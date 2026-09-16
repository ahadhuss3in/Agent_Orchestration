import glob
import os
import shutil
import uuid
from pathlib import Path

import logfire
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))


def _instrument(name: str, setup) -> None:
    """Turn on optional Logfire instrumentation without letting a missing
    plugin stop the API from booting. Each one adds spans for a whole category
    of work (inbound HTTP, outbound HTTP, the LLM SDK) so the trace explains
    where the time actually went, not just our own nodes.
    """
    try:
        setup()
        logfire.info(f"logfire instrumentation enabled: {name}")
    except Exception as e:  # noqa: BLE001 (instrumentation must never be fatal)
        logfire.warning(f"logfire instrumentation unavailable for {name}: {e}")


# Outbound HTTP (Jina embeddings use `requests`) and the OpenAI-compatible SDK
# (DeepSeek extraction). These produce their own child spans with latency and
# token counts, which is what makes a slow chunk obvious.
_instrument("requests", logfire.instrument_requests)
_instrument("openai", logfire.instrument_openai)
_instrument("mcp", logfire.instrument_mcp)

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from services.Orchestration.agents.archetypes import ARCHETYPE_IDS
from services.Orchestration.agents.chat import answer_as_agent
from services.Orchestration.graphdb.neo4j_service import (
    delete_seed,
    get_agent_pool,
    get_graph,
    list_seeds,
    set_agent_archetype,
)
from services.Orchestration.nodes.store_context import PLAINTEXT_DIR, WEB_DIR
from services.Orchestration.StateGraph.Graph import orchestration_agent
from services.Rag.retrieval.qdrant_service import delete_seed_points

app = FastAPI(title="Knowledge Base Engine")

# One span per inbound request, on top of the explicit "seed pipeline" span.
_instrument("fastapi", lambda: logfire.instrument_fastapi(app))

# The frontend2 Vite dev server runs on a different origin (5173) than this API
# (8000). Browsers block cross-origin requests unless the API opts in, so this
# middleware allows exactly the local dev origins.
app.add_middleware(
    CORSMiddleware,
    # Next dev picks the first free port (3000, then 3001, ...) and the old
    # Vite demo used 5173, so match any local port rather than a fixed list.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded seeds land here. DATA/ is gitignored, so nothing user-uploaded is
# ever committed. Change this if you move DATA elsewhere.
UPLOAD_DIR = os.path.join("DATA", "uploads")


class PromoteRequest(BaseModel):
    """Body for setting one agent's archetype. null = leave it in the pool."""

    archetype: str | None = None


class AgentQuery(BaseModel):
    """Body for one chat turn with an agent."""

    message: str


def _summarize(seed_id: str, result: dict) -> dict:
    """Shape the final state into a small API response.

    We deliberately do not return the seed text or every chunk, that would
    bloat the response for no reason. But we do return the extracted graph,
    because the UI needs to show it.

    Relationships only carry source_id/target_id, so build an id -> name map
    from the entities first and resolve the readable names here.
    """
    entities = result.get("candidate_entities", [])
    id_to_name = {e["entity_id"]: e["name"] for e in entities}

    relationships = [
        {
            "source_name": id_to_name.get(r["source_id"], r["source_id"]),
            "type": r["type"],
            "target_name": id_to_name.get(r["target_id"], r["target_id"]),
        }
        for r in result.get("relationships", [])
    ]

    return {
        "seed_id": seed_id,
        "status": "complete",
        "phase": result.get("phase"),
        "chunks_stored": len(result.get("stored_chunks", [])),
        "entities": [
            {"entity_id": e["entity_id"], "name": e["name"], "type": e["type"]}
            for e in entities
        ],
        "relationships": relationships,
        # The shortlist built by select_agent_pool. Returned inline so the
        # console can show it the moment a run finishes, without a second call.
        "agent_pool": result.get("agent_pool", []),
    }


@app.get("/")
def home():
    return {"message": "Knowledge Base Engine is live."}


@app.post("/seed")
async def submit_seed(file: UploadFile = File(...)):  # noqa: B008 (FastAPI dependency idiom)
    """Upload a seed PDF and run it through the whole knowledge-base pipeline.

    seed_id is generated here, not inside the graph, so the same id can be
    returned even if the run fails partway and you want to retry the same seed
    without ending up with two half-built knowledge bases.
    """
    seed_id = f"seed-{uuid.uuid4().hex[:8]}"

    # Keep the seed_id in the filename so an uploaded file is traceable back
    # to its run, and strip any path components from the client-supplied name
    # (a filename like "../../etc/passwd" must not escape UPLOAD_DIR).
    safe_name = os.path.basename(file.filename or "seed.pdf")

    # The one span that wraps the entire run. Every node span nests under it,
    # so in Logfire this single trace shows the full timing breakdown.
    with logfire.span("seed pipeline", seed_id=seed_id, filename=safe_name):
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        dest = os.path.join(UPLOAD_DIR, f"{seed_id}_{safe_name}")

        contents = await file.read()
        logfire.info("seed received", bytes=len(contents))

        try:
            # Writing to disk blocks, and this is an async function, so hand the
            # blocking write to a worker thread with run_in_threadpool. A plain
            # open(...).write(...) here would stall every other request.
            await run_in_threadpool(Path(dest).write_bytes, contents)
        except OSError as e:
            logfire.exception("could not save uploaded seed")
            raise HTTPException(status_code=500, detail="Could not save uploaded file") from e

        initial_state = {
            "seed_id": seed_id,
            "seed_pdf_path": dest,
            "seed_source": safe_name,
        }

        try:
            result = await orchestration_agent.ainvoke(initial_state)
        except Exception as e:
            # A node raising (e.g. a bad PDF, or Neo4j down) should surface as a
            # real error, not a 200 that pretends the graph was built.
            logfire.exception(f"seed {seed_id} failed")
            raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}") from e

        logfire.info(
            "seed complete",
            chunks=len(result.get("stored_chunks", [])),
            entities=len(result.get("candidate_entities", [])),
            relationships=len(result.get("relationships", [])),
        )

    return _summarize(seed_id, result)


