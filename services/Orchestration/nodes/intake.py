import uuid
import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def intake_seed(state: OrchestrationState):
    """
    First node in the orchestration graph. Takes the raw seed_text/seed_type
    the caller submitted and gives this seed a real identity: a generated
    seed_id and a phase marker.

    If the caller already supplied a seed_id (the API does this so it can
    use the same id as the LangGraph thread_id, needed up front to resume
    the M17 interrupt later), that one is kept instead of generating a new
    one. Calling the graph directly without one, e.g. for testing, still
    works exactly as before.
    """
    seed_id = state.get("seed_id") or f"seed-{uuid.uuid4().hex[:8]}"

    with logfire.span("Seed Intake", seed_id=seed_id, seed_type=state["seed_type"]):
        logfire.info(f"New seed received, type={state['seed_type']}")

        return {
            "seed_id": seed_id,
            "phase": "seed_intake",
        }
