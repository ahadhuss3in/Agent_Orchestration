"""
Normalization, dedup and engagement math. No network, no LLM, no provider.

Everything here is deterministic and testable, which is deliberate: these are
the functions that decide what counts as "one post", what a timestamp means,
and how two posts with wildly different ages get compared. Getting them wrong
silently corrupts every number downstream.
"""

import hashlib
import json
import math
import re
from datetime import UTC, datetime

from services.MCP.social.records import PostRecord

_HASHTAG_OR_MENTION = re.compile(r"^[#@]?[^\s#@]+$")


def parse_utc(value: object) -> datetime:
    """Parse a provider timestamp into an aware UTC datetime.

    Handles ISO 8601 with Z or an offset, and epoch seconds or milliseconds.
    Millisecond epochs are detected by magnitude: anything past year 2286 in
    seconds is a millisecond value, and getting that wrong shifts a timestamp
    by ~50,000 years, which is loud rather than subtle on purpose.
    """
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)

    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds > 1e11:
            seconds /= 1000.0
        return datetime.fromtimestamp(seconds, tz=UTC)

    if isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValueError("empty timestamp")
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text).astimezone(UTC)

    raise ValueError(f"unsupported timestamp type: {type(value).__name__}")


def normalize_tags(values: object) -> list[str]:
    """Lowercase, strip the sigil, drop empties, dedupe, preserve order.

    Real provider responses do contain duplicates and bare "#a" fragments; an
    Instagram response captured in the Bright Data docs returns
    ["#a", "#a", "#colarfolheado", "#joia"] for one post. Counting those raw
    would inflate every hashtag frequency the study reports.
    """
    if not values:
        return []
    seen: dict[str, None] = {}
    for raw in values:
        if not isinstance(raw, str):
            continue
        cleaned = raw.strip().lstrip("#@").lower()
        if cleaned and _HASHTAG_OR_MENTION.match(cleaned):
            seen.setdefault(cleaned, None)
    return list(seen)


def raw_hash(payload: object) -> str:
    """Stable sha256 of a provider's raw record, for provenance and drift checks."""
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def age_hours(record: PostRecord, now: datetime | None = None) -> float:
    """Post age in hours, floored at 1 to keep velocity math finite."""
    reference = now or datetime.now(UTC)
    return max((reference - record.created_at).total_seconds() / 3600.0, 1.0)


def engagement_per_hour(record: PostRecord, now: datetime | None = None) -> float | None:
    """Age-normalized engagement.

    Raw counts only grow, so a two-year-old post always outranks a two-hour-old
    one. Dividing by age is what makes "what is landing right now" a question
    the data can answer. Returns None when the platform hid the counts, so
    hidden metrics never enter a ranking as zeros.
    """
    likes = record.metrics.likes
    if likes is None:
        return None
    return round(likes / age_hours(record, now), 4)


def content_fingerprint(record: PostRecord) -> str:
    """Key for near-duplicate collapse: normalized text plus author.

    Reposts and quote-spam carry different native ids, so canonical_id alone
    does not catch them. The highest-engagement copy survives.
    """
    text = " ".join(record.text.lower().split())
    return hashlib.sha1(f"{record.author_handle.lower()}|{text}".encode()).hexdigest()[:16]


def dedupe(records: list[PostRecord]) -> tuple[list[PostRecord], dict]:
    """Drop exact id duplicates and collapse near-duplicates into one survivor.

    Returns the surviving records and a small report, because the duplicate
    rate is one of the accuracy acceptance criteria and has to be measurable
    rather than assumed.
    """
    by_id: dict[str, PostRecord] = {}
    exact_duplicates = 0
    for record in records:
        key = record.canonical_id
        if key in by_id:
            exact_duplicates += 1
            continue
        by_id[key] = record

    by_fingerprint: dict[str, PostRecord] = {}
    collapsed = 0
    for record in by_id.values():
        fingerprint = content_fingerprint(record)
        incumbent = by_fingerprint.get(fingerprint)
        if incumbent is None:
            by_fingerprint[fingerprint] = record
            continue
        collapsed += 1
        if (record.metrics.likes or 0) > (incumbent.metrics.likes or 0):
            by_fingerprint[fingerprint] = record

    survivors = sorted(by_fingerprint.values(), key=lambda r: r.created_at, reverse=True)
    report = {
        "input": len(records),
        "exact_duplicates": exact_duplicates,
        "near_duplicates": collapsed,
        "surviving": len(survivors),
        "duplicate_rate": _safe_rate(exact_duplicates + collapsed, len(records)),
    }
    return survivors, report


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, 4)


def url_canonical(url: str) -> str:
    """Strip tracking params and trailing slashes so two links to one post match.

    Instagram appends igsh / utm params to shared permalinks; without this, the
    same post shared twice looks like two posts with different URLs.
    """
    if not url:
        return ""
    base, _, query = url.partition("?")
    if query:
        keep = [
            part
            for part in query.split("&")
            if part.split("=", 1)[0].lower() not in {"igsh", "igshid", "utm_source", "utm_medium", "utm_campaign", "s", "t", "fbclid"}
        ]
        base = base + ("?" + "&".join(keep) if keep else "")
    return base.rstrip("/")


def coverage_ratio(returned: int, requested: int) -> float:
    """How much of the asked-for volume actually arrived. Reported, not hidden."""
    if requested <= 0:
        return 0.0
    return round(math.floor(returned) / requested, 4)