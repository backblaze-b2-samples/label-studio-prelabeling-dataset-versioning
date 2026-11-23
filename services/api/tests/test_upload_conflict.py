"""Unit tests for upload object-key minting.

The API mints the object key from the project and the declared filename at
presign time; the browser never chooses where its bytes land. B2 buckets are
always versioned, so re-uploading the same name just creates a new version.
"""

from app.service.upload import _validate_declared


def test_key_lands_in_the_project_raw_prefix():
    key = _validate_declared("street", "photo.jpg", "image/jpeg", 5)
    assert key == "labeling/raw/street/photo.jpg"


def test_duplicate_filename_yields_same_key():
    first = _validate_declared("street", "photo.jpg", "image/jpeg", 5)
    second = _validate_declared("street", "photo.jpg", "image/jpeg", 9)
    assert first == second == "labeling/raw/street/photo.jpg"


def test_key_is_sanitised():
    key = _validate_declared("street", "../../etc/my photo.png", "image/png", 5)
    assert key == "labeling/raw/street/my_photo.png"
