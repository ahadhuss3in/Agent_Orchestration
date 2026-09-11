"""
graph_retriever: the query side. Built AFTER the knowledge base exists.

This is the file that makes "Graph RAG" real instead of just vector search
with a graph sitting unused next to it. Do not start it until store_context,
extract_entities and write_to_graph are done and you have verified, by hand,
that chunks and entities are actually in their stores.

THE RECIPE (each step is one function you will write)
-----------------------------------------------------
1. VECTOR HIT
   Embed the question, search Qdrant scoped to this seed_id. Use
   qdrant_service.search_enterprise_knowledge(seed_id=...). That gives the
   top text chunks and their payloads.

2. RESOLVE ENTITIES
   Read the entity_ids off those chunks' payloads. These are the "entry
   points" into the graph, the entities the question is actually about.

3. GRAPH EXPAND
   For each of those entities, ask Neo4j for its neighbors
   (neo4j_service.get_relationships). This is the one thing vector search
   cannot do: follow a relationship to something that was never worded the
   same way as the question.

4. PULL NEIGHBOR CONTEXT
   For the neighbor entities, fetch their source chunks
   (qdrant_service.fetch_chunks_by_ids). Those chunks are relevant because of
   how the graph connects them, not because they are similar in wording.

5. RERANK AND ANSWER
   Combine direct hits and graph-reached chunks, rerank with
   ranking_service.rerank_documents, and generate an answer that cites source
   and chunk_id for every claim.

THINK ABOUT
-----------
- How many hops? One hop is cheap and usually enough. Two explodes the
  candidate set fast. Start with one and see if answers improve.
- How many entry entities? If a chunk mentions 20 entities, expanding all of
  them drowns the real signal. Cap it.
- Deduplicate before reranking. The same chunk can arrive both as a direct
  hit and as a neighbor's source. Feed each passage to the reranker once.
- Every answer must carry a citation. If it has none, the retrieval step
  found nothing and the honest response is "no supporting context", not a
  guess. That is the grounding rule this whole project runs on.
"""


def graph_retrieve(query: str, seed_id: str) -> list[dict]:
    """Return the combined, reranked context passages for one question.

    Suggested return shape, one dict per passage:
        {"content": "...", "source": "...", "chunk_id": "...", "score": ...}

    TODO (you): implement the five steps in this module's docstring.
    """
    raise NotImplementedError(
        "Build this after the knowledge-base pipeline works. Read the module "
        "docstring for the recipe."
    )
