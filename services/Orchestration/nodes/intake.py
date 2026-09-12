import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.ingestion.loaders.pdf_loader import loadpdf


def intake_seed(state: OrchestrationState):
   """ Read the uploaded PDF and put its text into state as seed_text
   """
   seed_id = state["seed_id"]

   with logfire.span("Seed Intake", seed_id=seed_id, seed_type=state["seed_type"]):
        pdf_path = state["seed_pdf_path"]

        ## load pdf and extract the text 
        if pdf_path:
            doc = loadpdf(pdf_path)
            seed_text = doc.text.strip()
         ## verify if the seed text is empty or not.
        if not seed_text:
            raise ValueError(
                f"Seed {seed_id} produced no text. Is {pdf_path} a scanned PDF "
                f"with no text layer? OCR is not supported."
            )

        logfire.info(f"Seed text ready, {len(seed_text)} chars")

        return {
            "seed_text": seed_text,
            "phase": "seed_intake",
        }
