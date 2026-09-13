import time

import logfire
import requests
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.config import config

BATCH_SIZE = 50
_GEMINI_DIM = 3072  #Dimention of embedding model ( it just means it has these many elements)
_FALLBACK_DIM = 768

# how big a chunk_text() chunk should be for each provider.
_GEMINI_CHUNK_SIZE = 1500
_FALLBACK_CHUNK_SIZE = 1500

_active_model = None
_model_type : str | None = None #gemini or custom or fallback
_custom_dim: int | None = None  # measured at probe time, custom models vary

def _probe_gemini():
    """a embedded call to verify gemini is running
    please use my other project which is a AI gateway to avoid this :)
    """
    try:
        model= GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-2-preview",
            google_api_key=config.GEMINI_API_KEY,
        )
        model.embed_query("test")
        logfire.info(f"Gemini Embeddings are ready. Model used {model.model}")
        return model
    except Exception as e:  # noqa: BLE001 (a failed probe falls back, not fatal)
        logfire.warning(f"Gemini probe failed : {e}. Will use the sentence-transfromer as fallback model")
        return None


def _call_custom_embeddings(texts: list[str]) -> list[list[float]]:
    """the actual http call to whatever openai-compatible endpoint is set
    in .env
    """
    max_chars = config.CUSTOM_EMBEDDING_MAX_CHARS
    safe_texts = []
    for text in texts:
        ## slixces the chunk since most of these providers dont have huge context 
        if len(text) > max_chars:
            logfire.warning(
                "chunk too long for the custom embedding model, truncating it",
                original_chars=len(text),
                kept_chars=max_chars,
            )
            safe_texts.append(text[:max_chars])
        else:
            safe_texts.append(text)
        ##using jina AI for the base for embedding model ( free 1 M token)
    base_url = config.CUSTOM_EMBEDDING_BASE_URL.rstrip("/")
    response = requests.post(
        f"{base_url}/embeddings",
        headers={"Authorization": f"Bearer {config.CUSTOM_EMBEDDING_API_KEY}"},
        json={"model": config.CUSTOM_EMBEDDING_MODEL, "input": safe_texts},
        timeout=60,
    )
    if response.status_code >= 400:
        # raise_for_status() throws away the provider's actual explanation,
        # this keeps it so failures are diagnosable straight from the logs.
        raise RuntimeError(f"custom embeddings request failed: {response.text}")

    data = response.json()
    return [item["embedding"] for item in data["data"]]


def _probe_custom():
    """a real call to check the configured custom embedding model actually
    responds, and to measure its real vector size, since unlike gemini or
    the local fallback, this could be any model at any dimension.
    """
    global _custom_dim
    try:
        logfire.info("Using Custom Embedding Model")
        vectors = _call_custom_embeddings(["test"])
        _custom_dim = len(vectors[0])
        logfire.info(
            f"Custom embeddings are ready. Model used {config.CUSTOM_EMBEDDING_MODEL}",
            dim=_custom_dim,
        )
        return config.CUSTOM_EMBEDDING_MODEL
    except Exception as e:  # noqa: BLE001 (a failed probe falls back, not fatal)
        logfire.warning(f"Custom embedding probe failed : {e}. Will use the sentence-transfromer as fallback model")
        return None


def load_fallback():
    from sentence_transformers import SentenceTransformer
    logfire.info("Loading fallback sentence transformer(768 DIM)")
    return SentenceTransformer("all-mpnet-base-v2")

def _init():
    global _active_model, _model_type

    if _active_model is not None:
        return _active_model, _model_type

    # config.EMBEDDING_PROVIDER picks which one to try first. anything
    # other than "gemini" is treated as "custom", driven entirely by the
    # CUSTOM_EMBEDDING_* settings, not hardcoded to any one provider.
    # The probe makes a real network call, so it gets its own span.
    with logfire.span(
        "init embeddings",
        provider=config.EMBEDDING_PROVIDER,
        custom_model=config.CUSTOM_EMBEDDING_MODEL,
    ):
        if config.EMBEDDING_PROVIDER == "gemini":
            active = _probe_gemini()
            if active:
                _active_model = active
                _model_type = "gemini"
                return
        else:
            active = _probe_custom()
            if active:
                _active_model = active
                _model_type = "custom"
                return

    _active_model = load_fallback()
    _model_type = "Sentence-Transformer-fallback"

