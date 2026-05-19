from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service
from src.auth.dependencies import current_user
from src.auth.models import User
from src.auth.schemas import (
    AuthTokens,
    GoogleAuthIn,
    LoginIn,
    RegisterIn,
    TokenRefreshIn,
    UserResponse,
)
from src.database import get_db

router = APIRouter()


@router.post(
    "/register",
    response_model=AuthTokens,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new author account",
)
async def register(
    data: RegisterIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthTokens:
    return await service.register(data.pen_name, data.email, data.password, db)


@router.post(
    "/login",
    response_model=AuthTokens,
    summary="Sign in with email and password",
)
async def login(
    data: LoginIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthTokens:
    return await service.authenticate(data.email, data.password, db)


@router.post(
    "/google",
    response_model=AuthTokens,
    summary="Sign in or register via Google OAuth",
)
async def google_auth(
    data: GoogleAuthIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthTokens:
    return await service.google_auth(data.token, db)


@router.post(
    "/refresh",
    response_model=AuthTokens,
    summary="Exchange a refresh token for a new token pair",
)
async def refresh(
    data: TokenRefreshIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthTokens:
    return await service.refresh_tokens(data.refresh_token, db)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke refresh token and sign out",
)
async def logout(
    data: TokenRefreshIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    bg: BackgroundTasks,
) -> None:
    # Fire-and-forget: safe to drop (token just lives until natural expiry)
    bg.add_task(service.revoke_refresh_token, data.refresh_token, db)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the currently authenticated user",
)
async def me(user: Annotated[User, Depends(current_user)]) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        pen_name=user.pen_name,
        avatar_url=user.avatar_url,
    )
