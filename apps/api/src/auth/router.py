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
    UpdateUserIn,
    UserResponse,
    VerifyEmailIn,
    ResendVerificationIn,
)
from src.database import get_db

router = APIRouter()


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
)
async def register(
    data: RegisterIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await service.register(data.username, data.email, data.password, db)


@router.post(
    "/verify-email",
    response_model=AuthTokens,
    summary="Verify email address with token from email link",
)
async def verify_email(
    data: VerifyEmailIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthTokens:
    return await service.verify_email(data.token, db)


@router.post(
    "/resend-verification",
    summary="Resend email verification link",
)
async def resend_verification(
    data: ResendVerificationIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await service.resend_verification(data.email, db)


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
        username=user.username,
        author_name=user.author_name,
        avatar_url=user.avatar_url,
    )


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update username or author name",
)
async def update_me(
    data: UpdateUserIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    if data.username is not None:
        user.username = data.username
    if data.author_name is not None:
        user.author_name = data.author_name
    await db.commit()
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        author_name=user.author_name,
        avatar_url=user.avatar_url,
    )
