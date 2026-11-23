"""HTTP adapter for the sample's ML backend (services/ml-backend).

The ML backend speaks the Label Studio ML backend protocol (`/health`,
`/setup`, `/predict`) plus `/info`. This API calls `/predict` directly during a
pre-label run so it can persist every suggestion to B2 before handing it to
Label Studio.
"""

import functools
from typing import Any

import httpx

from app.config import settings
from app.repo.upstream import UpstreamServiceError

SERVICE = "ML backend"


class MLBackendClient:
    def __init__(self, base_url: str, timeout: float, transport: httpx.BaseTransport | None = None):
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout, transport=transport)

    def _call(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = self._http.request(method, path, **kwargs)
        except httpx.HTTPError as e:
            raise UpstreamServiceError(SERVICE, f"{method} {path} failed: {e}") from e
        if response.status_code >= 400:
            raise UpstreamServiceError(
                SERVICE,
                f"{method} {path} returned {response.status_code}: {response.text[:300]}",
                response.status_code,
            )
        return response.json()

    def info(self) -> dict:
        """Model id, revision, license, device and label names."""
        return self._call("GET", "/info")

    def predict(self, tasks: list[dict], label_config: str, threshold: float) -> list[dict]:
        """One Label Studio-format prediction (`result`, `score`, ...) per task, in order."""
        data = self._call(
            "POST",
            "/predict",
            json={"tasks": tasks, "label_config": label_config, "params": {"threshold": threshold}},
        )
        results = data.get("results")
        if not isinstance(results, list) or len(results) != len(tasks):
            raise UpstreamServiceError(SERVICE, "predict returned a result count that does not match the tasks")
        return results


@functools.lru_cache(maxsize=1)
def get_ml_backend() -> MLBackendClient:
    return MLBackendClient(settings.ml_backend_url, settings.ml_backend_timeout_seconds)


def probe_ml_backend(timeout: float = 2.0) -> tuple[bool, dict | None, str | None]:
    """(ok, info, detail) with a short timeout, for /health."""
    try:
        return True, MLBackendClient(settings.ml_backend_url, timeout).info(), None
    except UpstreamServiceError as e:
        return False, None, str(e)
