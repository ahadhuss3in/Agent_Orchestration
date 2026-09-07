import re

import logfire
from neo4j import GraphDatabase

from app.config import config

driver = GraphDatabase.driver(
    config.NEO4J_URI,
    auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
)


def _sanitize_relationship_type(raw_type: str) -> str:
    """Cypher relationship types can't be parameterized like values can,
    they get written directly into the query text, and can only contain
    safe identifier characters. The LLM's relationship type is free text,
    so it gets cleaned up here before ever touching a query string, this
    is what stops a stray character in extracted text from being able to
    do anything to the database.
    """
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", raw_type).strip("_").upper()
    return cleaned or "RELATED_TO"


def write_entities(seed_id: str, seed_text: str, entities: list[dict], relationships: list[dict]):
    """
    Write one seed's extracted entities and relationships into Neo4j.

    Uses MERGE, keyed on entity_id, everywhere, not CREATE. Running this
    twice on the same seed updates existing nodes instead of duplicating
    them, this is the deliberate fix for the uuid4-per-run duplication
    mistake already made once in Qdrant ingestion, not repeated here.

    entity_id's type field (Person/Organization/Location) comes from a
    Pydantic Literal in the extraction step, so it's safe to use directly
    as a node label, it can only ever be one of those three exact values.
    """
    with logfire.span("Writing entities to Neo4j", seed_id=seed_id):
        with driver.session() as session:
            session.run(
                "MERGE (s:Seed {entity_id: $seed_id}) SET s.text = $seed_text",
                seed_id=seed_id,
                seed_text=seed_text,
            )

            for entity in entities:
                session.run(
                    f"""
                    MERGE (e:{entity['type']} {{entity_id: $entity_id}})
                    SET e.name = $name,
                        e.description = $description,
                        e.role_in_seed = $role_in_seed,
                        e.seed_id = $seed_id
                    WITH e
                    MATCH (s:Seed {{entity_id: $seed_id}})
                    MERGE (e)-[:PARTICIPATED_IN]->(s)
                    """,
                    entity_id=entity["entity_id"],
                    name=entity["name"],
                    description=entity["description"],
                    role_in_seed=entity["role_in_seed"],
                    seed_id=seed_id,
                )

            for rel in relationships:
                rel_type = _sanitize_relationship_type(rel["type"])
                session.run(
                    f"""
                    MATCH (a {{entity_id: $source_id}})
                    MATCH (b {{entity_id: $target_id}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r.description = $description
                    """,
                    source_id=rel["source_id"],
                    target_id=rel["target_id"],
                    description=rel["description"],
                )

        logfire.info(
            f"Wrote {len(entities)} entities and {len(relationships)} "
            f"relationships to Neo4j for seed {seed_id}"
        )


def get_relationships(entity_id: str) -> list[dict]:
    """
    Every relationship touching one entity, in either direction, excluding
    the structural PARTICIPATED_IN edge to the Seed node itself, that's
    bookkeeping, not a fact about the scenario.
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
                   startNode(r).entity_id = $entity_id AS outgoing
            """,
            entity_id=entity_id,
        )
        return [dict(record) for record in result]


def format_relationships(entity_id: str) -> str:
    """
    Turns get_relationships() into a plain text block, the same shape as
    generate_node's own "TECHNICAL CONTEXT" block, ready to drop straight
    into a prompt.
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
    """How many non-Seed nodes exist for one seed. Used to prove writes
    are idempotent, this number should not grow on a second identical run.
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
