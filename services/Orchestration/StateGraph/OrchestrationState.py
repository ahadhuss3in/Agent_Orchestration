from typing import Literal, TypedDict


class OrchestrationState(TypedDict):
    """
    THE JOURNEY OF ONE SEED THROUGH THIS STATE
    ------------------------------------------
    intake_seed        fills seed_id, seed_text, seed_source
    fetch_context      fills fetched_context          (real seeds only)
    store_context      fills stored_chunks            (writes to Qdrant)
    extract_entities   fills candidate_entities,
                             relationships,
                             qualitative_briefing
    write_to_graph     fills nothing, persists to Neo4j

    Read it top to bottom and it is the pipeline in order. `phase` is just a
    marker so logs/traces read in the order things actually happened.
    """

    # Identity. seed_id is the one value everything else keys off:
    # the Qdrant payload field, the Neo4j Seed node id, and the prefix of
    # every entity_id. If it changes between runs, nothing is findable again.
    seed_id: str

    # Where the seed came from. seed_source is the human-readable origin
    # (the uploaded filename, or "text" if someone seeded it directly).
    # seed_pdf_path is the file on disk that intake_seed reads.
    seed_pdf_path: str
    seed_source: str

    # The raw seed as plain text, produced by intake_seed from the PDF.
    seed_text: str
    seed_type: Literal["real", "fictional"]
    phase: str

    # Real-world articles fetched via the Tavily MCP tool. Only populated
    # for seed_type == "real", stays [] for fictional seeds because the
    # fetch_context node never runs for those.
    fetched_context: list[dict]

    # Every chunk store_context wrote to Qdrant for this seed. One dict per
    # chunk: {chunk_id, source, source_type, text, chunk_index, chunk_count}.
    # This is the bridge used later to attach provenance to entities.
    stored_chunks: list[dict]

    # Everything extract_entities produced. Entities and relationships are
    # candidates with source_chunk_ids pointing back into stored_chunks.
    candidate_entities: list[dict]
    relationships: list[dict]

    # Threats, key points, precautions, predictions for this seed.
    qualitative_briefing: dict
