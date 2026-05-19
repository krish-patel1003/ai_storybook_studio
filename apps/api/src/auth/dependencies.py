from collections.abc import Mapping
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.exceptions import AccountInactive, InvalidCredentials, UserNotFound
from src.auth.models import User
from src.auth.utils import decode_access_token
from src.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


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
    return user
