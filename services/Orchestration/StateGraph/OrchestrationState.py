from typing import TypedDict


class OrchestrationState(TypedDict):
   ## about seed
    seed_id: str
    seed_pdf_path: str
    seed_source: str

## the contents
    seed_text: str
    phase: str

    fetched_context: list[dict]

## chunk storage
    stored_chunks: list[dict]

## knowledge base
    candidate_entities: list[dict]
    relationships: list[dict]

## agents
    agent_pool: list[dict]