@app.get("/seeds")
def seeds():
    """List seeds that currently have a graph stored, for the UI picker."""
    return {"seeds": list_seeds()}


@app.get("/seed/{seed_id}/graph")
def seed_graph(seed_id: str):
    """One seed's stored graph, so the UI can draw the nodes and edges."""
    graph = get_graph(seed_id)
    if not graph["nodes"]:
        raise HTTPException(status_code=404, detail=f"No graph stored for {seed_id}")
    return graph


@app.get("/seed/{seed_id}/agents")
def seed_agents(seed_id: str):
    """The agent pool for one seed: candidates, rank, and current archetype."""
    return {"agents": get_agent_pool(seed_id)}


@app.post("/seed/{seed_id}/agents/{entity_id}")
def promote_agent(seed_id: str, entity_id: str, body: PromoteRequest):
    """Assign one archetype to one candidate, or clear it by sending null.

    This is the human gate: the engine ranks the candidates, a person decides
    which of them actually get to act and how each one argues.
    """
    if body.archetype is not None and body.archetype not in ARCHETYPE_IDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown archetype '{body.archetype}'. "
                f"Allowed: {', '.join(ARCHETYPE_IDS)}"
            ),
        )
    agent = set_agent_archetype(seed_id, entity_id, body.archetype)
    if not agent:
        raise HTTPException(
            status_code=404, detail=f"No agent for {entity_id} in {seed_id}"
        )
    return agent


@app.post("/agents/{agent_id}/query")
def agent_chat(agent_id: str, body: AgentQuery):
    """One chat turn with an agent, answered from the chunks stored for its seed.

    The reply carries the chunks it used, so any answer can be checked against
    the same passages the pipeline stored.
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    try:
        return answer_as_agent(agent_id, body.message)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No agent {agent_id}")


@app.delete("/seed/{seed_id}")
def remove_seed(seed_id: str):
    """Delete one seed's data from both stores and from disk.

    This is a destructive, unauthenticated dev endpoint for cleaning up test
    runs. Do not expose this API to the public with it enabled. It removes:
      - every Qdrant point whose payload seed_id matches
      - every Neo4j node/edge belonging to the seed
      - DATA/web/<seed_id>/ and DATA/plaintext/<seed_id>/
      - the uploaded PDF named <seed_id>_*
    """
    with logfire.span("delete seed", seed_id=seed_id):
        points = delete_seed_points(seed_id)
        delete_seed(seed_id)

        files_removed = 0
        for base in (WEB_DIR, PLAINTEXT_DIR):
            folder = os.path.join(base, seed_id)
            if os.path.isdir(folder):
                shutil.rmtree(folder)
                files_removed += 1
        for uploaded in glob.glob(os.path.join(UPLOAD_DIR, f"{seed_id}_*")):
            os.remove(uploaded)
            files_removed += 1

        logfire.info(
            f"Deleted seed {seed_id}: {points} Qdrant points, Neo4j cleared, "
            f"{files_removed} path(s) removed from disk"
        )
    return {
        "seed_id": seed_id,
        "deleted": {"qdrant_points": points, "paths_removed": files_removed},
    }
