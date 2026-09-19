"""
extract_entities: turn stored chunks into entities and relationships.

Extraction runs per chunk group, then one alias pass collapses different
surface forms of the same entity ("Houthis" / "Houthi forces" / "the Houthis")
before ids are assigned.
"""

import json
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

# OpenAI-compatible. temperature=0 keeps the JSON output stable.
# The timeout plus limited SDK retries stop one stalled call hanging the run.
llm = ChatOpenAI(
    api_key=config.CUSTOM_API_KEY,
    base_url=config.CUSTOM_BASE_URL,
    model=config.CUSTOM_MODEL,
    temperature=0,
    timeout=60,
    max_retries=2,
)

# How many times to retry one call before splitting the group or giving up.
_MAX_ATTEMPTS = 4


class ExtractedEntity(BaseModel):
    # chunk_id is the label the model was shown, not a real Qdrant id yet.
    chunk_id: str
    name: str
    type: Literal["Person", "Organization", "Location", "Event", "Entity"]
    description: str
    role_in_seed: str


class ExtractedRelationship(BaseModel):
    chunk_id: str
    source_name: str
    target_name: str
    type: str
    description: str


class ChunkExtraction(BaseModel):
    entities: list[ExtractedEntity]
    relationships: list[ExtractedRelationship]


class EntityAliasGroup(BaseModel):
    # canonical is one of the names in the group, copied exactly.
    canonical: str
    aliases: list[str]


class EntityAliasResolution(BaseModel):
    groups: list[EntityAliasGroup]


# Descriptions are truncated before the alias call: enough to tell "US" from
# "United States" apart, without paying for whole paragraphs to do it.
_ALIAS_MAX_DESC = 160

## im building on free models, so this helps keep the retry in check 
def _is_rate_limit(error: Exception) -> bool:
    """ Identify  'rate limit' / 429 when tokens-per-minute is hit."""
    message = str(error).lower()
    return "rate_limit" in message or "rate limit" in message or "429" in message


## just to shorten the qdrant id so the model can 
## refer to it easier and save contexxt
##contextmaxxing
def _label(index: int) -> str:
    """Short local label shown to the model. Long real ids get mangled."""
    return f"c_{index:03d}"


def _invoke_with_retries(call, label: str):
    """Run one LLM call with the shared retry/backoff policy.

    Rate limits need a real pause (tokens per minute refill); other errors get
    a short backoff. Re-raises the last error once attempts are exhausted.
    """
    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return call()
        except Exception as e:  # noqa: BLE001 (retry then re-raise below)
            last_error = e
            if attempt == _MAX_ATTEMPTS - 1:
                break
            sleep = (10 * (attempt + 1)) if _is_rate_limit(e) else (2 * (attempt + 1))
            logfire.warning(
                f"Attempt {attempt + 1}/{_MAX_ATTEMPTS} failed for "
                f"{label}, retrying in {sleep}s: {e}"
            )
            time.sleep(sleep)
    raise last_error


def _extract_once(extractor, chunks: list[dict], label: str):
    """One LLM call over one group of chunks, with retries.
    """
    labeled = [(_label(i), chunk) for i, chunk in enumerate(chunks)]
    payload = [{"chunk_id": lbl, "text": chunk["text"]} for lbl, chunk in labeled]
    prompt = f"""
    Extract a knowledge graph from the JSON array of document chunks below.
    Each item has a chunk_id and its text.

    Respond with a single JSON object, no prose, matching this shape:
    {{
      "entities": [
        {{"chunk_id": "...", "name": "...",
          "type": "Person|Organization|Location|Event|Entity",
          "description": "...", "role_in_seed": "..."}}
      ],
      "relationships": [
        {{"chunk_id": "...", "source_name": "...", "target_name": "...",
          "type": "...", "description": "..."}}
      ]
    }}

    Rules:
    - Every entity's chunk_id is the id of the FIRST chunk where it appears.
      Report each entity once.
    - Every relationship's chunk_id is the id of the chunk where the
      relationship is stated. If it is stated in more than one chunk, add one
      relationship entry per chunk.
    - Use only the chunk_id values given below, copied exactly.
    - Use only facts stated in the text. If there is nothing useful, return
      empty lists.

    CHUNKS:
    {json.dumps(payload, ensure_ascii=False)}

    Remember: only the given chunk_ids, and JSON only.
    """
    # The call is wrapped in a lambda so the retry policy lives in one place.
    result = _invoke_with_retries(lambda: extractor.invoke(prompt), label)
    return result, labeled


