"""
Agent chat: one promoted entity answers a question, grounded in the stored
chunks, and remembers the conversation.

Three things shape a reply:
  1. the archetype the human assigned (how it argues),
  2. the entity it represents and its Neo4j relationships (what it is),
  3. the Qdrant chunks retrieved for this exact question (what it can cite).

Memory is the previous turns, persisted as :Message nodes so it survives a
restart, and capped at AGENT_CHAT_MEMORY so a long thread cannot grow without
bound. Every reply carries the chunks it used, so an answer is never an
unsourced claim.
"""

import logfire
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import config
from services.Orchestration.agents.archetypes import ARCHETYPES
from services.Orchestration.graphdb.neo4j_service import (
    append_message,
    format_relationships,
    get_agent,
    get_messages,
)
from services.Rag.retrieval.qdrant_service import search_enterprise_knowledge

# Same provider as extraction (an .env swap moves both). temperature sits a
# little above zero so the four archetypes do not all read as one voice.
llm = ChatOpenAI(
    api_key=config.DEEPSEEK_API_KEY,
    base_url=config.DEEPSEEK_BASE_URL,
    model=config.DEEPSEEK_MODEL,
    temperature=0.3,
    timeout=60,
    max_retries=2,
)


def _system_prompt(agent: dict) -> str:
    """The agent's standing instructions: persona, identity, and how to know."""
    spec = ARCHETYPES.get(agent.get("archetype") or "")
    if spec:
        persona = f"You are {spec['name']}. {spec['role']}. {spec['persona']}"
    else:
        persona = (
            "You are this entity speaking for itself. No archetype was assigned "
            "to you, so you argue plainly from your own position."
        )

    return f"""{persona}

You speak for the entity "{agent['name']}" ({agent['type']}).
Role in the scenario: {agent.get('role_in_seed') or 'not recorded'}.
Description: {agent.get('description') or 'not recorded'}.

How you know things:
- Everything factual you say must come from the CONTEXT passages in the user
  message. They were retrieved from this scenario's own stored documents.
- If the context does not cover something, say so plainly. Do not invent facts,
  and never cite a passage that is not in the context.
- These are your entity's relationships in the knowledge graph:
{format_relationships(agent['entity_id'])}

Answer in the first person as the entity. Keep it tight: a short paragraph or
two of plain prose, no headings and no bullet lists."""


def _context_block(chunks: list[dict]) -> str:
    if not chunks:
        return "(no passages were retrieved for this question)"
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        blocks.append(
            f"[{i}] source: {chunk.get('source')}\n{chunk.get('content', '')}"
        )
    return "\n\n".join(blocks)


def answer_as_agent(agent_id: str, message: str) -> dict:
    """Run one chat turn for one agent.

    Raises KeyError if the agent id is unknown, which the API turns into a 404.
    """
    agent = get_agent(agent_id)
    if not agent:
        raise KeyError(agent_id)

    seed_id = agent["seed_id"]
    with logfire.span("agent chat", agent_id=agent_id, seed_id=seed_id):
        chunks = search_enterprise_knowledge(
            query=message,
            limit=config.AGENT_CHAT_TOP_K,
            seed_id=seed_id,
        )
        history = get_messages(agent_id, config.AGENT_CHAT_MEMORY)

        messages = [SystemMessage(content=_system_prompt(agent))]
        for turn in history:
            if turn["role"] == "assistant":
                messages.append(AIMessage(content=turn["content"]))
            else:
                messages.append(HumanMessage(content=turn["content"]))
        messages.append(
            HumanMessage(
                content=(
                    f"CONTEXT:\n{_context_block(chunks)}\n\n"
                    f"Question from the operator: {message}"
                )
            )
        )

        # Record the question before generating: if the model call fails, the
        # thread still shows what was asked rather than silently losing it.
        append_message(agent_id, seed_id, "user", message)
        response = llm.invoke(messages)
        reply = (
            response.content
            if isinstance(response.content, str)
            else str(response.content)
        )
        append_message(agent_id, seed_id, "assistant", reply)

    citations = [
        {
            "chunk_id": chunk.get("chunk_id"),
            "source": chunk.get("source"),
            "score": round(float(chunk.get("score") or 0), 4),
        }
        for chunk in chunks
    ]
    return {
        "agent_id": agent_id,
        "name": agent["name"],
        "archetype": agent.get("archetype"),
        "reply": reply,
        "citations": citations,
    }
