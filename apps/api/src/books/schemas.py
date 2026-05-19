import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from src.books.models import GenerationStage
from src.generation.constants import (
    DEFAULT_PAGE_COUNT,
    MAX_PAGE_COUNT,
    MIN_PAGE_COUNT,
    PAGE_COUNT_OPTIONS,
)
from src.generation.schemas import IllustrationMetadata


# ── Request schemas ───────────────────────────────────────────────────────────

class CreateBookIn(BaseModel):
    raw_prompt: str = Field(min_length=10, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list, max_length=5)
    art_style: str = Field(min_length=3, max_length=100)
    safety_mode: bool = True
    page_count: int = Field(
        default=DEFAULT_PAGE_COUNT,
        ge=MIN_PAGE_COUNT,
        le=MAX_PAGE_COUNT,
    )
    model_provider: str = "gemini"
    model_name: str = "gemini-2.0-flash"


class UpdatePageIn(BaseModel):
    """User editing a beat on the /outline screen."""
    beat: str | None = Field(default=None, min_length=5)
    emotional_note: str | None = None
    setting_note: str | None = None
    is_locked: bool | None = None


class RecalibrateIn(BaseModel):
    new_page_count: int = Field(ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)


# ── Response schemas ──────────────────────────────────────────────────────────

class ArcStageOut(BaseModel):
    name: str
    description: str
    page_span: int


class BriefOut(BaseModel):
    title: str
    logline: str
    central_conflict: str
    moral: str
    world: str
    narrative_structure: str
    arc: list[ArcStageOut]


class CharacterOut(BaseModel):
    id: uuid.UUID
    name: str
    is_protagonist: bool
    role_description: str
    personality: str
    visual_anchors: list[str]
    illustration_prompt: str

    model_config = {"from_attributes": True}


class PageOut(BaseModel):
    id: uuid.UUID
    order: int
    is_cover: bool
    is_locked: bool
    narrative_role: str
    beat: str
    emotional_note: str
    characters_present: list[str]
    setting_note: str
    text: str | None
    word_count: int | None
    illustration_metadata: IllustrationMetadata | None

    model_config = {"from_attributes": True}


class BookOut(BaseModel):
    id: uuid.UUID
    title: str
    raw_prompt: str
    age_range: str
    tone: list[str]
    art_style: str
    safety_mode: bool
    page_count: int
    model_provider: str
    model_name: str
    stage: GenerationStage
    error: str | None
    brief: BriefOut | None
    characters: list[CharacterOut]
    pages: list[PageOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookSummaryOut(BaseModel):
    """Lightweight representation for list endpoints."""
    id: uuid.UUID
    title: str
    age_range: str
    art_style: str
    page_count: int
    stage: GenerationStage
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageCountOptionsOut(BaseModel):
    options: list[int]
    default: int
    min: int
    max: int


class BriefGenerateIn(BaseModel):
    raw_prompt: str = Field(min_length=10, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-2.0-flash"


class BriefOptionsOut(BaseModel):
    briefs: list[BriefOut]


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
    size: str = ""       # e.g. "3B", "7B", "cloud"


class ProviderInfo(BaseModel):
    id: str              # "gemini" | "ollama"
    name: str
    description: str
    available: bool
    models: list[ModelInfo]


class ModelsOut(BaseModel):
    providers: list[ProviderInfo]


class CreateDraftIn(BaseModel):
    """Saves a project record before full generation starts."""
    raw_prompt: str = Field(min_length=10, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list, max_length=5)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-2.0-flash"


class GenerateIn(BaseModel):
    art_style: str = Field(min_length=3, max_length=100)


class AddPageIn(BaseModel):
    beat: str = Field(min_length=5, max_length=2000)
    narrative_role: str = Field(default="", max_length=100)
    setting_note: str = Field(default="", max_length=500)
    emotional_note: str = Field(default="", max_length=500)


class AddCharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    is_protagonist: bool = False
    role_description: str = Field(default="", max_length=1000)
    personality: str = Field(default="", max_length=1000)
    visual_anchors: list[str] = Field(default_factory=list)
    illustration_prompt: str = Field(default="", max_length=2000)
