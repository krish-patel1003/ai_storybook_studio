"""
Stripe billing service — customer, checkout session, and customer portal management.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.billing.tiers import get_tier
from src.config import settings

logger = logging.getLogger(__name__)


def _stripe() -> stripe.Stripe:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured — STRIPE_SECRET_KEY is missing.")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _price_id(tier: str) -> str:
    mapping = {
        "storyteller": settings.STRIPE_PRICE_STORYTELLER,
        "studio":      settings.STRIPE_PRICE_STUDIO,
        # legacy aliases → new prices (in case an old client posts an old name)
        "starter":     settings.STRIPE_PRICE_STORYTELLER,
        "family":      settings.STRIPE_PRICE_STUDIO,
        "creator":     settings.STRIPE_PRICE_STUDIO,
    }
    price_id = mapping.get(tier, "")
    if not price_id:
        raise ValueError(f"No Stripe price configured for tier '{tier}'. Set STRIPE_PRICE_{tier.upper()}.")
    return price_id


def _pack_price_id(pack: str) -> str:
    mapping = {
        "mini":  settings.STRIPE_PRICE_PACK_MINI,
        "value": settings.STRIPE_PRICE_PACK_VALUE,
        "bulk":  settings.STRIPE_PRICE_PACK_BULK,
    }
    price_id = mapping.get(pack, "")
    if not price_id:
        raise ValueError(f"No Stripe price configured for pack '{pack}'. Set STRIPE_PRICE_PACK_{pack.upper()}.")
    return price_id


async def get_or_create_customer(db: AsyncSession, user: User) -> str:
    """Return existing Stripe customer_id or create a new one."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    _stripe()
    customer = stripe.Customer.create(
        email=user.email,
        name=user.username,
        metadata={"user_id": str(user.id)},
    )
    user.stripe_customer_id = customer.id
    await db.commit()
    logger.info("Created Stripe customer %s for user %s", customer.id, user.id)
    return customer.id


async def create_checkout_session(
    db: AsyncSession,
    user: User,
    tier: str,
    success_url: str,
    cancel_url: str,
) -> str:
    """Create a Stripe Checkout session and return the redirect URL."""
    _stripe()
    customer_id = await get_or_create_customer(db, user)
    price_id = _price_id(tier)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        subscription_data={
            "metadata": {"user_id": str(user.id), "tier": tier},
        },
        allow_promotion_codes=True,
    )
    return session.url


async def create_pack_checkout_session(
    db: AsyncSession,
    user: User,
    pack: str,
    success_url: str,
    cancel_url: str,
) -> str:
    """Create a one-time (mode=payment) Stripe Checkout session for a page pack."""
    from src.billing.tiers import get_pack
    _stripe()
    pack_cfg = get_pack(pack)
    if pack_cfg is None:
        raise ValueError(f"Unknown page pack '{pack}'")
    customer_id = await get_or_create_customer(db, user)
    price_id = _pack_price_id(pack)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        payment_intent_data={
            "metadata": {"user_id": str(user.id), "pack": pack, "pages": str(pack_cfg.pages)},
        },
        metadata={"user_id": str(user.id), "pack": pack, "pages": str(pack_cfg.pages)},
        allow_promotion_codes=True,
    )
    return session.url


async def credit_topup_pages(db: AsyncSession, user_id: str, pages: int) -> None:
    """Add prepaid pages to a user's top-up balance (called from the webhook)."""
    import uuid as _uuid
    user = await db.get(User, _uuid.UUID(str(user_id)))
    if not user:
        logger.warning("Top-up credit for unknown user %s", user_id)
        return
    user.topup_pages_remaining = (user.topup_pages_remaining or 0) + int(pages)
    await db.commit()
    logger.info("Credited %s top-up pages to user %s (now %s)", pages, user_id, user.topup_pages_remaining)


async def create_portal_session(db: AsyncSession, user: User, return_url: str) -> str:
    """Create a Stripe Customer Portal session and return the redirect URL."""
    _stripe()
    customer_id = await get_or_create_customer(db, user)
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


async def apply_subscription(
    db: AsyncSession,
    user: User,
    tier: str,
    stripe_subscription_id: str,
    status: str,
    period_end: datetime | None,
) -> None:
    """Update user record with new subscription state. Resets page pool on new period."""
    old_tier = user.subscription_tier
    user.subscription_tier = tier
    user.stripe_subscription_id = stripe_subscription_id
    user.subscription_status = status
    user.subscription_period_end = period_end

    # Reset page pool when a new billing period starts (or on first subscription)
    if old_tier != tier or user.page_pool_reset_at is None:
        user.page_pool_used = 0
        user.page_pool_reset_at = period_end
        # Keep the AI-avatar allowance on the same billing cadence.
        user.avatars_used = 0
        user.avatars_reset_at = period_end

    await db.commit()
    logger.info("Updated subscription for user %s: tier=%s status=%s", user.id, tier, status)


async def reset_page_pool(db: AsyncSession, user: User, new_period_end: datetime) -> None:
    """Reset page pool at the start of a new billing period."""
    user.page_pool_used = 0
    user.page_pool_reset_at = new_period_end
    # AI-avatar allowance renews on the same billing period.
    user.avatars_used = 0
    user.avatars_reset_at = new_period_end
    await db.commit()
    logger.info("Reset page pool for user %s, next reset=%s", user.id, new_period_end)


async def cancel_subscription(db: AsyncSession, user: User) -> None:
    """Downgrade user to free tier when subscription is canceled/expired."""
    user.subscription_tier = "free"
    user.subscription_status = "canceled"
    user.stripe_subscription_id = None
    user.subscription_period_end = None
    user.page_pool_used = 0
    user.page_pool_reset_at = None
    # Reset the avatar allowance too; the free tier's monthly window restarts lazily.
    user.avatars_used = 0
    user.avatars_reset_at = None
    await db.commit()
    logger.info("Canceled subscription for user %s, downgraded to free", user.id)


async def record_purchase(
    db: AsyncSession,
    user_id,
    *,
    kind: str,
    description: str,
    amount_cents: int,
    currency: str = "usd",
    tier: str | None = None,
    pages: int | None = None,
    stripe_id: str | None = None,
) -> None:
    """Record a completed payment for the account's billing history. Idempotent
    on stripe_id (repeated webhook deliveries won't create duplicates)."""
    try:
        from sqlalchemy import select
        from src.billing.models import Purchase
        if stripe_id:
            exists = (await db.execute(select(Purchase.id).where(Purchase.stripe_id == stripe_id))).first()
            if exists:
                return
        db.add(Purchase(
            user_id=user_id, kind=kind, description=description[:120],
            amount_cents=max(0, int(amount_cents or 0)), currency=(currency or "usd").lower(),
            tier=tier, pages=pages, stripe_id=stripe_id,
        ))
        await db.commit()
    except Exception:
        logger.exception("Failed to record purchase (stripe_id=%s)", stripe_id)
