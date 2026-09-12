"""
fetch_context: pull live real-world articles for a real seed.
"""

import logfire

from services.MCP.client import call_tavily_tool
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


async def fetch_context(state: OrchestrationState):
    with logfire.span("Fetching real world context", seed_id=state["seed_id"]):
        query = " ".join(state["seed_text"].split())[:400]
        logfire.info(f"Fetching context for seed {state["seed_id"]}")
        articles = await call_tavily_tool(
            "search_recent_news",
            {"query": query, "max_results": 5},
        )

        logfire.info(f"Fetched {len(articles)} real-world article(s) via Tavily")

        # We keep title/url/content because store_context needs to label these
        # chunks as source_type "web" and keep the url for citations.
        return {
            "fetched_context": articles,
            "phase": "context_fetched",
        }
