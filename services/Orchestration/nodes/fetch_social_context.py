"""
fetch_social_context: pull public social posts for the seed, and persist them.

Sibling of fetch_context. That node fetches web articles through the Tavily MCP
server; this one fetches social posts through the social MCP server. Same
shape: an async node with a hard timeout, a persist step, and a manifest.

Two differences that are the whole point of the social layer:

* Per-platform failures do not kill the run, but they are never silent. A
  platform that could not be fetched lands in `social_coverage.failures`, and
  the brief generation step reads that instead of reading an empty list as
  absent demand.
* Nothing is fetched when SOCIAL_PLATFORMS is empty. The default configuration
  makes this node a pass-through, so adding it to the pipeline changes no
  existing behaviour until a platform is switched on deliberately.
"""

import asyncio
import json
import os
from pathlib import Path

import logfire

from app.config import config
from services.MCP.client import call_social_tool
from services.MCP.social.budget import plan_queries
from services.MCP.social.normalize import dedupe
from services.MCP.social.records import PostRecord, QueryType
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

SOCIAL_DIR = os.path.join("DATA", "social")


def _seed_query(seed_text: str) -> str:
    """The first few hundred characters of the seed, same as fetch_context does.

    Both nodes currently search on the raw opening of the seed because that is
    what is known to work. A query planner that turns the seed into real search
    terms is M23+ work, and doing it badly here would bias the sample.
    """
    return " ".join(seed_text.split())[:400]


def _persist(seed_id: str, records: list[PostRecord], payload: dict) -> str:
    """Write posts.jsonl plus a manifest. Returns the folder written to."""
    folder = os.path.join(SOCIAL_DIR, seed_id)
    os.makedirs(folder, exist_ok=True)

    posts_path = Path(os.path.join(folder, "posts.jsonl"))
    with posts_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(record.model_dump_json() + "\n")

    Path(os.path.join(folder, "manifest.json")).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return folder


async def fetch_social_context(state: OrchestrationState):
    seed_id = state["seed_id"]

    with logfire.span("Fetching social context", seed_id=seed_id):
        platforms = list(config.SOCIAL_PLATFORMS)
        if not platforms:
            logfire.info("Social fetching disabled (SOCIAL_PLATFORMS is empty)")
            return {
                "social_query_plan": [],
                "social_posts": [],
                "social_coverage": {
                    "enabled": False,
                    "reason": "SOCIAL_PLATFORMS is empty",
                    "failures": [],
                },
                "phase": "social_context_skipped",
            }

        plan = plan_queries(
            _seed_query(state["seed_text"]),
            platforms,
            config.SOCIAL_POSTS_PER_PLATFORM,
            QueryType(config.SOCIAL_QUERY_TYPE),
        )

        records: list[PostRecord] = []
        coverage: dict[str, dict] = {}
        failures: list[dict] = []

        for item in plan:
            with logfire.span("social mcp fetch", platform=item["platform"]):
                try:
                    result = await asyncio.wait_for(
                        call_social_tool(
                            "fetch_posts",
                            {
                                "platform": item["platform"],
                                "query": item["query"],
                                "query_type": item["query_type"],
                                "limit": item["limit"],
                            },
                        ),
                        timeout=config.SOCIAL_FETCH_TIMEOUT_SECONDS,
                    )
                except TimeoutError:
                    failures.append(
                        {
                            "platform": item["platform"],
                            "code": "timeout",
                            "error": f"no response within {config.SOCIAL_FETCH_TIMEOUT_SECONDS}s",
                        }
                    )
                    continue

                if not result.get("ok"):
                    # A typed failure, not an empty result. Kept in coverage so
                    # nothing downstream can read it as "no demand".
                    failures.append(
                        {
                            "platform": item["platform"],
                            "code": result.get("code"),
                            "error": result.get("error"),
                        }
                    )
                    continue

                coverage[item["platform"]] = result.get("coverage")
                records.extend(
                    PostRecord.model_validate(raw) for raw in result.get("records", [])
                )

        survivors, dedup_report = dedupe(records) if records else ([], None)

        if failures:
            logfire.warning(
                f"Social fetch incomplete: {len(failures)} platform(s) failed",
                failures=[f["platform"] for f in failures],
            )
        logfire.info(f"Fetched {len(survivors)} social post(s)")

        manifest = {
            "seed_id": seed_id,
            "query_plan": plan,
            "coverage": coverage,
            "failures": failures,
            "dedup": dedup_report,
            "posts_written": len(survivors),
            "platforms": {p: sum(1 for r in survivors if r.platform == p) for p in platforms},
        }
        folder = _persist(seed_id, survivors, manifest)

        return {
            "social_query_plan": plan,
            "social_posts": [record.model_dump(mode="json") for record in survivors],
            "social_coverage": {**manifest, "folder": folder},
            "phase": "social_context_fetched",
        }