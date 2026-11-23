"""COCO conversion and suggestion/annotation comparison (service/coco.py)."""

import pytest

from app.service import coco
from tests.fakes import box


def test_percent_to_pixels_and_category_ids():
    images = [
        {"task_id": 2, "file_name": "raw/b.jpg", "width": 1, "height": 1,
         "result": [box("a", "car", x=50, y=25, w=10, h=20, width=1000, height=500)]},
        {"task_id": 1, "file_name": "raw/a.jpg", "width": 640, "height": 480, "result": []},
    ]
    dataset = coco.build_coco(["person", "car"], images, "demo")
    assert [img["id"] for img in dataset["images"]] == [1, 2]
    assert dataset["images"][1] == {"id": 2, "file_name": "raw/b.jpg", "width": 1000, "height": 500}
    assert dataset["images"][0]["width"] == 640  # empty annotation keeps the record's size
    ann = dataset["annotations"][0]
    assert ann["bbox"] == [500.0, 125.0, 100.0, 100.0]
    assert ann["area"] == 10000.0
    assert ann["category_id"] == 2 and ann["image_id"] == 2
    assert dataset["categories"] == [{"id": 1, "name": "person"}, {"id": 2, "name": "car"}]


def test_rounding_two_decimals():
    region = box("a", "person", x=33.3333, y=0, w=33.3333, h=100, width=100, height=10)
    assert coco.to_pixels(region, 100, 10) == [33.33, 0.0, 33.33, 10.0]


def test_empty_annotations():
    dataset = coco.build_coco(["person"], [], "empty")
    assert dataset["images"] == [] and dataset["annotations"] == []


def test_unknown_label_is_an_error():
    with pytest.raises(ValueError):
        coco.build_coco(["person"], [{"task_id": 1, "file_name": "x", "width": 1, "height": 1,
                                       "result": [box("a", "car")]}], "x")


def test_non_rectangle_results_are_ignored():
    assert coco.rectangles([{"type": "choices", "value": {"choices": ["x"]}}, box("a", "car")]) == [box("a", "car")]


def test_compare_regions():
    suggested = [box("r0", "person"), box("r1", "car"), box("r2", "bus")]
    final = [box("r0", "person"), box("r1", "car", x=12.0), box("new", "person")]
    assert coco.compare_regions(suggested, final) == {"accepted": 1, "corrected": 1, "added": 1, "removed": 1}


def test_relabel_counts_as_correction():
    assert coco.compare_regions([box("r0", "person")], [box("r0", "car")])["corrected"] == 1
