"""Download the pinned CC0 seed images and upload them to a project's raw prefix.

Usage:
    services/api/.venv/bin/python services/api/scripts/seed_images.py --project street-scenes-batch-1
    services/api/.venv/bin/python services/api/scripts/seed_images.py --project demo --limit 4

Images come from Wikimedia Commons (services/api/seed/images.json pins each
URL, sha256, author and license), are cached under .data/seed-images/, and are
written to `labeling/raw/<project>/`. Then press "Sync from B2" on the project
(or POST /projects/<project>/sync) to turn them into Label Studio tasks.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(API_ROOT.parents[1] / ".env")

from app.service.seed import seed_project  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Project slug")
    parser.add_argument("--limit", type=int, default=None, help="Only the first N images")
    args = parser.parse_args()
    for key in seed_project(args.project, limit=args.limit):
        sys.stdout.write(f"uploaded {key}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
