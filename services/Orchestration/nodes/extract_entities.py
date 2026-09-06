import re

import logfire
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from typing import Literal

from app.config import config
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

llm = ChatGroq(api_key=config.GROQ_API_KEY, model=config.MODEL_REASONING)


class ExtractedEntity(BaseModel):
    name: str
    type: Literal["Person", "Organization", "Location"]
    description: str
    role_in_seed: str
    suggested_agent: bool = Field(
        description="whether this entity seems important enough to be worth "
        "considering as a simulated agent, a human still decides for real"
    )


class ExtractedRelationship(BaseModel):
    # by name, not id, the LLM naturally thinks in names, ids get assigned
    # afterward once every entity has one
    source_name: str
    target_name: str
    type: str
    description: str


class SeedExtraction(BaseModel):
    entities: list[ExtractedEntity]
    relationships: list[ExtractedRelationship]
    threats: list[str]
    key_points: list[str]
    precautions: list[str]
    predictions: list[str]


structured_llm = llm.with_structured_output(SeedExtraction)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def extract_entities(state: OrchestrationState):
    """
    One structured LLM call turning the seed (plus any real-world context
    fetched for it) into candidate entities, relationships, and a
    qualitative briefing.
    """
    with logfire.span("Extracting entities", seed_id=state["seed_id"]):
        # same truncate-and-warn pattern already used in generate_node,
        # seed text plus several fetched articles can plausibly get long
        # enough to hit the same Groq TPM limits discovered there
        max_context_chars = 25000
        full_context = state["seed_text"] + "\n\n"

        for article in state.get("fetched_context", []):
            piece = f"{article['title']}\n{article['content']}\n\n"
            if len(full_context) + len(piece) < max_context_chars:
                full_context += piece
            else:
                logfire.warning("Context truncated to fit Groq TPM limits.")
                break

        extraction = structured_llm.invoke(
            f"""
            You are analyzing a scenario to prepare it for simulation.

            SCENARIO:
            {full_context}

            Extract every person, organization, and location involved, the
            relationships between them, and a qualitative briefing: threats,
            key points, precautions, and predictions for how this could play
            out.
            """
        )

        # assign stable ids now, don't trust the LLM to invent consistent
        # unique ids itself
        name_to_id = {}
        candidate_entities = []
        for entity in extraction.entities:
            entity_id = f"{entity.type.lower()}-{_slugify(entity.name)}"
            name_to_id[entity.name] = entity_id
            candidate_entities.append({
                "entity_id": entity_id,
                "name": entity.name,
                "type": entity.type,
                "description": entity.description,
                "role_in_seed": entity.role_in_seed,
                "suggested_agent": entity.suggested_agent,
            })

        relationships = [
            {
                "source_id": name_to_id.get(r.source_name, r.source_name),
                "target_id": name_to_id.get(r.target_name, r.target_name),
                "type": r.type,
                "description": r.description,
            }
            for r in extraction.relationships
        ]

        logfire.info(
            f"Extracted {len(candidate_entities)} entities and "
            f"{len(relationships)} relationships"
        )

        return {
            "candidate_entities": candidate_entities,
            "relationships": relationships,
            "qualitative_briefing": {
                "threats": extraction.threats,
                "key_points": extraction.key_points,
                "precautions": extraction.precautions,
                "predictions": extraction.predictions,
            },
            "phase": "entities_extracted",
        }
