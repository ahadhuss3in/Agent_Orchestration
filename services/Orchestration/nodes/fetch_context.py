import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.MCP.client import call_tavily_tool


async def fetch_context(state: OrchestrationState):
    """
    Only reached for real-event seeds (see the conditional edge in
    Graph.py). Calls the Tavily MCP tool with the seed's own text as the
    search query and stores whatever comes back.
    """
    with logfire.span("Fetching real world context", seed_id=state["seed_id"]):
        articles = await call_tavily_tool(
            "search_recent_news",
            {"query": state["seed_text"], "max_results": 5},
        )
        logfire.info(f"Fetched {len(articles)} real-world article(s) via Tavily")

        return {
            "fetched_context": articles,
            "phase": "context_fetched",
        }
