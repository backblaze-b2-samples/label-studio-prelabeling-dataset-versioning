"""Unit + integration tests for raw-image upload validation and content sniffing."""

from datetime import UTC, datetime

import pytest

from app.service import upload as upload_service
from app.service.upload import (
    ALLOWED_TYPES,
    UploadError,
    _validate_declared,
    content_type_has_signature,
    create_presigned_upload,
    matches_content_signature,
    sanitize_filename,
    validate_extension_matches_type,
    verify_upload,
)
from app.types import FileMetadata

RAW = "labeling/raw/street/"


def _meta(key: str, *, size_bytes: int, content_type: str) -> FileMetadata:
    filename = key.rsplit("/", 1)[-1]
    return FileMetadata(
        key=key,
        filename=filename,
        folder=RAW,
        size_bytes=size_bytes,
        size_human=f"{size_bytes} B",
        content_type=content_type,
        uploaded_at=datetime(2026, 2, 14, tzinfo=UTC),
        url=None,
    )


# --- sanitize_filename ------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("a\x00b.jpg", "ab.jpg"),
        ("my file.jpg", "my_file.jpg"),
        ("...hidden", "_hidden"),
        ("", "unnamed"),
        ("/", "unnamed"),
    ],
)
def test_sanitize_filename(raw, expected):
    assert sanitize_filename(raw) == expected


@pytest.mark.parametrize("raw", ["a" * 300 + ".jpg", "a" * 300, "a" * 300 + "." + "b" * 250])
def test_sanitize_filename_truncates_long_names(raw):
    result = sanitize_filename(raw)
    assert len(result) <= 200
    assert not result.startswith(".")


# --- types: raw images only -------------------------------------------------


def test_only_label_studio_importable_images_are_allowed():
    assert {"image/jpeg", "image/png", "image/webp"} == ALLOWED_TYPES
    assert all(content_type_has_signature(ct) for ct in ALLOWED_TYPES)


@pytest.mark.parametrize(
    ("filename", "content_type", "expected"),
    [
        ("photo.jpg", "image/jpeg", True),
        ("photo.jpeg", "image/jpeg", True),
        ("photo.png", "image/png", True),
        ("photo.webp", "image/webp", True),
        ("photo.png", "image/jpeg", False),
        ("x.gif", "image/gif", False),
        ("x.pdf", "application/pdf", False),
    ],
)
def test_validate_extension_matches_type(filename, content_type, expected):
    assert validate_extension_matches_type(filename, content_type) is expected


_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 8
_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


@pytest.mark.parametrize(
    ("data", "content_type", "expected"),
    [
        (_PNG, "image/png", True),
        (b"<html>not a png", "image/png", False),
        (_JPEG, "image/jpeg", True),
        (_WEBP, "image/webp", True),
        (_PNG, "image/webp", False),
    ],
)
def test_matches_content_signature(data, content_type, expected):
    assert matches_content_signature(data, content_type) is expected


# --- presign-time declared-upload validation --------------------------------


def test_presign_rejects_oversized(monkeypatch):
    monkeypatch.setattr(upload_service.settings, "max_file_size", 10)
    with pytest.raises(UploadError) as exc:
        _validate_declared("street", "a.jpg", "image/jpeg", 999)
    assert exc.value.status_code == 413


@pytest.mark.parametrize(("filename", "content_type"), [("a.txt", "text/plain"), ("a.gif", "image/gif")])
def test_presign_rejects_non_image_types(filename, content_type):
    with pytest.raises(UploadError) as exc:
        _validate_declared("street", filename, content_type, 4)
    assert exc.value.status_code == 415


def test_presign_rejects_extension_mismatch():
    with pytest.raises(UploadError) as exc:
        _validate_declared("street", "a.png", "image/jpeg", 4)
    assert exc.value.status_code == 415


def test_presign_rejects_empty_file_and_bad_project():
    with pytest.raises(UploadError):
        _validate_declared("street", "a.jpg", "image/jpeg", 0)
    with pytest.raises(UploadError):
        _validate_declared("../evil", "a.jpg", "image/jpeg", 4)


