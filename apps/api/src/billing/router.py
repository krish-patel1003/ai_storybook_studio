"""
Billing endpoints — Stripe Checkout, Customer Portal, subscription info, and webhook.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_user
from src.auth.models import User
from src.billing import service as billing_service
from src.billing.tiers import TIERS, TIER_ORDER, get_tier
from src.config import settings
from src.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────────

class TierOut(BaseModel):
    name: str
    display_name: str
    price_usd: float
    page_pool: int
    hard_max_per_book: int
    books_per_month: int | None
    narration: bool
    avatars: bool
    pro_model: bool
    priority_queue: bool
    commercial_license: bool
    voice_count: int
    art_style_count: int
    is_current: bool = False


class SubscriptionOut(BaseModel):
    tier: str
    display_name: str
    status: str | None
    page_pool_total: int
    page_pool_used: int
    page_pool_remaining: int
    period_end: str | None
    publishable_key: str
    tiers: list[TierOut]


class CheckoutIn(BaseModel):
    tier: str


class CheckoutOut(BaseModel):
    url: str


class PortalOut(BaseModel):
    url: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionOut)
async def get_subscription(
    user: User = Depends(current_user),
) -> SubscriptionOut:
    """Return the current user's subscription state and all available tiers."""
    tier_cfg = get_tier(user.subscription_tier)
    import dataclasses
    tier_list = [
        TierOut(
            **dataclasses.asdict(TIERS[t]),
            is_current=(t == user.subscription_tier),
        )
        for t in TIER_ORDER
    ]
    remaining = max(0, tier_cfg.page_pool - user.page_pool_used)

    return SubscriptionOut(
        tier=user.subscription_tier,
        display_name=tier_cfg.display_name,
        status=user.subscription_status,
        page_pool_total=tier_cfg.page_pool,
        page_pool_used=user.page_pool_used,
        page_pool_remaining=remaining,
        period_end=user.subscription_period_end.isoformat() if user.subscription_period_end else None,
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        tiers=tier_list,
    )


@router.post("/checkout", response_model=CheckoutOut)
async def create_checkout(
    data: CheckoutIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CheckoutOut:
    """Create a Stripe Checkout session for upgrading to a paid tier."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing is not yet configured.")

    if data.tier not in ("starter", "family", "creator"):
        raise HTTPException(status_code=400, detail="Invalid tier. Choose starter, family, or creator.")

    try:
        url = await billing_service.create_checkout_session(
            db=db,
            user=user,
            tier=data.tier,
            success_url=f"{settings.FRONTEND_URL}/account?checkout=success&tier={data.tier}",
            cancel_url=f"{settings.FRONTEND_URL}/account?checkout=canceled",
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return CheckoutOut(url=url)


@router.post("/portal", response_model=PortalOut)
async def create_portal(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> PortalOut:
    """Create a Stripe Customer Portal session to manage/cancel subscription."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing is not yet configured.")

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found. Please subscribe first.")

    try:
        url = await billing_service.create_portal_session(
            db=db,
            user=user,
            return_url=f"{settings.FRONTEND_URL}/account",
        )
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return PortalOut(url=url)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Stripe webhook — no auth, verified by signature."""
    try:
        from src.billing.webhook import handle_webhook
        return await handle_webhook(request, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Webhook processing error: %s", exc)
        raise HTTPException(status_code=500, detail="Webhook processing failed")
