"""
store_context: load every raw source for a seed from disk, convert it to
plaintext, persist that plaintext, then chunk, embed, and write to Qdrant.
"""

import json
import os
from pathlib import Path

import logfire
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.config import config
from services.Orchestration.graphdb.neo4j_service import reset_graph
from services.Orchestration.ids import chunk_id as make_chunk_id
from services.Orchestration.ids import point_id
from services.Orchestration.StateGraph.OrchestrationState import OrchestrationState
from services.Rag.embedding.embeddings import (
    embedded_texts,
    get_embedding_dim,
    get_safe_chunk_size,
)
from services.Rag.ingestion.chuncking.splitter import chunk_text
from services.Rag.ingestion.loaders.html_loader import loadhtml
from services.Rag.ingestion.loaders.office_loader import loadoffice
from services.Rag.ingestion.loaders.pdf_loader import loadpdf
from services.Rag.ingestion.loaders.text_loader import loadtext

WEB_DIR = os.path.join("DATA", "web")
PLAINTEXT_DIR = os.path.join("DATA", "plaintext")


def _get_client() -> QdrantClient:
    return QdrantClient(
        url=config.QDRANT_CLUSTER_ENDPOINT,
        api_key=config.QDRANT_API_KEY,
    )


WIPE_COLLECTION_ON_STORE = True


def _reset_collection(client: QdrantClient) -> None:
    """Ensure the collection exists and is empty, sized for the active embedder.

    Check before the upsert: if the collection exists, clear the old data; if
    it does not, create it. Either way we end with an empty collection ready
    for this run's points.
    """
    with logfire.span("reset qdrant collection", collection=config.QDRANT_COLLECTION):
        if WIPE_COLLECTION_ON_STORE and client.collection_exists(
            config.QDRANT_COLLECTION
        ):
            client.delete_collection(config.QDRANT_COLLECTION)
            logfire.warning(
                f"Wiped existing collection {config.QDRANT_COLLECTION} "
                f"(WIPE_COLLECTION_ON_STORE=True)"
            )

        if not client.collection_exists(config.QDRANT_COLLECTION):
            dim = get_embedding_dim()
            client.create_collection(
                collection_name=config.QDRANT_COLLECTION,
                vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
            )
            logfire.info(f"Created collection {config.QDRANT_COLLECTION} ({dim}-dim, cosine)")


def _load_plaintext(path: str) -> str:
    """Reuse the RAG loaders by extension. Returns plaintext."""
    ext = path.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return loadpdf(path).text
    if ext in ("html", "htm"):
        return loadhtml(path).text
    if ext in ("docx", "pptx"):
        return loadoffice(path).text
    if ext == "txt":
        return loadtext(path).text
    raise ValueError(f"unsupported source type: {path}")


def _seed_sources(state: OrchestrationState) -> list[dict]:
    """The uploaded seed PDF as one source, if there is one."""
    pdf_path = state.get("seed_pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        return []
    name = state.get("seed_source") or os.path.basename(pdf_path)
    return [
        {
            "path": pdf_path,
            "source": name,
            "source_type": "seed",
            "title": name,
            "url": None,
        }
    ]


def _web_sources(seed_id: str) -> list[dict]:
    """Every raw web document fetch_context wrote, from its manifest."""
    folder = os.path.join(WEB_DIR, seed_id)
    manifest_path = os.path.join(folder, "manifest.json")
    if not os.path.exists(manifest_path):
        return []

    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    sources = []
    for entry in manifest:
        path = os.path.join(folder, entry["file"])
        if not os.path.exists(path):
            continue
        sources.append(
            {
                "path": path,
                # source doubles as the chunk_id ingredient and the citation.
                # The url is stable across reruns; fall back to the file name.
                "source": entry.get("url") or entry["file"],
                "source_type": "web",
                "title": entry.get("title", ""),
                "url": entry.get("url"),
            }
        )
    return sources


def _plaintext_name(src: dict) -> str:
    """Plaintext file name for one source. Unique within the seed's folder."""
    return Path(src["path"]).stem + ".txt"


def store_context(state: OrchestrationState):
    seed_id = state["seed_id"]
    client = _get_client()
    _reset_collection(client)
    # A run replaces the graph, matching the Qdrant wipe above: the demo holds
    # one seed at a time, and fetching a stored seed never calls this.
    reset_graph()

    sources = _seed_sources(state) + _web_sources(seed_id)
    plaintext_folder = os.path.join(PLAINTEXT_DIR, seed_id)
    stored_chunks: list[dict] = []

    with logfire.span("Storing seed context", seed_id=seed_id, sources=len(sources)):
        for src in sources:
            # 1. raw file -> plaintext, using the RAG loader for its type.
            with logfire.span(
                "load source", source=src["source"], source_type=src["source_type"]
            ):
                text = _load_plaintext(src["path"])
            if not text or not text.strip():
                logfire.warning(f"source had no text, skipping: {src['path']}")
                continue

            # 2. persist the plaintext.
            os.makedirs(plaintext_folder, exist_ok=True)
            plaintext_path = os.path.join(plaintext_folder, _plaintext_name(src))
            with logfire.span("write plaintext", path=plaintext_path):
                Path(plaintext_path).write_text(text, encoding="utf-8")

            # 3. pick it back up and use the stored copy as the source of truth.
            with logfire.span("read plaintext", path=plaintext_path):
                text = loadtext(plaintext_path).text

            # 4. chunk.
            with logfire.span(
                "Starting chunking of saved documents",
                source=src["source"],
                chars=len(text),
            ):
                chunks = chunk_text(text, chunk_size=get_safe_chunk_size())
            if not chunks:
                continue

            # 5. embed.
            with logfire.span("Embedding  chunks", count=len(chunks), source=src["source"]):
                vectors = embedded_texts(chunks)

            # 6. build points with deterministic ids and the bridge payload.
            points = []
            for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
                cid = make_chunk_id(seed_id, src["source"], index)
                points.append(
                    models.PointStruct(
                        id=point_id(cid),
                        vector=vector,
                        payload={
                            "text": chunk,
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
                stored_chunks.append(
                    {
                        "chunk_id": cid,
                        "source": src["source"],
                        "source_type": src["source_type"],
                        "text": chunk,
                        "chunk_index": index,
                        "chunk_count": len(chunks),
                    }
                )

            with logfire.span("upsert points", count=len(points), source=src["source"]):
                client.upsert(collection_name=config.QDRANT_COLLECTION, points=points)
            logfire.info(
                f"Stored {len(points)} chunks from {src['source_type']} "
                f"source '{src['source']}'"
            )

    logfire.info("context stored", total_chunks=len(stored_chunks), sources=len(sources))
    return {
        "stored_chunks": stored_chunks,
        "phase": "context_stored",
    }
