"""
PostRecord: the one shape every social adapter must produce.

The classifier never learns which platform a post came from, because every
platform is normalized into this record at the adapter boundary. If a field
cannot be established, it is None. None is never 0, and it is never a guess:
a hidden Instagram like count and a post with zero likes are different facts,
and collapsing them is how a market brief ends up confidently wrong.

Provenance fields (source_provider, source_query, scraped_at, raw_hash) exist so
any claim in the final brief can be traced back to the exact provider response
that produced it.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

PLATFORMS = ("x", "instagram", "facebook")


class Platform(StrEnum):
    X = "x"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


class AuthorType(StrEnum):
    """What kind of account posted it.

    X does not expose a business/personal distinction at all, so most X records
    land on UNKNOWN. That is recorded rather than inferred, because a market
    brief that counts "businesses" from an inferred field is counting noise.
    """

    PERSON = "person"
    BUSINESS = "business"
    CREATOR = "creator"
    PAGE = "page"
    UNKNOWN = "unknown"


class MediaType(StrEnum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    CAROUSEL = "carousel"
    LINK = "link"


class QueryType(StrEnum):
    KEYWORD = "keyword"
    HASHTAG = "hashtag"
    AUTHOR = "author"
    PAGE = "page"


# What each platform's numbers actually mean. The aggregator reads this instead
# of assuming a like is a like. Kept as data, not prose in a docstring, so a
# claim in the brief can be checked against it programmatically.
METRIC_SEMANTICS: dict[str, dict[str, str]] = {
    "x": {
        "likes": "like_count",
        "comments": "reply_count",
        "shares": "retweet_count + quote_count",
        "views": "impression_count (recorded per view, not unique reach)",
    },
    "instagram": {
        "likes": "like count, null when the author hides likes",
        "comments": "comment count",
        "shares": "not exposed by any Instagram surface",
        "views": "video_view_count, video posts only, null otherwise",
    },
    "facebook": {
        "likes": "reaction total (reactions, not likes)",
        "comments": "comment total",
        "shares": "share total",
        "views": "video views, video posts only, null otherwise",
    },
}


class Metrics(BaseModel):
    """Public engagement counts. None means the platform did not expose it."""

    likes: int | None = None
    comments: int | None = None
    shares: int | None = None
    views: int | None = None


class PostRecord(BaseModel):
    """One public post, normalized. The unit of evidence for everything after."""

    platform: Platform
    native_id: str = Field(description="the platform's own id for this post")

    permalink: str
    author_handle: str
    author_type: AuthorType = AuthorType.UNKNOWN

    text: str = ""
    language: str | None = Field(
        default=None,
        description="ISO 639-1 as reported or detected. None means unknown, "
        "never 'assume English'.",
    )
    created_at: datetime
    metrics: Metrics = Field(default_factory=Metrics)

    hashtags: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    media_type: MediaType | None = Field(
        default=None,
        description="None when the provider did not say. Not the same as text.",
    )

    # Provenance. Every claim in the brief has to be traceable to one of these.
    source_provider: str
    source_query: str = ""
    scraped_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    raw_hash: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    coverage_notes: str | None = None

    @field_validator("created_at", "scraped_at")
    @classmethod
    def _require_utc(cls, value: datetime) -> datetime:
        """Timestamps must be timezone-aware. Naive time is a timezone bug."""
        if value.tzinfo is None:
            raise ValueError("timestamp must be timezone-aware")
        return value.astimezone(UTC)

    @property
    def canonical_id(self) -> str:
        """The dedup key. Stable across fetches, unlike list position."""
        return f"{self.platform}:{self.native_id}"

    @property
    def is_text_bearing(self) -> bool:
        """False for image-only posts, which have nothing to classify."""
        return bool(self.text.strip())


class Coverage(BaseModel):
    """What the fetch actually covered. Travels with the records.

    An empty or truncated fetch is reported as low coverage with a reason,
    never as an absence of demand.
    """

    platform: str
    provider: str
    query: str
    query_type: str
    requested: int
    returned: int
    truncated: bool = False
    estimated_cost_usd: float = 0.0
    notes: list[str] = Field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.returned > 0 and not self.notes


class PlatformHealth(BaseModel):
    """Cheap, non-billing status for one platform's adapter."""

    platform: str
    adapter: str
    provider: str
    configured: bool
    detail: str
    checked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))