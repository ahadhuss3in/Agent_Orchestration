from typing import TypedDict, Literal, List


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
