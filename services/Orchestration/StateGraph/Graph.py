### The knowledge-base pipeline graph.
###
### This is the LangGraph wiring for turning one seed into a queryable
### knowledge base. Read the nodes in order:
###
###   intake_seed       PDF on disk -> plain text + identity
###   fetch_context     real seeds only: pull live articles via Tavily
###   store_context     chunk + embed + write to Qdrant under this seed_id
###   extract_entities  chunk-by-chunk LLM extraction with provenance
###   write_to_graph    entities + relationships into Neo4j (per-seed)
###
### After write_to_graph the seed's knowledge base exists in two places:
### raw context in Qdrant, structured entities/relationships in Neo4j, and
### the two are bridged by ids (Qdrant chunks carry entity_ids, Neo4j nodes
### carry source_chunk_ids). Retrieval (Graph RAG) is built separately later.
###
### HOW LANGGRAPH THINKS, since this is the first graph you own:
###   StateGraph(SomeState)  declares what the shared state looks like.
###   add_node("name", fn)   registers a function under a name.
###   add_edge(a, b)         b always runs after a.
###   add_conditional_edges  picks the next node at runtime with a function
###                          that returns one of the listed names.
###   set_entry_point        which node runs first.
###   compile()              freezes the wiring into a runnable object.

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


def route_after_intake(state: OrchestrationState):
    """Real seeds go fetch live context first. Fictional seeds have nothing
    real to look up, so they skip straight to storage.

    NOTE: both branches MUST end up at store_context. Storage is not optional
    for fictional seeds, their own PDF text still has to get into Qdrant or
    there is nothing for the knowledge base to retrieve later.
    """
    if state["seed_type"] == "real":
        return "fetch_context"
    return "store_context"


graph.set_entry_point("intake_seed")
graph.add_conditional_edges(
    "intake_seed",
    route_after_intake,
    {
        "fetch_context": "fetch_context",
        "store_context": "store_context",
    },
)
graph.add_edge("fetch_context", "store_context")
graph.add_edge("store_context", "extract_entities")
graph.add_edge("extract_entities", "write_to_graph")
graph.add_edge("write_to_graph", END)

orchestration_agent = graph.compile()
