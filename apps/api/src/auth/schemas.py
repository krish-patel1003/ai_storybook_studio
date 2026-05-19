import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer


class CustomModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def _serialize_datetimes(self, value: Any) -> Any:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=ZoneInfo("UTC"))
            return value.strftime("%Y-%m-%dT%H:%M:%S%z")
        return value


class RegisterIn(CustomModel):
    pen_name: str = Field(min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)


class LoginIn(CustomModel):
    email: EmailStr
    password: str = Field(min_length=1)


class GoogleAuthIn(CustomModel):
    token: str  # Google OAuth2 access token from the frontend


class TokenRefreshIn(CustomModel):
    refresh_token: str


class UserResponse(CustomModel):
    id: uuid.UUID
    email: str
    pen_name: str
    avatar_url: str | None = None


class AuthTokens(CustomModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
