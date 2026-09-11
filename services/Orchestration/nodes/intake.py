"""
intake_seed: first node in the pipeline.

WHY THIS NODE EXISTS
--------------------
Nothing downstream can work until the raw seed has two things: a stable
identity, and its text pulled out of the uploaded file. "Stable" is not
cosmetic. seed_id is the Qdrant payload key, the Neo4j Seed node key, and the
prefix of every entity_id. If it changes on a re-run, the new run cannot find
or update what the old run wrote, it just piles up duplicates.

WHAT THIS NODE OWNS (the state fields only this node sets)
----------------------------------------------------------
  seed_id        keep the one the API already put in state. The API generates
                 it up front so it is known before the graph even starts.
                 Only generate a fresh one when it is missing (direct calls).
  seed_text      the PDF at state["seed_pdf_path"] as plain text.
  seed_source    a human-readable origin label, e.g. the filename.
  phase          set it to "seed_intake".

HOW TO BUILD IT
---------------
1. Read state["seed_pdf_path"]. Figure out what it means when it is None
   (someone called the graph directly, e.g. from a test). Decide now whether
   that is an error or a case you tolerate.
2. Do NOT write a PDF parser. One already exists and is tested against real
   files:
       from services.Rag.ingestion.loaders.pdf_loader import loadpdf
   loadpdf(path) returns a LoadedDocument object with .text and .source.
   Read its docstring before using it.
3. Handle the empty-text case deliberately. A scanned PDF with no text layer
   comes back as "". What should happen then: raise, or carry on and let
   store_context deal with zero chunks? Pick one and write down why.
4. Return ONLY the fields this node changed, as a plain dict. LangGraph merges
   it into the shared state, it does not replace the whole state.

THINK ABOUT
-----------
- On a second run with the same PDF, do you reuse seed_id or make a new one?
  Which one makes store_context idempotent, and which one duplicates?
- Where does the uploaded file actually live on disk, and who deletes it?
"""

import logfire

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.ingestion.loaders.pdf_loader import loadpdf 

def intake_seed(state: OrchestrationState):

   ## check if the seed path exists 
   if not state["seed_pdf_path"]:
       logfire.error("No seed PDF path provided")
   else:
    chunks = loadpdf(state["seed_pdf_path"])

   with logfire.span("Setting Seed values"):
        try:
            return {
                 "seed_id": state["seed_id"],
                 "seed_text": chunks.text,
                 "seed_source": chunks.source,
                 "phase": "seed_intake"
            }
        except Exception as e:
            logfire.exception("could not read this text file", file=str(file_path))
            raise NotImplementedError(
        "Implement intake_seed. Read this module's docstring first, then fill "
        "in the body. Do not change the function name: Graph.py imports it."


    )
