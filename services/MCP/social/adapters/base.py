"""
The adapter contract: one fetch method, one health method.

Two responsibilities only. Everything that could be shared (dedup, normalization
math, budget) lives outside, so the platform-specific code is exactly the part
that is genuinely platform-specific and cannot leak assumptions upward.
"""

from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel, Field

from services.MCP.social.records import (
    Coverage,
    PlatformHealth,
    PostRecord,
    QueryType,
)


class FetchRequest(BaseModel):
    """One normalized fetch request, platform-agnostic."""

    platform: str
    query: str
    query_type: QueryType = QueryType.KEYWORD
    since: datetime | None = None
    until: datetime | None = None
    limit: int = Field(default=50, ge=1)


class AdapterResult(BaseModel):
    """Records plus what the fetch actually covered.

    The records alone are not a result. A caller that receives zero records has
    to be able to tell "nothing matched" from "the provider refused", and only
    the coverage object carries that distinction.
    """

    records: list[PostRecord] = Field(default_factory=list)
    coverage: Coverage
    estimated_cost_usd: float = 0.0


class Adapter(ABC):
    """Base class for every social data source."""

    platform: str
    provider: str
    usd_per_record: float = 0.0

    @abstractmethod
    def fetch_posts(self, request: FetchRequest) -> AdapterResult:
        """Fetch public posts for one request. Raises SocialError subclasses."""

    @abstractmethod
    def health(self) -> PlatformHealth:
        """Report configuration status without spending money on a fetch."""

    def _coverage(
        self,
        request: FetchRequest,
        returned: int,
        truncated: bool,
        notes: list[str] | None = None,
    ) -> Coverage:
        return Coverage(
            platform=self.platform,
            provider=self.provider,
            query=request.query,
            query_type=request.query_type.value,
            requested=request.limit,
            returned=returned,
            truncated=truncated,
            notes=notes or [],
        )