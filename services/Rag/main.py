import logfire
import os
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))

# Now safe to import app modules - logfire is already active
from fastapi import FastAPI, Response
from fastapi.responses import FileResponse
from services.Rag.agent.StateGraph.Graph import rag_agent

from pydantic import BaseModel
from typing import Optional
import os as _os


# Initialize FastAPI
app = FastAPI(title="Enterprise Agentic RAG API")

_STATIC_DIR = _os.path.join(_os.path.dirname(__file__), "static")


class QueryRequest(BaseModel):
    q: str
    thread_id: Optional[str] = "default_user"


@app.get("/")
def home():
    """Serves the test chat UI so you can try the API in a browser."""
    return FileResponse(_os.path.join(_STATIC_DIR, "index.html"))


@app.get("/health")
def health():
    return {"message": "Enterprise LangGraph RAG API is live."}


@app.get("/graph")
def get_graph_image():
    """
    Returns the Mermaid image of the agent's workflow.
    """
    try:
        png_bytes = rag_agent.get_graph().draw_mermaid_png()
        return Response(content=png_bytes, media_type="image/png")
    except Exception as e:
        return {"error": f"Could not generate graph image: {e}"}


@app.post("/query")
def query(request: QueryRequest):
    """
    Executes the LangGraph RAG flow with memory using a POST request.
    """
    q = request.q
    thread_id = request.thread_id

    # only "messages" actually needs to be seeded, every other AgentState
    # field (query, citation, plan, status, final_ans) gets set by a node
    # before anything downstream ever reads it
    initial_state = {
        "messages": [{"role": "user", "content": q}],
    }

    # Configuration for Memory (Thread ID)
    config = {"configurable": {"thread_id": thread_id}}

    try:
        final_output = rag_agent.invoke(initial_state, config=config)

        return {
            "question": q,
            "answer": final_output.get("final_ans"),
            "thought_process": final_output.get("plan"),
            "status": final_output.get("status"),
            "sources": final_output.get("citation", [])
        }
    except Exception as e:
        logfire.error(f"Backend Execution Failed: {e}")
        return {
            "question": q,
            "answer": "I apologize, but I encountered an internal error while processing your request. Please try again later.",
            "thought_process": ["Error encountered during execution."],
            "status": "error",
            "sources": []
        }
