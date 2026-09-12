"""
The Neo4j side of the knowledge base. All Cypher lives here so it can be
tested without running the LangGraph pipeline.

PER-SEED MODEL
--------------
Two different seeds that both mention "John Smith" are kept apart by giving
every entity a seed-prefixed id (see ids.entity_id):

    "seed-a:person-john-smith"  !=  "seed-b:person-john-smith"

Schema:

    (:Seed {seed_id, text})
    (:Person|Organization|Location|Event|Entity {
        entity_id, name, description, role_in_seed, seed_id,
        source_chunk_ids          # provenance back into Qdrant
    })
    (:Entity)-[:PARTICIPATED_IN]->(:Seed)
    (:EntityA)-[:<SANITIZED_TYPE> {description, source_chunk_ids}]->(:EntityB)
"""

import re

import logfire
from neo4j import GraphDatabase

from app.config import config

driver = GraphDatabase.driver(
    config.NEO4J_URI,
    auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
)


def _sanitize_relationship_type(raw_type: str) -> str:
    """Cypher relationship types cannot be parameterized like values can.
    They get written straight into the query text and may only contain safe
    identifier characters. The LLM's relationship type is free text, so it is
    cleaned here before ever touching a query string. This is what stops a
    stray character in extracted text from being able to do anything to the
    database.

    KEEP THIS. Property values ($name, $entity_id) are parameterized and safe.
    Labels and relationship types cannot be, so they are the one injection
    surface in this file.
    """
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", raw_type).strip("_").upper()
    return cleaned or "RELATED_TO"


def write_entities(
    seed_id: str,
    seed_text: str,
    entities: list[dict],
    relationships: list[dict],
):
    """Write one seed's entities and relationships into Neo4j.

    Everything uses MERGE, keyed on entity_id, never CREATE. MERGE means
    "match this, or create it if missing", so writing the same seed twice
    updates the same nodes instead of duplicating them.
    """
    with logfire.span("Writing entities to Neo4j", seed_id=seed_id):
        with driver.session() as session:
            # 1. The Seed node. Entities attach to it, so it must exist first.
            session.run(
                "MERGE (s:Seed {entity_id: $seed_id}) SET s.text = $seed_text",
                seed_id=seed_id,
                seed_text=seed_text,
            )

            # 2. Entity nodes.
            for entity in entities:
                # The label is f-string interpolated, so it MUST be a fixed
                # safe value. It is, because `type` comes from a Pydantic
                # Literal with five allowed strings. Property values use
                # $parameters and are always safe.
                label = entity["type"]
                session.run(
                    f"""
                    MERGE (e:{label} {{entity_id: $entity_id}})
                    SET e.name = $name,
                        e.description = $description,
                        e.role_in_seed = $role_in_seed,
                        e.seed_id = $seed_id,
                        e.source_chunk_ids = $source_chunk_ids
                    WITH e
                    MATCH (s:Seed {{entity_id: $seed_id}})
                    MERGE (e)-[:PARTICIPATED_IN]->(s)
                    """,
                    entity_id=entity["entity_id"],
                    name=entity["name"],
                    description=entity["description"],
                    role_in_seed=entity["role_in_seed"],
                    seed_id=seed_id,
                    source_chunk_ids=entity.get("source_chunk_ids", []),
                )

            # 3. Relationships between entities.
            for rel in relationships:
                # Sanitize BEFORE the type touches the query string.
                rel_type = _sanitize_relationship_type(rel["type"])
                session.run(
                    f"""
                    MATCH (a {{entity_id: $source_id}})
                    MATCH (b {{entity_id: $target_id}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r.description = $description,
                        r.source_chunk_ids = $source_chunk_ids
                    """,
                    source_id=rel["source_id"],
                    target_id=rel["target_id"],
                    description=rel["description"],
                    source_chunk_ids=rel.get("source_chunk_ids", []),
                )

        logfire.info(
            f"Wrote {len(entities)} entities and {len(relationships)} "
            f"relationships to Neo4j for seed {seed_id}"
        )


def get_relationships(entity_id: str) -> list[dict]:
    """Every relationship touching one entity, in either direction, excluding
    the structural PARTICIPATED_IN edge to the Seed node (bookkeeping, not a
    fact about the scenario).

    This is the read side Graph RAG calls: vector search finds an entity, then
    this walks one hop out to its neighbors. `outgoing` says which way the
    arrow points relative to the entity we asked about.
    """
    with driver.session() as session:
        result = session.run(
            """
            MATCH (e {entity_id: $entity_id})-[r]-(other)
            WHERE NOT other:Seed
            RETURN type(r) AS rel_type,
                   other.entity_id AS other_id,
                   other.name AS other_name,
                   r.description AS description,
                   r.source_chunk_ids AS source_chunk_ids,
                   startNode(r).entity_id = $entity_id AS outgoing
            """,
            entity_id=entity_id,
        )
        return [dict(record) for record in result]


def format_relationships(entity_id: str) -> str:
    """Turn get_relationships() into a text block ready to drop into a prompt,
    e.g.:
        - WORKS_FOR -> Acme Corp: Jane is the CFO of Acme.
        - LIVES_IN <- Berlin: Berlin is where Jane was born.
    """
    relationships = get_relationships(entity_id)
    if not relationships:
        return "No known relationships."

    lines = []
    for rel in relationships:
        if rel["outgoing"]:
            lines.append(f"- {rel['rel_type']} -> {rel['other_name']}: {rel['description']}")
        else:
            lines.append(f"- {rel['other_name']} -> {rel['rel_type']} -> you: {rel['description']}")
    return "\n".join(lines)


def count_nodes_for_seed(seed_id: str) -> int:
    """How many non-Seed nodes exist for one seed. Used to prove writes are
    idempotent: this number must not grow on a second identical run.
    """
    with driver.session() as session:
        result = session.run(
            "MATCH (e {seed_id: $seed_id}) RETURN count(e) AS c",
            seed_id=seed_id,
        )
        return result.single()["c"]


def delete_seed(seed_id: str) -> None:
    """Remove every node belonging to one seed, including the Seed node
    itself. For cleaning up test data, not used in the real pipeline.
    """
    with driver.session() as session:
        session.run(
            "MATCH (e) WHERE e.seed_id = $seed_id OR e.entity_id = $seed_id DETACH DELETE e",
            seed_id=seed_id,
        )
