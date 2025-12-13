"""API dependencies for dependency injection."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Header, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.group import Student, StudentRole
from src.core.models.user import User
from src.core.repositories.group import StudentRepository
from src.core.repositories.user import UserRepository
from src.shared.database import get_db
from src.shared.exceptions import AuthenticationError, AuthorizationError
from src.shared.redis import get_redis
from src.shared.security import decode_token


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session."""
    async for session in get_db():
        yield session


async def get_redis_client() -> Redis:
    """Get Redis client."""
    return await get_redis()


def get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_user_agent(
    user_agent: Annotated[str | None, Header(alias="User-Agent")] = None,
) -> str | None:
    """Get user agent header."""
    return user_agent


async def get_current_user_optional(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User | None:
    """Get current user if authenticated, None otherwise."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]  # Remove "Bearer " prefix
    try:
        payload = decode_token(token)
    except Exception:
        return None

    if payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user_repo = UserRepository(db)
    return await user_repo.get(uuid.UUID(user_id))


async def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    """Get current authenticated user. Raises if not authenticated."""
    if user is None:
        raise AuthenticationError("Authentication required")
    return user


async def require_verified(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Require user to be verified in at least one group."""
    student_repo = StudentRepository(db)
    students = await student_repo.get_user_students(user.id)

    if not any(s.verified for s in students):
        raise AuthorizationError("Verification required")

    return user


class RequireGroupRole:
    """Dependency to require user has specific role in a group."""

    def __init__(self, *roles: StudentRole) -> None:
        self.roles = roles

    async def __call__(
        self,
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db_session)],
        group_code: str,
    ) -> Student:
        """Check user has required role in group."""
        from src.core.repositories.group import GroupRepository

        group_repo = GroupRepository(db)
        student_repo = StudentRepository(db)

        group = await group_repo.get_by_code(group_code)
        if not group:
            raise AuthorizationError("Group not found")

        student = await student_repo.get_by_user_and_group(user.id, group.id)
        if not student:
            raise AuthorizationError("Not a member of this group")

        if self.roles and student.role not in self.roles:
            raise AuthorizationError("Insufficient permissions")

        return student


require_starosta = RequireGroupRole(StudentRole.STAROSTA, StudentRole.DEPUTY)
require_member = RequireGroupRole()


# Type aliases for cleaner route signatures
DBSession = Annotated[AsyncSession, Depends(get_db_session)]
RedisClient = Annotated[Redis, Depends(get_redis_client)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentUserOptional = Annotated[User | None, Depends(get_current_user_optional)]
VerifiedUser = Annotated[User, Depends(require_verified)]
ClientIP = Annotated[str | None, Depends(get_client_ip)]
UserAgent = Annotated[str | None, Depends(get_user_agent)]
