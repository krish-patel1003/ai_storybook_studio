import enum
import re
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from src.models import Base


def _strip_newlines(text: str) -> str:
    """Collapse all newline variants into a single space and trim."""
    collapsed = re.sub(r"\s*[\r\n]+\s*", " ", text)
    return re.sub(r" {2,}", " ", collapsed).strip()


class GenerationStage(str, enum.Enum):
    PENDING = "pending"
    ENHANCING = "enhancing"
    CHARACTERS = "characters"
    OUTLINE = "outline"
    PAGES = "pages"
    COMPLETE = "complete"
    FAILED = "failed"


class Book(Base):
    __tablename__ = "book"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # User inputs
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    age_range: Mapped[str] = mapped_column(String(10), nullable=False)
    tone: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    art_style: Mapped[str] = mapped_column(String(100), nullable=False)
    safety_mode: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    model_provider: Mapped[str] = mapped_column(String(20), nullable=False, default="gemini")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, default="gemini-3.5-flash")

    # Generated content (stored as JSONB so no migration needed when schemas evolve)
    brief: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # KDP publishing fields — generated on demand, cached here
    kdp_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    # Visibility
    visibility: Mapped[str] = mapped_column(String(10), nullable=False, default="private")

    # Author attribution — resolved at creation from parent user or chosen child profile
    author_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Optional child profile — personalises prompts and loading UX
    child_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("child_profile.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Seed for illustration consistency — set once, used as base for per-page seeds
    visual_seed: Mapped[int] = mapped_column(Integer, nullable=False, default=lambda: __import__('random').randint(0, 2**31 - 1))

    # Generation state
    stage: Mapped[GenerationStage] = mapped_column(
        Enum(GenerationStage, name="generation_stage", values_callable=lambda obj: [e.value for e in obj], create_type=False),
        default=GenerationStage.PENDING,
        nullable=False,
        index=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    characters: Mapped[list["Character"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", order_by="Character.name"
    )
    pages: Mapped[list["Page"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", order_by="Page.order"
    )


class Character(Base):
    __tablename__ = "character"
    __table_args__ = (UniqueConstraint("book_id", "name", name="uq_character_book_name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    book_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("book.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_protagonist: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role_description: Mapped[str] = mapped_column(Text, nullable=False)
    personality: Mapped[str] = mapped_column(Text, nullable=False)
    visual_anchors: Mapped[list] = mapped_column(JSONB, nullable=False)
    illustration_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    book: Mapped["Book"] = relationship(back_populates="characters")


class Page(Base):
    __tablename__ = "page"
    __table_args__ = (UniqueConstraint("book_id", "order", name="uq_page_book_order"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    book_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("book.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_back_cover: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Beat (outline)
    narrative_role: Mapped[str] = mapped_column(String(100), nullable=False)
    beat: Mapped[str] = mapped_column(Text, nullable=False)
    emotional_note: Mapped[str] = mapped_column(Text, nullable=False)
    characters_present: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    setting_note: Mapped[str] = mapped_column(Text, nullable=False)

    # Generated page text (null until page stage completes)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Illustration metadata (null until page stage completes)
    illustration_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # MinIO object key — set after illustration is uploaded (null = not yet illustrated)
    image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # MinIO object key — set after narration is generated (null = not yet narrated)
    audio_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Text layout — applied in reader and PDF export
    text_align: Mapped[str] = mapped_column(String(10), nullable=False, server_default="center")
    text_position: Mapped[str] = mapped_column(String(10), nullable=False, server_default="bottom")

    # Canvas-style text overlay — set by the canvas editor; overrides text_align/text_position when present
    # Schema: { x, y, w, fontSize, fontFamily, textColor, bgStyle, bgOpacity }
    canvas_overlay: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Per-page style (set by studio; null = use reader/export defaults)
    font_size: Mapped[float | None] = mapped_column(nullable=True)
    font_family: Mapped[str | None] = mapped_column(String(50), nullable=True)
    text_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    text_mode: Mapped[int | None] = mapped_column(nullable=True)
    bg_color: Mapped[str | None] = mapped_column(String(20), nullable=True)

    @validates("text")
    def _validate_text(self, key: str, value: str | None) -> str | None:
        if value is None:
            return None
        return _strip_newlines(value)

    book: Mapped["Book"] = relationship(back_populates="pages")
