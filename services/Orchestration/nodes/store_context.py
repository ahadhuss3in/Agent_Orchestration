"""
store_context: chunk the raw context, embed it, and persist it to Qdrant.
"""

import logfire
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.config import config
from services.Orchestration.ids import chunk_id as make_chunk_id
from services.Orchestration.ids import point_id
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.embedding.embeddings import (
    embedded_texts,
    get_embedding_dim,
    get_safe_chunk_size,
)
from services.Rag.ingestion.chuncking.splitter import chunk_text


def _get_client() -> QdrantClient:
    """One shared connection to Qdrant Cloud."""
    return QdrantClient(
        url=config.QDRANT_CLUSTER_ENDPOINT,
        api_key=config.QDRANT_API_KEY,
    )


def _ensure_collection(client: QdrantClient) -> None:
    """Create the collection if it does not exist yet.
    """
    if client.collection_exists(config.QDRANT_COLLECTION):
        return
    dim = get_embedding_dim()
    client.create_collection(
        collection_name=config.QDRANT_COLLECTION,
        vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
    )
    logfire.info(f"Created collection {config.QDRANT_COLLECTION} ({dim}-dim, cosine)")


def _sources(state: OrchestrationState) -> list[dict]:
    """The raw context for this seed, as a list of {source, source_type, text,
    title, url} dicts. Two kinds can show up:
      - the seed PDF itself, always
      - each fetched web article, real seeds only
    """
    sources = [
        {
            "source": state["seed_source"],
            "source_type": "seed",
            "text": state["seed_text"],
            "title": state["seed_source"],
            "url": None,
        }
    ]
    for i, article in enumerate(state.get("fetched_context", [])):
        # source doubles as the chunk_id ingredient, so it must be unique
        # within the seed. The url is unique; fall back to an index if a
        # result came back without one.
        sources.append(
            {
                "source": article.get("url") or f"web-{i}",
                "source_type": "web",
                "text": article.get("content", ""),
                "title": article.get("title", ""),
                "url": article.get("url"),
            }
        )
    return sources


def store_context(state: OrchestrationState):
    seed_id = state["seed_id"]
    client = _get_client()
    _ensure_collection(client)

    stored_chunks: list[dict] = []

    with logfire.span("Storing seed context", seed_id=seed_id):
        for src in _sources(state):
            # Skip empty sources. A web result can legitimately have no
            # content, and we do not want a chunk of "".
            if not src["text"].strip():
                continue

            # chunk_text packs paragraphs up to a size limit. We ask the
            # embedding module for that limit because it varies per provider
            # (a stricter model needs smaller chunks). Reusing both functions
            # is deliberate: the tested chunker and the tested embedder.
            chunks = chunk_text(src["text"], chunk_size=get_safe_chunk_size())
            if not chunks:
                continue

            # embedded_texts returns one vector per chunk, in the same order.
            vectors = embedded_texts(chunks)

            points = []
            for index, (text, vector) in enumerate(zip(chunks, vectors)):
                cid = make_chunk_id(seed_id, src["source"], index)

                # point_id is a deterministic UUIDv5 of cid. This is the
                # idempotency fix: re-running the same seed produces the same
                # point ids, so upsert overwrites instead of duplicating.
                points.append(
                    models.PointStruct(
                        id=point_id(cid),
                        vector=vector,
                        payload={
                            "text": text,
                            "source": src["source"],
                            "source_type": src["source_type"],
                            "seed_id": seed_id,
                            "chunk_id": cid,
                            "chunk_index": index,
                            "chunk_count": len(chunks),
                            "title": src["title"],
                            "url": src["url"],
                            # filled by extract_entities later
                            "entity_ids": [],
                        },
                    )
                )

                # Keep a plain copy in state. extract_entities reads this to
                # attach source_chunk_ids to the entities it finds. If we do
                # not return these, provenance is impossible.
                stored_chunks.append(
                    {
                        "chunk_id": cid,
                        "source": src["source"],
                        "source_type": src["source_type"],
                        "text": text,
                        "chunk_index": index,
                        "chunk_count": len(chunks),
                    }
                )

            client.upsert(collection_name=config.QDRANT_COLLECTION, points=points)
            logfire.info(
                f"Stored {len(points)} chunks from {src['source_type']} "
                f"source '{src['source']}'"
            )

    return {
        "stored_chunks": stored_chunks,
        "phase": "context_stored",
    }