def get_embedding_dim() -> int:
    """returns the vec dim fir active model."""
    _init()
    if _model_type == "gemini":
        return _GEMINI_DIM
    if _model_type == "custom":
        return _custom_dim
    return _FALLBACK_DIM

def get_safe_chunk_size() -> int:
    """how big a chunk_text() chunk can be before it risks breaking the
    active embedding model. call this before chunking, not after, so a
    custom model's chunks come out small enough from the start instead of
    needing to be truncated later.
    """
    _init()
    if _model_type == "gemini":
        return _GEMINI_CHUNK_SIZE
    if _model_type == "custom":
        return config.CUSTOM_EMBEDDING_MAX_CHARS
    return _FALLBACK_CHUNK_SIZE

def embedding_batch(batch:list[str]) -> list[list[float]]:
    """embedding a batch using the embedding model"""
    logfire.info("Running embedding model on batches")
    if _model_type == "gemini":
        for r in range (5):
            try:
                ## actual embedding process which is ran
                return _active_model.embed_documents(batch)
            ## rate limit error handling based on no of retries
            except Exception as e:
                err = str(e).lower()
                ## free tier so checking for rate limiting
                rate_limited_check = any(x in err for x in ("429", "quota","rate","resource_exhausted","billing","exceeded"))
                if rate_limited_check and r!=4:
                    sleep = 60 # the actual rate limit time 
                    logfire.warning(
                        f"Model is getting rate limited:Retrying in {sleep} seconds "
                        f"Attempts left {r+1}/5."
                    )
                    time.sleep(sleep)
                else :
                    logfire.error(f"Gemini Embedding failed:{e}")
                    raise
        raise RuntimeError("Gemini embedding failed after 5 exponential retries.")
    elif _model_type == "custom":
        for r in range(5):
            try:
                ## actual embedding process which is ran
                return _call_custom_embeddings(batch)
            ## rate limit error handling based on no of retries
            except Exception as e:
                err = str(e).lower()
                ## free tier so checking for rate limiting
                rate_limited_check = any(x in err for x in ("429", "quota", "rate", "exceeded"))
                if rate_limited_check and r != 4:
                    sleep = 2**r
                    logfire.warning(
                        f"Custom embedding provider is getting rate limited:Retrying in {sleep} seconds "
                        f"Attempts left {r+1}/5."
                    )
                    time.sleep(sleep)
                else:
                    logfire.error(f"Custom embedding failed:{e}")
                    raise
        raise RuntimeError("Custom embedding failed after 5 exponential retries.")
    else:
        ## fallback sentence trasnformer encoding ( embedding )
        return _active_model.encode(batch, show_progress_bar=False).tolist()



## aha now the query should also be in same format as asnwer right?
##so will also embedd the query so u can compare apple to apple in hdhahduh(perosnal work for embeddings) language

def embedding_query(query:str) -> list[float]:
    """embedded query to compare"""

    _init()
    if _model_type =="gemini":
        ## embded the query using gemini
        return _active_model.embed_query(query)
    if _model_type == "custom":
        ## embed the query using the custom provider, same call as a batch of one
        return _call_custom_embeddings([query])[0]
    ## or using sentence transformer
    return _active_model.encode([query])[0].tolist()

def embedded_texts(texts:list[str])-> list[list[float]]: 
    _init()
    all_embeddings: list[list[float]] = []
    with logfire.span("Running embedding model ", model=_model_type, total=len(texts), batch_size=BATCH_SIZE):
        for i in range(0,len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            with logfire.span("Embedded Batch", model=_model_type, start = i, size=len(batch)):
                all_embeddings.extend(embedding_batch(batch))
    return all_embeddings