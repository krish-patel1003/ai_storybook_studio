"""
Generation schemas.

Design principle: schema defines *structure*, Gemini authors *content*.
  - Typed containers (list[ArcStage], list[CharacterSheet])
  - Freeform string fields for all narrative content
  - No field names that prescribe story shape (no "setup", "confrontation", etc.)
  - Literals / enums only for operational values code actually branches on
"""

from pydantic import BaseModel, Field


# ── Stage 1: Prompt Enhancement ───────────────────────────────────────────────

class ArcStage(BaseModel):
    name: str = Field(description="Stage name chosen by the model — e.g. 'The Ordinary World', 'The Call', 'The Return'")
    description: str = Field(description="What happens emotionally and narratively in this stage")
    page_span: int = Field(description="How many content pages this stage should occupy")


class StoryBrief(BaseModel):
    title: str
    logline: str = Field(description="One sentence: the whole story compressed to its emotional core")
    central_conflict: str = Field(description="The core dramatic tension the protagonist must navigate")
    moral: str = Field(description="The emotional truth the reader arrives at — never stated directly in the story")
    world: str = Field(description="Setting and atmosphere as rich prose — should suggest visual variety across pages")
    narrative_structure: str = Field(description="The structure name the model chooses for this story — e.g. 'Hero's Journey', 'Circular Arc', 'Two-Beat Transformation'")
    arc: list[ArcStage] = Field(description="Ordered list of arc stages — length and names determined by the story, not a fixed template")


# ── Stage 2: Characters ───────────────────────────────────────────────────────

class CharacterSheet(BaseModel):
    name: str
    is_protagonist: bool = Field(description="True for the main character only — used for cover page logic")
    role_description: str = Field(description="Narrative role in the story — freely described, e.g. 'the reluctant mentor who appears at each turning point'")
    personality: str = Field(description="Rich prose describing who this character is — voice, habits, fears, desires")
    visual_anchors: list[str] = Field(
        description="4–6 specific, concrete visual traits locked for illustration consistency. "
                    "Each item is a tight descriptor: 'emerald scales', 'dusty flour-stained apron', 'amber eyes'. "
                    "No vague terms like 'friendly-looking'."
    )
    illustration_prompt: str = Field(
        description="Complete, self-contained description ready for an image generation model. "
                    "Format: [species/type], [physical details], [clothing/accessories], [characteristic expression]. "
                    "Include all visual_anchors."
    )


class CharacterRoster(BaseModel):
    characters: list[CharacterSheet] = Field(description="Full cast — only characters who appear on multiple pages")


# ── Stage 3: Outline / Beats ──────────────────────────────────────────────────

class StoryBeat(BaseModel):
    order: int = Field(description="Page position — 0 is always the cover")
    narrative_role: str = Field(description="Structural label the model assigns — e.g. 'inciting incident', 'midpoint reversal', 'quiet interlude', 'climax'")
    beat: str = Field(description="One sentence: a specific thing that happens on this page")
    emotional_note: str = Field(description="Tonal instruction for the prose writer — specific, e.g. 'quietly triumphant with a hint of disbelief'")
    characters_present: list[str] = Field(description="Character names who appear on this page")
    setting_note: str = Field(description="Where and when — free prose, should suggest a visually distinct scene")


class StoryOutline(BaseModel):
    beats: list[StoryBeat] = Field(description="All beats in order, including cover at index 0")


# ── Stage 4: Page Text + Illustration Metadata ────────────────────────────────

class IllustrationMetadata(BaseModel):
    mood: str = Field(description="Emotional atmosphere — e.g. 'warm and golden', 'tense and fog-shrouded'")
    characters_present: list[str]
    key_visual_elements: list[str] = Field(
        description="Specific things that must appear in the illustration — props, environmental details, actions"
    )
    composition_note: str = Field(
        description="Camera framing and character placement — e.g. 'Bramble fills the foreground pouring tea, the fog presses against the window behind her'"
    )
    assembled_prompt: str = Field(
        description="Complete, ready-to-use image generation prompt. Must include: art style, "
                    "all character visual anchors for present characters, scene description, mood, "
                    "composition, lighting. Self-contained — no external references needed."
    )
    negative_prompt: str = Field(
        description="Visual elements to avoid that might appear by default given the scene content"
    )


class GeneratedPage(BaseModel):
    order: int
    is_cover: bool
    beat_reference: str = Field(description="The beat sentence this page expands")
    text: str = Field(description="The actual page text. Cover page: title only.")
    word_count: int
    illustration_metadata: IllustrationMetadata


# ── Stage 5: Recalibration ────────────────────────────────────────────────────

class RecalibratedBeat(BaseModel):
    order: int
    narrative_role: str
    beat: str
    emotional_note: str
    characters_present: list[str]
    setting_note: str
    provenance: str = Field(
        description="One of: 'preserved' (locked page, unchanged), "
                    "'adapted from page {N}' (evolved from existing beat), "
                    "'new' (genuinely new beat)"
    )


class RecalibratedOutline(BaseModel):
    beats: list[RecalibratedBeat]
    editorial_note: str = Field(
        description="Brief explanation of the key structural decisions made during recalibration"
    )
