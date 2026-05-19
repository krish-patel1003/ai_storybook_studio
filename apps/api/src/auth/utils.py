import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext

from src.auth.config import auth_settings
from src.auth.exceptions import InvalidCredentials

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=auth_settings.JWT_EXP)
    payload = {"sub": user_id, "exp": expire, "iat": datetime.now(UTC)}
    return jwt.encode(payload, auth_settings.JWT_SECRET, algorithm=auth_settings.JWT_ALG)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, auth_settings.JWT_SECRET, algorithms=[auth_settings.JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise InvalidCredentials("Token has expired")
    except jwt.InvalidTokenError:
        raise InvalidCredentials("Token is invalid")


def generate_refresh_token() -> tuple[str, str]:
    """Return (plaintext_token, sha256_hash) pair."""
    plaintext = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(plaintext.encode()).hexdigest()
    return plaintext, token_hash


def hash_refresh_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(UTC) + auth_settings.refresh_token_exp
