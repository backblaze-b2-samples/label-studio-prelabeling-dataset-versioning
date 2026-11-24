"""Set the B2 bucket CORS rules this sample needs. Dry run unless --apply.

Two rules, merged into whatever the bucket already has:

1. `<app slug>-direct-upload` — the web app's origin(s): the browser PUTs raw
   images straight to the bucket (method PUT + the `content-type` header) and
   previews objects with presigned GETs.
2. `<app slug>-label-studio` — the Label Studio origin (`LABEL_STUDIO_URL`,
   default http://localhost:8080) for GET/HEAD only: the labeling UI loads each
   task image from a presigned B2 URL.

Usage:
    # dry run (default): print current + proposed CORS, write nothing
    python services/api/scripts/setup_b2_cors.py --origin http://localhost:3000

    # actually write it
    python services/api/scripts/setup_b2_cors.py --origin http://localhost:3000 --apply

Reads B2 credentials from the repo-root .env exactly like the app. Existing
rules with other IDs are preserved. Never prints credentials.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

# Import the app's settings loader (repo-root .env) without printing secrets.
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))
from app.config import settings  # noqa: E402

RULE_ID = f"{settings.app_slug}-direct-upload"
LS_RULE_ID = f"{settings.app_slug}-label-studio"


def out(message: str) -> None:
    sys.stdout.write(f"{message}\n")


def err(message: str) -> None:
    sys.stderr.write(f"{message}\n")


def _client():
    # Standalone client (not app.repo.get_s3_client) on purpose: this one-shot
    # script stays independent of the app's cached client factory and the repo
    # layer's import graph. Bucket-level CORS calls need an explicit region,
    # which now comes straight from B2_REGION instead of being parsed back out
    # of an endpoint string.
    return boto3.client(
        "s3",
        endpoint_url=settings.endpoint_url,
        region_name=settings.b2_region,
        aws_access_key_id=settings.b2_application_key_id,
        aws_secret_access_key=settings.b2_application_key,
        config=Config(signature_version="s3v4", user_agent_extra="b2ai-label-studio-annotation-loop"),
    )


def _current_rules(client) -> list[dict]:
    try:
        return client.get_bucket_cors(Bucket=settings.b2_bucket_name).get(
            "CORSRules", []
        )
    except ClientError as e:
        # AWS spells it NoSuchCORSConfiguration; B2 answers NoSuchCorsConfiguration.
        if str(e.response.get("Error", {}).get("Code", "")).lower() == "nosuchcorsconfiguration":
            return []
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--origin",
        action="append",
        required=True,
        metavar="URL",
        help="Web origin to allow, e.g. http://localhost:3000 (repeatable)",
    )
    parser.add_argument(
        "--label-studio-origin",
        default=settings.label_studio_url.rstrip("/"),
        metavar="URL",
        help="Label Studio origin allowed to GET/HEAD task images (default: LABEL_STUDIO_URL)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the change. Without it, this is a dry run.",
    )
    args = parser.parse_args()

    for origin in [*args.origin, args.label_studio_origin]:
        if "://" not in origin or origin.endswith("/"):
            parser.error(f"origin must be scheme://host with no trailing slash: {origin!r}")

    if not settings.b2_bucket_name:
        err("B2_BUCKET_NAME is not set — configure .env first.")
        return 2

    client = _client()
    current = _current_rules(client)
    our_rule = {
        "ID": RULE_ID,
        "AllowedOrigins": args.origin,
        "AllowedMethods": ["GET", "PUT", "HEAD"],
        "AllowedHeaders": ["content-type", "authorization"],
        "ExposeHeaders": ["etag"],
        "MaxAgeSeconds": 3600,
    }
    ls_rule = {
        "ID": LS_RULE_ID,
        "AllowedOrigins": [args.label_studio_origin],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["etag"],
        "MaxAgeSeconds": 3600,
    }
    # Preserve every other app's rules; replace only our own by ID.
    ours = {RULE_ID, LS_RULE_ID}
    merged = [r for r in current if r.get("ID") not in ours] + [our_rule, ls_rule]

    out(f"Bucket: {settings.b2_bucket_name}")
    out(f"Current CORS rules: {len(current)}")
    out("Proposed rules (merged in):")
    out(json.dumps([our_rule, ls_rule], indent=2))

    if not args.apply:
        out("\nDry run — re-run with --apply to write this change.")
        return 0

    client.put_bucket_cors(
        Bucket=settings.b2_bucket_name,
        CORSConfiguration={"CORSRules": merged},
    )
    out(f"\nApplied. Bucket now has {len(merged)} CORS rule(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
