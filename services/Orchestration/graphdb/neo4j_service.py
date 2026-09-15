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
    """Cypher relationship types cannot be parameterized like values.
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
            with logfire.span("merge seed node"):
                session.run(
                    "MERGE (s:Seed {entity_id: $seed_id}) SET s.text = $seed_text",
                    seed_id=seed_id,
                    seed_text=seed_text,
                )

            # 2. Entity nodes.
            with logfire.span("merge entity nodes", count=len(entities)):
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
            with logfire.span("merge relationships", count=len(relationships)):
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
    with logfire.span("get relationships", entity_id=entity_id), driver.session() as session:
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


def reset_graph() -> int:
    """Delete every node in the database, so a run starts from a clean graph.

    The demo holds one seed at a time, matching store_context wiping Qdrant on
    every run. Returns how many nodes were removed, for the log line.
    """
    with logfire.span("reset neo4j"):
        with driver.session() as session:
            removed = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            session.run("MATCH (n) DETACH DELETE n")
        logfire.warning(f"Wiped Neo4j ({removed} nodes) for a fresh run")
        return removed


def _entity_type(labels: list[str]) -> str:
    """The entity's type label (Person/Organization/...), ignoring Seed."""
    for label in labels:
        if label != "Seed":
            return label
    return "Entity"


def get_graph(seed_id: str) -> dict:
    """The whole stored graph for one seed, shaped for the UI.

    nodes: {id, name, type, description, role_in_seed, source_chunk_ids}
    edges: {source, target, type, description, source_chunk_ids}

    Both directions are filtered to nodes that carry this seed_id, which also
    drops the Seed node and its PARTICIPATED_IN bookkeeping edges (the Seed
    node has no seed_id property).
    """
    with logfire.span("read graph", seed_id=seed_id), driver.session() as session:
        node_records = list(
            session.run(
                """
                MATCH (e {seed_id: $seed_id})
                WHERE NOT e:Seed
                RETURN e.entity_id AS id,
                       e.name AS name,
                       labels(e) AS labels,
                       e.description AS description,
                       e.role_in_seed AS role_in_seed,
                       e.source_chunk_ids AS source_chunk_ids
                """,
                seed_id=seed_id,
            )
        )
        edge_records = list(
            session.run(
                """
                MATCH (a {seed_id: $seed_id})-[r]->(b {seed_id: $seed_id})
                RETURN a.entity_id AS source,
                       b.entity_id AS target,
                       type(r) AS type,
                       r.description AS description,
                       r.source_chunk_ids AS source_chunk_ids
                """,
                seed_id=seed_id,
            )
        )

    return {
        "seed_id": seed_id,
        "nodes": [
            {
                "id": rec["id"],
                "name": rec["name"],
                "type": _entity_type(rec["labels"]),
                "description": rec["description"],
                "role_in_seed": rec["role_in_seed"],
                "source_chunk_ids": rec["source_chunk_ids"] or [],
            }
            for rec in node_records
        ],
        "edges": [
            {
                "source": rec["source"],
                "target": rec["target"],
                "type": rec["type"],
                "description": rec["description"],
                "source_chunk_ids": rec["source_chunk_ids"] or [],
            }
            for rec in edge_records
        ],
    }


def list_seeds() -> list[dict]:
    """Every seed that has a graph stored, for the UI's picker."""
    with driver.session() as session:
        records = session.run(
            "MATCH (s:Seed) RETURN s.entity_id AS seed_id ORDER BY seed_id"
        )
        return [{"seed_id": rec["seed_id"]} for rec in records]
