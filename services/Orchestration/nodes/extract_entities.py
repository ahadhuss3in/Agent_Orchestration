"""
extract_entities: turn stored context into entities and relationships.

HOW IT WORKS
------------
The old version made ONE LLM call over the whole seed, cut off at 25000 chars,
and `break`-ed at the cap, silently losing the rest. This version does a map
then reduce:

  MAP     one small LLM call per stored chunk. Nothing is truncated.
  REDUCE  merge the per-chunk results:
            - the same entity found in two chunks becomes ONE entity
            - its source_chunk_ids collect every chunk it appeared in
            - the same relationship likewise
  LINK    write the entity ids back onto the Qdrant chunks, which is the
          Qdrant -> Neo4j direction of the bridge.

The models below describe one chunk's extraction. The LLM returns NAMES for
relationships; this code, not the LLM, assigns ids. That is what keeps edges
from pointing at ids that do not exist.
"""

from typing import Literal

import logfire
from langchain_groq import ChatGroq
from pydantic import BaseModel
from qdrant_client import QdrantClient

from app.config import config
from services.Orchestration.ids import entity_id as make_entity_id
from services.Orchestration.ids import point_id
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

llm = ChatGroq(api_key=config.GROQ_API_KEY, model=config.MODEL_REASONING)
structured_llm = llm.with_structured_output


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


def _extract_one_chunk(extractor, text: str) -> SeedExtraction:
    """One LLM call for one chunk. Small prompt, so nothing gets cut off."""
    prompt = f"""
    Extract a knowledge graph from this single chunk of a scenario.

    Return:
    - every person, organization, location, event, or other named entity
    - the relationships between them (who relates to whom, and how)
    - a short briefing: threats, key points, precautions, predictions

    Use only facts stated in the text. If the chunk has nothing useful,
    return empty lists.

    CHUNK:
    {text}
    """
    return extractor.invoke(prompt)


def _link_chunks_to_entities(seed_id: str, entities: list[dict]) -> None:
    """Write entity_ids onto each chunk's Qdrant payload.

    This is the Qdrant -> Neo4j half of the bridge: a later retrieval can read
    a matching chunk's entity_ids, then ask Neo4j about those entities.
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
    for cid, entity_ids in chunk_to_entities.items():
        # Qdrant addresses the point by its deterministic UUID, which we can
        # rebuild from chunk_id with the same helper store_context used.
        client.set_payload(
            collection_name=config.QDRANT_COLLECTION,
            payload={"entity_ids": sorted(entity_ids)},
            points=[point_id(cid)],
        )
    logfire.info(f"Linked {len(chunk_to_entities)} chunks to their entities")


def extract_entities(state: OrchestrationState):
    seed_id = state["seed_id"]
    stored_chunks = state["stored_chunks"]

    # A single structured-output wrapper reused for every chunk. Asking for a
    # Pydantic model means a malformed response raises instead of returning
    # a plain string we would have to parse by hand.
    extractor = structured_llm(SeedExtraction)

    # Merge accumulators, keyed so duplicates collapse:
    #   entities:      keyed by (type, normalized name)
    #   relationships: keyed by (source, target, type), all normalized
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
        for chunk in stored_chunks:
            cid = chunk["chunk_id"]

            # One bad chunk (rate limit, weird text) should not sink the whole
            # run, so log it and move on. The entity simply misses this chunk's
            # provenance, which is better than losing every other chunk.
            try:
                result = _extract_one_chunk(extractor, chunk["text"])
            except Exception as e:  # noqa: BLE001 (one bad chunk must not sink the run)
                logfire.warning(f"Extraction failed for chunk {cid}: {e}")
                continue

            for ent in result.entities:
                key = (ent.type, _norm(ent.name))
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
                key = (_norm(rel.source_name), _norm(rel.target_name), rel.type.strip().upper())
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
        name_to_id: dict[str, str] = {}
        for data in entities_by_key.values():
            eid = make_entity_id(seed_id, data["type"], data["name"])
            candidate_entities.append({"entity_id": eid, **data})

            norm = _norm(data["name"])
            # If the same name somehow has two types, first one wins. Relationships
            # only carry a name, so there is no better mapping available.
            if norm not in name_to_id:
                name_to_id[norm] = eid
            else:
                logfire.warning(f"Duplicate entity name across types: {data['name']}")

        # Map relationship names to ids. Drop any edge whose endpoint was never
        # extracted, rather than writing a dangling id into Neo4j.
        relationships = []
        for rel in rels_by_key.values():
            source_id = name_to_id.get(_norm(rel["source_name"]))
            target_id = name_to_id.get(_norm(rel["target_name"]))
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
