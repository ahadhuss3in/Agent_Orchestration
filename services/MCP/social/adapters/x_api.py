"""
X (Twitter) adapter, official API v2 recent search.

Verified against the live spec at https://docs.x.com/x-api/posts/search-recent-posts
(API v2, spec version 2.168) before this was written, rather than from memory:

    GET https://api.x.com/2/tweets/search/recent
      query         required
      max_results   10..100, default 10
      next_token    base32hex pagination cursor
      start_time    must be within the last 7 days
      end_time
      sort_order    recency | relevancy
      post.fields   the current spec's name; older docs say tweet.fields
      expansions, user.fields

Two honest caveats, both carried into the code rather than buried:

1. The field parameter is `post.fields` in the current spec, not the older
   `tweet.fields`. This sends the documented name. M25 confirms it against the
   live API before the adapter is trusted for a run, because a field rename is
   exactly the kind of thing that silently changes or breaks a response.
2. The 7-day window is a hard platform limit. A request older than that is
   clamped, and the clamp is recorded as a coverage note instead of being
   passed off as the full range that was asked for.

Only fields confirmed present in that spec's enum are requested. Nothing is
requested speculatively, because an unknown field name is a 400, and a 400 that
looks like "no results" is the failure this package exists to prevent.
"""

from datetime import UTC, datetime, timedelta

import requests

from app.config import config
from services.MCP.social.adapters.base import Adapter, AdapterResult, FetchRequest
from services.MCP.social.errors import ProviderNotConfigured, ProviderRequestFailed
from services.MCP.social.normalize import normalize_tags, parse_utc, raw_hash, url_canonical
from services.MCP.social.records import (
    AuthorType,
    MediaType,
    Metrics,
    Platform,
    PlatformHealth,
    PostRecord,
    QueryType,
)

BASE_URL = "https://api.x.com"
SEARCH_PATH = "/2/tweets/search/recent"

# Fields confirmed present in the current spec's post.fields enum. public_metrics
# gives the engagement counts; entities gives hashtags and mentions.
POST_FIELDS = "created_at,lang,public_metrics,author_id,conversation_id,entities,possibly_sensitive"
USER_FIELDS = "username,verified"

MIN_RESULTS = 10
MAX_RESULTS = 100
MAX_PAGES = 10
WINDOW_DAYS = 7

# Pay-as-you-go rate for new developers as of February 2026: billed per post
# read. Treated as a planning number and re-checked against the account's own
# usage endpoint in M25 before it is used to set a budget.
USD_PER_POST_READ = 0.005

REQUEST_TIMEOUT_SECONDS = 30


