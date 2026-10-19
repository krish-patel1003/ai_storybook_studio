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
from src.billing.tiers import TIERS, TIER_ORDER, get_tier, PAGE_PACKS, PACK_ORDER
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
    parent_mode: bool = False
    remakes_per_page: int = 0
    avatars_per_month: int = 0
    is_current: bool = False


class PackOut(BaseModel):
    name: str
    display_name: str
    pages: int
    price_usd: float


class SubscriptionOut(BaseModel):
    tier: str
    display_name: str
    status: str | None
    page_pool_total: int
    page_pool_used: int
    page_pool_remaining: int
    topup_pages_remaining: int = 0
    avatars_per_month: int = 0
    avatars_used: int = 0
    avatars_remaining: int = 0
    period_end: str | None
    publishable_key: str
    tiers: list[TierOut]
    packs: list[PackOut] = []


class CheckoutIn(BaseModel):
    tier: str


class TopupIn(BaseModel):
    pack: str


class CheckoutOut(BaseModel):
    url: str


class PortalOut(BaseModel):
    url: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

class PurchaseOut(BaseModel):
    id: str
    created_at: str
    kind: str
    description: str
    amount_cents: int
    currency: str
    tier: str | None = None
    pages: int | None = None


@router.get("/purchases", response_model=list[PurchaseOut])
async def list_purchases(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[PurchaseOut]:
    """Billing history — subscriptions and top-ups the user has paid for."""
    from sqlalchemy import select
    from src.billing.models import Purchase
    rows = (
        await db.execute(
            select(Purchase).where(Purchase.user_id == user.id).order_by(Purchase.created_at.desc()).limit(100)
        )
    ).scalars().all()
    return [
        PurchaseOut(
            id=str(p.id),
            created_at=p.created_at.isoformat() if p.created_at else "",
            kind=p.kind,
            description=p.description,
            amount_cents=p.amount_cents,
            currency=p.currency,
            tier=p.tier,
            pages=p.pages,
        )
        for p in rows
    ]


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
    topup = getattr(user, "topup_pages_remaining", 0) or 0
    remaining = max(0, tier_cfg.page_pool - user.page_pool_used) + topup
    from src.billing.guards import _avatar_status
    avatar_limit, avatar_used = _avatar_status(user)
    avatar_remaining = max(0, avatar_limit - avatar_used)
    packs = [
        PackOut(name=p, display_name=PAGE_PACKS[p].display_name, pages=PAGE_PACKS[p].pages, price_usd=PAGE_PACKS[p].price_usd)
        for p in PACK_ORDER
    ]

    return SubscriptionOut(
        tier=user.subscription_tier,
        display_name=tier_cfg.display_name,
        status=user.subscription_status,
        page_pool_total=tier_cfg.page_pool,
        page_pool_used=user.page_pool_used,
        page_pool_remaining=remaining,
        topup_pages_remaining=topup,
        avatars_per_month=avatar_limit,
        avatars_used=avatar_used,
        avatars_remaining=avatar_remaining,
        period_end=user.subscription_period_end.isoformat() if user.subscription_period_end else None,
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        tiers=tier_list,
        packs=packs,
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

    if data.tier not in ("storyteller", "studio"):
        raise HTTPException(status_code=400, detail="Invalid tier. Choose storyteller or studio.")

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


@router.post("/topup", response_model=CheckoutOut)
async def create_topup(
    data: TopupIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CheckoutOut:
    """Create a one-time Stripe Checkout session to buy a prepaid page pack."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing is not yet configured.")
    if data.pack not in PAGE_PACKS:
        raise HTTPException(status_code=400, detail=f"Invalid pack. Choose {', '.join(PACK_ORDER)}.")
    try:
        url = await billing_service.create_pack_checkout_session(
            db=db,
            user=user,
            pack=data.pack,
            success_url=f"{settings.FRONTEND_URL}/account?topup=success&pack={data.pack}",
            cancel_url=f"{settings.FRONTEND_URL}/account?topup=canceled",
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
