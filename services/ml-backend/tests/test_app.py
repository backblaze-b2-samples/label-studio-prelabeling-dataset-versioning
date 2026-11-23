"""HTTP protocol tests with a stub detector and a stubbed B2 read (no torch, no network)."""

import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ.setdefault("B2_BUCKET_NAME", "test-bucket")
os.environ["PRELOAD_MODEL"] = "false"

from app import b2, main, model

_real_read = b2.read_image_bytes

CONFIG = """<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="label" toName="image">
    <Label value="person"/><Label value="car"/>
  </RectangleLabels>
</View>"""


class StubDetector:
    device = "cpu"
    loaded = True

    def __init__(self):
        self.thresholds = []

    def labels(self):
        return ["person", "bicycle", "car"]

    def detect(self, images, threshold):
        self.thresholds.append(threshold)
        # person kept, bicycle dropped (not in the project's labels), car kept
        return [
            [("person", 0.9, 10, 20, 110, 220), ("bicycle", 0.8, 0, 0, 5, 5), ("car", 0.6, 100, 100, 200, 150)]
            for _ in images
        ]


@pytest.fixture
def client(monkeypatch):
    stub = StubDetector()
    model.set_detector(stub)
    buffer = io.BytesIO()
    Image.new("RGB", (400, 300), (200, 200, 200)).save(buffer, format="JPEG")
    monkeypatch.setattr(b2, "read_image_bytes", lambda uri: buffer.getvalue())
    with TestClient(main.app) as test_client:
        test_client.stub = stub
        yield test_client


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "UP"
    assert body["model_loaded"] is True


def test_setup_returns_model_version(client):
    body = client.post("/setup", json={"project": "1.0", "schema": CONFIG}).json()
    assert body["model_version"].startswith("PekingU/rtdetr_r18vd_coco_o365@")


def test_setup_rejects_config_without_rectangles(client):
    response = client.post("/setup", json={"schema": "<View><Image name='image' value='$image'/></View>"})
    assert response.status_code == 400


def test_info_reports_license_revision_and_labels(client):
    body = client.get("/info").json()
    assert body["license"] == "Apache-2.0"
    assert len(body["revision"]) == 40
    assert body["device"] == "cpu"
    assert "person" in body["labels"]


def test_predict_returns_label_studio_results(client):
    tasks = [{"id": 1, "data": {"image": "s3://test-bucket/labeling/raw/p/a.jpg"}},
             {"id": 2, "data": {"image": "s3://test-bucket/labeling/raw/p/b.jpg"}}]
    response = client.post("/predict", json={"tasks": tasks, "label_config": CONFIG, "params": {"threshold": 0.3}})
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 2
    first = results[0]
    assert first["image_width"] == 400 and first["image_height"] == 300
    assert [r["value"]["rectanglelabels"] for r in first["result"]] == [["person"], ["car"]]
    region = first["result"][0]
    assert region["from_name"] == "label" and region["to_name"] == "image"
    assert region["id"] == "r0"
    assert region["value"]["x"] == 2.5 and region["value"]["y"] == pytest.approx(6.6667, abs=1e-4)
    assert region["value"]["width"] == 25.0
    assert first["score"] == pytest.approx(0.75)
    assert client.stub.thresholds == [0.3]


def test_predict_requires_label_config(client):
    response = client.post("/predict", json={"tasks": []})
    assert response.status_code == 400


def test_predict_rejects_non_s3_uri(client, monkeypatch):
    monkeypatch.setattr(b2, "read_image_bytes", _real_read)
    tasks = [{"id": 1, "data": {"image": "https://example.com/a.jpg"}}]
    response = client.post("/predict", json={"tasks": tasks, "label_config": CONFIG})
    assert response.status_code == 400


def test_parse_s3_uri_rejects_other_bucket():
    with pytest.raises(ValueError):
        b2.parse_s3_uri("s3://other-bucket/key.jpg")
    assert b2.parse_s3_uri("s3://test-bucket/a/b.jpg") == ("test-bucket", "a/b.jpg")


def test_s3_client_carries_attribution_user_agent(monkeypatch):
    captured = {}
    monkeypatch.setattr(b2.boto3, "client", lambda *a, **kw: captured.update(kw) or object())
    b2.s3_client.cache_clear()
    b2.s3_client()
    b2.s3_client.cache_clear()
    assert captured["config"].user_agent_extra == "b2ai-label-studio-annotation-loop"
    assert captured["endpoint_url"].startswith("https://s3.")
