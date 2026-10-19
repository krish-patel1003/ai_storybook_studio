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


def _insufficient_detail(available: int, topup: int, pages: int) -> str:
    incl = f" (includes {topup} top-up)" if topup else ""
    left = f"{available} page{'s' if available != 1 else ''}"
    return (
        f"Not enough pages left — you have {left} remaining this period{incl}, "
        f"but this book needs {pages}. Buy a page pack for more pages, or make a shorter book."
    )


def check_page_pool(user: User, pages: int = 1) -> None:
    """Raise 402 if the user has no pages left (monthly pool + prepaid top-ups).

    Advisory pre-check used at the early planning steps. The authoritative,
    atomic check-and-consume happens in `reserve_pages` when generation commits.
    """
    if user.bypass_limits:
        return
    tier = get_tier(user.subscription_tier)
    monthly_remaining = max(0, tier.page_pool - user.page_pool_used)
    topup = getattr(user, "topup_pages_remaining", 0) or 0
    available = monthly_remaining + topup
    if available < pages:
        raise HTTPException(status_code=402, detail=_insufficient_detail(available, topup, pages))


def check_book_page_limit(user: User, page_count: int) -> None:
    """Raise 402 if page_count exceeds the tier's per-book hard maximum.

    Enforced at the very first generation step (brainstorm/expand/brief/create) so
    no tokens or compute are spent on a book the user can't create on their plan.
    """
    if user.bypass_limits:
        return
    tier = get_tier(user.subscription_tier)
    if page_count > tier.hard_max_per_book:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Your {tier.display_name} plan allows up to {tier.hard_max_per_book} pages per book. "
                f"Upgrade your plan to create longer books."
            ),
        )


def _avatar_status(user: User) -> tuple[int, int]:
    """Return (limit, used) for AI avatar generation this period, applying a
    lazy in-memory reset (not persisted) so reads reflect a fresh allowance once
    the period has rolled over. Does not mutate the DB."""
    from datetime import datetime, timezone
    tier = get_tier(user.subscription_tier)
    limit = tier.avatars_per_month
    reset_at = getattr(user, "avatars_reset_at", None)
    now = datetime.now(timezone.utc)
    if reset_at is None or reset_at <= now:
        return limit, 0
    return limit, (getattr(user, "avatars_used", 0) or 0)


async def check_avatar_quota(db: AsyncSession, user: User) -> None:
    """Raise 402 if the user has no AI avatar generations left this period.

    Performs (and persists) a period reset when due so free users — who have no
    Stripe billing cycle — still get a fresh monthly allowance. Consumption is
    recorded separately via `consume_avatar` only after a successful generation,
    so failures never burn a user's quota.
    """
    if user.bypass_limits:
        return
    from datetime import datetime, timedelta, timezone
    tier = get_tier(user.subscription_tier)
    limit = tier.avatars_per_month
    now = datetime.now(timezone.utc)

    if user.avatars_reset_at is None or user.avatars_reset_at <= now:
        user.avatars_used = 0
        # Align the next reset with the Stripe billing period when we have one;
        # otherwise fall back to a 30-day rolling window (free tier).
        nxt = user.subscription_period_end
        if nxt is None or nxt <= now:
            nxt = now + timedelta(days=30)
        user.avatars_reset_at = nxt
        await db.commit()

    if limit <= 0:
        raise HTTPException(
            status_code=402,
            detail="AI avatars aren't included on your plan. Upgrade to generate custom avatars.",
        )
    if user.avatars_used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"You've used all {limit} AI avatar{'s' if limit != 1 else ''} for this month. "
                "Your allowance renews next billing period — or upgrade your plan for more."
            ),
        )


async def consume_avatar(db: AsyncSession, user: User, count: int = 1) -> None:
    """Record a successful AI avatar generation. Non-fatal on error."""
    try:
        from sqlalchemy import update
        stmt = (
            update(User)
            .where(User.id == user.id, User.bypass_limits.is_(False))
            .values(avatars_used=User.avatars_used + count)
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        pass  # metering failure should never fail the user's generation


async def reserve_pages(db: AsyncSession, user: User, pages: int) -> tuple[int, int]:
    """Atomically reserve `pages` at the moment generation is committed
    (reserve-at-start), closing the race where the old post-generation deduction
    let a second book slip through while the first was still generating.

    The user row is locked with SELECT ... FOR UPDATE so concurrent reservations
    serialize — no over-commit, no silent clamping. The monthly pool is consumed
    first, then the prepaid top-up balance. Returns the exact split actually
    charged `(from_monthly, from_topup)` so a later failure can refund each
    bucket precisely (top-up pages are paid and must not be converted to
    expiring monthly pages). Returns (0, 0) for bypass users. Raises 402 if the
    pool can't cover the request.
    """
    if user.bypass_limits or pages <= 0:
        return (0, 0)
    from sqlalchemy import select
    pool = get_tier(user.subscription_tier).page_pool
    locked = (
        await db.execute(select(User).where(User.id == user.id).with_for_update())
    ).scalar_one()
    monthly_remaining = max(0, pool - locked.page_pool_used)
    topup = locked.topup_pages_remaining or 0
    available = monthly_remaining + topup
    if available < pages:
        await db.rollback()
        raise HTTPException(status_code=402, detail=_insufficient_detail(available, topup, pages))
    from_monthly = min(pages, monthly_remaining)
    from_topup = pages - from_monthly
    locked.page_pool_used += from_monthly
    locked.topup_pages_remaining = topup - from_topup
    await db.commit()
    try:
        from src.metrics import record_pages_reserved
        record_pages_reserved(from_monthly + from_topup)
    except Exception:
        pass
    return (from_monthly, from_topup)


async def refund_pages(db: AsyncSession, user_id: uuid.UUID, from_monthly: int, from_topup: int) -> None:
    """Compensating action: return a previously reserved split to the user's pool
    when the generation it was charged for fails. Restores each bucket exactly —
    monthly to the monthly pool, top-up to the prepaid balance — so paid top-up
    pages are never lost or converted. Non-fatal on error."""
    if from_monthly <= 0 and from_topup <= 0:
        return
    try:
        from sqlalchemy import update, func
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(
                page_pool_used=func.greatest(0, User.page_pool_used - from_monthly),
                topup_pages_remaining=User.topup_pages_remaining + from_topup,
            )
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        pass  # refund failure should not surface to the user


async def deduct_page_pool(db: AsyncSession, user_id: uuid.UUID, pages: int = 1) -> None:
    """Consume pages after a successful generation: monthly pool first, then prepaid
    top-up balance for any overflow. Non-fatal on error."""
    try:
        from sqlalchemy import update, func
        user = await db.get(User, user_id)
        if not user or user.bypass_limits:
            return
        pool = get_tier(user.subscription_tier).page_pool
        # ATOMIC deduction — a single UPDATE whose expressions evaluate against the
        # pre-update row, and which Postgres serializes with a row lock. This avoids
        # the lost-update race when pages are illustrated concurrently (the frontend
        # runs several illustrate requests in parallel). Monthly pool is consumed
        # first, then the prepaid top-up balance absorbs any overflow.
        from_monthly = func.least(pages, func.greatest(0, pool - User.page_pool_used))
        stmt = (
            update(User)
            .where(User.id == user_id, User.bypass_limits.is_(False))
            .values(
                page_pool_used=User.page_pool_used + from_monthly,
                topup_pages_remaining=func.greatest(0, User.topup_pages_remaining - (pages - from_monthly)),
            )
        )
        await db.execute(stmt)
        await db.commit()
    except Exception:
        pass  # pool accounting failure should never block the user
