import logfire
import os
import uuid
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))

from fastapi import FastAPI, HTTPException
from langgraph.types import Command
from pydantic import BaseModel
from typing import List, Literal

from services.Orchestration.StateGraph.Graph import orchestration_agent

app = FastAPI(title="Orchestration Engine")


class SeedRequest(BaseModel):
    seed_text: str
    seed_type: Literal["real", "fictional"]


class SelectAgentsRequest(BaseModel):
    selected_agent_ids: List[str]


def _format_result(seed_id: str, result: dict) -> dict:
    """
    A graph invocation that hits interrupt() returns normally, with a
    special __interrupt__ key instead of raising, verified directly against
    the installed langgraph before relying on it. Shape the API response
    around whichever case actually happened.
    """
    if "__interrupt__" in result:
        pause = result["__interrupt__"][0]
        return {
            "seed_id": seed_id,
            "status": "paused_for_agent_selection",
            **pause.value,
        }
    return {"seed_id": seed_id, "status": "complete", **result}


@app.get("/")
def home():
    return {"message": "Orchestration Engine is live."}


@app.post("/seed")
async def submit_seed(request: SeedRequest):
    """
    Submit a new seed (real or fictional). Runs through intake, context
    fetch, extraction, and the Neo4j write, then pauses for a human to pick
    which entities become agents. seed_id doubles as the LangGraph
    thread_id, generated up front so the same id can be used to resume this
    run later via /seed/{seed_id}/select-agents.
    """
    seed_id = f"seed-{uuid.uuid4().hex[:8]}"
    initial_state = {
        "seed_id": seed_id,
        "seed_text": request.seed_text,
        "seed_type": request.seed_type,
    }
    config = {"configurable": {"thread_id": seed_id}}
    result = await orchestration_agent.ainvoke(initial_state, config=config)
    return _format_result(seed_id, result)


@app.post("/seed/{seed_id}/select-agents")
async def select_agents(seed_id: str, request: SelectAgentsRequest):
    """
    Resumes a paused seed run with the human's chosen entity_ids. Validates
    the choice against this run's own candidate_entities before resuming,
    since this is the actual point where free-form human input crosses into
    the graph.
    """
    config = {"configurable": {"thread_id": seed_id}}
    snapshot = orchestration_agent.get_state(config)
    if not snapshot.values:
        raise HTTPException(status_code=404, detail=f"No seed run found for {seed_id}")

    candidate_ids = {e["entity_id"] for e in snapshot.values.get("candidate_entities", [])}
    unknown = set(request.selected_agent_ids) - candidate_ids
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown entity_id(s), not among this seed's candidates: {sorted(unknown)}",
        )

    result = await orchestration_agent.ainvoke(
        Command(resume=request.selected_agent_ids), config=config
    )
    return _format_result(seed_id, result)
