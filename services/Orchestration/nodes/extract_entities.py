"""
extract_entities: turn stored context into entities and relationships.

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

# DeepSeek is OpenAI-compatible, so ChatOpenAI talks to it with only a base_url
# change. Switched off Groq because its free tier rate-limited a run badly.
# temperature=0 keeps the JSON output stable.
llm = ChatOpenAI(
    api_key=config.DEEPSEEK_API_KEY,
    base_url=config.DEEPSEEK_BASE_URL,
    model=config.DEEPSEEK_MODEL,
    temperature=0,
    # A hard timeout plus limited SDK retries. Without a timeout one stalled
    # HTTP call can hang the entire graph, which looks like "no response".
    timeout=60,
    max_retries=2,
)

# How many times to retry one chunk before giving up on it.
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


def _norm(name: str) -> str:
    """Normalize a name for comparison. "Jane  Doe " and "jane doe" match."""
    return " ".join(name.split()).lower()


def _is_rate_limit(error: Exception) -> bool:
    """Groq says 'rate limit' / 429 when we exceed tokens-per-minute."""
    message = str(error).lower()
    return "rate_limit" in message or "rate limit" in message or "429" in message


def _extract_one_chunk(extractor, text: str, cid: str) -> SeedExtraction:
    """One LLM call for one chunk, with retries.

    Retries matter here for two reasons found on a real run:
      - 429 rate limits. The free Groq tier limits tokens per minute and one
        seed is many calls, so a chunk can be rejected mid-run. Back off and
        retry instead of losing the chunk.
      - transient parse/tool errors. Retrying usually succeeds.
    After _MAX_ATTEMPTS the chunk is left to the caller to skip.
    """
    prompt = f"""
    Extract a knowledge graph from this single chunk of a scenario.

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
    text. If the chunk has nothing useful, return empty lists.

    CHUNK:
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
                f"{cid}, retrying in {sleep}s: {e}"
            )
            time.sleep(sleep)
    raise last_error


def _link_chunks_to_entities(seed_id: str, entities: list[dict]) -> None:
    """Write entity_ids onto each chunk's Qdrant payload.
    """
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
    # This is N sequential set_payload calls, so it gets its own span. If it
    # shows up slow in the trace, batch the updates.
    with logfire.span("link chunks to entities", chunks=len(chunk_to_entities)):
        for cid, entity_ids in chunk_to_entities.items():
            # Qdrant addresses the point by its deterministic UUID, which we
            # can rebuild from chunk_id with the same helper store_context used.
            client.set_payload(
                collection_name=config.QDRANT_COLLECTION,
                payload={"entity_ids": sorted(entity_ids)},
                points=[point_id(cid)],
            )
    logfire.info(f"Linked {len(chunk_to_entities)} chunks to their entities")


def extract_entities(state: OrchestrationState):
    seed_id = state["seed_id"]
    stored_chunks = state["stored_chunks"]

   
    # json_mode, not the default tool-calling method. On a real run, Groq's
    # tool-calling structured output failed repeatedly with "Tool call
    # validation" / "Failed to parse tool" once the answer ran long. json_mode
    # asks the model to return the whole JSON response directly, with no
    # separate tool-call step to skip. This is the same fix already used for
    # the simulation turns before that stage was removed.
    extractor = llm.with_structured_output(SeedExtraction, method="json_mode")
    entities_by_key: dict[tuple, dict] = {}
    rels_by_key: dict[tuple, dict] = {}

    briefing: dict[str, list[str]] = {
        "threats": [],
        "key_points": [],
        "precautions": [],
        "predictions": [],
    }
    seen_briefing: set[str] = set()

    with logfire.span("Extracting entities", seed_id=seed_id, chunks=len(stored_chunks)):
        for chunk_index, chunk in enumerate(stored_chunks):
            cid = chunk["chunk_id"]

            # One span per chunk. This is the line item that tells you whether
            # a slow run is many slow model calls or one stuck one, and it
            # carries the per-chunk result counts.
            with logfire.span(
                "extract chunk",
                chunk_id=cid,
                chunk_index=chunk_index,
                chars=len(chunk["text"]),
            ):
                try:
                    result = _extract_one_chunk(extractor, chunk["text"], cid)
                except Exception as e:  # noqa: BLE001 (one bad chunk must not sink the run)
                    logfire.warning(f"Extraction failed for chunk {cid}: {e}")
                    continue
                logfire.info(
                    "chunk extracted",
                    chunk_id=cid,
                    entities=len(result.entities),
                    relationships=len(result.relationships),
                )

            for ent in result.entities:
                # Key on the SLUG, not the raw name. entity_id is built from
                # slugify(name), so two spellings that slugify the same must
                # dedup here or they become two entries that MERGE into one
                # Neo4j node. That mismatch was a real bug: "US-Iran talks" and
                # a variant with a non-breaking hyphen produced two entity
                # entries but one node, so counts disagreed and the UI showed
                # duplicate rows.
                key = (ent.type, slugify(ent.name))
                if key in entities_by_key:
                    existing = entities_by_key[key]
                    # Provenance: remember every chunk this entity showed up in.
                    if cid not in existing["source_chunk_ids"]:
                        existing["source_chunk_ids"].append(cid)
                    # Different chunks describe the same entity differently.
                    # Rule chosen here: keep the longest description and role,
                    # on the idea that more text carries more information.
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
                        "source_chunk_ids": [cid],
                    }

            for rel in result.relationships:
                # Same canonicalization as entities so two spellings of the
                # same endpoint dedup to one edge.
                key = (slugify(rel.source_name), slugify(rel.target_name), rel.type.strip().upper())
                if key in rels_by_key:
                    existing = rels_by_key[key]
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
                        "source_chunk_ids": [cid],
                    }

            # Briefing lists are short free text. Dedupe on normalized text so
            # the same point said twice does not show up twice.
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

        # Now that every entity is known, assign ids. make_entity_id uses the
        # per-seed scheme from ids.py: "seed-x:person-jane-doe".
        candidate_entities = []
        # Keyed by slug, the same canonical form used for dedup above, so a
        # relationship that spells an endpoint differently still resolves.
        name_to_id: dict[str, str] = {}
        for data in entities_by_key.values():
            eid = make_entity_id(seed_id, data["type"], data["name"])
            candidate_entities.append({"entity_id": eid, **data})

            canonical = slugify(data["name"])
            # If the same slug somehow has two types, first one wins.
            # Relationships only carry a name, so there is no better mapping.
            if canonical not in name_to_id:
                name_to_id[canonical] = eid
            else:
                logfire.warning(f"Duplicate entity name across types: {data['name']}")

        # Map relationship names to ids. Drop any edge whose endpoint was never
        # extracted, rather than writing a dangling id into Neo4j.
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

        # Close the bridge in the Qdrant direction.
        _link_chunks_to_entities(seed_id, candidate_entities)

        logfire.info(
            f"Extracted {len(candidate_entities)} entities and "
            f"{len(relationships)} relationships from {len(stored_chunks)} chunks"
        )

        return {
            "candidate_entities": candidate_entities,
            "relationships": relationships,
            "qualitative_briefing": briefing,
            "phase": "entities_extracted",
        }
