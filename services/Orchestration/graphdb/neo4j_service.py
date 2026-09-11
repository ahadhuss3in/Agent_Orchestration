"""
The Neo4j side of the knowledge base. Everything Cypher lives here so it can
be tested without running the LangGraph pipeline.

PER-SEED MODEL (the decision we agreed on)
------------------------------------------
Two different seeds that both mention "John Smith" must NOT collapse into one
node. So every entity_id is prefixed with the seed_id:

    entity_id = f"{seed_id}:{type.lower()}-{slugify(name)}"

Given that, the schema is:

    (:Seed {seed_id, text})
    (:Person|Organization|Location|Event|Entity {
        entity_id, name, description, role_in_seed, seed_id,
        source_chunk_ids: [...]          # provenance back into Qdrant
    })
    (:Entity)-[:PARTICIPATED_IN]->(:Seed)
    (:EntityA)-[:<SANITIZED_TYPE> {description, source_chunk_ids}]->(:EntityB)

Saying it again because it matters: the seed prefix is the whole reason the
per-seed model is collision-free. If you drop it, you silently move to the
global model and inherit the disambiguation problem.
"""

import re

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

    KEEP THIS. Do not inline relationship types into a query without it.
    Values ($name, $entity_id) are parameterized and safe; labels and
    relationship types cannot be, so they are the one injection surface here.
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

    HOW TO BUILD IT
    ---------------
    1. MERGE the Seed node first, so entity writes have something to attach to:
           MERGE (s:Seed {entity_id: $seed_id}) SET s.text = $seed_text
    2. For every entity, MERGE on entity_id. MERGE means "match or create", so
       running this twice updates the same node instead of duplicating it. That
       idempotency is the entire reason write_to_graph can be re-run safely.
       The label ({type}) comes from a Pydantic Literal, so it is one of a
       fixed set and safe to interpolate. Still, feel the difference: the
       label is f-string interpolated, the properties use $parameters.
    3. Link entity to seed: MERGE (e)-[:PARTICIPATED_IN]->(s).
    4. For every relationship, run _sanitize_relationship_type(rel["type"])
       BEFORE it touches the query string, then MERGE (a)-[r:TYPE]->(b) where
       a and b are matched by source_id/target_id. Decide what to do when one
       endpoint does not exist (skip it, or create a stub) and handle it.
    5. If you stored provenance, set source_chunk_ids on both nodes and edges.

    READ YOUR OWN CYPHER CAREFULLY: MATCH finds nothing quietly, it does not
    error. A typo in a property name gives you an empty result, not a crash,
    which is the kind of bug that survives until you wonder why the graph is
    empty. Verify counts after writing.
    """
    raise NotImplementedError(
        "Implement write_entities. Read this docstring first. Keep every property "
        "as a $parameter and every relationship type through _sanitize."
    )


def get_relationships(entity_id: str) -> list[dict]:
    """Every relationship touching one entity, in either direction, excluding
    the structural PARTICIPATED_IN edge to the Seed node, that is bookkeeping,
    not a fact about the scenario.

    Returns one dict per relationship. Suggested fields: rel_type, other_id,
    other_name, description, outgoing (True if this entity is the source).

    This is the read side Graph RAG will call: vector search finds an entity,
    then this walks one hop out to its neighbors. Build it now so the shape is
    ready, even though retrieval comes later.
    """
    raise NotImplementedError(
        "Implement get_relationships. Read this docstring first."
    )


def format_relationships(entity_id: str) -> str:
    """Turn get_relationships() into a plain text block ready to drop into an
    LLM prompt, e.g.:
        - WORKS_FOR -> Acme Corp: Jane is the CFO of Acme.
        - LIVES_IN <- Berlin: Berlin is where Jane was born.

    Used by Graph RAG when it feeds a graph neighborhood to the model.
    """
    raise NotImplementedError(
        "Implement format_relationships. Read this docstring first."
    )


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
