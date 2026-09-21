from langgraph.graph import END, StateGraph

from services.Orchestration.nodes.extract_entities import extract_entities
from services.Orchestration.nodes.fetch_context import fetch_context
from services.Orchestration.nodes.fetch_social_context import fetch_social_context
from services.Orchestration.nodes.intake import intake_seed
from services.Orchestration.nodes.select_agent_pool import select_agent_pool
from services.Orchestration.nodes.store_context import store_context
from services.Orchestration.nodes.write_to_graph import write_to_graph
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

graph = StateGraph(OrchestrationState)

graph.add_node("intake_seed", intake_seed)
graph.add_node("fetch_context", fetch_context)
graph.add_node("fetch_social_context", fetch_social_context)
graph.add_node("store_context", store_context)
graph.add_node("extract_entities", extract_entities)
graph.add_node("write_to_graph", write_to_graph)
graph.add_node("select_agent_pool", select_agent_pool)

# Linear pipeline now: every seed pulls live context. There used to be a
# real/fictional branch, but the product decision is that a seed is always
# enriched with whatever real coverage exists, so there is nothing to branch on.
#
# select_agent_pool sits after the write because it reads the finished graph to
# rank entities by connectivity. It produces the candidate list only; the
# promotion into an archetype is the human gate and happens later, over the API.
graph.set_entry_point("intake_seed")
graph.add_edge("intake_seed", "fetch_context")
# Social fetching sits between the web fetch and storage. With
# SOCIAL_PLATFORMS empty it returns immediately, so the default pipeline does
# the same work it did before this node existed.
graph.add_edge("fetch_context", "fetch_social_context")
graph.add_edge("fetch_social_context", "store_context")
graph.add_edge("store_context", "extract_entities")
graph.add_edge("extract_entities", "write_to_graph")
graph.add_edge("write_to_graph", "select_agent_pool")
graph.add_edge("select_agent_pool", END)

orchestration_agent = graph.compile()
