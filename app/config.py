import os

from dotenv import load_dotenv

load_dotenv()


class config:
    OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
    QDRANT_CLUSTER_ENDPOINT = os.getenv("QDRANT_CLUSTER_ENDPOINT")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    QDRANT_COLLECTION = "RAGAAAAA"
    
    EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "gemini").lower()
    CUSTOM_EMBEDDING_BASE_URL = os.getenv("CUSTOM_EMBEDDING_BASE_URL")
    CUSTOM_EMBEDDING_API_KEY = os.getenv("CUSTOM_EMBEDDING_API_KEY")
    CUSTOM_EMBEDDING_MODEL = os.getenv("CUSTOM_EMBEDDING_MODEL")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    CUSTOM_EMBEDDING_MAX_CHARS = int(os.getenv("CUSTOM_EMBEDDING_MAX_CHARS", "900"))
    MODEL_REASONING="openai/gpt-oss-120b"

    # LLM used for extraction. DeepSeek is OpenAI-compatible, so the client is
    # ChatOpenAI pointed at this base URL. Swapping provider is an .env change.
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")

    # Extraction input budget. extract_entities sends a whole source (one file)
    # in a single call when it fits, and only splits it into parts when it does
    # not. Chars, not words, to match the chunker. Roughly 4 chars per token, so
    # the defaults are about 3000 and 500 tokens. Tune per model context size.
    EXTRACT_MAX_CHARS = int(os.getenv("EXTRACT_MAX_CHARS", "12000"))
    EXTRACT_MIN_PART_CHARS = int(os.getenv("EXTRACT_MIN_PART_CHARS", "2000"))

    NEO4J_URI = os.getenv("NEO4J_URI")
    NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")


config = config()
