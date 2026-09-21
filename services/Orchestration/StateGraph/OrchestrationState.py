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

## social context. Coverage carries per-platform failures, so a platform that
## could not be fetched is never mistaken downstream for absent demand.
    social_query_plan: list[dict]
    social_posts: list[dict]
    social_coverage: dict

## chunk storage
    stored_chunks: list[dict]

## knowledge base
    candidate_entities: list[dict]
    relationships: list[dict]

## agents
    agent_pool: list[dict]
