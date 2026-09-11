"""
write_to_graph: persist the extracted entities and relationships into Neo4j.

WHY THIS NODE IS SO THIN
------------------------
Graph nodes should be orchestration, not implementation. This node's whole job
is to hand the extraction results to the graph store and move the phase along.
The actual Cypher lives in services/Orchestration/graphdb/neo4j_service.py, so
it can be tested on its own without running LangGraph.

WHAT THIS NODE OWNS
-------------------
  phase   set it to "written_to_graph".

HOW TO BUILD IT
---------------
1. Call the service you are going to write:
       from services.Orchestration.graphdb.neo4j_service import write_entities
   Pass seed_id, seed_text, candidate_entities, relationships. If you added
   provenance, make sure those source_chunk_ids make it into the call too.
2. Return {"phase": "written_to_graph"}.

THINK ABOUT
-----------
- Should this node fail loudly if Neo4j is down, or swallow the error? A
  swallowed write error means the API reports success while the graph is
  empty. For a knowledge base build, failing loudly is usually right.
- After this node the pipeline ends (END). Where would you verify the write
  actually landed, and could you automate that check in a test?
"""

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def write_to_graph(state: OrchestrationState):
    raise NotImplementedError(
        "Implement write_to_graph. Read this module's docstring first, then "
        "implement the real work in neo4j_service.write_entities."
    )
