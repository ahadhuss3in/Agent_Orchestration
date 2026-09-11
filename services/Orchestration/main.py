import os
import uuid
from pathlib import Path

import logfire
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))

from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from services.Orchestration.StateGraph.Graph import orchestration_agent

app = FastAPI(title="Knowledge Base Engine")

# Uploaded seeds land here. DATA/ is gitignored, so nothing user-uploaded is
# ever committed. Change this if you move DATA elsewhere.
UPLOAD_DIR = os.path.join("DATA", "uploads")


def _summarize(seed_id: str, result: dict) -> dict:
    """Do not return the whole state. It contains the full seed text and every
    chunk, which bloats the response for no reason. Return identity, phase,
    and counts a human actually wants to read.
    """
    return {
        "seed_id": seed_id,
        "status": "complete",
        "phase": result.get("phase"),
        "entities": len(result.get("candidate_entities", [])),
        "relationships": len(result.get("relationships", [])),
        "chunks_stored": len(result.get("stored_chunks", [])),
        "briefing": result.get("qualitative_briefing", {}),
    }


@app.get("/")
def home():
    return {"message": "Knowledge Base Engine is live."}


@app.post("/seed")
async def submit_seed(
    file: UploadFile = File(...),  # noqa: B008 (FastAPI dependency idiom)
    seed_type: Literal["real", "fictional"] = Form("real"),
):
    """Upload a seed PDF and run it through the whole knowledge-base pipeline.

    seed_id is generated here, not inside the graph, so the same id can be
    returned even if the run fails partway and you want to retry the same seed
    without ending up with two half-built knowledge bases.
    """
    seed_id = f"seed-{uuid.uuid4().hex[:8]}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Keep the seed_id in the filename so an uploaded file is traceable back
    # to its run, and strip any path components from the client-supplied name
    # (a filename like "../../etc/passwd" must not escape UPLOAD_DIR).
    safe_name = os.path.basename(file.filename or "seed.pdf")
    dest = os.path.join(UPLOAD_DIR, f"{seed_id}_{safe_name}")

    contents = await file.read()
    try:
        # Writing to disk blocks, and this is an async function, so hand the
        # blocking write to a worker thread with run_in_threadpool. A plain
        # open(...).write(...) here would stall every other request.
        await run_in_threadpool(Path(dest).write_bytes, contents)
    except OSError as e:
        logfire.error(f"Could not save uploaded seed: {e}")
        raise HTTPException(status_code=500, detail="Could not save uploaded file")

    initial_state = {
        "seed_id": seed_id,
        "seed_pdf_path": dest,
        "seed_source": safe_name,
        "seed_type": seed_type,
    }

    try:
        result = await orchestration_agent.ainvoke(initial_state)
    except Exception as e:  # noqa: BLE001 (API boundary: turn any node failure into a 500)
        # A node raising (e.g. a bad PDF, or Neo4j down) should surface as a
        # real error, not a 200 that pretends the graph was built.
        logfire.error(f"Seed {seed_id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}")

    return _summarize(seed_id, result)
