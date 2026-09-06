import uuid
import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def intake_seed(state: OrchestrationState):
    """
    First node in the orchestration graph. Takes the raw seed_text/seed_type
    the caller submitted and gives this seed a real identity: a generated
    seed_id and a phase marker.
    """
    seed_id = f"seed-{uuid.uuid4().hex[:8]}"

    with logfire.span("Seed Intake", seed_id=seed_id, seed_type=state["seed_type"]):
        logfire.info(f"New seed received, type={state['seed_type']}")

        return {
            "seed_id": seed_id,
            "phase": "seed_intake",
        }
