"""
Bright Data Web Scraper API adapter. The path to Instagram and Facebook.

Endpoint flow verified against https://docs.brightdata.com/api-reference/scrapers/synchronous-requests
and the Instagram scraper reference before writing:

    POST https://api.brightdata.com/datasets/v3/scrape?dataset_id=...&format=json
         Authorization: Bearer API_KEY
         body: {"input": [{"url": ...}], "limit_per_input": n}
         200 -> array of records
         202 -> {"snapshot_id": ...}, job continues past the 1-minute sync limit
         then GET /datasets/v3/progress/{snapshot_id} -> GET /datasets/v3/snapshot/{snapshot_id}

Design consequences of how that API actually behaves:

* Discovery (find posts matching criteria) always runs past the sync limit, so
  every fetch here goes through the async branch when it gets a 202.
* Sync accepts at most 20 inputs. Anything larger is a discovery job.
* `dataset_id` and the discovery mode are per-platform identifiers that come
  from the account's own Control Panel, so they are configuration, not
  constants. A missing one raises ProviderNotConfigured naming the variable.
* Only the Instagram field map is implemented, because it is the only one whose
  real response shape has been read (captured in Bright Data's own docs). X and
  Facebook return different field names, and writing those from guesswork is how
  a like count ends up in a follower field. They raise UnsupportedFieldMapping
  until a live response is captured in M23.
"""

import re
import time

import requests

from app.config import config
from services.MCP.social.adapters.base import Adapter, AdapterResult, FetchRequest
from services.MCP.social.errors import (
    ProviderNotConfigured,
    ProviderRequestFailed,
    UnsupportedFieldMapping,
)
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

SCRAPE_URL = "https://api.brightdata.com/datasets/v3/scrape"
PROGRESS_URL = "https://api.brightdata.com/datasets/v3/progress/{snapshot_id}"
SNAPSHOT_URL = "https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}"

MAX_URLS_PER_SYNC = 20
REQUEST_TIMEOUT_SECONDS = 60
POLL_INTERVAL_SECONDS = 5

# Instagram post media types, as Bright Data names them in content_type.
INSTAGRAM_MEDIA_TYPES = {
    "image": MediaType.IMAGE,
    "photo": MediaType.IMAGE,
    "carousel": MediaType.CAROUSEL,
    "video": MediaType.VIDEO,
    "reel": MediaType.VIDEO,
    "igtv": MediaType.VIDEO,
}


