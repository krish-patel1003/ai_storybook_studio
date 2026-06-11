"""
KDP (Kindle Direct Publishing) field generation.

Generates copy-ready publishing metadata from a book's brief, characters,
and settings. Most fields are derived deterministically; the description,
subtitle, keywords, and categories are produced by a single LLM call.
Results are cached on the Book.kdp_fields column so subsequent visits
are instant.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from src.auth.models import User
from src.books.models import Book


# ── LLM output schema ─────────────────────────────────────────────────────────

class KDPLLMFields(BaseModel):
    subtitle: str = Field(
        description="Punchy subtitle for the book, 50 characters max. "
                    "No punctuation at the end. No em-dashes."
    )
    description_html: str = Field(
        description="Amazon book description, 300–500 words. "
                    "Use only these HTML tags: <p>, <b>, <em>, <br/>. "
                    "Open with a hook sentence. Include the protagonist, the problem, "
                    "and the emotional journey without spoiling the ending. "
                    "Close with an age/occasion recommendation. "
                    "No em-dashes, no semicolons, no AI-sounding phrases."
    )
    keywords: list[str] = Field(
        description="Exactly 7 search keywords for Amazon. "
                    "Each keyword can be a phrase (2-4 words). "
                    "Do NOT repeat words from the title. "
                    "Focus on: theme, setting, character type, age group, occasion, emotion, reading level. "
                    "Example: ['bedtime story adventure', 'brave girl detective', 'mystery picture book']"
    )
    primary_category: str = Field(
        description="Best Amazon children's book category path. "
                    "Format: 'Books > Children's Books > [Subcategory] > [Sub-subcategory]'. "
                    "Choose the most specific path that fits."
    )
    secondary_category: str = Field(
        description="Second Amazon children's book category path — complementary to the primary. "
                    "Must be different from the primary category."
    )


# ── Partial update schema (all fields optional) ───────────────────────────────

class KDPUpdateIn(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    author: str | None = None
    description_html: str | None = None
    primary_category: str | None = None
    secondary_category: str | None = None
    keywords: list[str] | None = None
    reading_age_min: int | None = None
    reading_age_max: int | None = None
    grade_range: str | None = None
    language: str | None = None
    trim_size: str | None = None
    interior_type: str | None = None
    paper_color: str | None = None
    estimated_page_count: int | None = None
    publishing_rights: str | None = None
    territories: str | None = None
    royalty_plan: str | None = None
    suggested_price_usd: str | None = None


# ── Full response schema ───────────────────────────────────────────────────────

class KDPOut(BaseModel):
    # Book Details
    title: str
    subtitle: str
    author: str
    description_html: str

    # Categories & Keywords
    primary_category: str
    secondary_category: str
    keywords: list[str]

    # Target Audience
    reading_age_min: int
    reading_age_max: int
    grade_range: str
    language: str

    # Print Settings
    trim_size: str
    interior_type: str
    paper_color: str
    estimated_page_count: int

    # Rights & Pricing
    publishing_rights: str
    territories: str
    royalty_plan: str
    suggested_price_usd: str

    # Meta
    is_cached: bool


# ── Lookup tables ──────────────────────────────────────────────────────────────

_AGE_MAP: dict[str, dict] = {
    "3-5": {"min": 3, "max": 5, "grade": "Pre-K – Kindergarten"},
    "6-8": {"min": 6, "max": 8, "grade": "1st – 3rd Grade"},
    "9-11": {"min": 9, "max": 11, "grade": "4th – 6th Grade"},
}

_DEFAULT_AGE = {"min": 4, "max": 8, "grade": "Pre-K – 3rd Grade"}


def _price_suggestion(page_count: int) -> str:
    """Suggest a list price based on page count (print picture book norms)."""
    if page_count <= 8:
        return "$8.99"
    elif page_count <= 12:
        return "$9.99"
    elif page_count <= 16:
        return "$11.99"
    elif page_count <= 20:
        return "$12.99"
    else:
        return "$14.99"


# ── LLM system prompt ─────────────────────────────────────────────────────────

_KDP_SYSTEM = """\
You are an expert Amazon KDP publishing consultant and children's book marketing specialist.

