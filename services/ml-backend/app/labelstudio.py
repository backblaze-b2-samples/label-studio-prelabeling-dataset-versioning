"""Label Studio ML-protocol shapes: label config in, `rectanglelabels` out."""

import xml.etree.ElementTree as ET
from dataclasses import dataclass


@dataclass(frozen=True)
class BoxConfig:
    from_name: str
    to_name: str
    labels: list[str]


def parse_label_config(label_config: str) -> BoxConfig:
    """The first RectangleLabels block: its name, target image and label values."""
    root = ET.fromstring(label_config)
    block = root.find(".//RectangleLabels")
    if block is None:
        raise ValueError("label config has no <RectangleLabels> block")
    labels = [el.get("value") for el in block.findall("Label") if el.get("value")]
    return BoxConfig(from_name=block.get("name", "label"), to_name=block.get("toName", "image"), labels=labels)


def _pct(value: float, total: int) -> float:
    return round(min(100.0, max(0.0, value * 100.0 / total)), 4)


def to_result(detections: list[tuple], width: int, height: int, config: BoxConfig) -> list[dict]:
    """Pixel `(label, score, x0, y0, x1, y1)` boxes -> Label Studio results (percent).

    Detections whose label is not in the project's label set are dropped.
    Region ids are stable per task (`r0`, `r1`, ...), which is how a release
    later tells accepted suggestions from corrected or added boxes.
    """
    allowed = set(config.labels)
    result = []
    for label, score, x0, y0, x1, y1 in detections:
        if label not in allowed:
            continue
        result.append(
            {
                "id": f"r{len(result)}",
                "from_name": config.from_name,
                "to_name": config.to_name,
                "type": "rectanglelabels",
                "original_width": width,
                "original_height": height,
                "image_rotation": 0,
                "score": round(float(score), 4),
                "value": {
                    "x": _pct(x0, width),
                    "y": _pct(y0, height),
                    "width": _pct(x1 - x0, width),
                    "height": _pct(y1 - y0, height),
                    "rotation": 0,
                    "rectanglelabels": [label],
                },
            }
        )
    return result
