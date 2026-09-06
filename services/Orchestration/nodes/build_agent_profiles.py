import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def build_agent_profiles(state: OrchestrationState):
    """
    Turns the human's selected_agent_ids into real AgentProfiles: a persona
    string for the LLM to roleplay, plus the Qdrant filter that scopes that
    agent's retrieval to this seed's documents (and its own, once any exist).
    """
    entities_by_id = {e["entity_id"]: e for e in state["candidate_entities"]}
    seed_id = state["seed_id"]

    agents = {}
    for agent_id in state["selected_agent_ids"]:
        entity = entities_by_id[agent_id]
        persona = (
            f"You are {entity['name']}, a {entity['type'].lower()} in this "
            f"scenario. {entity['description']} Your role in the scenario: "
            f"{entity['role_in_seed']}."
        )
        agents[agent_id] = {
            "agent_id": agent_id,
            "name": entity["name"],
            "persona": persona,
            "qdrant_filter": {"seed_id": seed_id, "entity_id": agent_id},
        }

    logfire.info(f"Seed {seed_id}: built {len(agents)} agent profiles")

    return {
        "agents": agents,
        "phase": "agents_built",
    }
