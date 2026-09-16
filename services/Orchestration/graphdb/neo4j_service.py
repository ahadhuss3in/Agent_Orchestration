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

    (:Agent {
        agent_id, seed_id, entity_id, name, type,
        degree, rank, archetype, status        # status: pool | promoted
    })
    (:Entity)-[:REPRESENTED_BY]->(:Agent)
    (:Agent)-[:SAID]->(:Message {agent_id, seed_id, role, content, seq, created_at})
"""

import re

import logfire
from neo4j import GraphDatabase

from app.config import config
from services.Orchestration.ids import agent_id as make_agent_id

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
                WHERE NOT e:Seed AND NOT e:Agent AND NOT e:Message
                OPTIONAL MATCH (a:Agent {seed_id: $seed_id, entity_id: e.entity_id})
                RETURN e.entity_id AS id,
                       e.name AS name,
                       labels(e) AS labels,
                       e.description AS description,
                       e.role_in_seed AS role_in_seed,
                       e.source_chunk_ids AS source_chunk_ids,
                       a.rank AS agent_rank,
                       a.archetype AS archetype
                """,
                seed_id=seed_id,
            )
        )
        edge_records = list(
            session.run(
                """
                MATCH (a {seed_id: $seed_id})-[r]->(b {seed_id: $seed_id})
                WHERE NOT a:Agent AND NOT b:Agent
                  AND NOT a:Message AND NOT b:Message
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
                # Non-null only for entities in the agent pool; the console
                # uses these to ring and label the promotable nodes.
                "agent_rank": rec["agent_rank"],
                "archetype": rec["archetype"],
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


# ---------------------------------------------------------------------------
# Agents: the pool, the archetype a human assigns, and the memory.
#
# An :Agent node is a candidate promoted out of the graph. It is a separate
# node from the entity it represents, so the entity keeps carrying only what
# extraction found and the agent carries the run-time state (archetype, rank,
# and the messages it has said). Today that is one-to-one; keeping them apart
# means simulation state has a home that is not the knowledge graph itself.
# ---------------------------------------------------------------------------

# Only these entity labels can become agents. A place or an event "acting"
# reads as noise, and the generic Entity catch-all is a last resort, so the
# pool is drawn from people and organizations.
AGENT_POOL_LABELS = ("Person", "Organization")


def _agent_label_predicate() -> str:
    """Cypher label predicate for the pool.

    Labels cannot be parameterized like values, so this string is built from a
    fixed in-code tuple, never from user input. Same rule as the entity labels
    in write_entities.
    """
    return " OR ".join(f"e:{label}" for label in AGENT_POOL_LABELS)


def select_agent_pool(seed_id: str, size: int) -> list[dict]:
    """Mark the top `size` Person/Organization entities as agent candidates.

    Ranked by relationship count (both directions), excluding the structural
    Seed link and any Agent/Message nodes so the counts describe the scenario
    rather than our own bookkeeping. A re-selection replaces the previous pool
    and drops its messages, so a seed never accumulates ghost agents.
    """
    with logfire.span("select agent pool", seed_id=seed_id, size=size):
        with driver.session() as session:
            session.run(
                "MATCH (m:Message {seed_id: $seed_id}) DETACH DELETE m",
                seed_id=seed_id,
            )
            session.run(
                "MATCH (a:Agent {seed_id: $seed_id}) DETACH DELETE a",
                seed_id=seed_id,
            )

            rows = session.run(
                f"""
                MATCH (e {{seed_id: $seed_id}})
                WHERE ({_agent_label_predicate()})
                OPTIONAL MATCH (e)-[r]-(o)
                WHERE NOT o:Seed AND NOT o:Agent AND NOT o:Message
                WITH e, count(r) AS degree
                ORDER BY degree DESC, toLower(e.name) ASC
                LIMIT $size
                RETURN e.entity_id AS entity_id,
                       e.name AS name,
                       [l IN labels(e) WHERE l <> 'Seed'] AS labels,
                       degree
                """,
                seed_id=seed_id,
                size=size,
            ).data()

            payload = [
                {
                    "agent_id": make_agent_id(seed_id, row["name"]),
                    "entity_id": row["entity_id"],
                    "name": row["name"],
                    "type": _entity_type(row["labels"]),
                    "degree": row["degree"],
                    "rank": rank,
                }
                for rank, row in enumerate(rows, start=1)
            ]

            if payload:
                session.run(
                    """
                    UNWIND $rows AS row
                    MATCH (e {entity_id: row.entity_id})
                    WHERE NOT e:Agent AND NOT e:Message
                    MERGE (a:Agent {agent_id: row.agent_id})
                    SET a.seed_id = $seed_id,
                        a.entity_id = row.entity_id,
                        a.name = row.name,
                        a.type = row.type,
                        a.degree = row.degree,
                        a.rank = row.rank,
                        a.archetype = null,
                        a.status = 'pool'
                    MERGE (e)-[:REPRESENTED_BY]->(a)
                    """,
                    rows=payload,
                    seed_id=seed_id,
                )

        logfire.info(f"Selected {len(payload)} agent(s) for seed {seed_id}")
        return payload


def get_agent_pool(seed_id: str) -> list[dict]:
    """Every candidate agent for one seed, ranked, with its current archetype."""
    with driver.session() as session:
        records = session.run(
            """
            MATCH (a:Agent {seed_id: $seed_id})
            OPTIONAL MATCH (a)-[:SAID]->(m:Message)
            RETURN a.agent_id AS agent_id,
                   a.entity_id AS entity_id,
                   a.name AS name,
                   a.type AS type,
                   a.degree AS degree,
                   a.rank AS rank,
                   a.archetype AS archetype,
                   a.status AS status,
                   count(m) AS message_count
            ORDER BY a.rank
            """,
            seed_id=seed_id,
        )
        return [dict(rec) for rec in records]


def get_agent(agent_id: str) -> dict | None:
    """One agent plus the entity it represents. None if the agent is unknown."""
    with driver.session() as session:
        record = session.run(
            """
            MATCH (a:Agent {agent_id: $agent_id})
            OPTIONAL MATCH (a)<-[:REPRESENTED_BY]-(e)
            RETURN a.agent_id AS agent_id,
                   a.seed_id AS seed_id,
                   a.entity_id AS entity_id,
                   a.name AS name,
                   a.type AS type,
                   a.degree AS degree,
                   a.rank AS rank,
                   a.archetype AS archetype,
                   a.status AS status,
                   e.description AS description,
                   e.role_in_seed AS role_in_seed
            """,
            agent_id=agent_id,
        ).single()
        return dict(record) if record else None


def set_agent_archetype(
    seed_id: str, entity_id: str, archetype: str | None
) -> dict | None:
    """Assign (or clear) one agent's archetype.

    Passing None is the "leave it as it is" choice: the agent stays in the pool
    with no personality. Returns the updated row, or None if no such agent.
    """
    with driver.session() as session:
        record = session.run(
            """
            MATCH (a:Agent {seed_id: $seed_id, entity_id: $entity_id})
            SET a.archetype = $archetype,
                a.status = CASE WHEN $archetype IS NULL THEN 'pool' ELSE 'promoted' END
            RETURN a.agent_id AS agent_id,
                   a.entity_id AS entity_id,
                   a.archetype AS archetype,
                   a.status AS status
            """,
            seed_id=seed_id,
            entity_id=entity_id,
            archetype=archetype,
        ).single()
        return dict(record) if record else None


def append_message(agent_id: str, seed_id: str, role: str, content: str) -> int:
    """Append one turn to an agent's memory and return its sequence number.

    Memory is nodes, not a JSON blob, so it survives a restart and can be read
    back in order. `seq` is a plain counter per agent, which avoids depending on
    timestamp resolution for ordering.
    """
    with driver.session() as session:
        record = session.run(
            """
            MATCH (a:Agent {agent_id: $agent_id})
            OPTIONAL MATCH (a)-[:SAID]->(existing:Message)
            WITH a, count(existing) AS n
            CREATE (m:Message {
                agent_id: $agent_id,
                seed_id: $seed_id,
                role: $role,
                content: $content,
                seq: n,
                created_at: datetime()
            })
            CREATE (a)-[:SAID]->(m)
            RETURN m.seq AS seq
            """,
            agent_id=agent_id,
            seed_id=seed_id,
            role=role,
            content=content,
        ).single()
        return record["seq"] if record else -1


def get_messages(agent_id: str, limit: int) -> list[dict]:
    """The most recent `limit` turns, oldest first, ready to replay to an LLM."""
    with driver.session() as session:
        records = session.run(
            """
            MATCH (a:Agent {agent_id: $agent_id})-[:SAID]->(m:Message)
            RETURN m.role AS role, m.content AS content, m.seq AS seq
            ORDER BY m.seq DESC
            LIMIT $limit
            """,
            agent_id=agent_id,
            limit=limit,
        )
        rows = [dict(rec) for rec in records]
    return list(reversed(rows))
