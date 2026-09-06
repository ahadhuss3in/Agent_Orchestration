"""
A small direct MCP client for calling the Tavily server (tavily_server.py).
ad, the same
way it was already proven to work during M13's verification.
"""

import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TAVILY_SERVER_PARAMS = StdioServerParameters(
    command="uv",
    args=["run", "python", "-m", "services.MCP.tavily_server"],
)


async def call_tavily_tool(tool_name: str, arguments: dict) -> list[dict]:
    """Start the Tavily MCP server as a subprocess, call one tool on it,
    and return the results as plain dicts.

    Each result comes back over MCP as its own text block containing one
    JSON object, confirmed by inspecting a real response, not assumed.
    """
    async with stdio_client(TAVILY_SERVER_PARAMS) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments)
            return [json.loads(block.text) for block in result.content]