def _extract_group(extractor, chunks: list[dict], label: str):
    """Extract from a group of chunks, splitting the group if it keeps failing.

    A large group can fail because the JSON response is too large. Halving the
    group and retrying each half usually succeeds.
    """
    try:
        return [_extract_once(extractor, chunks, label)]
    except Exception as e:
        if len(chunks) <= 1:
            raise
        logfire.warning(f"Extraction failed for {label}, splitting the group: {e}")
        mid = len(chunks) // 2
        return _extract_group(extractor, chunks[:mid], f"{label}a") + _extract_group(
            extractor, chunks[mid:], f"{label}b"
        )


def _resolve_aliases(alias_extractor, entities: list[dict]) -> list[EntityAliasGroup]:
    """One LLM call that groups different surface forms of the same entity.

    Runs over the whole seed, not per chunk, so "Houthis" in one source and
    "Houthi forces" in another collapse to one entity. Merging is best-effort:
    the caller keeps the raw entities if this call fails.
    """
    payload = [
        {
            "name": e["name"],
            "type": e["type"],
            "description": e["description"][:_ALIAS_MAX_DESC],
        }
        for e in entities
    ]
    prompt = f"""
    Below is a JSON array of entities extracted from one document. Some entries
    name the same real-world thing in different ways (articles, plurals,
    abbreviations, translations, full names vs short names).

    Respond with a single JSON object, no prose, matching this shape:
    {{
      "groups": [
        {{"canonical": "...", "aliases": ["...", "..."]}}
      ]
    }}

    Rules:
    - Group only entries that clearly refer to the SAME real-world thing. If
      unsure, leave them out; a wrong merge is worse than a missed one.
    - "canonical" MUST be copied exactly from one of the names in that group,
      and should be the most complete, unambiguous spelling.
    - Every group has at least two names. Omit entities that have no alias.
    - Use only names from the list. Never invent names.

    ENTITIES:
    {json.dumps(payload, ensure_ascii=False)}

    Remember: JSON only.
    """
    resolution = _invoke_with_retries(
        lambda: alias_extractor.invoke(prompt), "entity aliases"
    )
    return resolution.groups


def _apply_alias_groups(entities_by_key: dict[tuple, dict], groups) -> dict[str, str]:
    """Merge each alias group into one canonical entity, in place.

    Returns slug-of-any-member -> slug-of-canonical, so a relationship that
    used a variant name still resolves to the merged entity's id.
    """
    # slug -> every (type, slug) key that produced it. A name can exist under
    # two types, and the alias call can group those too.
    by_slug: dict[str, list[tuple]] = {}
    for key in entities_by_key:
        by_slug.setdefault(key[1], []).append(key)

    alias_to_slug: dict[str, str] = {}
    merged = 0
    for group in groups:
        member_keys: list[tuple] = []
        for name in [group.canonical, *group.aliases]:
            for key in by_slug.get(slugify(name), []):
                if key in entities_by_key and key not in member_keys:
                    member_keys.append(key)
        if len(member_keys) < 2:
            continue

        canon_slug = slugify(group.canonical)
        canonical_key = next((k for k in member_keys if k[1] == canon_slug), None)
        if canonical_key is None:
            # The model returned a canonical name it was not given. Fall back to
            # the longest member rather than trusting an invented spelling.
            canonical_key = max(
                member_keys, key=lambda k: len(entities_by_key[k]["name"])
            )
            canon_slug = canonical_key[1]
            logfire.warning(
                f"Alias canonical {group.canonical!r} was not one of its members; "
                f"using {entities_by_key[canonical_key]['name']!r}"
            )

        target = entities_by_key[canonical_key]
        for key in member_keys:
            if key == canonical_key:
                continue
            other = entities_by_key.pop(key)
            by_slug.get(key[1], []).remove(key)
            target["chunks"].update(other["chunks"])
            # Same rule as exact-name merging: keep the richest text.
            if len(other["description"]) > len(target["description"]):
                target["description"] = other["description"]
            if len(other["role_in_seed"]) > len(target["role_in_seed"]):
                target["role_in_seed"] = other["role_in_seed"]
        for key in member_keys:
            alias_to_slug[key[1]] = canon_slug
        merged += 1

    if merged:
        logfire.info(
            f"Merged {merged} alias group(s); "
            f"{len(entities_by_key)} distinct entities remain"
        )
    return alias_to_slug


