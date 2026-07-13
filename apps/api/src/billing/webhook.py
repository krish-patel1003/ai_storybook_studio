"""
Stripe webhook handler — syncs subscription state to the database.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.billing import service as billing_service
from src.config import settings

logger = logging.getLogger(__name__)

# Events we care about
_HANDLED = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
}


async def handle_webhook(request: Request, db: AsyncSession) -> dict:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("STRIPE_WEBHOOK_SECRET not set — skipping signature verification")
        import json
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.error.SignatureVerificationError:
            logger.warning("Stripe webhook signature verification failed")
            raise ValueError("Invalid webhook signature")

    if event["type"] not in _HANDLED:
        return {"status": "ignored", "type": event["type"]}

    obj = event["data"]["object"]

    if event["type"] in ("customer.subscription.created", "customer.subscription.updated"):
        await _handle_subscription_change(db, obj)

    elif event["type"] == "customer.subscription.deleted":
        await _handle_subscription_deleted(db, obj)

    elif event["type"] == "invoice.payment_succeeded":
        # Reset page pool at the start of each billing period
        await _handle_invoice_paid(db, obj)

    elif event["type"] == "invoice.payment_failed":
        await _handle_payment_failed(db, obj)

    return {"status": "ok", "type": event["type"]}


async def _get_user_by_customer(db: AsyncSession, customer_id: str) -> User | None:
    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()


def _tier_from_metadata(metadata: dict) -> str:
    return metadata.get("tier", "free")


def _dt(ts: int | None) -> datetime | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)


async def _handle_subscription_change(db: AsyncSession, sub: dict) -> None:
    customer_id = sub["customer"]
    user = await _get_user_by_customer(db, customer_id)
    if not user:
        logger.warning("Subscription event for unknown customer %s", customer_id)
        return

    tier = _tier_from_metadata(sub.get("metadata", {}))
    status = sub["status"]
    period_end = _dt(sub.get("current_period_end"))

    await billing_service.apply_subscription(
        db, user,
        tier=tier,
        stripe_subscription_id=sub["id"],
        status=status,
        period_end=period_end,
    )


async def _handle_subscription_deleted(db: AsyncSession, sub: dict) -> None:
    customer_id = sub["customer"]
    user = await _get_user_by_customer(db, customer_id)
    if not user:
        return
    await billing_service.cancel_subscription(db, user)


async def _handle_invoice_paid(db: AsyncSession, invoice: dict) -> None:
    customer_id = invoice.get("customer")
    if not customer_id:
        return
    user = await _get_user_by_customer(db, customer_id)
    if not user:
        return

    # Only reset on subscription invoices (not one-off charges)
    if invoice.get("billing_reason") not in ("subscription_cycle", "subscription_create"):
        return

    sub_id = invoice.get("subscription")
    if not sub_id:
        return

    # Fetch the subscription to get the new period end
    stripe.api_key = settings.STRIPE_SECRET_KEY
    sub = stripe.Subscription.retrieve(sub_id)
    period_end = _dt(sub.get("current_period_end"))

    await billing_service.reset_page_pool(db, user, period_end)
    logger.info("Page pool reset for user %s after successful payment", user.id)


async def _handle_payment_failed(db: AsyncSession, invoice: dict) -> None:
    customer_id = invoice.get("customer")
    if not customer_id:
        return
    user = await _get_user_by_customer(db, customer_id)
    if not user:
        return

    user.subscription_status = "past_due"
    await db.commit()
    logger.warning("Payment failed for user %s — marked past_due", user.id)
