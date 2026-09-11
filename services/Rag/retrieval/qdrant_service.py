import logfire
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.config import config
from services.Rag.embedding.embeddings import embedding_query

# Initialize Qdrant Client
client = QdrantClient(
    url=config.QDRANT_CLUSTER_ENDPOINT,
    api_key=config.QDRANT_API_KEY
)

def search_enterprise_knowledge(query: str, limit: int = 8, seed_id: str | None = None, entity_id: str | None = None):
    """
    Performs a high-precision search in the enterprise knowledge base.

    Leave seed_id/entity_id as None to search the whole collection like
    before, nothing changes for the existing chatbot. Pass seed_id to only
    search within one governance/simulation scenario's own documents. Pass
    entity_id on top of that to search as one specific agent: it sees that
    scenario's shared documents (entity_id absent on the chunk) plus its
    own private documents (entity_id matches), but not another agent's.
    """
    try:
        query_vector = embedding_query(query)

        query_filter = None
        if seed_id:
            must = [models.FieldCondition(key="seed_id", match=models.MatchValue(value=seed_id))]
            should = None
            if entity_id:
                # visible to this agent: the seed's shared docs (no entity_id
                # set on the chunk) OR this agent's own docs (entity_id matches)
                should = [
                    models.FieldCondition(key="entity_id", match=models.MatchValue(value=entity_id)),
                    models.IsNullCondition(is_null=models.PayloadField(key="entity_id")),
                ]
            query_filter = models.Filter(must=must, should=should)

        # Using query_points
        response = client.query_points(
            collection_name=config.QDRANT_COLLECTION,
            query=query_vector,
            query_filter=query_filter,
            limit=limit,
            with_payload=True # JSON
        )

        results = []
        for res in response.points:
            results.append({
                "content": res.payload.get("text", ""),
                "source": res.payload.get("source", "Unknown"),
                "score": res.score
            })
        
        return results
    except Exception as e:
        logfire.error(f" Qdrant Search Failed: {e}")
        return []


def fetch_chunks_by_ids(seed_id: str, chunk_ids: list[str]) -> list[dict]:
    """Fetch specific chunks by their chunk_id, scoped to one seed.

    This is the Neo4j -> Qdrant half of the bridge. When graph expansion finds
    a neighbor entity, that entity carries source_chunk_ids; this turns those
    ids back into the actual text.

    NOTE: a point's Qdrant id is the deterministic uuid5 you built in
    store_context, which is NOT the same string as chunk_id. So you cannot
    retrieve by point id directly unless you keep that mapping. The simple
    route is a scroll with a Filter on the payload field chunk_id, using
    MatchAny for the list.

    TODO (you): implement with client.scroll. Read the qdrant_client docs for
    Filter / FieldCondition / MatchAny, or look at the filter in
    search_enterprise_knowledge above for the pattern.
    """
    raise NotImplementedError("Implement fetch_chunks_by_ids.")


def fetch_chunks_by_entity(seed_id: str, entity_id: str) -> list[dict]:
    """Every chunk whose payload lists this entity_id, scoped to one seed.

    This is the Qdrant -> Neo4j direction, and it only works if store_context
    (or a later step) wrote entity_ids into the chunk payloads. Used to answer
    "show me everything that mentions this entity".

    TODO (you): same scroll pattern as fetch_chunks_by_ids, but matching on
    the entity_ids payload field.
    """
    raise NotImplementedError("Implement fetch_chunks_by_entity.")