def _group_chunks(chunks: list[dict]) -> list[list[dict]]:
    """Pack a source's chunks into groups no larger than EXTRACT_MAX_CHARS.

    Chunks are kept intact (never split mid-chunk): a group is as many whole
    chunks as fit under the char budget.
    """
    groups: list[list[dict]] = []
    current: list[dict] = []
    size = 0
    for chunk in chunks:
        length = len(chunk["text"])
        if current and size + length > config.EXTRACT_MAX_CHARS:
            groups.append(current)
            current = []
            size = 0
        current.append(chunk)
        size += length
    if current:
        groups.append(current)
    return groups


def _group_by_source(stored_chunks: list[dict]) -> list[dict]:
    """Split stored chunks into sources, chunks kept in order."""
    grouped: dict[tuple, list[dict]] = {}
    order: list[tuple] = []
    for chunk in stored_chunks:
        key = (chunk["source"], chunk.get("source_type"))
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(chunk)

    sources = []
    for key in order:
        chunks = sorted(grouped[key], key=lambda c: c.get("chunk_index", 0))
        sources.append({"source": key[0], "source_type": key[1], "chunks": chunks})
    return sources


def _resolve_chunk(reported_id: str, name: str, labeled: list[tuple[str, dict]]):
    """Map a model-reported label to a real chunk.

    Falls back to matching the name in the group's chunk text when the model
    returns a label we did not give it, so a typo does not lose the citation.
    """
    by_label = dict(labeled)
    if reported_id in by_label:
        return by_label[reported_id]

    target = slugify(name)
    if target:
        for _, chunk in labeled:
            if target in slugify(chunk["text"]):
                return chunk
    return None


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
    sources = _group_by_source(state["stored_chunks"])

    # json_modex
    extractor = llm.with_structured_output(ChunkExtraction, method="json_mode")
    entities_by_key: dict[tuple, dict] = {}
    rels_by_key: dict[tuple, dict] = {}

    call_count = 0
    with logfire.span("Extracting entities", seed_id=seed_id, sources=len(sources)):
        for source in sources:
            groups = _group_chunks(source["chunks"])
            logfire.info(
                "extracting source",
                source=source["source"],
                source_type=source["source_type"],
                chunks=len(source["chunks"]),
                groups=len(groups),
            )

            for group_index, group in enumerate(groups):
                label = f"{source['source']}:g{group_index}"
                # One span per extraction call, this is where the time sits.
                with logfire.span(
                    "extract chunk group",
                    source=source["source"],
                    group=group_index,
                    chunks=len(group),
                    chars=sum(len(c["text"]) for c in group),
                ):
                    try:
                        results = _extract_group(extractor, group, label)
                    except Exception as e:  # noqa: BLE001 (one source must not sink the run)
                        logfire.warning(f"Extraction failed for {label}: {e}")
                        continue
                call_count += len(results)

                for result, labeled in results:
                    for ent in result.entities:
                        chunk = _resolve_chunk(ent.chunk_id, ent.name, labeled)
                        key = (ent.type, slugify(ent.name))
                        if key in entities_by_key:
                            existing = entities_by_key[key]
                            if chunk is not None:
                                existing["chunks"][chunk["chunk_id"]] = chunk.get(
                                    "chunk_index", 0
                                )
                            if len(ent.description) > len(existing["description"]):
                                existing["description"] = ent.description
                            if len(ent.role_in_seed) > len(existing["role_in_seed"]):
                                existing["role_in_seed"] = ent.role_in_seed
                        else:
                            chunks: dict[str, int] = {}
                            if chunk is not None:
                                chunks[chunk["chunk_id"]] = chunk.get("chunk_index", 0)
                            entities_by_key[key] = {
                                "name": ent.name,
                                "type": ent.type,
                                "description": ent.description,
                                "role_in_seed": ent.role_in_seed,
                                "chunks": chunks,
                            }

                    for rel in result.relationships:
                        key = (
                            slugify(rel.source_name),
                            slugify(rel.target_name),
                            rel.type.strip().upper(),
                        )
                        chunk = _resolve_chunk(
                            rel.chunk_id, rel.source_name, labeled
                        ) or _resolve_chunk(rel.chunk_id, rel.target_name, labeled)
                        found: dict[str, int] = {}
                        if chunk is not None:
                            found[chunk["chunk_id"]] = chunk.get("chunk_index", 0)
                        if key in rels_by_key:
                            existing = rels_by_key[key]
                            existing["chunks"].update(found)
                            if len(rel.description) > len(existing["description"]):
                                existing["description"] = rel.description
                        else:
                            rels_by_key[key] = {
                                "source_name": rel.source_name,
                                "target_name": rel.target_name,
                                "type": rel.type.strip().upper(),
                                "description": rel.description,
                                "chunks": found,
                            }

        # Collapse surface-form variants ("Houthis" / "Houthi forces" /
        # "the Houthis") into one entity before ids are assigned, so they
        # become a single node instead of several. Best-effort: a failed alias
        # call keeps the raw entities rather than sinking the run.
        alias_to_slug: dict[str, str] = {}
        if len(entities_by_key) > 1:
            with logfire.span("resolve entity aliases", entities=len(entities_by_key)):
                try:
                    alias_extractor = llm.with_structured_output(
                        EntityAliasResolution, method="json_mode"
                    )
                    alias_groups = _resolve_aliases(
                        alias_extractor, list(entities_by_key.values())
                    )
                    alias_to_slug = _apply_alias_groups(entities_by_key, alias_groups)
                except Exception as e:  # noqa: BLE001 (merging is best-effort)
                    logfire.warning(
                        f"Entity alias resolution failed, keeping raw names: {e}"
                    )

        # Assign ids now that every entity is known.
        candidate_entities = []
        name_to_id: dict[str, str] = {}
        for data in entities_by_key.values():
            eid = make_entity_id(seed_id, data["type"], data["name"])
            # Entity provenance is the single earliest chunk it appeared in.
            if data["chunks"]:
                first = min(data["chunks"].items(), key=lambda kv: kv[1])[0]
                chunk_ids = [first]
            else:
                chunk_ids = []
            candidate_entities.append(
                {
                    "entity_id": eid,
                    "name": data["name"],
                    "type": data["type"],
                    "description": data["description"],
                    "role_in_seed": data["role_in_seed"],
                    "source_chunk_ids": chunk_ids,
                }
            )
            canonical = slugify(data["name"])
            if canonical not in name_to_id:
                name_to_id[canonical] = eid
            else:
                logfire.warning(f"Duplicate entity name across types: {data['name']}")

        # A relationship may name a variant the alias pass merged away; point
        # every variant slug at the surviving entity's id.
        for alias_slug, canon_slug in alias_to_slug.items():
            if alias_slug not in name_to_id and canon_slug in name_to_id:
                name_to_id[alias_slug] = name_to_id[canon_slug]

        # Resolve relationship names to ids; drop any edge with a missing endpoint.
        # Variants that resolved to the same endpoints are the same edge, so
        # they are merged rather than emitted twice.
        relationships_by_key: dict[tuple, dict] = {}
        for rel in rels_by_key.values():
            source_id = name_to_id.get(slugify(rel["source_name"]))
            target_id = name_to_id.get(slugify(rel["target_name"]))
            if not source_id or not target_id:
                logfire.warning(
                    f"Dropping relationship with unknown endpoint: "
                    f"{rel['source_name']} -> {rel['target_name']}"
                )
                continue
            chunks = sorted(rel["chunks"], key=lambda cid: rel["chunks"][cid])
            key = (source_id, target_id, rel["type"])
            if key in relationships_by_key:
                existing = relationships_by_key[key]
                existing["source_chunk_ids"] = list(
                    dict.fromkeys(existing["source_chunk_ids"] + chunks)
                )
                if len(rel["description"]) > len(existing["description"]):
                    existing["description"] = rel["description"]
            else:
                relationships_by_key[key] = {
                    "source_id": source_id,
                    "target_id": target_id,
                    "type": rel["type"],
                    "description": rel["description"],
                    "source_chunk_ids": chunks,
                }
        relationships = list(relationships_by_key.values())

        _link_chunks_to_entities(seed_id, candidate_entities)

        logfire.info(
            f"Extracted {len(candidate_entities)} entities and "
            f"{len(relationships)} relationships from {len(sources)} sources "
            f"in {call_count} extraction call(s)"
        )

        return {
            "candidate_entities": candidate_entities,
            "relationships": relationships,
            "phase": "entities_extracted",
        }
