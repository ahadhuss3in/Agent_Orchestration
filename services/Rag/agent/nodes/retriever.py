import logfire
from services.Rag.agent.StateGraph.RagState import AgentState
from services.Rag.retrieval.qdrant_service import search_enterprise_knowledge
from services.Rag.retrieval.ranking_service import rerank_documents


def retrieve_node(state: AgentState):
    """
    Search Qdrant for the planner's refined query, then rerank the results
    with the cross-encoder before handing them off to generation.
    """
    query = state["query"]

    # absent for the general chatbot, so behavior there is unchanged; set
    # for an agent chat, scopes retrieval to that agent's own seed/entity
    qdrant_filter = state.get("qdrant_filter") or {}

    with logfire.span("Retrieving documents"):
        logfire.info(f"Searching DataBase for {query}")
        results = search_enterprise_knowledge(
            query,
            seed_id=qdrant_filter.get("seed_id"),
            entity_id=qdrant_filter.get("entity_id"),
        )

        # search_enterprise_knowledge hands back {"content", "source",
        # "score"} dicts, but rerank_documents only wants the raw passage
        # text, pull it out first so the reranker isn't scoring whole dicts.
        logfire.info("Search Completed, recieved Unranked results")
        passages = [r["content"] for r in results]
        top_n=5
        with logfire.span("Running reranking for the contents recieved"):
            reranked = rerank_documents(query, passages, top_n)
            logfire.info(f"Re-Ranking Completed. Kept {top_n} contents")

        logfire.info(
            f"Retrieved {len(results)} candidates, kept {len(reranked)} after reranking"
        )

        return {
            "citation": reranked,
            "status": f"Found {len(reranked)} relevant documents",
            "plan":state["plan"]+["context retrived"]
        }
