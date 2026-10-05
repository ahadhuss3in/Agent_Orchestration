# Contributing

Thanks for poking at AI-Engine. This file covers the layout, the dev loop, and
the few conventions the codebase actually relies on.

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node 20+ (only for `frontend/` and `frontend_app/`)
- Free/managed accounts for Qdrant, Neo4j, and an LLM + embeddings provider
  (see `README.md` and `.env.example`)

## Setup

```bash
uv sync
cp .env.example .env      # fill in your own keys; .env is gitignored
```

Run the API:

```bash
uv run uvicorn services.Orchestration.main:app --reload
```

## Where things live

```
app/                  shared config (reads .env) — the only config source
services/Orchestration/   the pipeline, the HTTP API, Neo4j, agents
services/Rag/         loaders, chunking, embeddings, retrieval
services/MCP/         MCP servers + client (Tavily, social)
frontend/             marketing site
frontend_app/         operator console
```

If you are changing pipeline behaviour, the file you almost always want is one
of `services/Orchestration/nodes/*.py`; the graph wiring itself is the small
`StateGraph/Graph.py`.

## Conventions

- **Config goes through `app/config.py`.** Do not read `os.getenv` elsewhere;
  add the setting there so it is discoverable in one place.
- **Ids are structural.** Use the helpers in `services/Orchestration/ids.py`.
  New Qdrant points must use the deterministic `point_id(chunk_id)`; do not
  introduce `uuid4` for anything that can be re-run (the legacy
  `Rag/ingestion/processor.py` keeps a documented exception).
- **Writes must be idempotent.** Neo4j writes use `MERGE` on `entity_id`, not
  `CREATE`. A second identical run must not change the node count.
- **Never return an empty list for a failure.** This is the standing rule in the
  social layer: a fetch that could not run raises a typed error and is surfaced
  in coverage. An empty list means "we looked and found nothing", and nothing
  else. See `services/MCP/social/errors.py`.
- **A field the provider did not expose is `None`**, never `0` and never a
  guess. Same reason.
- **Ground everything.** Any answer an agent gives must come from retrieved
  chunks and must carry citations. If retrieval found nothing, the correct reply
  is "no supporting context", not a guess.
- **Cypher identifiers.** Relationship types cannot be parameterized, so they
  are sanitized in `graphdb/neo4j_service.py`. Entity labels come from a closed
  set. Keep it that way; do not interpolate user input into a query.

## Style

- Python is formatted/linted with `ruff`:
  ```bash
  uv run ruff check .
  uv run ruff format .      # optional, if you want it to rewrite
  ```
- TypeScript: `npm run lint` inside `frontend/` or `frontend_app/`.
- Keep comments explaining *why*, not *what*. The existing code does this
  heavily; match the tone rather than adding narration.

## Tests

`pytest` and `pytest-asyncio` are configured (`pythonpath = ["."]` in
`pyproject.toml`). The suite is still thin; the highest-value additions are:

1. Pure unit tests: `slugify`/id stability, `chunk_text`, `parse_utc`,
   `normalize_tags`, `dedupe`, `RunBudget`.
2. A contract test with a fake LLM returning a fixed extraction, asserting the
   merge/alias/pruning rules.
3. A FastAPI `TestClient` integration test with fakes for Qdrant/Neo4j/MCP.

```bash
uv run pytest
```

## Pull requests

- Keep a PR scoped to one idea; the history works best as small, explainable
  commits.
- Say how you verified it. "It ran" is not verification if the change touches a
  store, a provider, or an LLM prompt; show the real output you read.
- Do not commit `.env`, real API keys, `DATA/`, or anything under `docs/`
  (documentation is intentionally local and gitignored).
