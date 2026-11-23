"""Access points to the external adapters, and the error translation for them.

Services call `label_studio()` / `ml_backend()` rather than the repo factories
directly, so tests replace one function instead of patching every importer.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from app.repo.label_studio import LabelStudioClient, get_label_studio
from app.repo.ml_backend import MLBackendClient, get_ml_backend
from app.repo.upstream import UpstreamServiceError
from app.service.errors import DependencyError


def label_studio() -> LabelStudioClient:
    return get_label_studio()


def ml_backend() -> MLBackendClient:
    return get_ml_backend()


@contextmanager
def upstream() -> Iterator[None]:
    """Turn adapter failures into a `DependencyError` with an actionable message."""
    try:
        yield
    except UpstreamServiceError as e:
        hint = " Is `docker compose up -d` running?" if e.unreachable else ""
        raise DependencyError(f"{e}{hint}", unreachable=e.unreachable) from e
    except RuntimeError as e:
        raise DependencyError(f"Backblaze B2: {e}", unreachable=False) from e
