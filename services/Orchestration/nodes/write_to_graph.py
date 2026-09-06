import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Orchestration.graphdb.neo4j_service import write_entities


def write_to_graph(state: OrchestrationState):
    """
    Takes whatever extract_entities produced and writes it into Neo4j.
    Safe to run more than once on the same seed, writes are idempotent.
    """
    write_entities(
        seed_id=state["seed_id"],
        seed_text=state["seed_text"],
        entities=state["candidate_entities"],
        relationships=state["relationships"],
    )
    logfire.info(f"Seed {state['seed_id']} written to knowledge graph")

    return {
        "phase": "written_to_graph",
    }
