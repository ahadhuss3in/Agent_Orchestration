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
from starlette.concurrency import run_in_threadpool

from services.Orchestration.graphdb.neo4j_service import delete_seed
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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded seeds land here. DATA/ is gitignored, so nothing user-uploaded is
# ever committed. Change this if you move DATA elsewhere.
UPLOAD_DIR = os.path.join("DATA", "uploads")


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
        "briefing": result.get("qualitative_briefing", {}),
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
