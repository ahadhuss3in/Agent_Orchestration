### Making the State Graph and Initializing it.


## connecting akk the components
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from services.Rag.agent.StateGraph.RagState import AgentChatState
from services.Rag.agent.nodes.planner import planned_node
from services.Rag.agent.nodes.responder import generate_node
from services.Rag.agent.nodes.retriever import retrieve_node

## Initialize the graph
graph = StateGraph(AgentChatState)


## define what are the nodes of the graph
graph.add_node("planner",planned_node)
graph.add_node("retriever", retrieve_node)
graph.add_node("generate_res", generate_node)


def route_planner(state:AgentChatState):
    """
    routes the workflow based on the planners decision
    """

    if state["query"] == "CONVERSATIONAL":
        return "generate_res"
    return "retriever"

graph.set_entry_point("planner")

graph.add_conditional_edges(
    "planner",
    route_planner,
    {
        "retriever":"retriever",
        "generate_res":"generate_res"
    }
)

graph.add_edge("retriever","generate_res")
graph.add_edge("generate_res",END)

checkpointer=MemorySaver()

rag_agent = graph.compile(checkpointer=checkpointer)