from typing import Final

# ── Word limits per page by age range ────────────────────────────────────────
# Kept here as the single source of truth. Never exposed as a user-facing setting.
WORD_LIMITS: Final[dict[str, tuple[int, int]]] = {
    "3-5":  (10,  20),   # 1–2 short sentences, toddler read-aloud
    "6-8":  (25,  45),   # 2–3 sentences, early reader
    "9-11": (50,  90),   # 3–4 sentences, middle-grade; long beats split into 2 pages
}

# ── Page-split threshold ───────────────────────────────────────────────────────
# When generated page text exceeds this word count the pipeline splits it into
# two pages, each with its own illustration.  Use 9999 to disable for an age group.
PAGE_SPLIT_THRESHOLD: Final[dict[str, int]] = {
    "3-5":  9999,   # always short — never split
    "6-8":  9999,   # fits comfortably — never split
    "9-11": 110,    # 90-word max → split if the LLM writes ≥ 110 words
}

# ── Page count ────────────────────────────────────────────────────────────────
DEFAULT_PAGE_COUNT: Final[int] = 10
MIN_PAGE_COUNT: Final[int] = 4
MAX_PAGE_COUNT: Final[int] = 100
PAGE_COUNT_OPTIONS: Final[list[int]] = [6, 8, 10, 12, 15, 20, 24, 30, 40]

# ── Gemini models ─────────────────────────────────────────────────────────────
# Flash: fast, cheap — good for structured tasks (outline, enhance, recalibrate)
# Pro:   richer creative writing — better for character & page text generation
GEMINI_FLASH: Final[str] = "gemini-3.5-flash"
GEMINI_PRO: Final[str] = "gemini-3.1-pro-preview"

# ── Generation temperatures ───────────────────────────────────────────────────
TEMP_ENHANCE: Final[float] = 0.85      # creative brief expansion
TEMP_CHARACTERS: Final[float] = 0.80   # character invention
TEMP_OUTLINE: Final[float] = 0.75      # structural, still imaginative
TEMP_PAGES: Final[float] = 0.90        # prose — needs most creative latitude
TEMP_RECALIBRATE: Final[float] = 0.60  # editorial restructuring — more deterministic
TEMP_REVIEW: Final[float] = 0.40       # review + rewrite — accuracy over creativity

# ── Concurrency ───────────────────────────────────────────────────────────────
# Max simultaneous Gemini calls during page text generation
PAGE_GEN_CONCURRENCY: Final[int] = 4
