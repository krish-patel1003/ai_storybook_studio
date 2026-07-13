"""
Seed script — generates 5 sample books end-to-end and marks them public+is_sample.

Run locally:
  cd apps/api
  DATABASE_URL=<your-url> GEMINI_API_KEY=<key> python -m scripts.seed_samples

Run as Cloud Run job (seeds against production DB):
  gcloud run jobs execute storybook-seed-samples --region=us-central1 --wait
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import uuid

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_samples")

# ── 5 sample book specs ───────────────────────────────────────────────────────
# age_range must be one of: "3-5", "6-8", "9-11"
SAMPLE_BOOKS = [
    {
        "raw_prompt": (
            "A little bear named Benny wants to keep all his honey to himself, "
            "but when his forest friends come hungry one cold morning he discovers "
            "that sharing makes the honey taste even sweeter."
        ),
        "age_range": "3-5",
        "tone": ["warm", "gentle", "funny"],
        "art_style": "watercolor",
        "page_count": 10,
    },
    {
        "raw_prompt": (
            "Zara, a curious seven-year-old, finds a tiny green dragon no bigger than "
            "her hand living inside a flower pot in her grandmother's garden. "
            "Together they must keep the dragon hidden from nosy neighbours while "
            "helping it find its way back to its family in the hills."
        ),
        "age_range": "6-8",
        "tone": ["adventurous", "funny", "heartwarming"],
        "art_style": "crayon",
        "page_count": 20,
    },
    {
        "raw_prompt": (
            "Four best friends — a bookworm, a tinkerer, a runner, and an artist — "
            "discover their town's beloved library is being demolished in one week. "
            "Using every skill they have, they race to save it and uncover a hidden "
            "room inside that holds a century-old secret."
        ),
        "age_range": "9-11",
        "tone": ["exciting", "inspiring", "funny"],
        "art_style": "flat",
        "page_count": 30,
    },
    {
        "raw_prompt": (
            "Twelve-year-old Kai finds an old hand-drawn map tucked inside a library "
            "book that leads to a forgotten island not on any chart. Sailing there on "
            "a patched-up boat with his clever younger sister, Kai discovers an island "
            "where every animal can speak and an ancient balance between land and sea "
            "has been broken — and only two kids from the outside world can fix it."
        ),
        "age_range": "9-11",
        "tone": ["adventurous", "mysterious", "heartwarming"],
        "art_style": "watercolor",
        "page_count": 40,
    },
    {
        "raw_prompt": (
            "Thirteen-year-old Maya has always built things out of scraps — radios, "
            "kites, solar cookers. When she accidentally launches herself skyward in "
            "a contraption built for the school science fair, she breaks through the "
            "clouds and discovers a vast floating city that has been hidden above the "
            "weather for three hundred years. The city's young engineer guild needs "
            "her knowledge of the world below — and Maya needs their help to get home "
            "before her parents call the fire brigade."
        ),
        "age_range": "9-11",
        "tone": ["exciting", "funny", "inspiring"],
        "art_style": "papercut",
        "page_count": 50,
    },
]


async def run() -> None:
    # Import here so env vars are loaded first
    from sqlalchemy import select
    from src.config import settings
    from src.database import engine, async_session_maker as async_session_factory
    from src.auth.models import User
    from src.books.models import Book, Page
    from src.books.schemas import CreateBookIn
    from src.books import service as book_service

    log.info("Connecting to DB: %s", str(settings.DATABASE_URL)[:60])

    async with async_session_factory() as db:
        # Pick the seed user: env override → first user in DB
        seed_email = os.environ.get("SEED_USER_EMAIL")
        if seed_email:
            result = await db.execute(select(User).where(User.email == seed_email))
        else:
            result = await db.execute(select(User).order_by(User.created_at).limit(1))
        user = result.scalar_one_or_none()

        if not user:
            log.error("No users found in DB — create at least one account first")
            sys.exit(1)

        log.info("Seeding as user: %s (%s)", user.username, user.email)

        # Temporarily give unlimited page pool for seeding
        original_pool = user.page_pool_used
        user.page_pool_used = 0
        user.subscription_tier = "creator"
        await db.commit()

        try:
            for i, spec in enumerate(SAMPLE_BOOKS, 1):
                log.info(
                    "═══ Book %d/%d — %d pages — Ages %s — %s ═══",
                    i, len(SAMPLE_BOOKS), spec["page_count"], spec["age_range"], spec["art_style"],
                )

                # Check if we already seeded this (avoid duplicates on re-run)
                existing = await db.execute(
                    select(Book).where(
                        Book.user_id == user.id,
                        Book.is_sample.is_(True),
                        Book.page_count == spec["page_count"],
                        Book.age_range == spec["age_range"],
                    )
                )
                if existing.scalar_one_or_none():
                    log.info("  Already seeded — skipping")
                    continue

                data = CreateBookIn(
                    raw_prompt=spec["raw_prompt"],
                    age_range=spec["age_range"],
                    tone=spec["tone"],
                    art_style=spec["art_style"],
                    page_count=spec["page_count"],
                    safety_mode=True,
                )

                log.info("  Generating text pipeline (brief + characters + pages)…")
                try:
                    book = await book_service.create_and_generate(db, user.id, data)
                except Exception as exc:
                    log.error("  Text generation failed: %s", exc)
                    continue

                log.info("  Created book: %s (%s)", book.title, book.id)

                # Illustrate all pages
                pages_result = await db.execute(
                    select(Page).where(Page.book_id == book.id).order_by(Page.order)
                )
                pages = pages_result.scalars().all()
                log.info("  Illustrating %d pages…", len(pages))

                for j, page in enumerate(pages, 1):
                    log.info("    Page %d/%d…", j, len(pages))
                    try:
                        await book_service.illustrate_page(db, book.id, page.id, user.id)
                    except Exception as exc:
                        log.warning("    Page %d illustration failed: %s", j, exc)

                # Illustrate back cover
                log.info("  Illustrating back cover…")
                try:
                    await book_service.illustrate_back_cover(db, book.id, user.id)
                except Exception as exc:
                    log.warning("  Back cover failed: %s", exc)

                # Mark as sample and public
                await db.refresh(book)
                book.is_sample = True
                book.visibility = "public"
                await db.commit()
                log.info("  ✓ Book %d complete: %s → /read/%s", i, book.title, book.id)

        finally:
            # Restore page pool
            await db.refresh(user)
            user.page_pool_used = original_pool
            await db.commit()
            log.info("Restored user page pool to %d", original_pool)

    log.info("All sample books seeded.")


if __name__ == "__main__":
    asyncio.run(run())
