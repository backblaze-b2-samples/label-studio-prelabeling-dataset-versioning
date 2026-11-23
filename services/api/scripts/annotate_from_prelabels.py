"""Submit annotations through the Label Studio API, derived from the latest run.

A TEST AND DEMO tool, not a product feature: people label in the Label Studio
UI. This lets the loop be exercised end to end without a person:

- every task gets an annotation linked to its prediction (`parent_prediction`)
  that keeps each suggested box (accepted);
- the first box of every even-indexed task is nudged right by 2 percent
  (corrected);
- a task with no suggestions gets one hand-drawn box (added); if every task had
  suggestions, the last task gets one extra box instead.

Usage:
    services/api/.venv/bin/python services/api/scripts/annotate_from_prelabels.py --project demo
    services/api/.venv/bin/python services/api/scripts/annotate_from_prelabels.py --project demo --skip-last
    services/api/.venv/bin/python services/api/scripts/annotate_from_prelabels.py --project demo --only-last
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(API_ROOT.parents[1] / ".env")

from app.service import descriptors, prelabels  # noqa: E402
from app.service.deps import label_studio  # noqa: E402
from app.service.label_config import FROM_NAME, TO_NAME  # noqa: E402


def _added_box(label: str, width: int | None, height: int | None, region_id: str) -> dict:
    return {
        "id": region_id,
        "from_name": FROM_NAME,
        "to_name": TO_NAME,
        "type": "rectanglelabels",
        "original_width": width or 1,
        "original_height": height or 1,
        "image_rotation": 0,
        "value": {"x": 10.0, "y": 10.0, "width": 20.0, "height": 20.0, "rotation": 0, "rectanglelabels": [label]},
    }


def build_result(index: int, record: dict | None, label: str, add_box: bool) -> list[dict]:
    result = copy.deepcopy(record.get("result", [])) if record else []
    for region in result:
        region.pop("score", None)
    if result and index % 2 == 0:
        value = result[0]["value"]
        value["x"] = round(min(100.0 - float(value["width"]), float(value["x"]) + 2.0), 4)
    if add_box or not result:
        width = record.get("image_width") if record else None
        height = record.get("image_height") if record else None
        result.append(_added_box(label, width, height, f"added-{index}"))
    return result


def annotate(slug: str, skip_last: bool = False, only_last: bool = False) -> dict:
    descriptor = descriptors.load(slug)
    runs = prelabels.list_runs(slug)
    if not runs:
        raise SystemExit("No pre-label run yet: run pre-labels first.")
    records = prelabels.load_records(slug, runs[0].run_id)
    ls = label_studio()
    tasks = sorted(ls.list_tasks(descriptor.label_studio_project_id), key=lambda t: t["id"])
    any_empty = any(not (records.get(t["id"]) or {}).get("result") for t in tasks)
    done = []
    for index, task in enumerate(tasks):
        is_last = index == len(tasks) - 1
        if (skip_last and is_last) or (only_last and not is_last):
            continue
        record = records.get(task["id"])
        result = build_result(index, record, descriptor.labels[0], add_box=is_last and not any_empty)
        parent = record.get("label_studio_prediction_id") if record else None
        ls.create_annotation(task["id"], result, parent)
        done.append(task["id"])
    return {"project": slug, "run_id": runs[0].run_id, "annotated_task_ids": done}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--skip-last", action="store_true", help="Leave the last task unannotated")
    group.add_argument("--only-last", action="store_true", help="Annotate only the last task")
    args = parser.parse_args()
    summary = annotate(args.project, skip_last=args.skip_last, only_last=args.only_last)
    sys.stdout.write(f"annotated tasks {summary['annotated_task_ids']} from run {summary['run_id']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
