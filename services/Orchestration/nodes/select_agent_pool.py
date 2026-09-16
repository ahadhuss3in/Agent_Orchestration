"""
select_agent_pool: after the graph is written, pick the entities worth
promoting.

Not every extracted entity should become an agent, and a seed can produce far
more of them than a run could use. This node ranks the Person and Organization
entities by how many relationships they hold and keeps the top
AGENT_POOL_SIZE as candidates, written as :Agent nodes.

Promotion itself is NOT here. Assigning an archetype is the human gate, done
through the API once the console shows the pool. This node only produces the
shortlist.
"""

import logfire

from app.config import config
from services.Orchestration.graphdb.neo4j_service import (
    select_agent_pool as build_agent_pool,
)
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def select_agent_pool(state: OrchestrationState):
    with logfire.span("Selecting agent pool", seed_id=state["seed_id"]):
        pool = build_agent_pool(state["seed_id"], config.AGENT_POOL_SIZE)
        logfire.info(f"agent pool built: {len(pool)} candidate(s)")
        return {"agent_pool": pool, "phase": "agent_pool_selected"}
