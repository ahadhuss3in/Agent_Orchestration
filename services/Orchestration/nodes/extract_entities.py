"""
extract_entities: turn the extracted text into entities and relationships.

WHAT CHANGED (and why)
----------------------
The old version made one LLM call per embedding chunk. A seed is ~25 chunks, so
that was ~25 calls over text that is really one document split up. Most of the
tokens spent were just re-sending context and schema instructions 25 times.

Now it works per SOURCE (one file: the seed PDF, or one web article):
  - if the source text fits EXTRACT_MAX_CHARS, send it in ONE call,
  - only if it is too long, split it into parts and send each part.
  - if a part still fails after retries (e.g. the JSON came back too long),
    split that part in half and try again, down to EXTRACT_MIN_PART_CHARS.

Provenance is rebuilt without extra API calls: after extracting, each entity
name is matched back against the stored chunk texts to find which chunks it
came from, and those chunk_ids become its source_chunk_ids. That keeps the
Qdrant <-> Neo4j bridge working at roughly chunk resolution.

The LLM returns NAMES for relationships; this code assigns ids, never the LLM.
"""

import time
from typing import Literal

import logfire
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from qdrant_client import QdrantClient

from app.config import config
from services.Orchestration.ids import entity_id as make_entity_id
from services.Orchestration.ids import point_id, slugify
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.ingestion.chuncking.splitter import chunk_text

# DeepSeek is OpenAI-compatible. temperature=0 keeps the JSON output stable.
# The timeout plus limited SDK retries stop one stalled call hanging the run.
llm = ChatOpenAI(
    api_key=config.DEEPSEEK_API_KEY,
    base_url=config.DEEPSEEK_BASE_URL,
    model=config.DEEPSEEK_MODEL,
    temperature=0,
    timeout=60,
    max_retries=2,
)

# How many times to retry one call before splitting or giving up.
_MAX_ATTEMPTS = 4


class ExtractedEntity(BaseModel):
    name: str
    type: Literal["Person", "Organization", "Location", "Event", "Entity"]
    description: str
    role_in_seed: str


class ExtractedRelationship(BaseModel):
    # by name, not id. The id is assigned after all entities are known.
    source_name: str
    target_name: str
    type: str
    description: str


class SeedExtraction(BaseModel):
    entities: list[ExtractedEntity]
    relationships: list[ExtractedRelationship]
    threats: list[str]
    key_points: list[str]
    precautions: list[str]
    predictions: list[str]


def _norm(text: str) -> str:
    """Lowercase and collapse whitespace, for comparing free text."""
    return " ".join(text.split()).lower()


def _is_rate_limit(error: Exception) -> bool:
    """Groq/DeepSeek say 'rate limit' / 429 when tokens-per-minute is hit."""
    message = str(error).lower()
    return "rate_limit" in message or "rate limit" in message or "429" in message


def _extract_once(extractor, text: str, label: str) -> SeedExtraction:
    """One LLM call for one piece of text, with retries.

    Retries 429s (rate limit) and transient parse/tool errors. After
    _MAX_ATTEMPTS it raises, and the caller decides whether to split the text.
    """
    prompt = f"""
    Extract a knowledge graph from the scenario text below.

    Respond with a single JSON object, no prose, matching this shape:
    {{
      "entities": [
        {{"name": "...", "type": "Person|Organization|Location|Event|Entity",
          "description": "...", "role_in_seed": "..."}}
      ],
      "relationships": [
        {{"source_name": "...", "target_name": "...", "type": "...",
          "description": "..."}}
      ],
      "threats": ["..."],
      "key_points": ["..."],
      "precautions": ["..."],
      "predictions": ["..."]
    }}

    Include every person, organization, location, event, or other named
    entity, and the relationships between them. Use only facts stated in the
    text. If the text has nothing useful, return empty lists.

    TEXT:
    {text}
    """
    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return extractor.invoke(prompt)
        except Exception as e:  # noqa: BLE001 (retry then re-raise below)
            last_error = e
            if attempt == _MAX_ATTEMPTS - 1:
                break
            # Rate limits need a real pause (tokens per minute refill); other
            # errors get a short backoff.
            sleep = (10 * (attempt + 1)) if _is_rate_limit(e) else (2 * (attempt + 1))
            logfire.warning(
                f"Extraction attempt {attempt + 1}/{_MAX_ATTEMPTS} failed for "
                f"{label}, retrying in {sleep}s: {e}"
            )
            time.sleep(sleep)
    raise last_error


