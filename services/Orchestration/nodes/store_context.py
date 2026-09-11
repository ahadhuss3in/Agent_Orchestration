"""
store_context: turn the seed's raw text (and any fetched articles) into
searchable vectors, and persist them. THIS IS THE MISSING STEP.

WHY THIS NODE EXISTS
--------------------
Without it the pipeline is a leak. extract_entities reads the seed text out
of state, and then the run ends and the run's memory is gone. Nothing was ever
written to Qdrant, so later retrieval filtered by this seed_id finds zero
chunks. Every other node depends on this one having happened first.

It also decides the two ids the whole knowledge base is stitched together with:
  chunk_id     stable identity for one chunk, so a re-run updates it
  entity_ids   left empty here, filled after extraction (see THINK ABOUT)

WHAT THIS NODE OWNS
-------------------
  stored_chunks  one dict per chunk written to Qdrant. Suggested shape:
                   {
                     "chunk_id": "seed-abc:seed.pdf:0",
                     "source": "seed.pdf",
                     "source_type": "seed" | "web",
                     "text": "...",
                     "chunk_index": 0,
                     "chunk_count": 12,
                   }
                 extract_entities uses this list to attach provenance
                 (source_chunk_ids) to the entities it finds.
  phase          set it to "context_stored".

HOW TO BUILD IT
---------------
There are two sources to store, and they are stored the same way:
  a) state["seed_text"]                    -> one source
  b) state["fetched_context"]              -> one source per article

1. Chunking. Do not write a chunker, one exists:
       from services.Rag.ingestion.chuncking.splitter import chunk_text
   Pick a chunk size with get_safe_chunk_size() from the embeddings module so
   the chunk fits the active embedding model. Read both first.

2. Embedding. Also reused, not rewritten:
       from services.Rag.embedding.embeddings import embedded_texts
   embedded_texts(list_of_strings) -> list_of_vectors, in the same order.

3. Writing. Get a Qdrant client (services/Rag/retrieval/qdrant_service.py and
   services/Rag/ingestion/processor.py both show how), and upsert PointStruct
   objects with a payload of:
       text, source, source_type, seed_id, chunk_id, chunk_index,
       chunk_count, entity_ids (start as [])
   The collection must exist before you write. processor.run_all_ingestion
   shows the create-if-missing code, including the correct vector dimension.
   Read it instead of guessing the dimension.

4. The critical detail, deterministic ids. A PointStruct id must be a UUID or
   an int. If you use uuid.uuid4() (what processor.py:88 does today) every run
   gets new ids, so upsert cannot match existing points and re-running
   duplicates everything. Use a stable id derived from content instead, e.g.
   uuid.uuid5(NAMESPACE, f"{seed_id}:{source}:{chunk_index}"). Same input,
   same id, so upsert overwrites. Decide your namespace once and keep it.

5. Return state["stored_chunks"] so later nodes can attach provenance. Whatever
   you keep out of here you cannot recover inside extract_entities.

THINK ABOUT
-----------
- Order: you store chunks, then extract entities. But entity_ids can only be
  known after extraction. So they cannot be filled here. That leaves a choice:
  either extract_entities updates the Qdrant payloads afterwards with
  qdrant_client.set_payload, or the Qdrant -> Neo4j direction of the bridge
  does not exist and only Neo4j -> Qdrant does. Whichever you pick, the
  pipeline must end with both directions bridged or Graph RAG cannot expand a
  vector hit into a graph neighborhood.
- Web articles need a source_type of "web" and should keep their url. The PDF
  is source_type "seed". extract_entities will not care, but citations will.
- What is the chunk_id for a web article where there is no filename? You still
  need it unique within the seed, e.g. use the url.
"""

from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState


def store_context(state: OrchestrationState):
    raise NotImplementedError(
        "Implement store_context. Read this module's docstring first. This node "
        "is the point of the whole pipeline, do not shortcut it."
    )
