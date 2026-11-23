"""Service-level errors, mapped to HTTP statuses in `runtime/`."""

from app.types import FlaggedTask


class ServiceError(Exception):
    status_code = 500

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class InvalidRequestError(ServiceError):
    status_code = 400


class NotFoundError(ServiceError):
    status_code = 404


class ConflictError(ServiceError):
    """409. `flagged` carries the tasks that block a release, when relevant."""

    status_code = 409

    def __init__(self, detail: str, flagged: list[FlaggedTask] | None = None):
        super().__init__(detail)
        self.flagged = flagged or []


class DependencyError(ServiceError):
    """Label Studio, the ML backend or B2 failed. 503 if unreachable, else 502."""

    def __init__(self, detail: str, unreachable: bool):
        super().__init__(detail)
        self.status_code = 503 if unreachable else 502
