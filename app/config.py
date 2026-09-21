import os
from typing import ClassVar

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
    CUSTOM_API_KEY = os.getenv("CUSTOM_API_KEY")
    CUSTOM_BASE_URL = os.getenv("CUSTOM_BASE_URL")
    CUSTOM_MODEL = os.getenv("CUSTOM_MODEL")
    # Extraction per-call budget. extract_entities sends chunks to the LLM as a
    # pre-indexed JSON array and packs whole chunks into a call up to this many
    # characters. Chars, not words, to match the chunker. Roughly 4 chars per
    # token, so the default is about 3000 tokens. Tune per model context size.
    EXTRACT_MAX_CHARS = int(os.getenv("EXTRACT_MAX_CHARS", "12000"))

    # Agent layer. After the graph is written, the top AGENT_POOL_SIZE entities
    # by relationship count become agent candidates. A human then promotes any
    # of them into one of the four archetypes (see
    # services/Orchestration/agents/archetypes.py). Chat retrieves
    # AGENT_CHAT_TOP_K chunks from Qdrant and keeps the last AGENT_CHAT_MEMORY
    # turns of history in Neo4j.
    AGENT_POOL_SIZE = int(os.getenv("AGENT_POOL_SIZE", "10"))
    AGENT_CHAT_TOP_K = int(os.getenv("AGENT_CHAT_TOP_K", "8"))
    AGENT_CHAT_MEMORY = int(os.getenv("AGENT_CHAT_MEMORY", "40"))

    # Social context layer (services/MCP/social). X bills per post read and
    # licensed providers bill per record, so both ceilings are checked before
    # any network call. SOCIAL_PLATFORMS is an explicit opt-in list: empty
    # means the social node passes through without fetching anything.
    SOCIAL_PLATFORMS: ClassVar[list[str]] = [
        p.strip() for p in os.getenv("SOCIAL_PLATFORMS", "").split(",") if p.strip()
    ]
    SOCIAL_QUERY_TYPE = os.getenv("SOCIAL_QUERY_TYPE", "keyword")
    SOCIAL_POSTS_PER_PLATFORM = int(os.getenv("SOCIAL_POSTS_PER_PLATFORM", "50"))
    SOCIAL_MAX_POSTS = int(os.getenv("SOCIAL_MAX_POSTS", "2000"))
    SOCIAL_MAX_COST_USD = float(os.getenv("SOCIAL_MAX_COST_USD", "20"))
    SOCIAL_FETCH_TIMEOUT_SECONDS = int(os.getenv("SOCIAL_FETCH_TIMEOUT_SECONDS", "120"))

    # X official API v2.
    X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN")

    # Bright Data Web Scraper API. dataset_id, discovery mode and discovery seed
    # URL are all per-platform values taken from the account's Control Panel,
    # not constants, so they are read from the environment by platform name:
    # SOCIAL_BRIGHTDATA_DATASET_INSTAGRAM, ..._DISCOVER_BY_INSTAGRAM,
    # ..._SEED_URL_INSTAGRAM, and the same three for X and FACEBOOK.
    BRIGHTDATA_API_TOKEN = os.getenv("BRIGHTDATA_API_TOKEN")
    SOCIAL_BRIGHTDATA_DATASET: ClassVar[dict[str, str | None]] = {
        p: os.getenv(f"SOCIAL_BRIGHTDATA_DATASET_{p.upper()}") for p in ("x", "instagram", "facebook")
    }
    SOCIAL_BRIGHTDATA_DISCOVER_BY: ClassVar[dict[str, str | None]] = {
        p: os.getenv(f"SOCIAL_BRIGHTDATA_DISCOVER_BY_{p.upper()}") for p in ("x", "instagram", "facebook")
    }
    SOCIAL_BRIGHTDATA_SEED_URL: ClassVar[dict[str, str | None]] = {
        p: os.getenv(f"SOCIAL_BRIGHTDATA_SEED_URL_{p.upper()}") for p in ("x", "instagram", "facebook")
    }
    # Per-record price. An assumption until M23 confirms the account's own
    # rate card; it only feeds the planning ceiling, never a customer-facing cost.
    SOCIAL_BRIGHTDATA_USD_PER_RECORD = float(os.getenv("SOCIAL_BRIGHTDATA_USD_PER_RECORD", "0.0015"))
    SOCIAL_PROVIDER_MAX_WAIT_SECONDS = int(os.getenv("SOCIAL_PROVIDER_MAX_WAIT_SECONDS", "180"))

    NEO4J_URI = os.getenv("NEO4J_URI")
    NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")


config = config()
