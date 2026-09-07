import logfire
from langchain_groq import ChatGroq
from pydantic import BaseModel
from typing import Literal

from app.config import config
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Orchestration.graphdb.neo4j_service import format_relationships
from services.Rag.retrieval.qdrant_service import search_enterprise_knowledge

llm = ChatGroq(api_key=config.GROQ_API_KEY, model=config.MODEL_REASONING)


class AgentTurn(BaseModel):
    action_type: Literal["dialogue", "action", "decision"]
    content: str


# json_mode, not the default tool-calling method: confirmed via real testing
# that when a turn's answer runs long and elaborate, Groq's tool-calling
# reliably free-texts a monologue instead of ever calling the structured
# tool at all (a real 400, "Tool choice is required, but model did not call
# a tool", not a flaky one-off). json_mode has the model return the whole
# response as JSON directly, no separate tool-call step to skip.
turn_llm = llm.with_structured_output(AgentTurn, method="json_mode")


def _build_turn_prompt(state, agent, shared_summary, recent_turns, round_num) -> str:
    relationships_text = format_relationships(agent["agent_id"])

    retrieved = search_enterprise_knowledge(
        state["seed_text"],
        seed_id=state["seed_id"],
        entity_id=agent["agent_id"],
    )
    context_text = "\n\n".join(r["content"] for r in retrieved[:3]) or "No documents yet."

    recent_text = "\n".join(
        f"[Round {t['round']}] {state['agents'][t['agent_id']]['name']}: {t['content']}"
        for t in recent_turns
    ) or "None yet, you go first this round."

    return f"""
    {agent['persona']}

    SCENARIO:
    {state['seed_text']}

    KNOWN RELATIONSHIPS:
    {relationships_text}

    SCENARIO SO FAR (summary of previous rounds):
    {shared_summary or "This is the first round, nothing has happened yet."}

    OTHER AGENTS' TURNS THIS ROUND SO FAR:
    {recent_text}

    RELEVANT DOCUMENTS:
    {context_text}

    It is round {round_num}. Decide what you say or do next, staying fully in
    character and responding to what has actually happened so far.

    Respond only as JSON matching this schema:
    {{"action_type": "dialogue" | "action" | "decision", "content": "..."}}
    """


def _synthesize_round(shared_summary: str, round_turns: list[dict], agents: dict) -> str:
    round_text = "\n".join(
        f"{agents[t['agent_id']]['name']}: {t['content']}" for t in round_turns
    )
    prompt = f"""
    PREVIOUS SUMMARY:
    {shared_summary or "None, this was the first round."}

    THIS ROUND'S EVENTS:
    {round_text}

    Write an updated, concise running summary of the scenario so far, folding
    in this round's events. A few sentences, not a transcript.
    """
    return llm.invoke(prompt).content.strip()


def simulate(state: OrchestrationState):
    """
    Runs the whole simulation as a plain Python loop inside one node: for
    each round, every selected agent takes one turn in fixed order, then a
    synthesis step folds the round into a rolling summary so prompt size
    stays bounded no matter how many rounds run, the same lesson already
    applied to retrieved context length elsewhere in this project.
    """
    max_rounds = state.get("max_rounds", 3)
    agents = state["agents"]
    simulation_log: list[dict] = []
    shared_summary = state.get("shared_scenario_summary", "")

    with logfire.span("Running simulation", seed_id=state["seed_id"], max_rounds=max_rounds):
        for round_num in range(1, max_rounds + 1):
            round_turns = []
            for agent_id in state["selected_agent_ids"]:
                agent = agents[agent_id]
                prompt = _build_turn_prompt(state, agent, shared_summary, round_turns, round_num)
                turn = turn_llm.invoke(prompt)
                entry = {
                    "round": round_num,
                    "agent_id": agent_id,
                    "action_type": turn.action_type,
                    "content": turn.content,
                }
                simulation_log.append(entry)
                round_turns.append(entry)

            shared_summary = _synthesize_round(shared_summary, round_turns, agents)
            logfire.info(f"Round {round_num} complete, {len(round_turns)} turns")

    return {
        "simulation_log": simulation_log,
        "shared_scenario_summary": shared_summary,
        "phase": "simulation_complete",
    }