def test_presign_returns_signed_put_into_project_prefix(monkeypatch):
    captured = {}

    def fake_sign(key, content_type, content_length, expires_in):
        captured.update(key=key, content_type=content_type, content_length=content_length)
        return "https://b2.example/signed-put"

    monkeypatch.setattr(upload_service, "generate_presigned_upload", fake_sign)
    monkeypatch.setattr(upload_service.descriptors, "exists", lambda slug: True)
    result = create_presigned_upload("street", "My Photo.png", "image/png", 1234)

    assert result.key == f"{RAW}My_Photo.png"
    assert result.headers["Content-Type"] == "image/png"
    assert captured["content_length"] == 1234


def test_presign_unknown_project_is_404(monkeypatch):
    monkeypatch.setattr(upload_service.descriptors, "exists", lambda slug: False)
    with pytest.raises(UploadError) as exc:
        create_presigned_upload("nobody", "a.jpg", "image/jpeg", 10)
    assert exc.value.status_code == 404


# --- post-upload verification (HEAD + Range-GET sniff) -----------------------


def _wire_verify(monkeypatch, *, metadata, head_bytes):
    deleted: list[str] = []
    invalidated: list[bool] = []
    monkeypatch.setattr(upload_service, "get_file_metadata", lambda key: metadata)
    monkeypatch.setattr(upload_service, "get_object_head_bytes", lambda key, length: head_bytes)
    monkeypatch.setattr(upload_service, "delete_file", lambda key: deleted.append(key))
    monkeypatch.setattr(upload_service, "invalidate_listing", lambda: invalidated.append(True))
    return deleted, invalidated


def test_verify_accepts_valid_object(monkeypatch):
    meta = _meta(f"{RAW}a.png", size_bytes=16, content_type="image/png")
    deleted, invalidated = _wire_verify(monkeypatch, metadata=meta, head_bytes=_PNG)
    result = verify_upload(f"{RAW}a.png")
    assert result.key == f"{RAW}a.png"
    assert deleted == [] and invalidated == [True]


def test_verify_rejects_and_deletes_signature_mismatch(monkeypatch):
    meta = _meta(f"{RAW}a.png", size_bytes=16, content_type="image/png")
    deleted, _ = _wire_verify(monkeypatch, metadata=meta, head_bytes=b"<html>not a png")
    with pytest.raises(UploadError) as exc:
        verify_upload(f"{RAW}a.png")
    assert exc.value.status_code == 415
    assert deleted == [f"{RAW}a.png"]


def test_verify_rejects_oversize(monkeypatch):
    monkeypatch.setattr(upload_service.settings, "max_file_size", 10)
    meta = _meta(f"{RAW}big.jpg", size_bytes=999, content_type="image/jpeg")
    deleted, _ = _wire_verify(monkeypatch, metadata=meta, head_bytes=_JPEG)
    with pytest.raises(UploadError) as exc:
        verify_upload(f"{RAW}big.jpg")
    assert exc.value.status_code == 413
    assert deleted == [f"{RAW}big.jpg"]


def test_verify_missing_object_is_404(monkeypatch):
    deleted, _ = _wire_verify(monkeypatch, metadata=None, head_bytes=b"")
    with pytest.raises(UploadError) as exc:
        verify_upload(f"{RAW}gone.jpg")
    assert exc.value.status_code == 404
    assert deleted == []


def test_verify_rejects_key_outside_raw_prefix():
    with pytest.raises(UploadError):
        verify_upload("uploads/evil.jpg")


@pytest.mark.asyncio
async def test_successful_verify_increments_uploads_metric(client, monkeypatch):
    from app.runtime import metrics

    monkeypatch.setattr(metrics, "_upload_count", 0)
    meta = _meta(f"{RAW}a.jpg", size_bytes=5, content_type="image/jpeg")
    _wire_verify(monkeypatch, metadata=meta, head_bytes=_JPEG)

    resp = await client.post("/upload/verify", json={"key": f"{RAW}a.jpg"})
    assert resp.status_code == 200

    metrics_resp = await client.get("/metrics")
    assert "uploads_total 1" in metrics_resp.text
