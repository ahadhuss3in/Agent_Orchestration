"""
A real MCP server exposing social context as tools, over X, Instagram and
Facebook, through the adapters in services/MCP/social/.

Run standalone the same way the Tavily server is run:

    uv run python -m services.MCP.social_server

Tool surface, deliberately two tools:

    fetch_posts      one platform, one query, normalized PostRecords + coverage
    platform_health  which platforms are configured, without spending money

Two more tools are planned and not built yet: fetch_post (one post by id) and
fetch_author (a profile plus its posts). They are absent rather than stubbed
because their endpoint paths are not yet confirmed against the live APIs, and
this project's standing rule is to read a real response before writing code
against it. A stub that returns [] would be worse than a missing tool.

The response contract matters more than the tool list:

    {"ok": true,  "records": [...], "coverage": {...}, "dedup": {...}, ...}
    {"ok": false, "code": "...", "error": "...", "records": [], ...}

A caller can always tell "the fetch failed" from "nothing matched", which is
the difference between a market brief that says "no demand" and one that says
"we could not see". Everything below upholds that, at the cost of never
returning a bare empty list.
"""

from typing import Any

from mcp.server.mcpserver import MCPServer

from services.MCP.social.adapters import all_adapters, get_adapter
from services.MCP.social.adapters.base import FetchRequest
from services.MCP.social.budget import default_budget
from services.MCP.social.errors import SocialError
from services.MCP.social.normalize import dedupe, parse_utc
from services.MCP.social.records import QueryType

mcp_server = MCPServer("social-context")


def _failure(code: str, message: str, platform: str | None = None) -> dict:
    """A loud failure. Never an empty record list with ok: true."""
    return {
        "ok": False,
        "code": code,
        "error": message,
        "platform": platform,
        "records": [],
        "count": 0,
        "coverage": None,
        "dedup": None,
    }


@mcp_server.tool()
def fetch_posts(
    platform: str,
    query: str,
    query_type: str = "keyword",
    limit: int = 50,
    since: str | None = None,
    until: str | None = None,
) -> dict[str, Any]:
    """Fetch public posts for one platform and one query.

    Returns normalized records plus a coverage object. Coverage is the part
    that matters: it records what was actually reached, whether the fetch was
    truncated, and why. A caller that ignores coverage will eventually report a
    rate limit as a lack of market interest.

    Timestamps are ISO 8601. The result is de-duplicated before it is returned.
    """
    try:
        request = FetchRequest(
            platform=platform.strip().lower(),
            query=query,
            query_type=QueryType((query_type or "keyword").strip().lower()),
            since=parse_utc(since) if since else None,
            until=parse_utc(until) if until else None,
            limit=int(limit),
        )
    except (ValueError, TypeError) as exc:
        return _failure("invalid_argument", str(exc), platform)

    try:
        adapter = get_adapter(request.platform)
    except KeyError as exc:
        return _failure("unknown_platform", str(exc), platform)

    try:
        # The ceiling is checked before the first network call. X bills per
        # post read, so a fan-out that overshoots is an invoice, not a warning.
        budget = default_budget()
        allowed = budget.allow(request.limit, adapter.usd_per_record)
        capped = allowed < request.limit
        request.limit = allowed

        result = adapter.fetch_posts(request)
        budget.spend(len(result.records), adapter.usd_per_record)
    except SocialError as exc:
        return _failure(exc.code, str(exc), request.platform)

    records, dedup_report = dedupe(result.records)
    coverage = result.coverage.model_dump(mode="json")
    if capped:
        covered_notes = list(coverage.get("notes") or [])
        covered_notes.append(
            f"requested {limit} records, budget allowed {allowed}; fetch reduced"
        )
        coverage["notes"] = covered_notes
        coverage["truncated"] = True

    return {
        "ok": True,
        "platform": request.platform,
        "records": [record.model_dump(mode="json") for record in records],
        "count": len(records),
        "coverage": coverage,
        "dedup": dedup_report,
        "estimated_cost_usd": result.estimated_cost_usd,
        "budget": {
            "posts_fetched": budget.posts_fetched,
            "cost_usd": budget.cost_usd,
            "max_posts": budget.max_posts,
            "max_cost_usd": budget.max_cost_usd,
        },
    }


@mcp_server.tool()
def platform_health() -> list[dict[str, Any]]:
    """Configuration status per platform. Spends nothing and fetches nothing.

    A configured platform here means credentials and identifiers are present,
    not that the source is currently reachable or accurate. Live canary checks
    are a separate concern and are not built yet.
    """
    return [adapter.health().model_dump(mode="json") for adapter in all_adapters()]


if __name__ == "__main__":
    mcp_server.run()