"""setup_b2_cors.py must treat a bucket with no CORS yet as "no rules", on B2 too."""

import importlib.util
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "setup_b2_cors.py"


def _load():
    spec = importlib.util.spec_from_file_location("setup_b2_cors", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _NoCors:
    def __init__(self, code: str):
        self.code = code

    def get_bucket_cors(self, Bucket):
        raise ClientError({"Error": {"Code": self.code}}, "GetBucketCors")


# AWS spells the code NoSuchCORSConfiguration; B2 answers NoSuchCorsConfiguration.
@pytest.mark.parametrize("code", ["NoSuchCORSConfiguration", "NoSuchCorsConfiguration"])
def test_missing_cors_configuration_is_empty(code):
    assert _load()._current_rules(_NoCors(code)) == []


def test_other_errors_still_raise():
    with pytest.raises(ClientError):
        _load()._current_rules(_NoCors("AccessDenied"))
