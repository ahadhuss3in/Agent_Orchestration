import logfire
from langgraph.types import interrupt

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def await_agent_selection(state: OrchestrationState):
    """
    Pauses the graph here and surfaces every candidate entity to a human.
    interrupt() halts execution and returns its argument to whoever called
    ainvoke() this time; the graph only continues once someone resumes the
    same thread_id with Command(resume=<list of chosen entity_ids>), which
    becomes this call's return value.
    """
    selected_ids = interrupt({
        "message": "Select which entities should become simulated agents.",
        "candidates": state["candidate_entities"],
    })

    logfire.info(
        f"Seed {state['seed_id']}: human selected {len(selected_ids)} agents",
        selected_ids=selected_ids,
    )

    return {
        "selected_agent_ids": selected_ids,
        "phase": "agents_selected",
    }
