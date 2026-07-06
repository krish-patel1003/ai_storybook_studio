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
    requirements: list[str] = Field(
        default_factory=list,
        description=(
            "Concrete, non-negotiable deliverables extracted from the user's prompt — things the story MUST contain, "
            "beyond its narrative arc. Each item is a specific, checkable statement. "
            "Examples: 'Coach Priya teaches exactly 2 Hindi words; each word is introduced in the story "
            "with its English meaning explained immediately after', "
            "'Final page is a vocabulary recap listing all 6 foreign words and their meanings'. "
            "Leave empty if the prompt has no structured deliverables beyond 'tell a good story'."
        ),
    )


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
    assembled_prompt: str = Field(
        default="",
        description="Complete, ready-to-use image generation prompt. Must include: art style, "
                    "all character visual anchors for present characters, scene description, mood, "
                    "composition, lighting. Self-contained — no external references needed."
    )
    negative_prompt: str = Field(
        default="",
        description="Visual elements to avoid that might appear by default given the scene content"
    )
    # Optional fields — present on LLM-generated pages, absent on hand-crafted pages (e.g. back cover)
    mood: str = Field(default="", description="Emotional atmosphere — e.g. 'warm and golden', 'tense and fog-shrouded'")
    characters_present: list[str] = Field(default_factory=list)
    key_visual_elements: list[str] = Field(default_factory=list)
    composition_note: str = Field(default="")


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


# ── Stage 7b: Fulfillment Audit ───────────────────────────────────────────────

class RequirementCheck(BaseModel):
    requirement: str = Field(description="The original requirement text, copied verbatim")
    fulfilled: bool = Field(description="True if this requirement is clearly and completely met in the book as written")
    found_on_pages: list[int] = Field(
        default_factory=list,
        description="Page order numbers where this requirement is addressed (may be empty if not fulfilled)"
    )
    gap: str | None = Field(
        default=None,
        description="If not fulfilled: exactly what is missing. E.g. 'Only 1 Hindi word found (koshish); a second Hindi word with meaning is absent'. Null if fulfilled."
    )
    fix_strategy: str | None = Field(
        default=None,
        description=(
            "If not fulfilled: 'patch_page_N' to add content to an existing page, or 'new_page' to insert a "
            "dedicated page. Choose patch when the fix is one sentence; choose new_page when it needs a full page "
            "(e.g. a vocabulary recap). Null if fulfilled."
        )
    )
    patch_target_page: int | None = Field(
        default=None,
        description="If fix_strategy is patch_page_N: the page order number to patch. Null otherwise."
    )


class FulfillmentAudit(BaseModel):
    checks: list[RequirementCheck] = Field(
        description="One entry per requirement in the brief.requirements list, in the same order"
    )


class PagePatch(BaseModel):
    page_order: int
    new_text: str = Field(description="Complete replacement text for this page — same scene, adds the missing content naturally woven in")


# ── Simplified pipeline: BriefStage ──────────────────────────────────────────

class PagePlan(BaseModel):
    order: int = Field(description="Page position — 0 is always the cover")
    narrative_role: str = Field(description="Short structural label — e.g. 'opening', 'rising action', 'climax', 'resolution', 'vocabulary recap'")
    summary: str = Field(description="One sentence: exactly what happens on this page")
    emotional_note: str = Field(description="Tone instruction for the prose writer — e.g. 'warm and excited', 'quietly hopeful', 'triumphant'")
    characters_present: list[str] = Field(description="Character names who appear on this page")
    setting: str = Field(description="Where and when — short phrase, e.g. 'the swimming pool, midday'")

class StoryPlan(BaseModel):
    title: str = Field(description="Final book title")
    characters: list[CharacterSheet] = Field(description="Full cast with visual anchors for illustration consistency. Only recurring characters.")
    pages: list[PagePlan] = Field(description="All pages in order, starting with cover at order=0")


# ── Simplified pipeline: ReviewLoopStage ─────────────────────────────────────

class RequirementScore(BaseModel):
    requirement: str = Field(description="Original requirement text, copied verbatim")
    met: bool = Field(description="True if fully and clearly satisfied in the book as written")
    gap: str | None = Field(default=None, description="If not met: exactly what is missing or insufficient")

class PageScore(BaseModel):
    order: int = Field(description="Page order number")
    prose_score: int = Field(description="Prose quality 1-10: 10=perfect for age group, 7=good, 5=needs work, below 5=must rewrite")
    issues: list[str] = Field(default_factory=list, description="Specific problems: vocabulary too hard, sentence too long, emotion stated not shown, etc.")
    rewrite: str | None = Field(default=None, description="Complete replacement page text — only provided when prose_score < 6. Same scene, better writing.")

class BookScore(BaseModel):
    overall_score: int = Field(description="Overall quality 1-10 averaging requirement fulfillment and prose quality")
    requirement_scores: list[RequirementScore] = Field(default_factory=list)
    page_scores: list[PageScore] = Field(description="One entry per non-cover page")


class NewPage(BaseModel):
    after_order: int = Field(description="Insert this page immediately after the page with this order number")
    narrative_role: str
    text: str = Field(description="Full page text. For a vocab recap: a friendly, child-facing list of words and meanings.")
    illustration_note: str = Field(description="Brief note for the illustrator describing what this page should show")