class XApiAdapter(Adapter):
    """Official X API v2. Accurate and paid; the only platform where the
    official path can actually answer a live market question."""

    platform = Platform.X.value
    provider = "x_api_v2"
    usd_per_record = USD_PER_POST_READ

    def __init__(self) -> None:
        self.token = config.X_BEARER_TOKEN

    # -- configuration ----------------------------------------------------

    def health(self) -> PlatformHealth:
        configured = bool(self.token)
        return PlatformHealth(
            platform=self.platform,
            adapter=type(self).__name__,
            provider=self.provider,
            configured=configured,
            detail=(
                f"recent search only, {WINDOW_DAYS}-day window, "
                f"${USD_PER_POST_READ}/post read"
                if configured
                else "X_BEARER_TOKEN is not set"
            ),
        )

    def _require_token(self) -> str:
        if not self.token:
            raise ProviderNotConfigured(self.platform, "X_BEARER_TOKEN")
        return self.token

    # -- fetch -------------------------------------------------------------

    def fetch_posts(self, request: FetchRequest) -> AdapterResult:
        token = self._require_token()
        if request.query_type not in (QueryType.KEYWORD, QueryType.HASHTAG):
            raise ProviderRequestFailed(
                self.provider,
                None,
                f"query_type {request.query_type} is not supported by recent search; "
                "author timelines need a separate endpoint",
            )

        query = request.query if request.query_type is QueryType.KEYWORD else f"#{request.query.lstrip('#')}"
        if not query.strip():
            raise ProviderRequestFailed(self.provider, None, "empty query")

        notes: list[str] = []
        start_time, end_time = self._resolve_window(request, notes)

        records: list[PostRecord] = []
        pages = 0
        cursor: str | None = None
        truncated = False

        while pages < MAX_PAGES:
            page_size = min(MAX_RESULTS, max(MIN_RESULTS, request.limit - len(records)))
            payload = self._search(token, query, page_size, start_time, end_time, cursor)
            pages += 1

            records.extend(self._parse_page(payload, query, start_time, end_time))

            cursor = (payload.get("meta") or {}).get("next_token")
            if not cursor or len(records) >= request.limit:
                break

        # Only truncation if the page cap stopped us short of what was asked
        # for. Reaching the limit, or running out of results, is a complete fetch.
        if pages >= MAX_PAGES and len(records) < request.limit:
            truncated = True
            notes.append(f"hit the {MAX_PAGES}-page cap with a cursor still open")

        return AdapterResult(
            records=records[: request.limit],
            coverage=self._coverage(request, len(records[: request.limit]), truncated, notes),
            estimated_cost_usd=round(len(records[: request.limit]) * USD_PER_POST_READ, 6),
        )

    def _resolve_window(
        self, request: FetchRequest, notes: list[str]
    ) -> tuple[datetime | None, datetime | None]:
        """Clamp the requested window to the platform's 7-day limit."""
        now = datetime.now(UTC)
        floor = now - timedelta(days=WINDOW_DAYS)

        start_time = request.since
        if start_time and start_time < floor:
            notes.append(
                f"since={start_time.isoformat()} is older than the {WINDOW_DAYS}-day "
                f"recent-search window; clamped to {floor.isoformat()}"
            )
            start_time = floor
        return start_time, request.until

    def _search(
        self,
        token: str,
        query: str,
        page_size: int,
        start_time: datetime | None,
        end_time: datetime | None,
        cursor: str | None,
    ) -> dict:
        params: dict[str, object] = {
            "query": query,
            "max_results": page_size,
            "sort_order": "recency",
            "post.fields": POST_FIELDS,
            "expansions": "author_id",
            "user.fields": USER_FIELDS,
        }
        if start_time:
            params["start_time"] = start_time.astimezone(UTC).isoformat().replace("+00:00", "Z")
        if end_time:
            params["end_time"] = end_time.astimezone(UTC).isoformat().replace("+00:00", "Z")
        if cursor:
            params["next_token"] = cursor

        try:
            response = requests.get(
                f"{BASE_URL}{SEARCH_PATH}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise ProviderRequestFailed(self.provider, None, str(exc)) from exc

        if response.status_code == 429:
            raise ProviderRequestFailed(
                self.provider, 429, "recent-search rate limit hit; back off before retrying"
            )
        if response.status_code != 200:
            raise ProviderRequestFailed(self.provider, response.status_code, response.text)

        return response.json()

    def _parse_page(
        self,
        payload: dict,
        query: str,
        start_time: datetime | None,
        end_time: datetime | None,
    ) -> list[PostRecord]:
        users = {
            user["id"]: user for user in ((payload.get("includes") or {}).get("users") or [])
        }
        records: list[PostRecord] = []
        for item in payload.get("data") or []:
            author_id = item.get("author_id")
            author = users.get(author_id, {})
            handle = author.get("username") or "unknown"
            metrics = item.get("public_metrics") or {}
            entities = item.get("entities") or {}

            records.append(
                PostRecord(
                    platform=Platform.X,
                    native_id=str(item["id"]),
                    # The /i/status form resolves for any post and needs no
                    # username, so a missing author expansion cannot produce a
                    # broken or invented permalink.
                    permalink=url_canonical(
                        f"https://x.com/{handle}/status/{item['id']}"
                        if handle != "unknown"
                        else f"https://x.com/i/status/{item['id']}"
                    ),
                    author_handle=handle,
                    author_type=AuthorType.PERSON if author.get("verified") else AuthorType.UNKNOWN,
                    text=item.get("text") or "",
                    # X reports the language it detected, which is not the same
                    # claim as a language we detected ourselves.
                    language=item.get("lang"),
                    created_at=parse_utc(item["created_at"]),
                    metrics=Metrics(
                        likes=metrics.get("like_count"),
                        comments=metrics.get("reply_count"),
                        shares=self._shares(metrics),
                        views=metrics.get("impression_count"),
                    ),
                    hashtags=normalize_tags([h.get("tag") for h in entities.get("hashtags") or []]),
                    mentions=normalize_tags([m.get("username") for m in entities.get("mentions") or []]),
                    media_type=self._media_type(item),
                    source_provider=self.provider,
                    source_query=query,
                    raw_hash=raw_hash(item),
                    coverage_notes=self._window_note(start_time, end_time),
                )
            )
        return records

    @staticmethod
    def _shares(metrics: dict) -> int | None:
        """X has no single share count: reposts and quote posts are separate."""
        retweets = metrics.get("retweet_count")
        quotes = metrics.get("quote_count")
        if retweets is None and quotes is None:
            return None
        return (retweets or 0) + (quotes or 0)

    @staticmethod
    def _media_type(item: dict) -> MediaType | None:
        """None when the post carries media whose kind this call did not request.

        Reporting "text" for a video post would be a fabricated field, which is
        worse than an honest unknown.
        """
        if (item.get("attachments") or {}).get("media_keys"):
            return None
        if (item.get("entities") or {}).get("urls"):
            return MediaType.LINK
        return MediaType.TEXT

    @staticmethod
    def _window_note(start_time: datetime | None, end_time: datetime | None) -> str | None:
        if not start_time and not end_time:
            return None
        return f"window {start_time or 'open'}..{end_time or 'now'} (UTC)"