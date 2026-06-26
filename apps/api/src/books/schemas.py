import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

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
    tone: list[str] = Field(default_factory=list)
    art_style: str = Field(min_length=3, max_length=100)
    safety_mode: bool = True
    page_count: int = Field(
        default=DEFAULT_PAGE_COUNT,
        ge=MIN_PAGE_COUNT,
        le=MAX_PAGE_COUNT,
    )
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"
    child_profile_id: uuid.UUID | None = None
    author_name: str | None = None


class UpdatePageIn(BaseModel):
    """User editing a page on the /outline or review screen."""
    beat: str | None = Field(default=None, min_length=5)
    emotional_note: str | None = None
    setting_note: str | None = None
    is_locked: bool | None = None
    text: str | None = None
    text_align: str | None = Field(default=None, pattern=r"^(left|center|right)$")
    text_position: str | None = Field(default=None, pattern=r"^(top|center|bottom)$")
    canvas_overlay: dict | None = None
    font_size: float | None = None
    font_family: str | None = None
    text_color: str | None = None
    text_mode: int | None = None


class BulkTextStyleIn(BaseModel):
    """Apply text layout to all content pages at once, or randomize."""
    text_align: str | None = Field(default=None, pattern=r"^(left|center|right)$")
    text_position: str | None = Field(default=None, pattern=r"^(top|center|bottom)$")
    randomize: bool = False
    # When randomize=True, pick from these subsets (defaults to all if empty)
    align_pool: list[str] = Field(default_factory=list)
    position_pool: list[str] = Field(default_factory=list)


class BulkPageStyleIn(BaseModel):
    """Apply book-level style settings to every content page at once."""
    font_family: str | None = None
    font_size: float | None = None
    text_color: str | None = None
    text_mode: int | None = None
    canvas_overlay: dict | None = None


class RecalibrateIn(BaseModel):
    new_page_count: int = Field(ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)


class UpdateBookIn(BaseModel):
    visibility: str | None = Field(default=None, pattern=r"^(public|private)$")


# ── Response schemas ──────────────────────────────────────────────────────────

class ArcStageOut(BaseModel):
    name: str
    description: str
    page_span: int


class BriefOut(BaseModel):
    title: str
    description: str
    characters_intro: list[str]
    themes: list[str]
    lesson: str
    arc: list[ArcStageOut]


class CharacterOut(BaseModel):
    id: uuid.UUID
    name: str
    is_protagonist: bool
    role_description: str
    personality: str
    visual_anchors: list[str]
    illustration_prompt: str
    reference_image_key: str | None = Field(default=None, exclude=True)
    has_reference_image: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _set_has_ref_image(self) -> "CharacterOut":
        self.has_reference_image = self.reference_image_key is not None
        return self


class PageOut(BaseModel):
    id: uuid.UUID
    order: int
    is_cover: bool
    is_back_cover: bool = False
    is_locked: bool
    narrative_role: str = ""
    beat: str = ""
    emotional_note: str = ""
    characters_present: list[str] = Field(default_factory=list)
    setting_note: str = ""
    text: str | None
    word_count: int | None
    illustration_metadata: IllustrationMetadata | None
    image_key: str | None = Field(default=None, exclude=True)
    has_image: bool = False
    audio_key: str | None = Field(default=None, exclude=True)
    has_audio: bool = False
    text_align: str = "center"
    text_position: str = "bottom"
    canvas_overlay: dict | None = None
    font_size: float | None = None
    font_family: str | None = None
    text_color: str | None = None
    text_mode: int | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _set_flags(self) -> "PageOut":
        self.has_image = self.image_key is not None
        self.has_audio = self.audio_key is not None
        return self


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
    visibility: str
    stage: GenerationStage
    error: str | None
    brief: BriefOut | None
    characters: list[CharacterOut]
    pages: list[PageOut]
    created_at: datetime
    updated_at: datetime
    child_profile_id: uuid.UUID | None = None
    author_name: str | None = None

    model_config = {"from_attributes": True}


class BookSummaryOut(BaseModel):
    """Lightweight representation for list endpoints."""
    id: uuid.UUID
    title: str
    age_range: str
    art_style: str
    page_count: int
    visibility: str
    stage: GenerationStage
    illustrated_page_count: int = 0
    cover_image_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageCountOptionsOut(BaseModel):
    options: list[int]
    default: int
    min: int
    max: int


class BrainstormIn(BaseModel):
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list)
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"


class StorySeedOut(BaseModel):
    title: str
    hook: str


class BrainstormOut(BaseModel):
    seeds: list[StorySeedOut]


class ExpandPromptIn(BaseModel):
    raw_prompt: str = Field(min_length=3, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"


class ExpandedPromptOut(BaseModel):
    title: str
    story_concept: str
    key_characters: list[str]
    story_highlights: list[str]
    themes: list[str]
    visual_style: str


class BriefGenerateIn(BaseModel):
    raw_prompt: str = Field(min_length=10, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"
    expanded_concept: ExpandedPromptOut | None = None


class BriefOptionsOut(BaseModel):
    briefs: list[BriefOut]


class BriefFieldRegenerateIn(BaseModel):
    raw_prompt: str = Field(min_length=10, max_length=2000)
    age_range: str = Field(pattern=r"^(3-5|6-8|9-11)$")
    tone: list[str] = Field(default_factory=list)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"
    current_brief: BriefOut
    field: str = Field(description="One of: title, description, characters_intro, themes, lesson")


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
    tone: list[str] = Field(default_factory=list)
    safety_mode: bool = True
    page_count: int = Field(default=DEFAULT_PAGE_COUNT, ge=MIN_PAGE_COUNT, le=MAX_PAGE_COUNT)
    model_provider: str = "gemini"
    model_name: str = "gemini-3.5-flash"
    child_profile_id: uuid.UUID | None = None
    author_name: str | None = None


class GenerateIn(BaseModel):
    art_style: str = Field(min_length=3, max_length=100)


class NarrateIn(BaseModel):
    voice_name: str = "Kore"
    voice_profile_id: uuid.UUID | None = None  # User's cloned voice — overrides voice_name when set


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
