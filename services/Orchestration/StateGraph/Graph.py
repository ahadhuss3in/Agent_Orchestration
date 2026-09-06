### Orchestration engine graph.
### M12: intake_seed. M14: fetch_context, real seeds only.
### M15: extract_entities, both paths converge into it.
### No checkpointer yet, that arrives at M17 when a seed's run needs to
### pause for human agent-selection and resume later.

from langgraph.graph import StateGraph, END
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Orchestration.nodes.intake import intake_seed
from services.Orchestration.nodes.fetch_context import fetch_context
from services.Orchestration.nodes.extract_entities import extract_entities

graph = StateGraph(OrchestrationState)

graph.add_node("intake_seed", intake_seed)
graph.add_node("fetch_context", fetch_context)
graph.add_node("extract_entities", extract_entities)


def route_after_intake(state: OrchestrationState):
    """Real seeds go fetch real-world context first. Fictional seeds skip
    straight to extraction, there's nothing real to look up for those.
    Either way, both paths end up at extract_entities.
    """
    if state["seed_type"] == "real":
        return "fetch_context"
    return "extract_entities"


graph.set_entry_point("intake_seed")
graph.add_conditional_edges(
    "intake_seed",
    route_after_intake,
    {
        "fetch_context": "fetch_context",
        "extract_entities": "extract_entities",
    },
)
graph.add_edge("fetch_context", "extract_entities")
graph.add_edge("extract_entities", END)

orchestration_agent = graph.compile()
