from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.exceptions import AccountInactive, InvalidCredentials, UserNotFound
from src.auth.models import User
from src.auth.utils import decode_access_token
from src.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_SEEN_THROTTLE = timedelta(minutes=5)


async def parse_jwt_data(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> dict:
    return decode_access_token(token)


async def current_user(
    token_data: Annotated[dict, Depends(parse_jwt_data)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await db.get(User, token_data["sub"])
    if not user:
        raise UserNotFound()
    if not user.is_active:
        raise AccountInactive()

    # Stamp last_seen_at at most once every 5 minutes to avoid excessive writes
    now = datetime.now(UTC)
    ls = user.last_seen_at
    if ls is not None and ls.tzinfo is None:
        ls = ls.replace(tzinfo=UTC)
    if ls is None or (now - ls) > _SEEN_THROTTLE:
        await db.execute(
            update(User).where(User.id == user.id).values(last_seen_at=now)
        )
        await db.commit()
        user.last_seen_at = now

    return user
