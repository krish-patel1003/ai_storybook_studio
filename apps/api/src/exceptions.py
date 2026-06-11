import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppException(Exception):
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail: str = "Internal server error"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.__class__.detail


class NotFoundError(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Not found"


class ConflictError(AppException):
    status_code = status.HTTP_409_CONFLICT
    detail = "Conflict"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Log the full validation error so we can diagnose 422s from the browser
        body = None
        try:
            body = await request.body()
            body = body.decode("utf-8")[:500]
        except Exception:
            pass
        logger.error(
            "422 Validation error on %s %s\nErrors: %s\nBody: %s",
            request.method, request.url.path, exc.errors(), body,
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )
