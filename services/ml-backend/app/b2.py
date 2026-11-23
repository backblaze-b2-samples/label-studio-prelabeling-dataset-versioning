"""Read task images from B2 over the S3-compatible API.

Label Studio hands the backend `s3://<bucket>/<key>` URIs (its source storage
stores blob URIs, not bytes). This is the ML backend's own S3 client, tagged
with the sample's attribution user agent like every other client in the sample.
"""

import functools

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


def parse_s3_uri(uri: str) -> tuple[str, str]:
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
