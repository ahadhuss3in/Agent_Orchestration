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
from services.Rag.agent.StateGraph.Graph import rag_agent

app = FastAPI(title="Orchestration Engine")


class SeedRequest(BaseModel):
    seed_text: str
    seed_type: Literal["real", "fictional"]
    max_rounds: int = 3


class SelectAgentsRequest(BaseModel):
    selected_agent_ids: List[str]


class AgentQueryRequest(BaseModel):
    seed_id: str
    q: str


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
        "max_rounds": request.max_rounds,
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


@app.post("/agents/{agent_id}/query")
async def query_agent(agent_id: str, request: AgentQueryRequest):
    """
    Chat with one simulated agent from a finished seed run. Reuses the
    existing RAG chat graph unchanged (planner/retriever/generate_res),
    just handing it this agent's persona and Qdrant filter from state. The
    first message to any given agent gets its own simulation_log entries
    seeded into memory first, the same conversation-history mechanism the
    chatbot already uses, so the agent answers as someone who actually
    lived through the scenario, not a blank persona.
    """
    seed_config = {"configurable": {"thread_id": request.seed_id}}
    seed_snapshot = orchestration_agent.get_state(seed_config)
    if not seed_snapshot.values:
        raise HTTPException(status_code=404, detail=f"No seed run found for {request.seed_id}")

    agents = seed_snapshot.values.get("agents", {})
    if agent_id not in agents:
        raise HTTPException(
            status_code=404,
            detail=f"No agent {agent_id} for seed {request.seed_id}",
        )
    profile = agents[agent_id]

    chat_thread_id = f"{request.seed_id}:{agent_id}"
    chat_config = {"configurable": {"thread_id": chat_thread_id}}

    seed_messages = []
    if not rag_agent.get_state(chat_config).values:
        own_turns = [
            t for t in seed_snapshot.values.get("simulation_log", [])
            if t["agent_id"] == agent_id
        ]
        if own_turns:
            record = "\n".join(f"Round {t['round']}: {t['content']}" for t in own_turns)
            seed_messages.append({
                "role": "assistant",
                "content": f"[simulation record] During the scenario, I:\n{record}",
            })

    chat_state = {
        "messages": seed_messages + [{"role": "user", "content": request.q}],
        "persona": profile["persona"],
        "qdrant_filter": profile["qdrant_filter"],
    }
    result = await rag_agent.ainvoke(chat_state, config=chat_config)
    return {
        "agent_id": agent_id,
        "name": profile["name"],
        "answer": result.get("final_ans"),
        "sources": result.get("citation", []),
    }
