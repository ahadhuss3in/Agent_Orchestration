"""
Adapter registry: platform name in, adapter out.

Which source serves which platform is the federation decision from the plan:

    x          -> official API v2 (accurate, billed per post read)
    instagram  -> licensed provider (official path is capped at 30 hashtags
                  per rolling 7 days and cannot carry a market study)
    facebook   -> licensed provider (no official public search path exists)

Adding the official Instagram Graph fallback later means registering it here
under a different provider name and letting config choose; nothing above this
layer knows which source answered.
"""

from services.MCP.social.adapters.base import Adapter, AdapterResult, FetchRequest
from services.MCP.social.adapters.brightdata import BrightDataAdapter
from services.MCP.social.adapters.x_api import XApiAdapter
from services.MCP.social.records import PLATFORMS

__all__ = [
    "Adapter",
    "AdapterResult",
    "FetchRequest",
    "all_adapters",
    "get_adapter",
    "registered_platforms",
]


def _build(platform: str) -> Adapter:
    if platform == "x":
        return XApiAdapter()
    if platform in ("instagram", "facebook"):
        return BrightDataAdapter(platform)
    raise KeyError(platform)


def registered_platforms() -> list[str]:
    return list(PLATFORMS)


def get_adapter(platform: str) -> Adapter:
    """The adapter for one platform. Unknown platform is a hard error."""
    normalized = (platform or "").strip().lower()
    if normalized not in PLATFORMS:
        raise KeyError(f"unknown platform '{platform}'; known: {', '.join(PLATFORMS)}")
    return _build(normalized)


def all_adapters() -> list[Adapter]:
    """Every adapter, for a health sweep. Constructed fresh, so a config
    change is picked up without restarting the server process."""
    return [_build(platform) for platform in PLATFORMS]