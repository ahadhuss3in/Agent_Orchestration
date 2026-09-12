from langgraph.graph import END, StateGraph

from services.Orchestration.nodes.extract_entities import extract_entities
from services.Orchestration.nodes.fetch_context import fetch_context
from services.Orchestration.nodes.intake import intake_seed
from services.Orchestration.nodes.store_context import store_context
from services.Orchestration.nodes.write_to_graph import write_to_graph
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

graph = StateGraph(OrchestrationState)

graph.add_node("intake_seed", intake_seed)
graph.add_node("fetch_context", fetch_context)
graph.add_node("store_context", store_context)
graph.add_node("extract_entities", extract_entities)
graph.add_node("write_to_graph", write_to_graph)

# Linear pipeline now: every seed pulls live context. There used to be a
# real/fictional branch, but the product decision is that a seed is always
# enriched with whatever real coverage exists, so there is nothing to branch on.
graph.set_entry_point("intake_seed")
graph.add_edge("intake_seed", "fetch_context")
graph.add_edge("fetch_context", "store_context")
graph.add_edge("store_context", "extract_entities")
graph.add_edge("extract_entities", "write_to_graph")
graph.add_edge("write_to_graph", END)

orchestration_agent = graph.compile()
