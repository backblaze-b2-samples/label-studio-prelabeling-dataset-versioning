"""Both target-storage shapes Label Studio can write are parsed."""

from app.service import annotations


def test_per_annotation_object():
    body = {"id": 11, "result": [{"type": "rectanglelabels"}], "was_cancelled": False,
            "parent_prediction": 5, "task": {"id": 3, "data": {"image": "s3://b/k.jpg"}}}
    [entry] = annotations.parse_object("labeling/annotations/p/11", body)
    assert (entry["task_id"], entry["annotation_id"], entry["parent_prediction"]) == (3, 11, 5)


def test_per_task_object():
    body = {"id": 3, "data": {"image": "s3://b/k.jpg"},
            "annotations": [{"id": 11, "result": []}, {"id": 12, "result": [], "was_cancelled": True}]}
    entries = annotations.parse_object("labeling/annotations/p/3.json", body)
    assert [(e["task_id"], e["annotation_id"], e["cancelled"]) for e in entries] == [(3, 11, False), (3, 12, True)]
