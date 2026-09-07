from typing import TypedDict, Literal, List, Dict


class OrchestrationState(TypedDict):
    """State for one seed's whole run through the orchestration engine.

    """
    seed_id: str
    seed_text: str
    seed_type: Literal["real", "fictional"]
    phase: str
    # real-world articles fetched via the Tavily MCP tool, only populated
    # for seed_type == "real". stays an empty list for fictional seeds,
    # the fetch_context node never even runs for those.
    fetched_context: List[dict]
    # everything extract_entities produces. entities/relationships are
    # candidates only, nothing here becomes an agent until a human picks
    # from this list at M17.
    candidate_entities: List[dict]
    relationships: List[dict]
    qualitative_briefing: dict
    # M17: the entity_ids a human chose out of candidate_entities. Set by
    # resuming the graph's interrupt with this list.
    selected_agent_ids: List[str]
    # one AgentProfile per selected_agent_id, keyed by agent_id (== entity_id).
    agents: Dict[str, dict]
    # M19/M20: how many rounds to run, defaults set by intake if absent.
    max_rounds: int
    # every turn any agent has taken, in order: {round, agent_id, action_type, content}
    simulation_log: List[dict]
    # rolling summary, folded after every round so prompt size stays bounded
    # no matter how many rounds run
    shared_scenario_summary: str
