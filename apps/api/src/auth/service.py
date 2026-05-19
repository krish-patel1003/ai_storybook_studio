import uuid
from datetime import UTC, datetime

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


async def register(pen_name: str, email: str, password: str, db: AsyncSession) -> AuthTokens:
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise EmailAlreadyTaken()

    user = User(
        pen_name=pen_name,
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()  # get user.id without committing yet

    tokens = await _issue_tokens(user, db)
    await db.commit()
    return tokens


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
    else:
        user = User(
            pen_name=name,
            email=email,
            google_id=google_id,
            avatar_url=avatar_url,
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
            pen_name=user.pen_name,
            avatar_url=user.avatar_url,
        ),
    )


async def _verify_google_token(access_token: str) -> dict:
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        raise InvalidGoogleToken()

    return resp.json()
