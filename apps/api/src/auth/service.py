import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.exceptions import (
    AccountInactive,
    EmailAlreadyTaken,
    InvalidCredentials,
    InvalidGoogleToken,
    RefreshTokenNotValid,
)
from src.auth.models import RefreshToken, User
from src.auth.schemas import AuthTokens, UserResponse
from src.auth.utils import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)


def _generate_verification_token() -> str:
    return hashlib.sha256(os.urandom(32)).hexdigest()


async def register(username: str, email: str, password: str, db: AsyncSession) -> dict:
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise EmailAlreadyTaken()

    token = _generate_verification_token()
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        is_email_verified=False,
        email_verification_token=token,
        email_verification_expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(user)
    await db.commit()

    # Send verification email (non-blocking — failure doesn't break registration)
    try:
        from src.auth.email_service import send_verification_email
        await send_verification_email(email, username, token)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to send verification email to %s", email)

    return {"message": "Registration successful. Please check your email to verify your account."}


async def verify_email(token: str, db: AsyncSession) -> AuthTokens:
    user = await db.scalar(
        select(User).where(User.email_verification_token == token)
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )
    if user.email_verification_expires_at and user.email_verification_expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link has expired. Please request a new one.",
        )
    user.is_email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None

    tokens = await _issue_tokens(user, db)
    await db.commit()

    # Send welcome email
    try:
        from src.auth.email_service import send_welcome_email
        await send_welcome_email(user.email, user.username)
    except Exception:
        pass

    return tokens


async def resend_verification(email: str, db: AsyncSession) -> dict:
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        # Don't reveal whether email exists
        return {"message": "If that email is registered, a new verification link has been sent."}
    if user.is_email_verified:
        return {"message": "Your email is already verified. You can sign in."}

    token = _generate_verification_token()
    user.email_verification_token = token
    user.email_verification_expires_at = datetime.now(UTC) + timedelta(hours=24)
    await db.commit()

    try:
        from src.auth.email_service import send_verification_email
        await send_verification_email(email, user.username, token)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to resend verification email to %s", email)

    return {"message": "If that email is registered, a new verification link has been sent."}


async def authenticate(email: str, password: str, db: AsyncSession) -> AuthTokens:
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not user.password_hash:
        raise InvalidCredentials()
    if not verify_password(password, user.password_hash):
        raise InvalidCredentials()
    if not user.is_active:
        raise AccountInactive()

    tokens = await _issue_tokens(user, db)
    await db.commit()
    return tokens


async def google_auth(id_token_str: str, db: AsyncSession) -> AuthTokens:
    idinfo = await _verify_google_token(id_token_str)

    google_id: str = idinfo["sub"]
    email: str = idinfo["email"]
    name: str = idinfo.get("name", email.split("@")[0])
    avatar_url: str | None = idinfo.get("picture")

    # Try to find by google_id first, then by email (link existing account)
    user = await db.scalar(select(User).where(User.google_id == google_id))
    if not user:
        user = await db.scalar(select(User).where(User.email == email))

    if user:
        if not user.is_active:
            raise AccountInactive()
        # Link google_id if signing in via email-created account
        if not user.google_id:
            user.google_id = google_id
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        # Google has verified this email
        if not user.is_email_verified:
            user.is_email_verified = True
            user.email_verification_token = None
            user.email_verification_expires_at = None
    else:
        user = User(
            username=name,
            email=email,
            google_id=google_id,
            avatar_url=avatar_url,
            is_email_verified=True,  # Google already verified it
        )
        db.add(user)
        await db.flush()

    tokens = await _issue_tokens(user, db)
    await db.commit()
    return tokens


async def refresh_tokens(refresh_token_plaintext: str, db: AsyncSession) -> AuthTokens:
    token_hash = hash_refresh_token(refresh_token_plaintext)

    record = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .where(RefreshToken.revoked.is_(False))
    )

    if not record:
        raise RefreshTokenNotValid()

    if record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise RefreshTokenNotValid()

    user = await db.get(User, record.user_id)
    if not user or not user.is_active:
        raise RefreshTokenNotValid()

    # Rotate: revoke old token, issue new pair
    record.revoked = True
    tokens = await _issue_tokens(user, db)
    await db.commit()
    return tokens


async def revoke_refresh_token(refresh_token_plaintext: str, db: AsyncSession) -> None:
    token_hash = hash_refresh_token(refresh_token_plaintext)
    record = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if record and not record.revoked:
        record.revoked = True
        await db.commit()


async def _issue_tokens(user: User, db: AsyncSession) -> AuthTokens:
    plaintext, token_hash = generate_refresh_token()

    refresh = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=refresh_token_expiry(),
    )
    db.add(refresh)

    access_token = create_access_token(str(user.id))
    return AuthTokens(
        access_token=access_token,
        refresh_token=plaintext,
        user=UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            avatar_url=user.avatar_url,
        ),
    )


async def _verify_google_token(id_token: str) -> dict:
    """Verify a Google ID token (JWT) and return its claims.

    Validates signature, audience (must match GOOGLE_CLIENT_ID), issuer,
    and expiry — all checks that the old access-token/userinfo approach skipped.
    """
    import asyncio
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    from google.auth.exceptions import TransportError
    from src.auth.config import auth_settings

    if not auth_settings.GOOGLE_CLIENT_ID:
        raise InvalidGoogleToken()

    def _verify() -> dict:
        try:
            return google_id_token.verify_oauth2_token(
                id_token,
                google_requests.Request(),
                auth_settings.GOOGLE_CLIENT_ID,
            )
        except (ValueError, TransportError):
            raise InvalidGoogleToken()

    # verify_oauth2_token fetches Google's JWKS synchronously; run in thread pool
    try:
        return await asyncio.to_thread(_verify)
    except InvalidGoogleToken:
        raise
