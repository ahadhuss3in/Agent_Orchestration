"""
Typed failures for the social context layer.

Every one of these is raised instead of returning an empty list. An empty list
is indistinguishable from "nobody is talking about this", and that mistake is
the single most expensive failure mode in this subsystem: it turns a broken
fetch into a confident market conclusion. A fetch that could not run fails
loudly and carries a code the coverage report can surface.
"""


class SocialError(Exception):
    """Base for everything this package raises."""

    code = "social_error"


class ProviderNotConfigured(SocialError):
    """No credentials or dataset id for this platform.

    Carries the exact environment variable that is missing, so a run that
    cannot fetch says which key to set rather than "something went wrong".
    """

    code = "provider_not_configured"

    def __init__(self, platform: str, missing: str):
        self.platform = platform
        self.missing = missing
        super().__init__(f"platform '{platform}' is not configured: set {missing}")


class ProviderRequestFailed(SocialError):
    """The provider answered, but not with usable data."""

    code = "provider_request_failed"

    def __init__(self, provider: str, status: int | None, detail: str):
        self.provider = provider
        self.status = status
        self.detail = detail[:300]
        where = f"HTTP {status}" if status is not None else "transport"
        super().__init__(f"{provider} request failed ({where}): {self.detail}")


class UnsupportedFieldMapping(SocialError):
    """A provider returned records, but no verified field map exists for them.

    Deliberately not a placeholder that returns []. Writing a field map from
    guesswork is how you get a caption parsed out of an engagement counter, and
    the whole point of this layer is that the numbers are real. The map gets
    written once a live response has been seen.
    """

    code = "unsupported_field_mapping"

    def __init__(self, provider: str, platform: str, reason: str):
        self.provider = provider
        self.platform = platform
        super().__init__(
            f"no verified field map for {provider}/{platform}: {reason}"
        )


class QuotaWindowExhausted(SocialError):
    """A platform quota window (not a rate limit) is used up.

    Instagram's hashtag search allows 30 unique hashtags per rolling 7 days per
    account. When that window is closed, fetching more hashtags is impossible
    until it resets, which is a coverage fact the brief has to state.
    """

    code = "quota_window_exhausted"

    def __init__(self, platform: str, detail: str):
        self.platform = platform
        super().__init__(f"{platform} quota window exhausted: {detail}")


class BudgetExceeded(SocialError):
    """The run would pass its post or cost ceiling.

    X bills per post read, so a runaway query fan-out is a real invoice. The
    planner checks against the ceiling before any network call.
    """

    code = "budget_exceeded"

    def __init__(self, detail: str):
        super().__init__(f"social budget exceeded: {detail}")