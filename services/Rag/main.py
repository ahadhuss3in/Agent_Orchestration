import os

import logfire
from dotenv import load_dotenv

load_dotenv()
logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))

from fastapi import FastAPI

# NOTE: this service used to host the planner/retriever/responder chat graph
# and a static chat UI. Both were removed when the project pivoted to the
# knowledge-base pipeline. Retrieval now lives in
# services/Rag/retrieval/graph_retriever.py and is not exposed over HTTP yet.
# When Graph RAG is built, add its query endpoint here.
app = FastAPI(title="RAG Service")


@app.get("/health")
def health():
    return {"message": "RAG service is live. Retrieval endpoint not built yet."}
