"""Label Studio and ML backend adapters against httpx.MockTransport."""

import json

import httpx
import pytest

from app.config import settings
from app.repo.label_studio import LabelStudioClient
from app.repo.ml_backend import MLBackendClient
from app.repo.upstream import UpstreamServiceError


def _ls(handler):
    return LabelStudioClient("http://ls.test/", "tok123", 5, transport=httpx.MockTransport(handler))


def test_token_header_and_project_payload():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers["Authorization"]
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={"id": 7})

    assert _ls(handler).create_project("T", "D", "<View/>") == 7
    assert seen["auth"] == "Token tok123" and seen["path"] == "/api/projects/"
    assert seen["body"]["evaluate_predictions_automatically"] is False


def test_storage_payloads_point_at_b2(monkeypatch):
    monkeypatch.setattr(settings, "b2_region", "test-region-1")
    monkeypatch.setattr(settings, "b2_bucket_name", "bkt")
    bodies = []

    def handler(request):
        bodies.append((request.url.path, json.loads(request.content)))
        return httpx.Response(201, json={"id": 3})

    client = _ls(handler)
    client.create_import_storage(1, "labeling/raw/p/", r"(?i)^.*\.jpg$")
    client.create_export_storage(1, "labeling/annotations/p/")
    (imp_path, imp), (exp_path, exp) = bodies
    assert imp_path == "/api/storages/s3/" and exp_path == "/api/storages/export/s3"
    assert imp["s3_endpoint"] == "https://s3.test-region-1.backblazeb2.com"
    assert imp["region_name"] == "test-region-1" and imp["bucket"] == "bkt"
    assert imp["prefix"] == "labeling/raw/p"  # no trailing slash: LS joins with "/"
    assert exp["prefix"] == "labeling/annotations/p"
    assert imp["use_blob_urls"] and imp["presign"] and imp["recursive_scan"]


def test_list_tasks_paginates():
    def handler(request):
        page = int(request.url.params["page"])
        tasks = [{"id": i} for i in range((page - 1) * 100, min(page * 100, 150))]
        return httpx.Response(200, json={"tasks": tasks, "total": 150})

    assert len(_ls(handler).list_tasks(1)) == 150


def test_sync_polls_until_completed():
    statuses = iter(["in_progress", "completed"])

    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={})
        return httpx.Response(200, json={"status": next(statuses)})

    _ls(handler).sync_export_storage(4)


def test_sync_failure_raises():
    def handler(request):
        return httpx.Response(200, json={"status": "failed"})

    with pytest.raises(UpstreamServiceError):
        _ls(handler).sync_import_storage(4)


def test_http_error_and_unreachable():
    with pytest.raises(UpstreamServiceError) as err:
        _ls(lambda r: httpx.Response(401, text="nope")).version()
    assert err.value.status_code == 401 and not err.value.unreachable

    def boom(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(UpstreamServiceError) as err:
        _ls(boom).version()
    assert err.value.unreachable


def test_delete_missing_project_is_false():
    assert _ls(lambda r: httpx.Response(404, json={})).delete_project(9) is False


def test_ml_predict_contract():
    def handler(request):
        body = json.loads(request.content)
        assert body["params"]["threshold"] == 0.5 and body["label_config"] == "<View/>"
        return httpx.Response(200, json={"results": [{"result": []} for _ in body["tasks"]]})

    client = MLBackendClient("http://ml.test", 5, transport=httpx.MockTransport(handler))
    assert len(client.predict([{"id": 1}, {"id": 2}], "<View/>", 0.5)) == 2

    bad = MLBackendClient("http://ml.test", 5, transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"results": []})))
    with pytest.raises(UpstreamServiceError):
        bad.predict([{"id": 1}], "<View/>", 0.5)
