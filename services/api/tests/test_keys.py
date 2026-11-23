"""Key layout and name validation (service/keys.py)."""

from datetime import UTC, datetime

import pytest

from app.service import keys


def test_layout():
    assert keys.descriptor_key("street") == "labeling/projects/street.json"
    assert keys.raw_key("street", "a.jpg") == "labeling/raw/street/a.jpg"
    assert keys.prelabel_key("street", "20261123T120000Z-rtdetr-r18", "a") == (
        "labeling/prelabels/street/20261123T120000Z-rtdetr-r18/a.json"
    )
    assert keys.run_record_key("street", "R") == "labeling/prelabels/street/R/_run.json"
    assert keys.annotations_prefix("street") == "labeling/annotations/street/"
    assert keys.release_file_key("street", "v1", keys.MANIFEST_FILE) == "labeling/exports/street/v1/manifest.json"


@pytest.mark.parametrize("slug", ["ab", "street-scenes-1", "a" * 48, "0day"])
def test_valid_slugs(slug):
    assert keys.validate_project_slug(slug) == slug


@pytest.mark.parametrize("slug", ["a", "-ab", "Ab", "a_b", "a" * 49, "", "a/b"])
def test_invalid_slugs(slug):
    with pytest.raises(keys.KeyLayoutError):
        keys.validate_project_slug(slug)


def test_slugify():
    assert keys.slugify("Street scenes, batch 1") == "street-scenes-batch-1"
    with pytest.raises(keys.KeyLayoutError):
        keys.slugify("!!")


@pytest.mark.parametrize("name", ["v1", "2026.11.23", "rc_1", "release-final"])
def test_valid_release_names(name):
    assert keys.validate_release_name(name) == name


@pytest.mark.parametrize("name", ["", "V1", ".hidden", "a/b", "x" * 65])
def test_invalid_release_names(name):
    with pytest.raises(keys.KeyLayoutError):
        keys.validate_release_name(name)


def test_run_id_shape():
    run_id = keys.new_run_id("rtdetr-r18", datetime(2026, 11, 23, 12, 0, 5, tzinfo=UTC))
    assert run_id == "20261123T120005Z-rtdetr-r18"
    assert keys.validate_run_id(run_id) == run_id
    with pytest.raises(keys.KeyLayoutError):
        keys.validate_run_id("../x")


def test_helpers():
    assert keys.is_image_key("a/B.JPEG") and not keys.is_image_key("a/b.gif")
    assert keys.child_name("labeling/exports/p/", "labeling/exports/p/v1/manifest.json") == "v1"
    assert keys.child_name("labeling/exports/p/", "labeling/exports/p/stray.json") is None
    assert keys.source_key_from_uri("s3://bkt/labeling/raw/p/a.jpg", "bkt") == "labeling/raw/p/a.jpg"
    assert keys.source_key_from_uri("s3://other/x.jpg", "bkt") is None
    assert keys.image_stem("labeling/raw/p/street.photo.jpg") == "street.photo"


def test_regex_filter_matches_label_studio_usage():
    import re

    pattern = re.compile(keys.IMAGE_REGEX_FILTER)
    assert pattern.match("labeling/raw/p/a.JPG") and pattern.match("labeling/raw/p/b.webp")
    assert not pattern.match("labeling/raw/p/notes.txt")
