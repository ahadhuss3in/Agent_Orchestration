### Orchestration engine graph.
### pause for human agent-selection and resume later.

from langgraph.graph import StateGraph, END
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Orchestration.nodes.intake import intake_seed
from services.Orchestration.nodes.fetch_context import fetch_context

graph = StateGraph(OrchestrationState)

graph.add_node("intake_seed", intake_seed)
graph.add_node("fetch_context", fetch_context)


def route_after_intake(state: OrchestrationState):
    """Real seeds go fetch real-world context. Fictional seeds skip
    straight to the end, there's nothing real to look up for those.
    """
    if state["seed_type"] == "real":
        return "fetch_context"
    return "skip"


graph.set_entry_point("intake_seed")
graph.add_conditional_edges(
    "intake_seed",
    route_after_intake,
    {
        "fetch_context": "fetch_context",
        "skip": END,
    },
)
graph.add_edge("fetch_context", END)

orchestration_agent = graph.compile()
