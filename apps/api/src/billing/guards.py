"""
Billing guards — FastAPI-friendly helpers that enforce tier limits before generation.
Call these at the top of any endpoint that consumes resources.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.billing.tiers import get_tier


def require_feature(user: User, feature: str) -> None:
    """Raise 402 if the user's tier doesn't include the given feature."""
    if user.bypass_limits:
        return
    tier = get_tier(user.subscription_tier)
    if not getattr(tier, feature, False):
        tier_name = tier.display_name
        raise HTTPException(
            status_code=402,
            detail=f"Your {tier_name} plan doesn't include this feature. Upgrade to unlock it.",
        )


def require_active_subscription(user: User) -> None:
    """Raise 402 if subscription is past_due (access grace period has ended)."""
    if user.bypass_limits:
        return
    if user.subscription_status == "past_due" and user.subscription_tier != "free":
        raise HTTPException(
            status_code=402,
            detail="Your payment is past due. Please update your billing information to continue.",
        )


def check_page_pool(user: User, pages: int = 1) -> None:
    """Raise 402 if the user has used up their page pool."""
    if user.bypass_limits:
        return
    tier = get_tier(user.subscription_tier)
    remaining = max(0, tier.page_pool - user.page_pool_used)
    if remaining < pages:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Page pool exhausted — you've used all {tier.page_pool} pages for this period. "
                f"Upgrade your plan or wait for your pool to reset."
            ),
        )


def check_book_page_limit(user: User, page_count: int) -> None:
    """Raise 400 if page_count exceeds the tier's per-book hard maximum."""
    if user.bypass_limits:
        return
    tier = get_tier(user.subscription_tier)
    if page_count > tier.hard_max_per_book:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Your {tier.display_name} plan allows up to {tier.hard_max_per_book} pages per book. "
                f"Upgrade to create longer books."
            ),
        )


async def deduct_page_pool(db: AsyncSession, user_id: uuid.UUID, pages: int = 1) -> None:
    """Increment page_pool_used after a successful generation. Non-fatal on error."""
    try:
        user = await db.get(User, user_id)
        if user and not user.bypass_limits:
            user.page_pool_used = user.page_pool_used + pages
            await db.commit()
    except Exception:
        pass  # pool accounting failure should never block the user
