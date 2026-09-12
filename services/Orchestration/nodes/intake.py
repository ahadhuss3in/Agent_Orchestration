"""
intake_seed: give the seed a stable identity and turn its PDF into text.

The two jobs:
  1. make sure seed_id exists, because every id downstream is built from it
  2. read the uploaded PDF and put its text into state as seed_text

Nothing here is clever. That is the point: the first node should be the
simplest one, so when a later node misbehaves you know it is not intake.
"""

import os
import uuid

import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.ingestion.loaders.pdf_loader import loadpdf


def intake_seed(state: OrchestrationState):
    """Read the uploaded PDF and put its text into state as seed_text."""
    # The API generates seed_id before calling the graph. The fallback lets
    # someone run the graph directly (script/test) without one.
    seed_id = state.get("seed_id") or f"seed-{uuid.uuid4().hex[:8]}"

    with logfire.span("Seed Intake", seed_id=seed_id):
        pdf_path = state.get("seed_pdf_path")

        # seed_text always has a value, so the emptiness check below can never
        # hit an undefined variable. A caller may also seed raw text directly
        # instead of a file, in which case the PDF is skipped.
        seed_text = state.get("seed_text", "")
        seed_source = state.get("seed_source")

        if pdf_path:
            # loadpdf returns a LoadedDocument; the loader owns all the
            # pdfplumber details. We only want .text here. It gets its own span
            # because PDF parsing time varies a lot by document.
            with logfire.span("extract pdf text", pdf_path=pdf_path):
                doc = loadpdf(pdf_path)
            seed_text = doc.text.strip()
            seed_source = seed_source or os.path.basename(pdf_path)

        seed_source = seed_source or "text"

        # A scanned PDF with no text layer comes back empty. Carrying on would
        # produce zero chunks and an empty knowledge base, so fail now with a
        # clear message instead of later with a confusing one.
        if not seed_text:
            raise ValueError(
                f"Seed {seed_id} produced no text. Is {pdf_path} a scanned PDF "
                f"with no text layer? OCR is not supported."
            )

        logfire.info(f"Seed text ready, {len(seed_text)} chars")

        # Return ONLY the fields this node changed. LangGraph merges this dict
        # into the shared state; it does not replace the whole thing.
        return {
            "seed_id": seed_id,
            "seed_text": seed_text,
            "seed_source": seed_source,
            "phase": "seed_intake",
        }
