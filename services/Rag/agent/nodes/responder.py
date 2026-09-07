from services.Rag.agent.StateGraph.RagState import AgentState
from app.config import config
from langchain_groq import ChatGroq
import logfire


llm = ChatGroq(api_key=config.GROQ_API_KEY, model=config.MODEL_REASONING)


def generate_node(state:AgentState):
    """
    Generate a reponse to the actual query using 
    the document and the conversational history
    """
    query = state["query"]
    history=""
## import the history of messages 
    for msg in state["messages"][:-1]:
            ## add_messages turns every message into a real HumanMessage/
            ## AIMessage object, not a dict, so this needs attribute access
            ## (.type/.content), not ["role"]/["content"]
            role  = "User" if msg.type == "human" else "Assistant"
            history += f"{role}:{msg.content}\n"

    user_message = state["messages"][-1].content if state["messages"] else ""
    # absent for the general chatbot, defaults to today's exact persona
    persona = state.get("persona") or "You are a friendly and helpful Enterprise AI Assistant."

    if query == "CONVERSATIONAL":
        logfire.info("Generating conversational response using memory.")
        prompt = f"""
        {persona}
        Answer the user's latest message using the CONVERSATION HISTORY below.

        CONVERSATION HISTORY:
        {history}

        LATEST MESSAGE:
        "{user_message}"
        """
        # no retrieval happened this turn, so no sources actually back
        # this answer, wipe out whatever citation was left over from a
        # previous technical turn instead of leaving it sitting there
        citation_for_response = []
    else:
        logfire.info("Generating technical RAG response.")
        max_context_chars = 25000
        full_context = ""

        for doc in state["citation"]:
            if len(full_context) + len(doc) < max_context_chars:
                full_context += doc + "\n\n"
            else:
                logfire.warning("Context truncated to fit Groq TPM limits.")
                break

        technical_persona = state.get("persona") or "You are a Senior Technical Architect."
        prompt = f"""
        {technical_persona}
        Answer the question using the TECHNICAL CONTEXT provided.

        TECHNICAL CONTEXT:
        {full_context}

        CONVERSATION HISTORY:
        {history}

        USER QUESTION:
        "{user_message}"
        """
        # this turn's own retrieval really was used to answer
        citation_for_response = state["citation"]
    with logfire.span("LLm run for reponse"):
         try:
              content = llm.invoke(prompt).content
              logfire.info("Response systhesized via LLM")
              return {
                    "final_ans":content,
                    "status":"Response Generated",
                    "plan":state["plan"],
                    "citation":citation_for_response,
                    "messages":[{"role":"assistant", "content":content}]
              }
         except Exception as e:
              logfire.error(f"LLm gen failed :{e}")