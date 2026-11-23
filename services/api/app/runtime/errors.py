"""One translation from service errors to HTTP, registered in main.py.

Routers stay thin: they call the service and let `ServiceError` subclasses
surface here. A 409 carrying flagged tasks keeps them in the body
(`ReleaseBlocked`), so the UI can show exactly which tasks block a release.
"""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.service.errors import ConflictError, ServiceError
from app.types import ReleaseBlocked

logger = logging.getLogger(__name__)


async def service_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ServiceError)
    if exc.status_code >= 500:
        logger.warning("Dependency failure: %s", exc.detail)
    if isinstance(exc, ConflictError):
        body = ReleaseBlocked(detail=exc.detail, flagged=exc.flagged).model_dump(mode="json")
        return JSONResponse(status_code=409, content=body)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
