"""Label Studio rectangle results -> COCO. Pure: no I/O, no clock.

Label Studio stores `rectanglelabels` values as *percentages* of the image's
`original_width` / `original_height`. COCO wants absolute pixels as
`[x, y, width, height]` from the top-left corner. Values are rounded to two
decimals so a release is byte-stable across runs.
"""

from typing import Any


def rectangles(result: list[dict]) -> list[dict]:
    """The rectangle regions of one annotation or prediction `result` list."""
    return [r for r in result or [] if r.get("type") == "rectanglelabels" and r.get("value")]


def to_pixels(region: dict, width: int, height: int) -> list[float]:
    value = region["value"]
    return [
        round(float(value["x"]) * width / 100.0, 2),
        round(float(value["y"]) * height / 100.0, 2),
        round(float(value["width"]) * width / 100.0, 2),
        round(float(value["height"]) * height / 100.0, 2),
    ]


def region_label(region: dict) -> str | None:
    labels = region.get("value", {}).get("rectanglelabels") or []
    return labels[0] if labels else None


def build_coco(labels: list[str], images: list[dict[str, Any]], description: str) -> dict:
    """Build a COCO detection dataset.

    `labels` fixes the category ids (1-based, in project order). Each image is
    `{"task_id", "file_name", "width", "height", "result"}` where `result` is the
    Label Studio annotation result list. Region dimensions win over the image
    record's when present, because they are what the annotator saw.
    """
    category_ids = {name: index + 1 for index, name in enumerate(labels)}
    coco_images: list[dict] = []
    coco_annotations: list[dict] = []
    for image in sorted(images, key=lambda item: item["task_id"]):
        regions = rectangles(image.get("result", []))
        width = int(regions[0].get("original_width", image["width"])) if regions else int(image["width"])
        height = int(regions[0].get("original_height", image["height"])) if regions else int(image["height"])
        coco_images.append(
            {"id": image["task_id"], "file_name": image["file_name"], "width": width, "height": height}
        )
        for region in regions:
            label = region_label(region)
            if label not in category_ids:
                raise ValueError(f"task {image['task_id']}: label {label!r} is not in the project label set")
            bbox = to_pixels(region, width, height)
            coco_annotations.append(
                {
                    "id": len(coco_annotations) + 1,
                    "image_id": image["task_id"],
                    "category_id": category_ids[label],
                    "bbox": bbox,
                    "area": round(bbox[2] * bbox[3], 2),
                    "iscrowd": 0,
                }
            )
    return {
        "info": {"description": description},
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": [{"id": cid, "name": name} for name, cid in category_ids.items()],
    }


def compare_regions(suggested: list[dict], final: list[dict]) -> dict[str, int]:
    """Count how annotators treated the suggestions, matching regions by id.

    Label Studio keeps a prediction region's id when an annotator accepts it,
    so: same id and same value -> accepted; same id, changed value -> corrected;
    an id the model never produced -> added; a suggested id that is gone -> removed.
    """
    before = {r.get("id"): r for r in rectangles(suggested)}
    after = {r.get("id"): r for r in rectangles(final)}
    counts = {"accepted": 0, "corrected": 0, "added": 0, "removed": 0}
    for region_id, region in after.items():
        if region_id in before:
            same = _geometry(before[region_id]) == _geometry(region)
            counts["accepted" if same else "corrected"] += 1
        else:
            counts["added"] += 1
    counts["removed"] = sum(1 for region_id in before if region_id not in after)
    return counts


def _geometry(region: dict) -> tuple:
    value = region.get("value", {})
    return (
        round(float(value.get("x", 0)), 3),
        round(float(value.get("y", 0)), 3),
        round(float(value.get("width", 0)), 3),
        round(float(value.get("height", 0)), 3),
        tuple(value.get("rectanglelabels") or []),
    )
