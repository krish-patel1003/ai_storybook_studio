"""
Book service — all database interactions and pipeline orchestration for books.

The generation pipeline is invoked directly (not via a task queue) so the API
request drives the generation. For long-running production use this would move
to a background worker, but the interface here is designed so that swap is trivial.
"""

import asyncio
import uuid
import logging
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.books.models import Book, Character, GenerationStage, Page
from src.books.schemas import AddCharacterIn, AddPageIn, BriefGenerateIn, CreateBookIn, CreateDraftIn, GenerateIn, RecalibrateIn, UpdateBookIn, UpdatePageIn
from src.config import settings
from src.exceptions import NotFoundError
from src.generation.pipeline import ModelConfig, StoryPipeline
from src.generation.schemas import (
    CharacterSheet,
    RecalibratedBeat,
    StoryBeat,
    StoryBrief,
)

logger = logging.getLogger(__name__)


def _pipeline(model_config: ModelConfig | None = None) -> StoryPipeline:
    return StoryPipeline(
        api_key=settings.GEMINI_API_KEY,
        ollama_base_url=settings.OLLAMA_BASE_URL,
        model_config=model_config,
    )


# ── Read helpers ──────────────────────────────────────────────────────────────

async def generate_brief_options(data: BriefGenerateIn) -> list:
    """Run EnhanceStage 4x concurrently — LLM non-determinism gives natural variety."""
    cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
    pipeline = _pipeline(cfg)
    tasks = [
        pipeline._enhance.run(
            raw_prompt=data.raw_prompt,
            age_range=data.age_range,
            tone=data.tone,
            safety=data.safety_mode,
            page_count=data.page_count,
        )
        for _ in range(4)
    ]
    return list(await asyncio.gather(*tasks))


