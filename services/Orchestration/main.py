import logfire
import os
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Literal

from services.Orchestration.StateGraph.Graph import orchestration_agent

app = FastAPI(title="Orchestration Engine")


class SeedRequest(BaseModel):
    seed_text: str
    seed_type: Literal["real", "fictional"]


@app.get("/")
def home():
    return {"message": "Orchestration Engine is live."}


@app.post("/seed")
async def submit_seed(request: SeedRequest):
    """
    Submit a new seed (real or fictional) and get back its assigned
    seed_id, current phase, and (for real seeds only) fetched real-world
    context. async now, since fetch_context makes a real network call.
    """
    initial_state = {
        "seed_text": request.seed_text,
        "seed_type": request.seed_type,
    }
    result = await orchestration_agent.ainvoke(initial_state)
    return result
