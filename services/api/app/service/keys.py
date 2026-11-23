"""The B2 key layout, in one place.

    labeling/projects/<project>.json                     project descriptor
    labeling/raw/<project>/<file>                        raw images (LS source storage)
    labeling/prelabels/<project>/<run-id>/<stem>.json    one record per task, plus _run.json
    labeling/annotations/<project>/<annotation-id>       written by LS target storage
    labeling/exports/<project>/<release>/                annotations.coco.json,
                                                         label-studio-export.json, manifest.json

Every other module builds keys through these functions, so the layout cannot
drift between the writer and the verifier.
"""

import re
from datetime import UTC, datetime
from pathlib import PurePosixPath

ROOT = "labeling/"
PROJECT_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,47}$")
RELEASE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
RUN_ID_RE = re.compile(r"^\d{8}T\d{6}Z-[a-z0-9-]+$")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
# Label Studio applies this with re.match against the full key.
IMAGE_REGEX_FILTER = r"(?i)^.*\.(jpe?g|png|webp)$"

RUN_RECORD = "_run.json"
COCO_FILE = "annotations.coco.json"
LS_EXPORT_FILE = "label-studio-export.json"
MANIFEST_FILE = "manifest.json"


class KeyLayoutError(ValueError):
    """A slug, release name or run id that does not fit the layout."""


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48].strip("-")
    validate_project_slug(slug)
    return slug


def validate_project_slug(slug: str) -> str:
    if not PROJECT_SLUG_RE.fullmatch(slug or ""):
        raise KeyLayoutError(
            "Project slug must be 2-48 characters of a-z, 0-9 and '-', starting with a letter or digit"
        )
    return slug


def validate_release_name(name: str) -> str:
    if not RELEASE_RE.fullmatch(name or ""):
        raise KeyLayoutError(
            "Release name must be 1-64 characters of a-z, 0-9, '.', '_' and '-', starting with a letter or digit"
        )
    return name


def validate_run_id(run_id: str) -> str:
    if not RUN_ID_RE.fullmatch(run_id or ""):
        raise KeyLayoutError("Run id must look like 20260101T120000Z-model")
    return run_id


def new_run_id(model_short: str, now: datetime | None = None) -> str:
    stamp = (now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{model_short}"


def is_image_key(key: str) -> bool:
    return key.lower().endswith(IMAGE_EXTENSIONS)


def descriptor_key(project: str) -> str:
    return f"{ROOT}projects/{project}.json"


def projects_prefix() -> str:
    return f"{ROOT}projects/"


def raw_prefix(project: str) -> str:
    return f"{ROOT}raw/{project}/"


def raw_key(project: str, filename: str) -> str:
    return f"{raw_prefix(project)}{filename}"


def prelabels_prefix(project: str, run_id: str | None = None) -> str:
    base = f"{ROOT}prelabels/{project}/"
    return f"{base}{run_id}/" if run_id else base


def prelabel_key(project: str, run_id: str, stem: str) -> str:
    return f"{prelabels_prefix(project, run_id)}{stem}.json"


def run_record_key(project: str, run_id: str) -> str:
    return f"{prelabels_prefix(project, run_id)}{RUN_RECORD}"


def annotations_prefix(project: str) -> str:
    return f"{ROOT}annotations/{project}/"


def exports_prefix(project: str, release: str | None = None) -> str:
    base = f"{ROOT}exports/{project}/"
    return f"{base}{release}/" if release else base


def release_file_key(project: str, release: str, filename: str) -> str:
    return f"{exports_prefix(project, release)}{filename}"


def image_stem(source_key: str) -> str:
    return PurePosixPath(source_key).stem


def child_name(prefix: str, key: str) -> str | None:
    """First path segment of `key` below `prefix` (a run id or a release name)."""
    if not key.startswith(prefix):
        return None
    rest = key[len(prefix) :]
    return rest.split("/", 1)[0] if "/" in rest else None


def source_key_from_uri(uri: str, bucket: str) -> str | None:
    """`s3://<bucket>/<key>` -> `<key>`; None for any other bucket or scheme."""
    prefix = f"s3://{bucket}/"
    return uri[len(prefix) :] if isinstance(uri, str) and uri.startswith(prefix) else None
