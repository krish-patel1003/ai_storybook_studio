"""
Seed script — generate 5 sample books end-to-end using the normal code paths
(same service functions the API uses), then mark them public + is_sample so they
show on the landing page.

Run as a Cloud Run job against the production DB:
  gcloud run jobs execute storybook-seed-samples --region=us-central1

Run locally:
  cd apps/api
  DATABASE_URL=... GEMINI_API_KEY=... python -m scripts.seed_samples
"""
from __future__ import annotations

import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_samples")

SEED_USER_EMAIL = "patel.krish1003@gmail.com"

# 5 unique books: (prompt, age_range, page_count, art_style, tone)
BOOKS = [
    (
        "Pip the penguin is scared of the water and won't take his first swim. "
        "With a little courage and a lot of cheering from his friends, he finally "
        "takes the leap and discovers how much fun the ocean can be.",
        "3-5", 10, "watercolor", ["warm", "gentle", "funny"],
    ),
    (
        "Nina builds a cardboard rocket in her backyard and, one starry night, it "
        "actually lifts off. She travels to a friendly little moon where the craters "
        "are made of cheese and makes a new alien friend before flying home for breakfast.",
        "6-8", 20, "crayon", ["adventurous", "funny", "heartwarming"],
    ),
    (
        "When the old clock tower in Marlow town stops ticking, twelve-year-old Theo "
        "and his friends discover a hidden mechanism inside that keeps the whole town's "
        "luck running. To fix it before the harvest festival, they must solve three "
        "riddles left behind by the tower's long-forgotten builder.",
        "9-11", 30, "flat", ["exciting", "mysterious", "inspiring"],
    ),
    (
        "Amara finds a cracked compass at a flea market that points not north, but "
        "toward whoever needs help most. Following its needle across her city, she and "
        "her dog Biscuit help a lost baby owl, a stranded street musician, and an old "
        "lighthouse keeper — and learn that the compass was really guiding her home.",
        "9-11", 40, "watercolor", ["adventurous", "heartwarming", "gentle"],
    ),
    (
        "Leo lives in a valley where it has rained for a hundred years, and everyone "
        "has forgotten what the sun looks like. Armed with his grandfather's journals "
        "and a homemade glider, Leo climbs above the endless clouds to find the sun — "
        "and brings back proof that the sky can be blue again.",
        "9-11", 50, "papercut", ["exciting", "inspiring", "hopeful"],
    ),
]


async def run() -> None:
    from sqlalchemy import select

    # Register every table in the metadata before any flush — the Book FK graph
    # (e.g. child_profile) needs these imported, same as the API does at startup.
    import src.auth.models  # noqa: F401
    import src.books.models  # noqa: F401
    import src.profiles.models  # noqa: F401
    import src.voices.models  # noqa: F401
    import src.generation.event_models  # noqa: F401

    from src.database import async_session_maker
    from src.auth.models import User
    from src.books.schemas import CreateBookIn
    from src.books import service

    from src.books.models import Book

    async with async_session_maker() as db:
        user = await db.scalar(select(User).where(User.email == SEED_USER_EMAIL))
        if not user:
            raise SystemExit(f"Test user {SEED_USER_EMAIL} not found")
        log.info("Seeding as %s (bypass_limits=%s)", user.email, user.bypass_limits)

        for i, (prompt, age, pages, style, tone) in enumerate(BOOKS, 1):
            log.info("=== Book %d/5 — %d pages — ages %s — %s ===", i, pages, age, style)

            # Idempotent: reuse an existing book with the same prompt (resume a
            # partial run) instead of creating a duplicate.
            existing = await db.scalar(
                select(Book).where(Book.user_id == user.id, Book.raw_prompt == prompt)
            )
            if existing:
                book = await service.get_book(db, existing.id, user.id)
                log.info("  Reusing existing: %s (%s)", book.title, book.id)
            else:
                data = CreateBookIn(
                    raw_prompt=prompt, age_range=age, tone=tone,
                    art_style=style, page_count=pages, safety_mode=True,
                )
                book = await service.create_and_generate(db, user.id, data)
                log.info("  Created: %s (%s)", book.title, book.id)

            # Ensure a back-cover page exists before illustrating.
            if not any(p.is_back_cover for p in book.pages):
                try:
                    await service.create_back_cover_page(db, book.id, user.id)
                    book = await service.get_book(db, book.id, user.id)
                except Exception as exc:
                    log.warning("  create back cover failed: %s", exc)

            # Illustrate any page still missing an image (covers included).
            for page in sorted(book.pages, key=lambda p: p.order):
                if page.image_key:
                    continue
                try:
                    if page.is_back_cover:
                        await service.illustrate_back_cover(db, book.id, user.id)
                    else:
                        await service.illustrate_page(db, book.id, page.id, user.id)
                except Exception as exc:
                    log.warning("  illustrate page %s failed: %s", page.order, exc)

            # Narrate any text page still missing audio.
            book = await service.get_book(db, book.id, user.id)
            for page in sorted(book.pages, key=lambda p: p.order):
                if page.audio_key or not page.text or page.is_cover or page.is_back_cover:
                    continue
                try:
                    await service.narrate_page(db, book.id, page.id, user.id)
                except Exception as exc:
                    log.warning("  narrate page %s failed: %s", page.order, exc)

            # Publish as a landing-page sample.
            book = await service.get_book(db, book.id, user.id)
            book.is_sample = True
            book.visibility = "public"
            await db.commit()
            log.info("  done → /read/%s", book.id)

    log.info("All 5 sample books seeded.")


if __name__ == "__main__":
    asyncio.run(run())
