"""
Subscription tier definitions — single source of truth for limits and features.
"""
from dataclasses import dataclass, field
from typing import Final


@dataclass(frozen=True)
class TierConfig:
    name: str
    display_name: str
    price_usd: float
    page_pool: int           # pages per billing period
    hard_max_per_book: int   # absolute per-book ceiling (abuse guard)
    books_per_month: int | None  # None = unlimited
    narration: bool
    avatars: bool
    pro_model: bool
    priority_queue: bool
    commercial_license: bool
    voice_count: int
    art_style_count: int


TIERS: Final[dict[str, TierConfig]] = {
    "free": TierConfig(
        name="free",
        display_name="Free",
        price_usd=0.0,
        page_pool=24,
        hard_max_per_book=8,
        books_per_month=3,
        narration=False,
        avatars=False,
        pro_model=False,
        priority_queue=False,
        commercial_license=False,
        voice_count=1,
        art_style_count=3,
    ),
    "starter": TierConfig(
        name="starter",
        display_name="Starter",
        price_usd=9.99,
        page_pool=100,
        hard_max_per_book=15,
        books_per_month=10,
        narration=True,
        avatars=False,
        pro_model=True,
        priority_queue=False,
        commercial_license=False,
        voice_count=3,
        art_style_count=8,
    ),
    "family": TierConfig(
        name="family",
        display_name="Family",
        price_usd=17.99,
        page_pool=250,
        hard_max_per_book=25,
        books_per_month=20,
        narration=True,
        avatars=True,
        pro_model=True,
        priority_queue=False,
        commercial_license=False,
        voice_count=5,
        art_style_count=8,
    ),
    "creator": TierConfig(
        name="creator",
        display_name="Creator",
        price_usd=34.99,
        page_pool=600,
        hard_max_per_book=40,
        books_per_month=None,
        narration=True,
        avatars=True,
        pro_model=True,
        priority_queue=True,
        commercial_license=True,
        voice_count=5,
        art_style_count=8,
    ),
}

TIER_ORDER = ["free", "starter", "family", "creator"]


def get_tier(name: str) -> TierConfig:
    return TIERS.get(name, TIERS["free"])
