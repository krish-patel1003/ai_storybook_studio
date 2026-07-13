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
        "starter": settings.STRIPE_PRICE_STARTER,
        "family":  settings.STRIPE_PRICE_FAMILY,
        "creator": settings.STRIPE_PRICE_CREATOR,
    }
    price_id = mapping.get(tier, "")
    if not price_id:
        raise ValueError(f"No Stripe price configured for tier '{tier}'. Set STRIPE_PRICE_{tier.upper()}.")
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

    await db.commit()
    logger.info("Updated subscription for user %s: tier=%s status=%s", user.id, tier, status)


async def reset_page_pool(db: AsyncSession, user: User, new_period_end: datetime) -> None:
    """Reset page pool at the start of a new billing period."""
    user.page_pool_used = 0
    user.page_pool_reset_at = new_period_end
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
    await db.commit()
    logger.info("Canceled subscription for user %s, downgraded to free", user.id)
