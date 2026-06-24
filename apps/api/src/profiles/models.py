import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models import Base


class ChildProfile(Base):
    __tablename__ = "child_profile"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    author_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    # "boy" | "girl" | "nonbinary" | "unspecified"
    gender: Mapped[str] = mapped_column(String(20), nullable=False, default="unspecified")
    # "preschool" | "K" | "1" | "2" | "3" | "4" | "5" | "6+"
    grade_level: Mapped[str] = mapped_column(String(20), nullable=False, default="K")
    # list[str] — e.g. ["dinosaurs", "space", "animals"]
    interests: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # "beginner" | "early_reader" | "chapter_book"
    reading_level: Mapped[str] = mapped_column(String(20), nullable=False, default="beginner")
    # emoji displayed on the profile card
    avatar_emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="⭐")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
