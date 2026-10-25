"""API middleware."""

import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.api.rate_limit import hit_limit
from src.shared.exceptions import RateLimitError
from src.shared.net import get_client_ip
from src.shared.redis import get_redis

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all incoming requests with timing."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Any]) -> Response:
        request_id = str(uuid.uuid4())[:8]
        start_time = time.perf_counter()

        # Add request ID to state for use in handlers
        request.state.request_id = request_id

        # Log request
        logger.info(
            "Request started",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": get_client_ip(request),
            },
        )

        try:
            response: Response = await call_next(request)
        except Exception as e:
            duration = time.perf_counter() - start_time
            logger.error(
                "Request failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration * 1000, 2),
                    "error": str(e),
                },
            )
            raise

        duration = time.perf_counter() - start_time

        # Add headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{round(duration * 1000, 2)}ms"

        # Log response
        logger.info(
            "Request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2),
            },
        )

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Общий лимит запросов с одного IP; счётчики в Redis, поэтому едины для всех подов."""

    def __init__(self, app: Any, *, requests_per_minute: int = 300) -> None:
        super().__init__(app)
        self.requests_per_minute = requests_per_minute

    async def dispatch(self, request: Request, call_next: Callable[[Request], Any]) -> Response:
        if request.url.path in ("/health", "/ready"):
            result: Response = await call_next(request)
            return result

        client_ip = get_client_ip(request)
        if client_ip:
            try:
                await hit_limit(
                    await get_redis(), f"ratelimit:global:{client_ip}", self.requests_per_minute, 60
                )
            except RateLimitError:
                return Response(
                    content='{"detail":"Too many requests"}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "60"},
                )

        result = await call_next(request)
        return result