class BrightDataAdapter(Adapter):
    """Licensed collection for the platforms with no usable official API."""

    provider = "brightdata"

    def __init__(self, platform: str) -> None:
        self.platform = platform
        self.api_key = config.BRIGHTDATA_API_TOKEN
        self.usd_per_record = config.SOCIAL_BRIGHTDATA_USD_PER_RECORD

    # -- configuration ----------------------------------------------------

    @property
    def _dataset_env(self) -> str:
        return f"SOCIAL_BRIGHTDATA_DATASET_{self.platform.upper()}"

    @property
    def _discover_env(self) -> str:
        return f"SOCIAL_BRIGHTDATA_DISCOVER_BY_{self.platform.upper()}"

    @property
    def dataset_id(self) -> str | None:
        return config.SOCIAL_BRIGHTDATA_DATASET.get(self.platform)

    @property
    def discover_by(self) -> str | None:
        return config.SOCIAL_BRIGHTDATA_DISCOVER_BY.get(self.platform)

    @property
    def _seed_env(self) -> str:
        return f"SOCIAL_BRIGHTDATA_SEED_URL_{self.platform.upper()}"

    def health(self) -> PlatformHealth:
        missing = []
        if not self.api_key:
            missing.append("BRIGHTDATA_API_TOKEN")
        if not self.dataset_id:
            missing.append(self._dataset_env)
        if not self.discover_by:
            missing.append(self._discover_env)
        return PlatformHealth(
            platform=self.platform,
            adapter=type(self).__name__,
            provider=self.provider,
            configured=not missing,
            detail=(
                f"dataset {self.dataset_id}, discovery via discover_by={self.discover_by}"
                if not missing
                else "missing " + ", ".join(missing)
            ),
        )

    def _require_config(self) -> tuple[str, str]:
        if not self.api_key:
            raise ProviderNotConfigured(self.platform, "BRIGHTDATA_API_TOKEN")
        if not self.dataset_id:
            raise ProviderNotConfigured(self.platform, self._dataset_env)
        return self.api_key, self.dataset_id

    # -- fetch -------------------------------------------------------------

    def fetch_posts(self, request: FetchRequest) -> AdapterResult:
        api_key, dataset_id = self._require_config()
        if request.query_type not in (QueryType.KEYWORD, QueryType.HASHTAG, QueryType.AUTHOR):
            raise ProviderRequestFailed(
                self.provider, None, f"unsupported query_type: {request.query_type}"
            )
        if not self.discover_by:
            raise ProviderNotConfigured(self.platform, self._discover_env)

        params = {
            "dataset_id": dataset_id,
            "format": "json",
            "type": "discover_new",
            "discover_by": self.discover_by,
            "include_errors": "true",
        }
        body = {
            "input": [{"url": self._discovery_seed(request)}],
            "limit_per_input": request.limit,
        }

        payload = self._post(api_key, params, body)
        records = self._map_records(payload, request)

        truncated = len(records) > request.limit
        return AdapterResult(
            records=records[: request.limit],
            coverage=self._coverage(
                request,
                len(records[: request.limit]),
                truncated,
                [
                    (
                        f"discovery mode discover_by={self.discover_by}; "
                        "the result set is not a random sample"
                    )
                ],
            ),
            estimated_cost_usd=round(len(records[: request.limit]) * self.usd_per_record, 6),
        )

    def fetch_records_by_url(self, urls: list[str]) -> list[dict]:
        """Raw records for known post or profile URLs. The verified sync path.

        Exposed separately from fetch_posts because it is the one collection
        path whose request shape is confirmed end to end, and M23's accuracy
        spike runs against it.
        """
        api_key, dataset_id = self._require_config()
        if len(urls) > MAX_URLS_PER_SYNC:
            raise ProviderRequestFailed(
                self.provider,
                None,
                f"{len(urls)} urls exceeds the {MAX_URLS_PER_SYNC}-url sync limit; "
                "use the async trigger endpoint instead",
            )
        return self._post(api_key, {"dataset_id": dataset_id, "format": "json"}, {"input": [{"url": u} for u in urls]})

    def _discovery_seed(self, request: FetchRequest) -> str:
        """The URL that seeds a discovery job.

        Instagram and Facebook discovery is seeded from an explore/tag URL
        rather than a bare keyword. The exact seed form per platform is part of
        the same Control Panel configuration as `discover_by`, so it is read
        from config instead of hardcoded — a wrong seed URL returns an empty
        list, which is the failure mode this package refuses to guess at.
        """
        template = getattr(config, f"SOCIAL_BRIGHTDATA_SEED_URL_{self.platform.upper()}", None)
        if not template:
            raise ProviderNotConfigured(
                self.platform, f"SOCIAL_BRIGHTDATA_SEED_URL_{self.platform.upper()}"
            )
        if request.query_type is QueryType.AUTHOR:
            return template.format(query=request.query.lstrip("@"))
        return template.format(query=request.query.strip().lstrip("#"))

    # -- http --------------------------------------------------------------

    def _post(self, api_key: str, params: dict, body: dict) -> list[dict]:
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        try:
            response = requests.post(
                SCRAPE_URL, params=params, headers=headers, json=body, timeout=REQUEST_TIMEOUT_SECONDS
            )
        except requests.RequestException as exc:
            raise ProviderRequestFailed(self.provider, None, str(exc)) from exc

        if response.status_code == 200:
            payload = response.json()
            if not isinstance(payload, list):
                raise ProviderRequestFailed(self.provider, 200, "expected a JSON array of records")
            return payload
        if response.status_code == 202:
            snapshot_id = (response.json() or {}).get("snapshot_id")
            if not snapshot_id:
                raise ProviderRequestFailed(self.provider, 202, "no snapshot_id in the 202 response")
            return self._await_snapshot(api_key, snapshot_id)
        raise ProviderRequestFailed(self.provider, response.status_code, response.text)

    def _await_snapshot(self, api_key: str, snapshot_id: str) -> list[dict]:
        """Poll the async job, bounded.

        Bounded on purpose: an unbounded poll inside a run is a hang. Running
        out of budget raises, so the caller records low coverage rather than
        pretending the job never had results.
        """
        headers = {"Authorization": f"Bearer {api_key}"}
        deadline = time.monotonic() + config.SOCIAL_PROVIDER_MAX_WAIT_SECONDS
        while time.monotonic() < deadline:
            try:
                progress = requests.get(
                    PROGRESS_URL.format(snapshot_id=snapshot_id),
                    headers=headers,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            except requests.RequestException as exc:
                raise ProviderRequestFailed(self.provider, None, str(exc)) from exc

            if progress.status_code != 200:
                raise ProviderRequestFailed(self.provider, progress.status_code, progress.text)

            status = (progress.json() or {}).get("status")
            if status == "ready":
                snapshot = requests.get(
                    SNAPSHOT_URL.format(snapshot_id=snapshot_id),
                    params={"format": "json"},
                    headers=headers,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
                if snapshot.status_code != 200:
                    raise ProviderRequestFailed(self.provider, snapshot.status_code, snapshot.text)
                payload = snapshot.json()
                return payload if isinstance(payload, list) else payload.get("records", [])
            if status in {"failed", "canceled"}:
                raise ProviderRequestFailed(self.provider, None, f"snapshot {snapshot_id} {status}")
            time.sleep(POLL_INTERVAL_SECONDS)

        raise ProviderRequestFailed(
            self.provider,
            None,
            f"snapshot {snapshot_id} still running after "
            f"{config.SOCIAL_PROVIDER_MAX_WAIT_SECONDS}s",
        )

    # -- mapping -----------------------------------------------------------

    def _map_records(self, payload: list[dict], request: FetchRequest) -> list[PostRecord]:
        if self.platform == Platform.INSTAGRAM.value:
            return [self._map_instagram(item, request) for item in payload if item.get("post_id") or item.get("pk")]
        raise UnsupportedFieldMapping(
            self.provider,
            self.platform,
            "only the Instagram response shape has been read from a real capture; "
            "capture a live X and Facebook response in M23 and write the map from it",
        )

    def _map_instagram(self, item: dict, request: FetchRequest) -> PostRecord:
        """Field names taken from a real captured Instagram record.

        Note what is deliberately absent: Instagram returns no language, so
        language stays None rather than being defaulted to English. Verification
        status does not tell us business versus creator, so author_type stays
        unknown instead of being inferred.
        """
        shortcode = item.get("shortcode") or item.get("content_id")
        permalink = item.get("url") or (
            f"https://www.instagram.com/p/{shortcode}/" if shortcode else ""
        )
        return PostRecord(
            platform=Platform.INSTAGRAM,
            native_id=str(item.get("post_id") or item.get("pk")),
            permalink=url_canonical(permalink),
            author_handle=item.get("user_posted") or "unknown",
            author_type=AuthorType.UNKNOWN,
            text=item.get("description") or "",
            language=None,
            created_at=parse_utc(item["date_posted"]),
            metrics=Metrics(
                likes=item.get("likes"),
                comments=item.get("num_comments"),
                shares=None,  # not exposed by Instagram at all
                views=item.get("video_view_count"),
            ),
            hashtags=normalize_tags(item.get("hashtags") or []),
            mentions=normalize_tags(self._instagram_mentions(item.get("description") or "")),
            media_type=INSTAGRAM_MEDIA_TYPES.get(str(item.get("content_type") or "").lower()),
            source_provider=self.provider,
            source_query=request.query,
            raw_hash=raw_hash(item),
        )

    @staticmethod
    def _instagram_mentions(text: str) -> list[str]:
        return re.findall(r"@([A-Za-z0-9._]+)", text)