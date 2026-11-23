"""Prefix-scoped object helpers for the labeling workflow.

Everything the annotation loop writes or reads under `labeling/` goes through
here: JSON records (descriptors, pre-labels, manifests), release files, and
uncached prefix listings. Same S3 client — and so the same
`user_agent_extra` attribution — as the bucket explorer in `b2_client`.

Listings here deliberately bypass `list_cache`: verification and releases must
see the bucket as it is *now*, not a snapshot up to a TTL old.
"""

import json
from datetime import datetime
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache

_NOT_FOUND = ("404", "NoSuchKey", "NotFound")


def _code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


def put_bytes(key: str, body: bytes, content_type: str) -> str:
    """Write an object and return its ETag (quotes stripped). Raises RuntimeError."""
    try:
        response = get_s3_client().put_object(
            Bucket=settings.b2_bucket_name, Key=key, Body=body, ContentType=content_type
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 put_object failed for '{key}': {e}") from e
    _invalidate_list_cache()
    return str(response.get("ETag", "")).strip('"')


def put_json(key: str, payload: Any) -> bytes:
    """Serialize deterministically, write, and return the exact bytes written."""
    body = json.dumps(payload, indent=2, sort_keys=True, default=_json_default).encode("utf-8")
    put_bytes(key, body, "application/json")
    return body


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


def get_bytes(key: str) -> bytes | None:
    """Full object body, or None when the key does not exist. Raises RuntimeError."""
    try:
        response = get_s3_client().get_object(Bucket=settings.b2_bucket_name, Key=key)
        return response["Body"].read()
    except ClientError as e:
        if _code(e) in _NOT_FOUND:
            return None
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 get_object failed for '{key}': {e}") from e


def get_json(key: str) -> Any | None:
    body = get_bytes(key)
    return None if body is None else json.loads(body)


def head(key: str) -> dict | None:
    """`{"etag", "size", "last_modified"}` for a key, or None when missing."""
    try:
        response = get_s3_client().head_object(Bucket=settings.b2_bucket_name, Key=key)
    except ClientError as e:
        if _code(e) in _NOT_FOUND:
            return None
        raise RuntimeError(f"B2 head_object failed for '{key}': {e}") from e
    return {
        "etag": str(response.get("ETag", "")).strip('"'),
        "size": int(response["ContentLength"]),
        "last_modified": response["LastModified"],
    }


def list_prefix(prefix: str) -> list[dict]:
    """Every object under `prefix` as `{"key", "size", "etag", "last_modified"}`."""
    objects: list[dict] = []
    cursor: str | None = None
    while True:
        page, cursor = list_page(prefix, cursor, 1000)
        objects.extend(page)
        if cursor is None:
            return objects


def list_page(prefix: str, cursor: str | None, max_keys: int) -> tuple[list[dict], str | None]:
    """One page of a prefix listing plus the continuation token (None at the end)."""
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": max_keys}
    if cursor:
        kwargs["ContinuationToken"] = cursor
    try:
        response = get_s3_client().list_objects_v2(**kwargs)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list failed for prefix '{prefix}': {e}") from e
    items = [
        {
            "key": obj["Key"],
            "size": int(obj["Size"]),
            "etag": str(obj.get("ETag", "")).strip('"'),
            "last_modified": obj["LastModified"],
        }
        for obj in response.get("Contents", [])
    ]
    next_cursor = response.get("NextContinuationToken") if response.get("IsTruncated") else None
    return items, next_cursor


def delete_keys(keys: list[str]) -> int:
    """Delete keys in batches of 1000 (`delete_objects`). Returns how many went."""
    deleted = 0
    client = get_s3_client()
    for start in range(0, len(keys), 1000):
        batch = keys[start : start + 1000]
        try:
            response = client.delete_objects(
                Bucket=settings.b2_bucket_name,
                Delete={"Objects": [{"Key": k} for k in batch], "Quiet": False},
            )
        except (ClientError, BotoCoreError) as e:
            raise RuntimeError(f"B2 delete_objects failed: {e}") from e
        deleted += len(response.get("Deleted", []))
    if keys:
        _invalidate_list_cache()
    return deleted