def _extract_text(extractor, text: str, label: str) -> list[SeedExtraction]:
    """Extract from one piece of text, splitting in half if it keeps failing.

    A very long part can fail because the JSON response is too big. Splitting
    it and retrying each half usually succeeds and is still far fewer calls
    than the old per-embedding-chunk approach.
    """
    try:
        return [_extract_once(extractor, text, label)]
    except Exception as e:
        if len(text) <= config.EXTRACT_MIN_PART_CHARS:
            raise
        logfire.warning(f"Extraction failed for {label}, splitting it in half: {e}")
        half = max(len(text) // 2, config.EXTRACT_MIN_PART_CHARS)
        results: list[SeedExtraction] = []
        for index, piece in enumerate(chunk_text(text, chunk_size=half)):
            results.extend(_extract_text(extractor, piece, f"{label}.{index}"))
        return results


def _parts(text: str) -> list[str]:
    """Split a source into extraction parts only when it is over the budget."""
    if len(text) <= config.EXTRACT_MAX_CHARS:
        return [text]
    return chunk_text(text, chunk_size=config.EXTRACT_MAX_CHARS)


def _group_sources(stored_chunks: list[dict]) -> list[dict]:
    """Rebuild the full text per source from its chunks.

    store_context stores chunks in order. Joining them back gives the saved
    plaintext as one document, which is what we now send to the model.
    """
    grouped: dict[tuple, dict] = {}
    order: list[tuple] = []
    for chunk in stored_chunks:
        key = (chunk["source"], chunk.get("source_type"))
        if key not in grouped:
            grouped[key] = {"source": chunk["source"], "chunks": []}
            order.append(key)
        grouped[key]["chunks"].append(chunk)

    sources = []
    for key in order:
        group = grouped[key]
        group["chunks"].sort(key=lambda c: c.get("chunk_index", 0))
        sources.append(
            {
                "source": group["source"],
                "source_type": key[1],
                "text": "\n\n".join(c["text"] for c in group["chunks"]),
                "chunks": group["chunks"],
            }
        )
    return sources


def _provenance(name: str, chunk_slugs: list[tuple[str, str]]) -> list[str]:
    """Chunk ids whose text mentions this name.

    Matches on the slug form so punctuation/spacing differences do not break
    it. If nothing matches (the model paraphrased the name), fall back to every
    chunk of the source so the entity is still linked to its provenance.
    """
    target = slugify(name)
    if target:
        matched = [cid for cid, slug in chunk_slugs if target in slug]
        if matched:
            return matched
    return [cid for cid, _ in chunk_slugs]


def _link_chunks_to_entities(seed_id: str, entities: list[dict]) -> None:
    """Write entity_ids onto each chunk's Qdrant payload (Qdrant -> Neo4j bridge)."""
    chunk_to_entities: dict[str, set[str]] = {}
    for entity in entities:
        for cid in entity["source_chunk_ids"]:
            chunk_to_entities.setdefault(cid, set()).add(entity["entity_id"])

    if not chunk_to_entities:
        return

    client = QdrantClient(
        url=config.QDRANT_CLUSTER_ENDPOINT,
        api_key=config.QDRANT_API_KEY,
    )
    with logfire.span("link chunks to entities", chunks=len(chunk_to_entities)):
        for cid, entity_ids in chunk_to_entities.items():
            client.set_payload(
                collection_name=config.QDRANT_COLLECTION,
                payload={"entity_ids": sorted(entity_ids)},
                points=[point_id(cid)],
            )
    logfire.info(f"Linked {len(chunk_to_entities)} chunks to their entities")


def extract_entities(state: OrchestrationState):
    seed_id = state["seed_id"]
    stored_chunks = state["stored_chunks"]
    sources = _group_sources(stored_chunks)

    # json_mode, not the default tool calling: Groq's tool-calling structured
    # output dropped the tool call on long answers. Same fix applies to DeepSeek
    # and avoids a separate tool-call step.
    extractor = llm.with_structured_output(SeedExtraction, method="json_mode")

    # Merge accumulators. Entities keyed on (type, slug(name)), relationships on
    # (source slug, target slug, type). Same canonicalization as entity_id.
    entities_by_key: dict[tuple, dict] = {}
    rels_by_key: dict[tuple, dict] = {}

    briefing: dict[str, list[str]] = {
        "threats": [],
        "key_points": [],
        "precautions": [],
        "predictions": [],
    }
    seen_briefing: set[str] = set()

    call_count = 0
    with logfire.span("Extracting entities", seed_id=seed_id, sources=len(sources)):
        for source in sources:
            chunk_slugs = [(c["chunk_id"], slugify(c["text"])) for c in source["chunks"]]
            parts = _parts(source["text"])
            logfire.info(
                "extracting source",
                source=source["source"],
                source_type=source["source_type"],
                chars=len(source["text"]),
                parts=len(parts),
            )

            for part_index, part in enumerate(parts):
                label = f"{source['source']}:part{part_index}"
                # One span per extraction call. Fewer, larger calls than the old
                # per-chunk version, so this is where the time now sits.
                with logfire.span(
                    "extract source part",
                    source=source["source"],
                    source_type=source["source_type"],
                    part=part_index,
                    chars=len(part),
                ):
                    try:
                        results = _extract_text(extractor, part, label)
                    except Exception as e:  # noqa: BLE001 (one source must not sink the run)
                        logfire.warning(f"Extraction failed for {label}: {e}")
                        continue
                call_count += len(results)

                for result in results:
                    for ent in result.entities:
                        key = (ent.type, slugify(ent.name))
                        found = _provenance(ent.name, chunk_slugs)
                        if key in entities_by_key:
                            existing = entities_by_key[key]
                            for cid in found:
                                if cid not in existing["source_chunk_ids"]:
                                    existing["source_chunk_ids"].append(cid)
                            if len(ent.description) > len(existing["description"]):
                                existing["description"] = ent.description
                            if len(ent.role_in_seed) > len(existing["role_in_seed"]):
                                existing["role_in_seed"] = ent.role_in_seed
                        else:
                            entities_by_key[key] = {
                                "name": ent.name,
                                "type": ent.type,
                                "description": ent.description,
                                "role_in_seed": ent.role_in_seed,
                                "source_chunk_ids": list(found),
                            }

                    for rel in result.relationships:
                        key = (
                            slugify(rel.source_name),
                            slugify(rel.target_name),
                            rel.type.strip().upper(),
                        )
                        found = sorted(
                            set(_provenance(rel.source_name, chunk_slugs))
                            | set(_provenance(rel.target_name, chunk_slugs))
                        )
                        if key in rels_by_key:
                            existing = rels_by_key[key]
                            for cid in found:
                                if cid not in existing["source_chunk_ids"]:
                                    existing["source_chunk_ids"].append(cid)
                            if len(rel.description) > len(existing["description"]):
                                existing["description"] = rel.description
                        else:
                            rels_by_key[key] = {
                                "source_name": rel.source_name,
                                "target_name": rel.target_name,
                                "type": rel.type.strip().upper(),
                                "description": rel.description,
                                "source_chunk_ids": found,
                            }

                    for field, values in (
                        ("threats", result.threats),
                        ("key_points", result.key_points),
                        ("precautions", result.precautions),
                        ("predictions", result.predictions),
                    ):
                        for value in values:
                            norm = _norm(value)
                            if norm and norm not in seen_briefing:
                                seen_briefing.add(norm)
                                briefing[field].append(value)

        # Assign ids now that every entity is known.
        candidate_entities = []
        name_to_id: dict[str, str] = {}
        for data in entities_by_key.values():
            eid = make_entity_id(seed_id, data["type"], data["name"])
            candidate_entities.append({"entity_id": eid, **data})
            canonical = slugify(data["name"])
            if canonical not in name_to_id:
                name_to_id[canonical] = eid
            else:
                logfire.warning(f"Duplicate entity name across types: {data['name']}")

        # Resolve relationship names to ids; drop any edge with a missing endpoint.
        relationships = []
        for rel in rels_by_key.values():
            source_id = name_to_id.get(slugify(rel["source_name"]))
            target_id = name_to_id.get(slugify(rel["target_name"]))
            if not source_id or not target_id:
                logfire.warning(
                    f"Dropping relationship with unknown endpoint: "
                    f"{rel['source_name']} -> {rel['target_name']}"
                )
                continue
            relationships.append(
                {
                    "source_id": source_id,
                    "target_id": target_id,
                    "type": rel["type"],
                    "description": rel["description"],
                    "source_chunk_ids": rel["source_chunk_ids"],
                }
            )

        _link_chunks_to_entities(seed_id, candidate_entities)

        logfire.info(
            f"Extracted {len(candidate_entities)} entities and "
            f"{len(relationships)} relationships from {len(sources)} sources "
            f"in {call_count} extraction call(s)"
        )

        return {
            "candidate_entities": candidate_entities,
            "relationships": relationships,
            "qualitative_briefing": briefing,
            "phase": "entities_extracted",
        }