Your job is to generate copy-ready KDP metadata for a children's picture book. \
Every field you write will be pasted directly into Amazon KDP with no editing.

RULES:
- The description must open with a compelling hook (a question or a vivid situation).
- The description must NOT spoil the ending or the resolution.
- Use Amazon-friendly HTML: <p>, <b>, <em>, <br/> only. No other tags.
- Keywords must be what a parent or gift-buyer would actually search for on Amazon. \
  No generic terms like "children book" or "kids story" — those are too broad to rank.
- Categories must be real Amazon category paths for children's books.
- Subtitle must fit on a book cover — punchy, memorable, under 50 characters.
- NO em-dashes (—), NO semicolons, NO AI-sounding phrases like "embarks on a journey" \
  or "discovers the true meaning of".
- Write like a real publisher, not like an AI.
"""


# ── Main generation function ───────────────────────────────────────────────────

async def generate_kdp_fields(
    book: Book,
    user: User,
    llm_client,  # LLMClient — avoid circular import by not type-hinting
    force: bool = False,
) -> KDPOut:
    """
    Return KDP fields for the given book.
    Uses cached result unless force=True or no cache exists.
    Stores the result back to book.kdp_fields (caller must commit the session).
    """
    from src.generation.constants import GEMINI_FLASH

    # ── Return cached ─────────────────────────────────────────────────────────
    if not force and book.kdp_fields:
        data = book.kdp_fields
        return KDPOut(**data, is_cached=True)

    # ── Deterministic fields ──────────────────────────────────────────────────
    brief = book.brief or {}
    age_info = _AGE_MAP.get(book.age_range, _DEFAULT_AGE)
    estimated_pages = book.page_count + 4  # front matter + back cover

    # ── Build LLM prompt ─────────────────────────────────────────────────────
    char_lines = "\n".join(
        f"  - {c.name} ({'protagonist' if c.is_protagonist else 'supporting'}): {c.role_description}"
        for c in book.characters
    ) or "  (characters not yet generated)"

    tone_str = ", ".join(book.tone) if book.tone else "not specified"

    user_prompt = f"""\
Generate KDP publishing metadata for this children's picture book:

TITLE: {brief.get('title') or book.title}
STORY: {brief.get('description', 'Not available')}
LESSON: {brief.get('lesson', 'Not available')}
THEMES: {', '.join(brief.get('themes', [])) or 'Not available'}
AGE RANGE: {book.age_range} years old
TONE: {tone_str}
ART STYLE: {book.art_style}
PAGE COUNT: {book.page_count} pages

CHARACTERS:
{char_lines}

Generate a subtitle, Amazon HTML description, 7 keywords, and 2 category paths.
"""

    # ── LLM call ──────────────────────────────────────────────────────────────
    llm_fields: KDPLLMFields = await llm_client.generate(
        prompt=user_prompt,
        schema=KDPLLMFields,
        system=_KDP_SYSTEM,
        model=GEMINI_FLASH,
        temperature=0.65,
    )

    # ── Assemble full response ────────────────────────────────────────────────
    out = KDPOut(
        # Book Details
        title=brief.get("title") or book.title,
        subtitle=llm_fields.subtitle,
        author=user.pen_name,
        description_html=llm_fields.description_html,

        # Categories & Keywords
        primary_category=llm_fields.primary_category,
        secondary_category=llm_fields.secondary_category,
        keywords=llm_fields.keywords[:7],  # enforce max 7

        # Target Audience
        reading_age_min=age_info["min"],
        reading_age_max=age_info["max"],
        grade_range=age_info["grade"],
        language="English",

        # Print Settings
        trim_size="8.5 × 8.5 inches",
        interior_type="Full Color",
        paper_color="White",
        estimated_page_count=estimated_pages,

        # Rights & Pricing
        publishing_rights=(
            "I own the copyright and I hold the necessary publishing rights."
        ),
        territories="All territories",
        royalty_plan="60% royalty (print) · 70% royalty (eBook)",
        suggested_price_usd=_price_suggestion(book.page_count),

        is_cached=False,
    )

    # ── Cache on the book record (caller commits) ─────────────────────────────
    cache_data = out.model_dump()
    cache_data.pop("is_cached")
    book.kdp_fields = cache_data

    return out
