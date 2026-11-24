"""Read task images from B2 over the S3-compatible API.

Label Studio hands the backend `s3://<bucket>/<key>` URIs (its source storage
stores blob URIs, not bytes) — or, when it resolves them for a browser, a
`/tasks/<id>/resolve/?fileuri=<base64 s3 URI>` proxy URL, which is decoded back. This is the ML backend's own S3 client, tagged
with the sample's attribution user agent like every other client in the sample.
"""

import base64
import binascii
import functools
from urllib.parse import parse_qs, urlparse

import boto3
from botocore.config import Config

from app.config import settings

USER_AGENT_EXTRA = "b2ai-label-studio-annotation-loop"


@functools.lru_cache(maxsize=1)
def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.endpoint_url,
        region_name=settings.b2_region,
        aws_access_key_id=settings.b2_application_key_id,
        aws_secret_access_key=settings.b2_application_key,
        config=Config(
            connect_timeout=5,
            read_timeout=60,
            retries={"mode": "standard", "total_max_attempts": 3},
            signature_version="s3v4",
            user_agent_extra=USER_AGENT_EXTRA,
        ),
    )


def _unwrap_resolve_url(uri: str) -> str:
    """Label Studio's `/tasks/<id>/resolve/?fileuri=<urlsafe base64>` -> the s3:// URI inside."""
    parsed = urlparse(uri)
    if "/resolve/" not in parsed.path:
        return uri
    encoded = (parse_qs(parsed.query).get("fileuri") or [""])[0]
    try:
        return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
    except (binascii.Error, UnicodeDecodeError):
        return uri


def parse_s3_uri(uri: str) -> tuple[str, str]:
    if isinstance(uri, str):
        uri = _unwrap_resolve_url(uri)
    if not isinstance(uri, str) or not uri.startswith("s3://"):
        raise ValueError(f"expected an s3:// task image URI, got {uri!r}")
    bucket, _, key = uri[len("s3://") :].partition("/")
    if not key:
        raise ValueError(f"no object key in {uri!r}")
    if bucket != settings.b2_bucket_name:
        raise ValueError(f"bucket {bucket!r} is not the configured B2 bucket")
    return bucket, key


def read_image_bytes(uri: str) -> bytes:
    bucket, key = parse_s3_uri(uri)
    return s3_client().get_object(Bucket=bucket, Key=key)["Body"].read()
