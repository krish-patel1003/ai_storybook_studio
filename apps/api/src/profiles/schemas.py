import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CreateProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    author_name: str | None = Field(default=None, min_length=1, max_length=100)
    age: int = Field(ge=0, le=18)
    gender: str = Field(default="unspecified", pattern=r"^(boy|girl|nonbinary|unspecified)$")
    grade_level: str = Field(default="K", pattern=r"^(preschool|K|1|2|3|4|5|6\+)$")
    interests: list[str] = Field(default_factory=list)
    reading_level: str = Field(default="beginner", pattern=r"^(beginner|early_reader|chapter_book)$")
    avatar_emoji: str = Field(default="⭐", max_length=10)


class UpdateProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    author_name: str | None = Field(default=None, min_length=1, max_length=100)
    age: int | None = Field(default=None, ge=0, le=18)
    gender: str | None = Field(default=None, pattern=r"^(boy|girl|nonbinary|unspecified)$")
    grade_level: str | None = Field(default=None, pattern=r"^(preschool|K|1|2|3|4|5|6\+)$")
    interests: list[str] | None = None
    reading_level: str | None = Field(default=None, pattern=r"^(beginner|early_reader|chapter_book)$")
    avatar_emoji: str | None = Field(default=None, max_length=10)


class ProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    author_name: str | None = None
    age: int
    gender: str
    grade_level: str
    interests: list[str]
    reading_level: str
    avatar_emoji: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
