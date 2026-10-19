"""
Subscription tier definitions — single source of truth for limits and features.

3-tier model:
  free       — 6 pages, 1 book, no remakes / narration / parent mode
  storyteller— $9.99/mo, 24 pages, 1 remake/page, parent mode, no narration
  studio     — $15.99/mo, 24 pages, 1 remake/page, parent mode, preset narration
"""
from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class TierConfig:
    name: str
    display_name: str
    price_usd: float
    page_pool: int           # pages per billing period
    hard_max_per_book: int   # absolute per-book ceiling (abuse guard)
    books_per_month: int | None  # None = unlimited (pool-limited)
    narration: bool
    avatars: bool
    pro_model: bool
    priority_queue: bool
    commercial_license: bool
    voice_count: int
    art_style_count: int
    parent_mode: bool = False       # advanced editing (layouts, fonts, colors)
    remakes_per_page: int = 0       # free image remakes allowed per page
    avatars_per_month: int = 0      # AI avatar generations allowed per billing period


TIERS: Final[dict[str, TierConfig]] = {
    "free": TierConfig(
        name="free",
        display_name="Free",
        price_usd=0.0,
        page_pool=6,
        hard_max_per_book=6,
        books_per_month=1,
        narration=False,
        avatars=True,
        pro_model=False,
        priority_queue=False,
        commercial_license=False,
        voice_count=1,
        art_style_count=3,
        parent_mode=False,
        remakes_per_page=0,
        avatars_per_month=1,
    ),
    "storyteller": TierConfig(
        name="storyteller",
        display_name="Storyteller",
        price_usd=9.99,
        page_pool=24,
        hard_max_per_book=12,
        books_per_month=None,
        narration=False,
        avatars=True,
        pro_model=True,
        priority_queue=False,
        commercial_license=False,
        voice_count=1,
        art_style_count=8,
        parent_mode=True,
        remakes_per_page=1,
        avatars_per_month=2,
    ),
    "studio": TierConfig(
        name="studio",
        display_name="Studio",
        price_usd=15.99,
        page_pool=24,
        hard_max_per_book=12,
        books_per_month=None,
        narration=True,
        avatars=True,
        pro_model=True,
        priority_queue=False,
        commercial_license=False,
        voice_count=3,
        art_style_count=8,
        parent_mode=True,
        remakes_per_page=1,
        avatars_per_month=3,
    ),
}

TIER_ORDER = ["free", "storyteller", "studio"]


@dataclass(frozen=True)
class PagePack:
    name: str
    display_name: str
    pages: int
    price_usd: float


# Prepaid page packs — one-time purchases that add to a user's page balance and
# persist across billing cycles (consumed after the monthly pool is used up).
PAGE_PACKS: Final[dict[str, PagePack]] = {
    "mini":  PagePack(name="mini",  display_name="Mini Pack",  pages=10, price_usd=4.99),
    "value": PagePack(name="value", display_name="Value Pack", pages=25, price_usd=9.99),
    "bulk":  PagePack(name="bulk",  display_name="Bulk Pack",  pages=60, price_usd=19.99),
}

PACK_ORDER = ["mini", "value", "bulk"]


def get_pack(name: str) -> PagePack | None:
    return PAGE_PACKS.get(name)

# Back-compat: map any legacy tier names still stored on existing users
# onto the closest new tier so nobody loses access on the cut-over.
_LEGACY_ALIASES: Final[dict[str, str]] = {
    "starter": "storyteller",
    "family": "studio",
    "creator": "studio",
}


def get_tier(name: str) -> TierConfig:
    resolved = _LEGACY_ALIASES.get(name, name)
    return TIERS.get(resolved, TIERS["free"])
