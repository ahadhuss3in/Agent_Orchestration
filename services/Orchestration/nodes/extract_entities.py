"""
extract_entities: turn stored context into a graph of entities and the
relationships between them.

WHY THIS NODE EXISTS
--------------------
store_context produced raw text chunks. Raw text answers "what was written".
A graph answers "who is involved, and how are they connected", which is the
question Graph RAG actually needs multi-hop reasoning over.

WHAT THIS NODE OWNS
-------------------
  candidate_entities    list of entity dicts. Suggested shape:
                          {
                            "entity_id": "seed-abc:person-jane-doe",
                            "name": "Jane Doe",
                            "type": "Person",
                            "description": "...",
                            "role_in_seed": "...",
                            "source_chunk_ids": ["seed-abc:seed.pdf:0", ...],
                          }
  relationships         list of relationship dicts:
                          {
                            "source_id": "seed-abc:person-jane-doe",
                            "target_id": "seed-abc:org-acme",
                            "type": "WORKS_FOR",
                            "description": "...",
                            "source_chunk_ids": [...],
                          }
  qualitative_briefing  {threats, key_points, precautions, predictions}
  phase                 set it to "entities_extracted".

THE MODELS BELOW ARE A STARTING CONTRACT, NOT LAW
-------------------------------------------------
They describe what one chunk's extraction looks like coming back from the LLM.
Adjust them if your design differs, but keep one rule: the LLM returns NAMES
for relationships. Your code assigns ids. An LLM inventing ids is how you get
dangling edges that point at nothing.

HOW TO BUILD IT
---------------
The old version made ONE call over the whole seed, capped at 25000 characters,
and `break`-ed when it hit the cap. That silently drops the rest of a long PDF,
so a 40 page seed can lose most of its entities and you would never know.
Replace that with map then reduce:

  MAP     for each chunk in state["stored_chunks"]:
              ask the LLM to extract entities + relationships from THAT chunk
              alone. Small prompt, well under the model's limit, nothing lost.
  REDUCE  merge all per-chunk results into one list:
              - same entity in two chunks = ONE entity, not two
              - normalize names before comparing (lowercase, strip spaces)
              - merge their source_chunk_ids so provenance is complete
              - decide how to merge descriptions when they differ

1. Assign entity_id yourself, per seed, from the normalized name and type:
       entity_id = f"{seed_id}:{type.lower()}-{slugify(name)}"
   The seed_id prefix is what keeps two different seeds that both mention
   "John Smith" from colliding into one Neo4j node. Read the plan note on
   per-seed vs global entity identity if that is unclear.
2. Relationships come back by name. After every entity has an id, map
   source_name/target_name -> source_id/target_id. If the LLM names something
   it never declared as an entity, decide: drop the edge, or create a stub
   entity for it. Do not leave a dangling id.
3. Attach provenance: record which chunk_id(s) each entity and relationship
   came from. This is what lets a later answer cite its source. The write
   path will store these as source_chunk_ids on the Neo4j nodes/edges.
4. Use a real Pydantic schema with the LLM (structured output) so a bad
   response raises instead of silently returning junk.

THINK ABOUT
-----------
- Groq token limits: one call per chunk is more calls but each is small. Is
  that a good trade for you? It is the difference between losing data and not.
- Deduplication is the hard part. Two chunks describe "Jane Doe" differently.
  Keep the longer description, concatenate, or let the LLM pick? Any is fine,
  just choose deliberately and write down why.
- The extraction prompt currently mentions Kubernetes/Intel in the planner,
  that is leftover from the old chatbot and does not belong here.
"""

import re
from typing import Literal

from langchain_groq import ChatGroq
from pydantic import BaseModel

from app.config import config
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

llm = ChatGroq(api_key=config.GROQ_API_KEY, model=config.MODEL_REASONING)


class ExtractedEntity(BaseModel):
    name: str
    type: Literal["Person", "Organization", "Location", "Event", "Entity"]
    description: str
    role_in_seed: str


class ExtractedRelationship(BaseModel):
    # by name, not id. The LLM naturally thinks in names, ids are assigned
    # afterward once every entity has one.
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


# READY WHEN YOU ARE: uncomment this and reach for it inside your map step.
# structured_llm = llm.with_structured_output(SeedExtraction)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def extract_entities(state: OrchestrationState):
    raise NotImplementedError(
        "Implement extract_entities. Read this module's docstring first. Do a "
        "per-chunk map, then merge. Do not go back to the single truncated call."
    )
