"""
Generation schemas.

Design principle: schema defines *structure*, Gemini authors *content*.
  - Typed containers (list[ArcStage], list[CharacterSheet])
  - Freeform string fields for all narrative content
  - No field names that prescribe story shape (no "setup", "confrontation", etc.)
  - Literals / enums only for operational values code actually branches on
"""

from pydantic import BaseModel, Field


# ── Stage 0a: Brainstorm (idea sparks shown before user writes prompt) ─────────

class StorySeed(BaseModel):
    title: str = Field(description="A short, catchy title (4–7 words) that would look great on a book cover")
    hook: str = Field(description="One sentence (max 20 words) describing the core story — specific, vivid, and irresistible")


class BrainstormResult(BaseModel):
    seeds: list[StorySeed] = Field(description="Exactly 6 distinct story seeds. Each must be meaningfully different in protagonist, setting, or premise.")


# ── Stage 0b: Prompt Expansion (user-facing concept preview before the brief) ──

class ExpandedPrompt(BaseModel):
    title: str = Field(description="A compelling, specific title for this story")
    story_concept: str = Field(
        description="2–3 vivid paragraphs describing the story, who it follows, what they do, "
                    "and how it ends. Write it the way you'd pitch it to a publisher — exciting, warm, specific."
    )
    key_characters: list[str] = Field(
        description="One line per character: 'Name – personality and role in the story'. 2–4 characters only."
    )
    story_highlights: list[str] = Field(
        description="6–8 key scene highlights that show the most exciting or heartwarming moments of the story. "
                    "Concrete and specific — each one should make the reader want to see that page."
    )
    themes: list[str] = Field(description="4–6 core themes as short phrases, e.g. 'Friendship', 'Trying again'")
    visual_style: str = Field(
        description="Art direction in one sentence — style, mood, and colour palette. "
                    "E.g. 'Warm Pixar-style 3D animation with golden-hour lighting and bright summer colours.'"
    )


class ExpandedPromptOptions(BaseModel):
    """Two meaningfully different concept takes on the same idea."""
    concepts: list[ExpandedPrompt] = Field(
        description="Exactly 2 distinct concepts. Same core idea from the user, but explored differently — "
                    "e.g. different protagonist perspective, different tone, different story arc shape, or different setting angle. "
                    "Both must be faithful to the user's idea."
    )


# ── Stage 1: Prompt Enhancement ───────────────────────────────────────────────

class ArcStage(BaseModel):
    name: str = Field(description="Stage name chosen by the model — e.g. 'The Ordinary World', 'The Call', 'The Return'")
    description: str = Field(description="What happens emotionally and narratively in this stage")
    page_span: int = Field(description="How many content pages this stage should occupy")


class StoryBrief(BaseModel):
    title: str
    description: str = Field(description="2–3 plain sentences describing what happens in the story from start to finish. No jargon. A parent should be able to read this and immediately know what the book is about.")
    characters_intro: list[str] = Field(description="One line per character: 'Name – one or two plain traits'. Example: 'Olivia – cheerful and curious, always ready to try something new'")
    themes: list[str] = Field(description="3–5 plain theme words or short phrases. Example: ['Friendship', 'Teamwork', 'Trying new things']")
    lesson: str = Field(description="The lesson in one plain sentence a child would say out loud. Example: 'Friends can do amazing things when they help each other.'")
    arc: list[ArcStage] = Field(description="Ordered list of arc stages. Names and count determined by the story. page_span values must sum to the requested page count.")


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


# ── Stage 5: Text Polish ─────────────────────────────────────────────────────

class PolishedText(BaseModel):
    text: str = Field(description="The fully polished, humanised page text. Same meaning and scene as the input — just more alive.")


# ── Stage 6: Auto-Review ─────────────────────────────────────────────────────

class PageReview(BaseModel):
    order: int = Field(description="Page order number (matches GeneratedPage.order)")
    score: int = Field(description="Quality score 1-5: 5=publish-ready, 4=good, 3=needs work, 1-2=must rewrite")
    issues: list[str] = Field(description="Concrete problems found — e.g. 'word too complex: peculiar', 'sentence too long (18 words)', 'emotion stated not shown'")
    rewrite: str | None = Field(
        default=None,
        description="Full replacement text for this page. Only provided when score is 3 or below. "
                    "Same scene, simpler words, shorter sentences. Output ONLY the text, no quotes or explanation."
    )


class BookReview(BaseModel):
    page_reviews: list[PageReview] = Field(description="One entry per non-cover page in the book")


# ── Stage 7: Recalibration ────────────────────────────────────────────────────

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
