"""
A small direct MCP client for calling the Tavily server (tavily_server.py).
ad, the same
way it was already proven to work during M13's verification.
"""

import json

import logfire
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TAVILY_SERVER_PARAMS = StdioServerParameters(
    command="uv",
    args=["run", "python", "-m", "services.MCP.tavily_server"],
)

SOCIAL_SERVER_PARAMS = StdioServerParameters(
    command="uv",
    args=["run", "python", "-m", "services.MCP.social_server"],
)


async def call_tavily_tool(tool_name: str, arguments: dict) -> list[dict]:
    """Start the Tavily MCP server as a subprocess, call one tool on it,
    and return the results as plain dicts.

    Each result comes back over MCP as its own text block containing one
    JSON object, confirmed by inspecting a real response, not assumed.
    """
    # Spawning a subprocess and doing the MCP handshake is not free, so this
    # gets a span. It is also where a run would hang if the server never
    # responds, which the timeout in fetch_context guards against.
    with logfire.span("mcp tavily call", tool=tool_name):
        async with stdio_client(TAVILY_SERVER_PARAMS) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)
                return [json.loads(block.text) for block in result.content]


async def call_social_tool(tool_name: str, arguments: dict) -> dict:
    """Call one tool on the social MCP server and return its single result dict.

    Unlike the Tavily server, which returns a list of per-result JSON blocks,
    each social tool returns one JSON object: records plus coverage, or a typed
    failure. An `ok: false` payload is a real answer rather than an exception,
    because the caller has to record which platforms failed. A transport-level
    error still raises.
    """
    with logfire.span("mcp social call", tool=tool_name):
        async with stdio_client(SOCIAL_SERVER_PARAMS) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)
                blocks = [block.text for block in result.content]
                # The installed mcp version exposes is_error (snake_case), not
                # the isError spelling most examples show, and it serializes a
                # returned list as one text block per element rather than one
                # block for the whole list. Both confirmed against real
                # responses from this server, not assumed.
                if result.is_error:
                    raise RuntimeError(f"social tool {tool_name} failed: {''.join(blocks)[:300]}")
                payloads = [json.loads(block) for block in blocks]
                return payloads[0] if len(payloads) == 1 else payloads
