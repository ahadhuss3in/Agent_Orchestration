"""
fetch_context: pull live real-world articles for the seed, and persist them.

Everything a Tavily search returns is written to disk before anything else
touches it, so the same file-based ingestion path can pick it up:

    DATA/web/<seed_id>/<hash>.txt      one raw article, text content
    DATA/web/<seed_id>/manifest.json   [{file, title, url}]

The file name is a hash of the article url, not its position, so it is stable
across reruns. That keeps chunk_id (which is built from the source) stable
too, which is what makes re-running a seed overwrite instead of duplicate.
"""

import asyncio
import hashlib
import json
import os
from pathlib import Path

import logfire

from services.MCP.client import call_tavily_tool
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

WEB_DIR = os.path.join("DATA", "web")


def _web_filename(url: str) -> str:
    """Stable file name for an article, derived from its url."""
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    return f"{digest}.txt"


def _persist_articles(seed_id: str, articles: list[dict]) -> int:
    """Write raw article text plus a manifest. Returns how many were written."""
    folder = os.path.join(WEB_DIR, seed_id)
    os.makedirs(folder, exist_ok=True)

    manifest = []
    written = set()
    for index, article in enumerate(articles):
        # A result should always have a url, but fall back to an index so a
        # missing one cannot collide with another.
        url = article.get("url") or f"web-{index}"
        filename = _web_filename(url)
        if filename in written:
            continue
        written.add(filename)

        content = article.get("content", "") or ""
        Path(os.path.join(folder, filename)).write_text(content, encoding="utf-8")
        manifest.append(
            {
                "file": filename,
                "title": article.get("title", ""),
                "url": url,
            }
        )
    ## crete a manifest to keep track of the files and meta data
    Path(os.path.join(folder, "manifest.json")).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(manifest)


async def fetch_context(state: OrchestrationState):
    with logfire.span("Fetching real world context", seed_id=state["seed_id"]):
        ## send just the first few characters
        ## mainly should contain the heading 
        ## maybe i can improve this later by asking a llm to give 
        ## the heading to better search for context.
        query = " ".join(state["seed_text"].split())[:400]
        logfire.info(f"Fetching context for seed {state["seed_id"]}")

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

       ## save the fetched articles to disk 
        with logfire.span("Saving the fetched web documents", count=len(articles)):
            count = _persist_articles(state["seed_id"], articles)

        logfire.info(f"Fetched {count} real-world article(s) via Tavily")

        return {
            "fetched_context": articles,
            "phase": "context_fetched",
        }
