```
████    ███   █   █  █████  █   █  █████   ███   █   █
█   █  █   █  ██  █    █    █   █  █      █   █  ██  █
████   █████  █ █ █    █    █████  ████   █   █  █ █ █
█      █   █  █  ██    █    █   █  █      █   █  █  ██
█      █   █  █   █    █    █   █  █      █   █  █   █
█      █   █  █   █    █    █   █  █████   ███   █   █
```

> Give it one sentence. It builds a graph, wakes up the people in it, and
> lets them argue about it without you.

Curious what's actually going on under the hood? We're not explaining it
twice. 👉 **visit: [aisimulation.site](https://aisimulation.site)**

---

## What this is

An orchestration engine: feed it a seed (a real event or a made-up one), it
extracts the entities and relationships into a Neo4j knowledge graph, a human
picks which entities get promoted into autonomous agents, those agents run
through several rounds of simulated interaction, and afterward a human can
open a direct 1:1 chat with any one of them. The `frontend/` folder is the
marketing site for this pipeline; the actual engine lives under `services/`.

## Project layout

```
AI-Engine/
  app/               shared settings (reads .env)
  services/
    Orchestration/    seed intake, graph writes, agent promotion, simulation loop
    Rag/               retrieval-augmented generation backbone the agents run on
  frontend/           Next.js marketing site ("Pantheon")
  docs/               living project docs
```

## Setting up the backend

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
# install dependencies
uv sync

# copy the environment template and fill in your own keys
cp .env.example .env   # if one doesn't exist yet, create .env directly
```

You'll need values for at least:

```
OPENROUTER_API_KEY / OPENROUTER_BASE_URL
GROQ_API_KEY
TAVILY_API_KEY
QDRANT_API_KEY / QDRANT_CLUSTER_ENDPOINT
GEMINI_API_KEY
NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD
EMBEDDING_PROVIDER   (gemini, or custom — see CUSTOM_EMBEDDING_* if so)
```

Run the orchestration API (seed intake, graph, agents, simulation):

```bash
uv run uvicorn services.Orchestration.main:app --reload
```

Run the RAG service on its own (the retrieval/chat backbone the agents reuse):

```bash
uv run uvicorn services.Rag.main:app --reload
```

## Setting up the frontend

Requires Node 20+.

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000`.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Docs

`docs/KNOWLEDGE_GRAPH.md` and `docs/plan.md` track the architecture and
build history in more detail than this file ever will.
