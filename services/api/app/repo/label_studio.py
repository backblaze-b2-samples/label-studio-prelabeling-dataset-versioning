"""Label Studio REST adapter (verified against Label Studio 1.23.2).

Only the calls the annotation loop needs. Label Studio reads and writes B2
itself through its S3 source/target storages; this adapter only *configures*
those storages and triggers their syncs — no bytes flow through it.

URL shapes matter: Label Studio runs with APPEND_SLASH off, so the trailing
slash on each path below is exactly what its URLconf declares.
"""

import functools
import time
from typing import Any

import httpx

from app.config import settings
from app.repo.upstream import UpstreamServiceError

SERVICE = "Label Studio"


class LabelStudioClient:
    def __init__(self, base_url: str, token: str, timeout: float, transport: httpx.BaseTransport | None = None):
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Token {token}"},
            timeout=timeout,
            transport=transport,
        )

    # --- plumbing -------------------------------------------------------
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
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    # --- instance -------------------------------------------------------
    def version(self) -> str:
        data = self._call("GET", "/api/version/")
        return str(data.get("release") or data.get("label-studio-os-package", {}).get("version", "unknown"))

    # --- projects -------------------------------------------------------
    def create_project(self, title: str, description: str, label_config: str) -> int:
        data = self._call(
            "POST",
            "/api/projects/",
            json={
                "title": title,
                "description": description,
                "label_config": label_config,
                # Pre-labels are shown to annotators, but only static ones from
                # our runs: nothing is fetched from the model when a task opens.
                "show_collab_predictions": True,
                "evaluate_predictions_automatically": False,
            },
        )
        return int(data["id"])

    def update_project(self, project_id: int, fields: dict[str, Any]) -> None:
        self._call("PATCH", f"/api/projects/{project_id}/", json=fields)

    def delete_project(self, project_id: int) -> bool:
        """Delete a project; False if it was already gone."""
        try:
            self._call("DELETE", f"/api/projects/{project_id}/")
        except UpstreamServiceError as e:
            if e.status_code == 404:
                return False
            raise
        return True

    # --- storages -------------------------------------------------------
    def _s3_fields(self, prefix: str) -> dict[str, Any]:
        return {
            "bucket": settings.b2_bucket_name,
            # No trailing slash: Label Studio joins prefix + "/" + key itself.
            "prefix": prefix.rstrip("/"),
            "aws_access_key_id": settings.b2_application_key_id,
            "aws_secret_access_key": settings.b2_application_key,
            "region_name": settings.b2_region,
            "s3_endpoint": settings.endpoint_url,
        }

    def create_import_storage(self, project_id: int, prefix: str, regex_filter: str) -> int:
        payload = {
            **self._s3_fields(prefix),
            "project": project_id,
            "title": "B2 raw images",
            "regex_filter": regex_filter,
            "use_blob_urls": True,
            "presign": True,
            "presign_ttl": 15,
            "recursive_scan": True,
        }
        return int(self._call("POST", "/api/storages/s3/", json=payload)["id"])

    def create_export_storage(self, project_id: int, prefix: str) -> int:
        payload = {
            **self._s3_fields(prefix),
            "project": project_id,
            "title": "B2 annotations",
            "can_delete_objects": False,
        }
        return int(self._call("POST", "/api/storages/export/s3", json=payload)["id"])

    def sync_import_storage(self, storage_id: int) -> None:
        self._call("POST", f"/api/storages/s3/{storage_id}/sync")
        self._wait_for_storage(f"/api/storages/s3/{storage_id}")

    def sync_export_storage(self, storage_id: int) -> None:
        self._call("POST", f"/api/storages/export/s3/{storage_id}/sync")
        self._wait_for_storage(f"/api/storages/export/s3/{storage_id}")

    def _wait_for_storage(self, path: str, timeout: float = 300.0) -> None:
        """Syncs run in-request without Redis; with Redis they queue. Poll either way."""
        deadline = time.monotonic() + timeout
        while True:
            status = str(self._call("GET", path).get("status", "completed"))
            if status in ("failed", "completed_with_errors"):
                raise UpstreamServiceError(SERVICE, f"storage sync ended with status {status} ({path})")
            if status not in ("queued", "in_progress"):
                return
            if time.monotonic() > deadline:
                raise UpstreamServiceError(SERVICE, f"storage sync timed out ({path})")
            time.sleep(1.0)

    # --- ML backend -----------------------------------------------------
    def register_ml_backend(self, project_id: int, url: str, title: str) -> int:
        payload = {"project": project_id, "url": url, "title": title, "is_interactive": False}
        return int(self._call("POST", "/api/ml/", json=payload)["id"])

    # --- tasks, predictions, annotations --------------------------------
    def list_tasks(self, project_id: int) -> list[dict]:
        tasks: list[dict] = []
        page = 1
        while True:
            data = self._call(
                "GET", "/api/tasks/", params={"project": project_id, "page": page, "page_size": 100}
            )
            batch = data.get("tasks", [])
            tasks.extend(batch)
            if not batch or len(tasks) >= int(data.get("total", len(tasks))):
                return tasks
            page += 1

    def create_prediction(self, task_id: int, result: list[dict], score: float, model_version: str) -> int:
        payload = {"task": task_id, "result": result, "score": score, "model_version": model_version}
        return int(self._call("POST", "/api/predictions/", json=payload)["id"])

    def create_annotation(self, task_id: int, result: list[dict], parent_prediction: int | None) -> int:
        payload: dict[str, Any] = {"result": result}
        if parent_prediction is not None:
            payload["parent_prediction"] = parent_prediction
        return int(self._call("POST", f"/api/tasks/{task_id}/annotations/", json=payload)["id"])

    def export_json(self, project_id: int) -> list[dict]:
        """Label Studio's own JSON export of every task (annotated or not)."""
        return self._call(
            "GET",
            f"/api/projects/{project_id}/export",
            params={"exportType": "JSON", "download_all_tasks": "true", "download_resources": "false"},
        )


@functools.lru_cache(maxsize=1)
def get_label_studio() -> LabelStudioClient:
    return LabelStudioClient(
        settings.label_studio_url, settings.label_studio_api_token, settings.label_studio_timeout_seconds
    )


def probe_label_studio(timeout: float = 2.0) -> tuple[bool, str | None, str | None]:
    """(ok, version, detail) with a short timeout, for /health."""
    try:
        client = LabelStudioClient(settings.label_studio_url, settings.label_studio_api_token, timeout)
        return True, client.version(), None
    except UpstreamServiceError as e:
        return False, None, str(e)
