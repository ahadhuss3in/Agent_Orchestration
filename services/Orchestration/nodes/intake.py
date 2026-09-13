"""
intake_seed: give the seed a stable identity and turn its PDF into text.

"""

import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState

## not needed here for now but keep it here to retrieve it later for when I go for the chunking part 
from services.Rag.ingestion.loaders.pdf_loader import loadpdf


def intake_seed(state: OrchestrationState):
    """Read the uploaded PDF and put its text into state as doc."""

    with logfire.span("Seed Intake", seed_id=state["seed_id"]):
        pdf_path = state.get("seed_pdf_path")
        doc = ""

        if not pdf_path: 
            logfire.warning("No seed found to process. Exiting")
            # Return a state update indicating a skip or error so the graph doesn't hang
            return {"phase": "skipped"}
    
        with logfire.span("Extracting pdf text", pdf_path=pdf_path):
                doc = loadpdf(pdf_path)
                if not doc or not doc.text.strip():
                     logfire.warning(f"File {pdf_path} has no extractable content, skipping it.")
                     return
                logfire.info(f"Seed text ready, {len(doc.text)} chars")     

        return {
            "seed_text": doc.text,
            "phase": "seed_intake",
        }
