"""Internal routes — called by the Telegram bot, not exposed to end users."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.deps import DBSession, RedisClient
from src.core.services.auth import AuthService

router = APIRouter()


class BotAuthCompleteRequest(BaseModel):
    token: str
    telegram_id: str
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None


@router.post("/auth/complete")
async def bot_auth_complete(
    data: BotAuthCompleteRequest,
    db: DBSession,
    redis: RedisClient,
) -> dict:
    """Called by the bot when user sends /start <token>. Completes the auth flow."""
    key = f"auth_token:{data.token}"
    raw = await redis.get(key)
    if raw is None:
        raise HTTPException(status_code=404, detail="Token not found or expired")

    stored = json.loads(raw)
    if stored["status"] != "pending":
        raise HTTPException(status_code=409, detail="Token already used")

    # Register or find user, create JWT tokens
    auth_service = AuthService(db)
    user = await auth_service.register_from_bot(
        telegram_id=data.telegram_id,
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
    )
    await db.commit()

    tokens = auth_service._create_tokens(user)

    # Store completed auth under the same Redis key (keep remaining TTL)
    ttl = await redis.ttl(key)
    completed = json.dumps(
        {
            "status": "complete",
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "token_type": tokens.token_type,
        }
    )
    await redis.set(key, completed, ex=max(ttl, 1))

    return {"status": "ok"}
