"""
Social context layer: fetch, normalize and de-duplicate public posts.

Layering, outermost first:

    social_server.py     MCP tool surface; the only thing the orchestrator talks to
    adapters/            per-platform fetch, one file per data source
    records.py           PostRecord, the single shape every adapter must produce
    normalize.py         dedup, timestamps, engagement math (no network, no LLM)
    budget.py            cost ceiling, checked before any network call

Two rules hold everywhere below here:

1. A fetch that could not run raises. It never returns an empty list, because
   an empty list is indistinguishable from "nobody is talking about this".
2. A field the platform did not expose is None. It is never defaulted, never
   inferred, and never zero.
"""