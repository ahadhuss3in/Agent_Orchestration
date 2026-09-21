"""
Cost ceiling and query fan-out, checked before any network call.

X bills per post read, and licensed providers bill per successful record, so an
unbounded fan-out is an unbounded invoice. The ceiling is enforced here, at
planning time, not discovered afterwards in a billing dashboard.
"""

from pydantic import BaseModel

from app.config import config
from services.MCP.social.errors import BudgetExceeded
from services.MCP.social.records import QueryType


class RunBudget(BaseModel):
    """A run's ceiling. Nothing spends without asking this first."""

    max_posts: int
    max_cost_usd: float
    posts_fetched: int = 0
    cost_usd: float = 0.0

    def allow(self, wanted: int, usd_per_record: float) -> int:
        """How many records this run may still fetch. Raises if none.

        Returns a possibly reduced number rather than refusing outright, so a
        run at 90% of its budget still produces evidence instead of nothing,
        with the reduction recorded as a coverage note upstream.
        """
        remaining_posts = self.max_posts - self.posts_fetched
        if remaining_posts <= 0:
            raise BudgetExceeded(
                f"post ceiling reached ({self.posts_fetched}/{self.max_posts})"
            )

        if usd_per_record > 0:
            remaining_usd = self.max_cost_usd - self.cost_usd
            if remaining_usd <= 0:
                raise BudgetExceeded(
                    f"cost ceiling reached (${self.cost_usd:.4f}/${self.max_cost_usd:.2f})"
                )
            affordable = int(remaining_usd // usd_per_record)
            if affordable <= 0:
                raise BudgetExceeded(
                    f"next record would exceed the cost ceiling "
                    f"(${usd_per_record:.6f}/record, ${remaining_usd:.4f} left)"
                )
            remaining_posts = min(remaining_posts, affordable)

        return min(wanted, remaining_posts)

    def spend(self, records: int, usd_per_record: float) -> None:
        self.posts_fetched += records
        self.cost_usd = round(self.cost_usd + records * usd_per_record, 6)


def default_budget() -> RunBudget:
    return RunBudget(
        max_posts=config.SOCIAL_MAX_POSTS,
        max_cost_usd=config.SOCIAL_MAX_COST_USD,
    )


def plan_queries(
    seed_query: str,
    platforms: list[str],
    limit_per_platform: int,
    query_type: QueryType = QueryType.KEYWORD,
) -> list[dict]:
    """One query per platform for a seed.

    Fan-out (co-occurring terms, hashtag expansion, time stratification) is
    M23+ work. This is the single-query shape the node needs to run end to end,
    kept deliberately naive rather than half-built: a fan-out that picks terms
    badly produces a biased sample that looks precise.
    """
    query = " ".join(seed_query.split())
    return [
        {
            "platform": platform,
            "query": query,
            "query_type": query_type.value,
            "limit": limit_per_platform,
        }
        for platform in platforms
    ]