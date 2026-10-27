"""Обращения в поддержку от пользователя (#99)."""

from fastapi import APIRouter

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.moderation import MySupportRequestResponse, SupportRequestCreate
from src.core.services.moderation import SupportService

router = APIRouter()


@router.post("", response_model=MySupportRequestResponse, status_code=201)
async def create_support_request(
    data: SupportRequestCreate, user: CurrentUser, db: DBSession
) -> MySupportRequestResponse:
    """Написать в поддержку. Ответ модератора придёт в Telegram."""
    req = await SupportService(db).create(user, data.message)
    return MySupportRequestResponse.model_validate(req)


@router.get("/my", response_model=list[MySupportRequestResponse])
async def my_support_requests(user: CurrentUser, db: DBSession) -> list[MySupportRequestResponse]:
    return [MySupportRequestResponse.model_validate(r) for r in await SupportService(db).mine(user)]
