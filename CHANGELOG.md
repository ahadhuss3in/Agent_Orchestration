# Changelog

Notable changes to AI-Engine. This project is pre-1.0 and moving fast, so entries
describe capabilities rather than releases. Dates are the date the work landed on
`main`.

## Unreleased

### Added
- Social context layer (`services/MCP/social/`): a normalized `PostRecord` shape,
  a pre-flight `RunBudget` cost/post ceiling, typed failures instead of empty
  lists, deterministic de-duplication and engagement math, and platform adapters
  (X official API v2; Instagram / Facebook via Bright Data).
- `fetch_social_context` pipeline node, opt-in via `SOCIAL_PLATFORMS`. Empty
  config makes it a no-op pass-through, so the default pipeline is unchanged.
- Agent layer: after the graph is written, the top entities by relationship count
  become a promotable pool; a human assigns one of four behavioural archetypes
  and can chat with the agent, grounded in the stored chunks with citations.
- `.env.example`, `.editorconfig`, and `.gitattributes` for setup and consistent
  tooling across platforms.

### Changed
- README rewritten to match the implemented pipeline, include the API surface,
  and state plainly what is not built yet.
- `frontend/README.md` replaced the default Next.js boilerplate with notes for
  the actual marketing site.

### Known gaps
- Graph RAG retrieval is a documented recipe (`Rag/retrieval/graph_retriever.py`),
  not an implementation; the Qdrant helpers it needs are still stubs.
- Only the Instagram social field map has been verified against a real provider
  response. X / Facebook mapping raises rather than guess field names.
- A run wipes Qdrant and Neo4j (single-seed demo), and the API has no auth.

## Earlier history (from the git log)

- `brightdata implementation` — Instagram / Facebook collection path and the
  social package's domain layer.
- `fixed chunk mode` / `chunk mode implementation` — provider-aware chunking and
  the deterministic point-id scheme for stored chunks.
- `custom mcp for context` — the Tavily MCP server, the direct stdio client, and
  wiring live web context into the pipeline.
- Earlier: seed intake, structured entity/relationship extraction, the Neo4j
  write path, and the console for exploring an extracted graph.
