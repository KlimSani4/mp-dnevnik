"""Application exceptions with HTTP status code mapping."""

from typing import Any


class AppException(Exception):
    """Base application exception."""

    status_code: int = 500
    detail: str = "Internal server error"

    def __init__(self, detail: str | None = None, **kwargs: Any) -> None:
        self.detail = detail or self.detail
        self.extra = kwargs
        super().__init__(self.detail)


class NotFoundError(AppException):
    """Resource not found."""

    status_code = 404
    detail = "Resource not found"


class ValidationError(AppException):
    """Validation error."""

    status_code = 422
    detail = "Validation error"


class AuthenticationError(AppException):
    """Authentication failed."""

    status_code = 401
    detail = "Authentication required"


class AuthorizationError(AppException):
    """Authorization denied."""

    status_code = 403
    detail = "Access denied"


class ConflictError(AppException):
    """Resource conflict."""

    status_code = 409
    detail = "Resource conflict"


class RateLimitError(AppException):
    """Rate limit exceeded."""

    status_code = 429
    detail = "Too many requests"


class ExternalServiceError(AppException):
    """External service error."""

    status_code = 502
    detail = "External service unavailable"


class ServiceUnavailableError(AppException):
    """Service temporarily unavailable."""

    status_code = 503
    detail = "Service temporarily unavailable"
