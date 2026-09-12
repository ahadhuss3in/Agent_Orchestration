"""
fetch_context: pull live real-world articles for the seed.

This node is "the online data about it" half of the input. It always runs now,
there is no real/fictional branch: every seed is enriched with whatever real
coverage exists.

The tool itself is a separate MCP server (services/MCP/tavily_server.py). We
call it through services/MCP/client.py, which starts that server as a
subprocess, calls one tool, and returns the results as plain dicts.
"""

import asyncio

import logfire

from services.MCP.client import call_tavily_tool
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


async def fetch_context(state: OrchestrationState):
    with logfire.span("Fetching real world context", seed_id=state["seed_id"]):
        # A search engine wants a short query, not a whole page. seed_text can
        # be tens of thousands of characters, so collapse whitespace and keep
        # only the opening slice. Crude headline extraction, good enough for a
        # first pass; a smarter version would ask the LLM for a query.
        query = " ".join(state["seed_text"].split())[:400]
        logfire.info(f"Fetching context for seed {state['seed_id']}")

        # call_tavily_tool is async, which is why this node is async too. The
        # MCP call starts a subprocess, so give it its own span and a hard
        # timeout: without one a stuck MCP handshake would hang the whole run.
        # Returns a list of {title, url, content}.
        with logfire.span("tavily mcp search", query_chars=len(query)):
            articles = await asyncio.wait_for(
                call_tavily_tool(
                    "search_recent_news",
                    {"query": query, "max_results": 5},
                ),
                timeout=60,
            )

        logfire.info(f"Fetched {len(articles)} real-world article(s) via Tavily")

        # We keep title/url/content because store_context needs to label these
        # chunks as source_type "web" and keep the url for citations.
        return {
            "fetched_context": articles,
            "phase": "context_fetched",
        }
