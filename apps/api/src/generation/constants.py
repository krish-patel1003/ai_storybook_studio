from typing import Final

# ── Word limits per page by age range ────────────────────────────────────────
# Kept here as the single source of truth. Never exposed as a user-facing setting.
WORD_LIMITS: Final[dict[str, tuple[int, int]]] = {
    "3-5":  (20,  35),
    "6-8":  (45,  70),
    "9-11": (80, 120),
}

# ── Page count ────────────────────────────────────────────────────────────────
DEFAULT_PAGE_COUNT: Final[int] = 10
MIN_PAGE_COUNT: Final[int] = 6
MAX_PAGE_COUNT: Final[int] = 20
PAGE_COUNT_OPTIONS: Final[list[int]] = [6, 8, 10, 12, 15, 20]

# ── Gemini models ─────────────────────────────────────────────────────────────
# Flash: fast, cheap — good for structured tasks (outline, enhance, recalibrate)
# Pro:   richer creative writing — better for character & page text generation
GEMINI_FLASH: Final[str] = "gemini-2.0-flash"
GEMINI_PRO: Final[str] = "gemini-1.5-pro"

# ── Generation temperatures ───────────────────────────────────────────────────
TEMP_ENHANCE: Final[float] = 0.85      # creative brief expansion
TEMP_CHARACTERS: Final[float] = 0.80   # character invention
TEMP_OUTLINE: Final[float] = 0.75      # structural, still imaginative
TEMP_PAGES: Final[float] = 0.90        # prose — needs most creative latitude
TEMP_RECALIBRATE: Final[float] = 0.60  # editorial restructuring — more deterministic

# ── Concurrency ───────────────────────────────────────────────────────────────
# Max simultaneous Gemini calls during page text generation
PAGE_GEN_CONCURRENCY: Final[int] = 4
