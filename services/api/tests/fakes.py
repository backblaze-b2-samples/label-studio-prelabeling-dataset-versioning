"""In-memory stand-ins for the repo boundary: B2 objects, Label Studio, ML backend.

Services are tested against these, so the normal suite never touches the
network. The Label Studio fake mimics the one behaviour the loop depends on:
its target storage writes ONE object per annotation at
`<target prefix>/<annotation id>` (Label Studio 1.23.2 default) when synced.
"""

import hashlib
import json
from datetime import UTC, datetime

from app.config import settings

INFO = {
    "id": "PekingU/rtdetr_r18vd_coco_o365",
    "name": "RT-DETR R18",
    "license": "Apache-2.0",
    "source_url": "https://huggingface.co/PekingU/rtdetr_r18vd_coco_o365",
    "revision": "386c43855d01bcd966e548f3296fbd2cd2a2a40b",
    "device": "cpu",
    "labels": ["person", "bicycle", "car", "motorbike", "bus"],
}


class FakeB2:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.when = datetime(2026, 11, 23, tzinfo=UTC)

    def _meta(self, key):
        body = self.objects[key]
        return {"key": key, "size": len(body), "etag": hashlib.md5(body).hexdigest(), "last_modified": self.when}

    def put_bytes(self, key, body, content_type):
        self.objects[key] = body
        return self._meta(key)["etag"]

    def put_json(self, key, payload):
        body = json.dumps(payload, indent=2, sort_keys=True, default=str).encode()
        self.objects[key] = body
        return body

    def get_bytes(self, key):
        return self.objects.get(key)

    def get_json(self, key):
        body = self.objects.get(key)
        return None if body is None else json.loads(body)

    def head(self, key):
        if key not in self.objects:
            return None
        meta = self._meta(key)
        return {"etag": meta["etag"], "size": meta["size"], "last_modified": meta["last_modified"]}

    def list_prefix(self, prefix):
        return [self._meta(k) for k in sorted(self.objects) if k.startswith(prefix)]

    def list_page(self, prefix, cursor, max_keys):
        items = self.list_prefix(prefix)
        start = int(cursor or 0)
        page = items[start : start + max_keys]
        nxt = str(start + max_keys) if start + max_keys < len(items) else None
        return page, nxt

    def delete_keys(self, keys):
        gone = [k for k in keys if self.objects.pop(k, None) is not None]
        return len(gone)

    def install(self, monkeypatch):
        from app.repo import b2_objects

        for name in ("put_bytes", "put_json", "get_bytes", "get_json", "head", "list_prefix", "list_page", "delete_keys"):
            monkeypatch.setattr(b2_objects, name, getattr(self, name))
        return self


class FakeLabelStudio:
    def __init__(self, b2: FakeB2):
        self.b2 = b2
        self.projects: dict[int, dict] = {}
        self.tasks: dict[int, dict] = {}
        self.annotations: dict[int, dict] = {}
        self.predictions: dict[int, dict] = {}
        self.storages: dict[int, dict] = {}
        self._ids = iter(range(1, 10_000))

    def version(self):
        return "1.23.2"

    def create_project(self, title, description, label_config):
        pid = next(self._ids)
        self.projects[pid] = {"title": title, "description": description, "label_config": label_config}
        return pid

    def update_project(self, project_id, fields):
        self.projects[project_id].update(fields)

    def delete_project(self, project_id):
        return self.projects.pop(project_id, None) is not None

    def create_import_storage(self, project_id, prefix, regex_filter):
        sid = next(self._ids)
        self.storages[sid] = {"project": project_id, "prefix": prefix.rstrip("/"), "kind": "import"}
        return sid

    def create_export_storage(self, project_id, prefix):
        sid = next(self._ids)
        self.storages[sid] = {"project": project_id, "prefix": prefix.rstrip("/"), "kind": "export"}
        return sid

    def register_ml_backend(self, project_id, url, title):
        return next(self._ids)

    def sync_import_storage(self, storage_id):
        storage = self.storages[storage_id]
        known = {t["data"]["image"] for t in self.tasks.values()}
        for obj in self.b2.list_prefix(storage["prefix"] + "/"):
            uri = f"s3://{settings.b2_bucket_name}/{obj['key']}"
            if uri not in known:
                tid = next(self._ids)
                self.tasks[tid] = {"id": tid, "project": storage["project"], "data": {"image": uri}}

    def sync_export_storage(self, storage_id):
        storage = self.storages[storage_id]
        for ann in self.annotations.values():
            task = self.tasks[ann["task"]]
            if task["project"] == storage["project"]:
                body = {**ann, "task": {"id": task["id"], "data": task["data"]}}
                self.b2.put_json(f"{storage['prefix']}/{ann['id']}", body)

    def list_tasks(self, project_id):
        out = []
        for task in self.tasks.values():
            if task["project"] == project_id:
                n = sum(1 for a in self.annotations.values() if a["task"] == task["id"])
                out.append({**task, "total_annotations": n})
        return out

    def create_prediction(self, task_id, result, score, model_version):
        pid = next(self._ids)
        self.predictions[pid] = {"task": task_id, "result": result, "model_version": model_version}
        return pid

    def create_annotation(self, task_id, result, parent_prediction):
        aid = next(self._ids)
        self.annotations[aid] = {
            "id": aid, "task": task_id, "result": result,
            "was_cancelled": False, "parent_prediction": parent_prediction,
        }
        return aid

    def export_json(self, project_id):
        return [
            {**t, "annotations": [a for a in self.annotations.values() if a["task"] == t["id"]]}
            for t in self.list_tasks(project_id)
        ]


def box(region_id, label, x=10.0, y=10.0, w=20.0, h=30.0, width=400, height=300):
    return {
        "id": region_id, "from_name": "label", "to_name": "image", "type": "rectanglelabels",
        "original_width": width, "original_height": height,
        "value": {"x": x, "y": y, "width": w, "height": h, "rotation": 0, "rectanglelabels": [label]},
    }


class FakeML:
    def __init__(self, boxes_per_task=1):
        self.boxes_per_task = boxes_per_task
        self.calls = []

    def info(self):
        return dict(INFO)

    def predict(self, tasks, label_config, threshold):
        self.calls.append((len(tasks), threshold))
        return [
            {"result": [box(f"r{i}", "person") for i in range(self.boxes_per_task)],
             "score": 0.9, "image_width": 400, "image_height": 300}
            for _ in tasks
        ]
