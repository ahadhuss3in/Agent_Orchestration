"""
A real MCP server exposing web search as a tool, backed by Tavily.

"""

from mcp.server.mcpserver import MCPServer
from tavily import TavilyClient

from app.config import config

mcp_server = MCPServer("tavily-research")

tavily_client = TavilyClient(api_key=config.TAVILY_API_KEY)


@mcp_server.tool()
def search_recent_news(query: str, max_results: int = 5) -> list[dict]:
    """Search for recent real-world news relevant to a seed scenario.

    Returns a list of {title, url, content} dicts, the actual article
    snippets, not just links.
    """
    result = tavily_client.search(query, max_results=max_results, topic="news")
    return [
        {"title": r["title"], "url": r["url"], "content": r["content"]}
        for r in result["results"]
    ]


if __name__ == "__main__":
    mcp_server.run()
