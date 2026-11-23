"""The pinned CC0 / public-domain seed images (services/api/seed/images.json).

No image binaries live in the repository. Each image is downloaded once from
Wikimedia Commons with a descriptive user agent, checked against its pinned
sha256, and cached on local disk (`settings.seed_cache_dir`, gitignored), so
creating a second project does not hit Commons again.

Commons rate-limits bursts with HTTP 429, so downloads are paced and retried
with backoff.
"""

import hashlib
import json
import time
from pathlib import Path

import httpx

from app.config import settings
from app.repo.upstream import UpstreamServiceError

_API_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = _API_ROOT / "seed" / "images.json"
USER_AGENT = (
    "label-studio-prelabeling-dataset-versioning-seed/0.1 "
    "(https://github.com/backblaze-b2-samples/label-studio-prelabeling-dataset-versioning)"
)
_PAUSE_SECONDS = 2.0


def load_catalog() -> list[dict]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["images"]


def _cache_dir() -> Path:
    path = Path(settings.seed_cache_dir)
    if not path.is_absolute():
        parents = Path(__file__).resolve().parents
        path = (parents[4] if len(parents) > 4 else _API_ROOT) / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _download(url: str) -> bytes:
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120, follow_redirects=True) as http:
        for attempt in range(6):
            try:
                response = http.get(url)
            except httpx.HTTPError as e:
                raise UpstreamServiceError("Wikimedia Commons", f"download failed: {e}") from e
            if response.status_code == 429:
                time.sleep(10.0 * (attempt + 1))
                continue
            if response.status_code >= 400:
                raise UpstreamServiceError(
                    "Wikimedia Commons", f"download returned {response.status_code}", response.status_code
                )
            return response.content
    raise UpstreamServiceError("Wikimedia Commons", "still rate-limited after retries", 429)


def fetch_seed_image(entry: dict) -> bytes:
    """Bytes of one catalog image, from the local cache or Commons. sha256-checked."""
    cached = _cache_dir() / entry["filename"]
    if cached.exists():
        data = cached.read_bytes()
        if hashlib.sha256(data).hexdigest() == entry["sha256"]:
            return data
    data = _download(entry["url"])
    digest = hashlib.sha256(data).hexdigest()
    if digest != entry["sha256"]:
        raise UpstreamServiceError(
            "Wikimedia Commons", f"{entry['filename']} sha256 {digest} does not match the pinned value"
        )
    cached.write_bytes(data)
    time.sleep(_PAUSE_SECONDS)
    return data
