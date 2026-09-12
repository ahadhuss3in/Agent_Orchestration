"""
write_to_graph: persist the extraction into Neo4j.

This node stays thin on purpose. Graph nodes should be orchestration, not
implementation, so the Cypher lives in graphdb/neo4j_service.py where it can be
tested without running LangGraph.
"""

import logfire

from services.Orchestration.graphdb.neo4j_service import write_entities
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def write_to_graph(state: OrchestrationState):
    # Let a Neo4j failure raise. Swallowing it would make the API report
    # success while the graph is empty, which is the worst possible outcome.
    with logfire.span("Writing to knowledge graph", seed_id=state["seed_id"]):
        write_entities(
            seed_id=state["seed_id"],
            seed_text=state["seed_text"],
            entities=state["candidate_entities"],
            relationships=state["relationships"],
        )
        return {"phase": "written_to_graph"}
