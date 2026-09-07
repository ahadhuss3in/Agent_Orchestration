from typing import TypedDict, List, Annotated
from langgraph.graph.message import add_messages

### State graph for the agents built

class AgentState(TypedDict):
    messages:Annotated[List[dict], add_messages]
    query: str
    citation:List[str]
    plan:List[str]  ## intention , selecting of node
    status:str ## what node ( plan, tech,use)
    final_ans:str


class AgentChatState(AgentState):
    """
    Same graph, same nodes, used for chatting with one simulated agent
    instead of the general chatbot. agent_id/persona/qdrant_filter stay
    unset for the general chatbot, so nothing about its behavior changes.
    """
    agent_id: str
    persona: str
    qdrant_filter: dict
