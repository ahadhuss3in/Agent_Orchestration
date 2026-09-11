"""
fetch_context: pull live real-world context for real seeds.

WHY THIS NODE EXISTS
--------------------
A fictional seed carries all its context in its own PDF. A real seed does not:
the PDF is a starting point, and current articles fill in what happened around
it. This node is the "online data about it" half of the input.

WHEN IT RUNS
------------
Only for seed_type == "real". Graph.py's route_after_intake sends fictional
seeds straight to store_context, so this function is never called for them.
That also means fetched_context stays an empty list for fictional seeds.

WHAT THIS NODE OWNS
-------------------
  fetched_context   a list of article dicts, one per result.
  phase             set it to "context_fetched".

HOW TO BUILD IT
---------------
1. The web-search tool is served over MCP and already works. Call it through
   the client helper rather than talking to Tavily directly:
       from services.MCP.client import call_tavily_tool
   Read services/MCP/client.py to see its signature and what it returns.
2. Use state["seed_text"] as the search query. If it is a long PDF, that is a
   bad query (search engines want a sentence, not a page). Decide whether to
   truncate it, or derive a short query from it. If you derive a query, that
   is itself an LLM call and belongs in this node's scope.
3. Store what comes back in state["fetched_context"].

THINK ABOUT
-----------
- Tavily returns {title, url, content}. store_context will need to know a
  chunk came from a URL, not the PDF. Make sure whatever you store here keeps
  the url and title, you will want them for the Qdrant payload.
- What if the search returns zero results? Is that an error, or a real seed
  that happens to have no recent news?
"""

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


async def fetch_context(state: OrchestrationState):
    raise NotImplementedError(
        "Implement fetch_context. Read this module's docstring first. Note it "
        "is async because call_tavily_tool is async; keep the async keyword "
        "or Graph.py will await a non-awaitable."
    )
