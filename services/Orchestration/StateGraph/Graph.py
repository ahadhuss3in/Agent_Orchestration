### Orchestration engine graph.
### M12: intake_seed. M14: fetch_context, real seeds only.
### M15: extract_entities, both paths converge into it.
### M16: write_to_graph, writes extraction results into Neo4j.
### M17: await_agent_selection pauses via interrupt() for a human to pick
### which entities become agents, then build_agent_profiles turns the pick
### into real AgentProfiles. A checkpointer is required for interrupt()/
### Command(resume=...) to work, so one is added at compile time here.

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Orchestration.nodes.intake import intake_seed
from services.Orchestration.nodes.fetch_context import fetch_context
from services.Orchestration.nodes.extract_entities import extract_entities
from services.Orchestration.nodes.write_to_graph import write_to_graph
from services.Orchestration.nodes.await_agent_selection import await_agent_selection
from services.Orchestration.nodes.build_agent_profiles import build_agent_profiles

graph = StateGraph(OrchestrationState)

graph.add_node("intake_seed", intake_seed)
graph.add_node("fetch_context", fetch_context)
graph.add_node("extract_entities", extract_entities)
graph.add_node("write_to_graph", write_to_graph)
graph.add_node("await_agent_selection", await_agent_selection)
graph.add_node("build_agent_profiles", build_agent_profiles)


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
graph.add_edge("extract_entities", "write_to_graph")
graph.add_edge("write_to_graph", "await_agent_selection")
graph.add_edge("await_agent_selection", "build_agent_profiles")
graph.add_edge("build_agent_profiles", END)

orchestration_agent = graph.compile(checkpointer=MemorySaver())