async def get_book(db: AsyncSession, book_id: uuid.UUID, user_id: uuid.UUID) -> Book:
    result = await db.execute(
        select(Book)
        .where(Book.id == book_id, Book.user_id == user_id)
        .options(selectinload(Book.characters), selectinload(Book.pages))
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise NotFoundError("Book not found")
    return book


async def list_books(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[Book, int]]:
    from sqlalchemy import func
    illustrated_sq = (
        select(Page.book_id, func.count(Page.id).label("cnt"))
        .where(Page.image_key.isnot(None))
        .group_by(Page.book_id)
        .subquery()
    )
    stmt = (
        select(Book, func.coalesce(illustrated_sq.c.cnt, 0).label("illustrated_count"))
        .outerjoin(illustrated_sq, illustrated_sq.c.book_id == Book.id)
        .where(Book.user_id == user_id)
        .order_by(Book.updated_at.desc())
    )
    result = await db.execute(stmt)
    return [(row.Book, int(row.illustrated_count)) for row in result.all()]


# ── Draft & generate ──────────────────────────────────────────────────────────

async def create_draft(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: CreateDraftIn,
) -> Book:
    book = Book(
        user_id=user_id,
        title=data.raw_prompt[:60],
        raw_prompt=data.raw_prompt,
        age_range=data.age_range,
        tone=data.tone,
        art_style="",
        safety_mode=data.safety_mode,
        page_count=data.page_count,
        model_provider=data.model_provider,
        model_name=data.model_name,
        stage=GenerationStage.PENDING,
    )
    db.add(book)
    await db.commit()
    return await get_book(db, book.id, user_id)


async def generate_from_draft(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: GenerateIn,
) -> Book:
    book = await get_book(db, book_id, user_id)
    book.art_style = data.art_style
    book.stage = GenerationStage.ENHANCING
    await db.flush()

    try:
        cfg = ModelConfig(provider=book.model_provider, model_name=book.model_name)
        pipeline = _pipeline(cfg)

        result = await pipeline.generate(
            raw_prompt=book.raw_prompt,
            age_range=book.age_range,
            tone=book.tone,
            art_style=book.art_style,
            safety=book.safety_mode,
            page_count=book.page_count,
        )

        await _persist_result(db, book, result.brief, result.characters, result.beats, result.pages)
        book.stage = GenerationStage.COMPLETE
        book.title = result.brief.title
        await db.commit()
        await db.refresh(book)

    except Exception as exc:
        logger.exception("Generation failed for book %s", book.id)
        try:
            await db.rollback()
            book.stage = GenerationStage.FAILED
            book.error = str(exc)[:1000]
            await db.commit()
        except Exception:
            pass
        raise

    return await get_book(db, book_id, user_id)


# ── Create & generate ─────────────────────────────────────────────────────────

async def create_and_generate(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: CreateBookIn,
) -> Book:
    book = Book(
        user_id=user_id,
        title=data.raw_prompt[:60],
        raw_prompt=data.raw_prompt,
        age_range=data.age_range,
        tone=data.tone,
        art_style=data.art_style,
        safety_mode=data.safety_mode,
        page_count=data.page_count,
        model_provider=data.model_provider,
        model_name=data.model_name,
        stage=GenerationStage.ENHANCING,
    )
    db.add(book)
    await db.flush()

    try:
        cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
        pipeline = _pipeline(cfg)

        await _set_stage(db, book, GenerationStage.ENHANCING)
        result = await pipeline.generate(
            raw_prompt=data.raw_prompt,
            age_range=data.age_range,
            tone=data.tone,
            art_style=data.art_style,
            safety=data.safety_mode,
            page_count=data.page_count,
        )

        await _persist_result(db, book, result.brief, result.characters, result.beats, result.pages)
        book.stage = GenerationStage.COMPLETE
        book.title = result.brief.title
        await db.commit()
        await db.refresh(book)

    except Exception as exc:
        logger.exception("Generation failed for book %s", book.id)
        try:
            await db.rollback()
            book.stage = GenerationStage.FAILED
            book.error = str(exc)[:1000]
            await db.commit()
        except Exception:
            pass
        raise

    return await get_book(db, book.id, user_id)


# ── Beat editing ──────────────────────────────────────────────────────────────

async def update_page(
    db: AsyncSession,
    book_id: uuid.UUID,
    page_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdatePageIn,
) -> Book:
    book = await get_book(db, book_id, user_id)
    page = next((p for p in book.pages if p.id == page_id), None)
    if page is None:
        raise NotFoundError("Page not found")

    if data.beat is not None:
        page.beat = data.beat
    if data.emotional_note is not None:
        page.emotional_note = data.emotional_note
    if data.setting_note is not None:
        page.setting_note = data.setting_note
    if data.is_locked is not None:
        page.is_locked = data.is_locked

    await db.commit()
    return await get_book(db, book_id, user_id)


# ── Page regeneration ─────────────────────────────────────────────────────────

async def regenerate_page(
    db: AsyncSession,
    book_id: uuid.UUID,
    page_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Book:
    book = await get_book(db, book_id, user_id)
    page = next((p for p in book.pages if p.id == page_id), None)
    if page is None:
        raise NotFoundError("Page not found")

    brief = StoryBrief.model_validate(book.brief)
    characters = [
        CharacterSheet(
            name=c.name,
            is_protagonist=c.is_protagonist,
            role_description=c.role_description,
            personality=c.personality,
            visual_anchors=c.visual_anchors,
            illustration_prompt=c.illustration_prompt,
        )
        for c in book.characters
    ]
    all_beats = [_page_to_beat(p) for p in book.pages]

    cfg = ModelConfig(provider=book.model_provider, model_name=book.model_name)
    pipeline = _pipeline(cfg)
    [generated] = await pipeline.regenerate_pages(
        brief=brief,
        characters=characters,
        beats=all_beats,
        age_range=book.age_range,
        art_style=book.art_style,
        orders={page.order},
    )

    page.text = generated.text
    page.word_count = generated.word_count
    page.illustration_metadata = generated.illustration_metadata.model_dump()
    await db.commit()

    return await get_book(db, book_id, user_id)


# ── Recalibration ─────────────────────────────────────────────────────────────

async def recalibrate_book(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: RecalibrateIn,
) -> Book:
    book = await get_book(db, book_id, user_id)
    if book.brief is None:
        raise ValueError("Book has no brief yet — generation may still be in progress")

    brief = StoryBrief.model_validate(book.brief)
    current_beats = [_page_to_beat(p) for p in book.pages]
    locked_orders = {p.order for p in book.pages if p.is_locked}

    cfg = ModelConfig(provider=book.model_provider, model_name=book.model_name)
    pipeline = _pipeline(cfg)
    recalibrated = await pipeline.recalibrate(
        brief=brief,
        current_beats=current_beats,
        new_page_count=data.new_page_count,
        locked_orders=locked_orders,
    )

    # Replace all pages with the recalibrated beats
    for page in list(book.pages):
        await db.delete(page)
    await db.flush()

    for rbeat in sorted(recalibrated.beats, key=lambda b: b.order):
        db.add(_beat_to_page(book.id, rbeat))

    book.page_count = data.new_page_count
    await db.commit()

    return await get_book(db, book_id, user_id)


# ── Illustration ─────────────────────────────────────────────────────────────


async def illustrate_page(
    db: AsyncSession,
    book_id: uuid.UUID,
    page_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Book:
    from src.storage import minio_client

    book = await get_book(db, book_id, user_id)
    page = next((p for p in book.pages if p.id == page_id), None)
    if page is None:
        raise NotFoundError("Page not found")
    if page.illustration_metadata is None:
        raise ValueError("Page has no illustration metadata yet")

    pipeline = _pipeline()
    img = await pipeline.illustrate_single(page=page, visual_seed=book.visual_seed)

    # Upload to MinIO; delete old object if regenerating
    if page.image_key:
        minio_client.delete_image(page.image_key)
    key = minio_client.upload_image(
        book_id=str(book_id),
        page_id=str(page_id),
        data=img.image_data,
        mime_type=img.mime_type,
    )
    page.image_key = key
    await db.commit()
    return await get_book(db, book_id, user_id)


# ── Delete & update ───────────────────────────────────────────────────────────

async def delete_book(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    book = await get_book(db, book_id, user_id)
    await db.delete(book)
    await db.commit()


async def update_book(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: UpdateBookIn,
) -> Book:
    book = await get_book(db, book_id, user_id)
    if data.visibility is not None:
        book.visibility = data.visibility
    await db.commit()
    return await get_book(db, book_id, user_id)


# ── Add page / character ──────────────────────────────────────────────────────

async def add_page(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AddPageIn,
) -> Book:
    book = await get_book(db, book_id, user_id)
    next_order = max((p.order for p in book.pages), default=-1) + 1
    db.add(Page(
        book_id=book_id,
        order=next_order,
        is_cover=False,
        is_locked=False,
        narrative_role=data.narrative_role,
        beat=data.beat,
        emotional_note=data.emotional_note,
        characters_present=[],
        setting_note=data.setting_note,
        text=None,
        word_count=None,
        illustration_metadata=None,
    ))
    book.page_count = len(book.pages) + 1
    await db.commit()
    return await get_book(db, book_id, user_id)


async def add_character(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AddCharacterIn,
) -> Book:
    await get_book(db, book_id, user_id)  # ownership check
    db.add(Character(
        book_id=book_id,
        name=data.name,
        is_protagonist=data.is_protagonist,
        role_description=data.role_description,
        personality=data.personality,
        visual_anchors=data.visual_anchors,
        illustration_prompt=data.illustration_prompt,
    ))
    await db.commit()
    return await get_book(db, book_id, user_id)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _set_stage(db: AsyncSession, book: Book, stage: GenerationStage) -> None:
    book.stage = stage
    await db.flush()


async def _persist_result(db, book, brief, characters, beats, pages) -> None:
    book.brief = brief.model_dump()

    for sheet in characters:
        db.add(Character(
            book_id=book.id,
            name=sheet.name,
            is_protagonist=sheet.is_protagonist,
            role_description=sheet.role_description,
            personality=sheet.personality,
            visual_anchors=sheet.visual_anchors,
            illustration_prompt=sheet.illustration_prompt,
        ))

    beat_map = {b.order: b for b in beats}
    # Deduplicate by order — small models occasionally return duplicate orders
    page_by_order = {gpage.order: gpage for gpage in pages}
    for gpage in sorted(page_by_order.values(), key=lambda p: p.order):
        beat = beat_map.get(gpage.order)
        db.add(Page(
            book_id=book.id,
            order=gpage.order,
            is_cover=gpage.is_cover,
            is_locked=False,
            narrative_role=beat.narrative_role if beat else "",
            beat=beat.beat if beat else gpage.beat_reference,
            emotional_note=beat.emotional_note if beat else "",
            characters_present=beat.characters_present if beat else [],
            setting_note=beat.setting_note if beat else "",
            text=gpage.text,
            word_count=gpage.word_count,
            illustration_metadata=gpage.illustration_metadata.model_dump(),
        ))

    await db.flush()


def _page_to_beat(page: Page) -> StoryBeat:
    return StoryBeat(
        order=page.order,
        narrative_role=page.narrative_role,
        beat=page.beat,
        emotional_note=page.emotional_note,
        characters_present=page.characters_present,
        setting_note=page.setting_note,
    )


def _beat_to_page(book_id: uuid.UUID, rbeat: RecalibratedBeat) -> Page:
    return Page(
        book_id=book_id,
        order=rbeat.order,
        is_cover=(rbeat.order == 0),
        is_locked=False,
        narrative_role=rbeat.narrative_role,
        beat=rbeat.beat,
        emotional_note=rbeat.emotional_note,
        characters_present=rbeat.characters_present,
        setting_note=rbeat.setting_note,
        text=None,
        word_count=None,
        illustration_metadata=None,
    )
