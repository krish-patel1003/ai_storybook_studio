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

from src.auth.models import User
from src.books.models import Book, Character, GenerationStage, Page
from src.books.schemas import AddCharacterIn, AddPageIn, BrainstormIn, BriefGenerateIn, CreateBookIn, CreateDraftIn, ExpandPromptIn, GenerateIn, RecalibrateIn, UpdateBookIn, UpdatePageIn
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

async def brainstorm(data: BrainstormIn):
    """Generate 6 story seed ideas to spark the user's imagination."""
    cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
    pipeline = _pipeline(cfg)
    return await pipeline._brainstorm.run(
        age_range=data.age_range,
        tone=data.tone,
        page_count=data.page_count,
    )


async def expand_prompt(data: ExpandPromptIn):
    """Expand a user's prompt into 2 distinct concept takes via ExpandStage."""
    cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
    pipeline = _pipeline(cfg)
    return await pipeline._expand.run(
        raw_prompt=data.raw_prompt,
        age_range=data.age_range,
        tone=data.tone,
        safety=data.safety_mode,
        page_count=data.page_count,
    )


async def generate_brief(data: BriefGenerateIn):
    """Generate a single story brief via EnhanceStage, optionally grounded in an expanded concept."""
    from src.generation.schemas import ExpandedPrompt as ExpandedPromptSchema
    cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
    pipeline = _pipeline(cfg)
    # Convert ExpandedPromptOut (Pydantic schema from books) → ExpandedPrompt (generation schema)
    expanded = None
    if data.expanded_concept:
        ec = data.expanded_concept
        expanded = ExpandedPromptSchema(
            title=ec.title,
            story_concept=ec.story_concept,
            key_characters=ec.key_characters,
            story_highlights=ec.story_highlights,
            themes=ec.themes,
            visual_style=ec.visual_style,
        )
    return await pipeline._enhance.run(
        raw_prompt=data.raw_prompt,
        age_range=data.age_range,
        tone=data.tone,
        safety=data.safety_mode,
        page_count=data.page_count,
        expanded_concept=expanded,
    )


async def regenerate_brief_field(data) -> dict:
    """
    Regenerate one field of an existing brief.
    Generates a fresh brief from the same prompt, then splices in just the
    requested field so every other field stays exactly as the user left it.
    """
    from src.books.schemas import BriefFieldRegenerateIn
    assert isinstance(data, BriefFieldRegenerateIn)

    valid_fields = {"title", "description", "characters_intro", "themes", "lesson"}
    if data.field not in valid_fields:
        raise ValueError(f"field must be one of {valid_fields}")

    cfg = ModelConfig(provider=data.model_provider, model_name=data.model_name)
    pipeline = _pipeline(cfg)
    new_brief = await pipeline._enhance.run(
        raw_prompt=data.raw_prompt,
        age_range=data.age_range,
        tone=data.tone,
        safety=data.safety_mode,
        page_count=data.page_count,
    )

    # Merge: keep everything from current_brief, replace only the requested field
    merged = data.current_brief.model_dump()
    merged[data.field] = getattr(new_brief, data.field)
    return merged


# Keep old name as alias so any other callers don't break
generate_brief_options = lambda data: generate_brief(data)  # type: ignore


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


async def list_books(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[Book, int, str | None]]:
    """Return (book, illustrated_page_count, cover_page_id | None) for each book."""
    from sqlalchemy import func
    illustrated_sq = (
        select(Page.book_id, func.count(Page.id).label("cnt"))
        .where(Page.image_key.isnot(None))
        .group_by(Page.book_id)
        .subquery()
    )
    # Subquery: the ID of the cover page for each book (null if not illustrated yet)
    cover_sq = (
        select(Page.book_id, Page.id.label("cover_page_id"))
        .where(Page.is_cover.is_(True), Page.image_key.isnot(None))
        .subquery()
    )
    stmt = (
        select(
            Book,
            func.coalesce(illustrated_sq.c.cnt, 0).label("illustrated_count"),
            cover_sq.c.cover_page_id,
        )
        .outerjoin(illustrated_sq, illustrated_sq.c.book_id == Book.id)
        .outerjoin(cover_sq, cover_sq.c.book_id == Book.id)
        .where(Book.user_id == user_id)
        .order_by(Book.updated_at.desc())
    )
    result = await db.execute(stmt)
    return [
        (row.Book, int(row.illustrated_count), str(row.cover_page_id) if row.cover_page_id else None)
        for row in result.all()
    ]


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
        child_profile_id=data.child_profile_id,
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

        split_pages, split_beats = _split_overlong_pages(result.pages, result.beats, book.age_range)
        await _persist_result(db, book, result.brief, result.characters, split_beats, split_pages)
        book.stage = GenerationStage.COMPLETE
        book.title = result.brief.title
        await db.commit()
        await db.refresh(book)

        # Auto-generate KDP fields — don't let a failure here break book creation
        await _try_generate_kdp(db, book)

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
        child_profile_id=data.child_profile_id,
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

        split_pages, split_beats = _split_overlong_pages(result.pages, result.beats, data.age_range)
        await _persist_result(db, book, result.brief, result.characters, split_beats, split_pages)
        book.stage = GenerationStage.COMPLETE
        book.title = result.brief.title
        await db.commit()
        await db.refresh(book)

        # Auto-generate KDP fields — don't let a failure here break book creation
        await _try_generate_kdp(db, book)

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
    if data.text is not None:
        page.text = data.text
    if data.text_align is not None:
        page.text_align = data.text_align
    if data.text_position is not None:
        page.text_position = data.text_position
    if "canvas_overlay" in data.model_fields_set:
        page.canvas_overlay = data.canvas_overlay

    await db.commit()
    return await get_book(db, book_id, user_id)


async def bulk_text_style(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    data: "BulkTextStyleIn",
) -> "Book":
    import random as _random
    from src.books.schemas import BulkTextStyleIn

    book = await get_book(db, book_id, user_id)
    content_pages = [p for p in book.pages if not p.is_cover]

    _ALIGNS    = ["left", "center", "right"]
    _POSITIONS = ["top", "center", "bottom"]
    align_pool    = [a for a in (data.align_pool    or _ALIGNS)    if a in _ALIGNS]
    position_pool = [p for p in (data.position_pool or _POSITIONS) if p in _POSITIONS]

    for page in content_pages:
        if data.randomize:
            page.text_align    = _random.choice(align_pool)
            page.text_position = _random.choice(position_pool)
        else:
            if data.text_align is not None:
                page.text_align = data.text_align
            if data.text_position is not None:
                page.text_position = data.text_position

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


async def generate_character_sheets(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Book:
    from src.storage import minio_client as mc

    book = await get_book(db, book_id, user_id)
    if not book.characters:
        raise ValueError("Book has no characters")

    pipeline = _pipeline()
    sheets = await pipeline.generate_character_sheets(
        characters=book.characters,
        art_style=book.art_style,
        visual_seed=book.visual_seed,
    )

    sheet_map = {s.character_id: s for s in sheets}
    for char in book.characters:
        sheet = sheet_map.get(str(char.id))
        if sheet:
            if char.reference_image_key:
                mc.delete_image(char.reference_image_key)
            key = mc.upload(
                mc.character_key(str(book_id), str(char.id)),
                sheet.image_data,
                sheet.mime_type,
            )
            char.reference_image_key = key

    await db.commit()
    return await get_book(db, book_id, user_id)


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

    # Fetch character reference images for characters present on this page
    character_refs: dict[str, bytes] = {}
    present = set(page.characters_present or [])
    for char in book.characters:
        if char.name in present and char.reference_image_key:
            try:
                data, _ = minio_client.download(char.reference_image_key)
                character_refs[char.name] = data
            except Exception:
                pass  # missing ref is non-fatal — fall back to text-only

    pipeline = _pipeline()
    img = await pipeline.illustrate_single(
        page=page,
        visual_seed=book.visual_seed,
        character_refs=character_refs if character_refs else None,
    )

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


# ── Narration ────────────────────────────────────────────────────────────────

async def narrate_page(
    db: AsyncSession,
    book_id: uuid.UUID,
    page_id: uuid.UUID,
    user_id: uuid.UUID,
    voice_name: str = "Kore",
    voice_profile_id: uuid.UUID | None = None,
) -> Book:
    from src.storage import minio_client
    from src.generation.tts import synthesize, DEFAULT_VOICE

    book = await get_book(db, book_id, user_id)
    page = next((p for p in book.pages if p.id == page_id), None)
    if page is None:
        raise NotFoundError("Page not found")
    if not page.text:
        raise ValueError("Page has no text yet")

    # Route to ElevenLabs if a cloned voice profile is requested
    if voice_profile_id is not None:
        from src.voices.models import VoiceProfile
        from src.generation.elevenlabs import synthesize as el_synthesize
        profile = await db.get(VoiceProfile, voice_profile_id)
        if profile is None or profile.user_id != user_id:
            raise NotFoundError("Voice profile not found")
        wav = await el_synthesize(page.text, profile.elevenlabs_voice_id, age_range=book.age_range)
    else:
        raw_key = f"audio/{book_id}/{page_id}.raw.pcm"
        wav = await synthesize(page.text, voice_name=voice_name or DEFAULT_VOICE, debug_raw_key=raw_key)

    if page.audio_key:
        try:
            minio_client.delete_image(page.audio_key)
        except Exception:
            pass
    key = minio_client.upload_audio(str(book_id), str(page_id), wav)
    page.audio_key = key
    await db.commit()
    return await get_book(db, book_id, user_id)


async def narrate_book(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    voice_name: str = "Kore",
    voice_profile_id: uuid.UUID | None = None,
) -> Book:
    """Narrate all pages with text using the selected voice (overwrites existing audio)."""
    book = await get_book(db, book_id, user_id)
    pages_to_narrate = [p for p in book.pages if p.text]
    for page in pages_to_narrate:
        await narrate_page(
            db, book_id, page.id, user_id,
            voice_name=voice_name,
            voice_profile_id=voice_profile_id,
        )
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


# ── Export ────────────────────────────────────────────────────────────────────

async def build_export_pages(db: AsyncSession, book: Book) -> list:
    """Download all page images from MinIO and return ExportPage list.

    Continuation pages (split overflow) have no image_key of their own —
    they reuse the last available image so no page is left blank in the export.
    """
    from src.books.export import ExportPage
    from src.storage import minio_client

    result = []
    last_image_bytes: bytes | None = None

    for page in sorted(book.pages, key=lambda p: p.order):
        image_bytes = None
        if page.image_key:
            try:
                image_bytes, _ = minio_client.download_image(page.image_key)
                last_image_bytes = image_bytes   # cache for continuation pages
            except Exception:
                image_bytes = last_image_bytes   # fallback to previous
        elif not page.is_cover:
            # Continuation / split page — reuse previous page's image
            image_bytes = last_image_bytes

        result.append(ExportPage(
            order=page.order,
            is_cover=page.is_cover,
            text=page.text,
            image_bytes=image_bytes,
            text_align=getattr(page, "text_align", "center"),
            text_position=getattr(page, "text_position", "bottom"),
        ))
    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _try_generate_kdp(db: AsyncSession, book: Book) -> None:
    """Silently generate KDP fields after a book completes. Failures are logged, not raised."""
    try:
        from src.books.kdp import generate_kdp_fields
        from src.generation.gemini import GeminiClient

        user = await db.get(User, book.user_id)
        if user is None:
            return

        client = GeminiClient(api_key=settings.GEMINI_API_KEY)
        await generate_kdp_fields(book, user, client)
        await db.commit()
        logger.info("KDP fields auto-generated for book %s", book.id)
    except Exception:
        logger.exception("KDP auto-generation failed for book %s (non-fatal)", book.id)


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


def _split_sentences(text: str) -> list[str]:
    """Split text into individual sentences at . ! ? boundaries."""
    import re
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _split_overlong_pages(
    pages: list,
    beats: list,
    age_range: str,
) -> tuple[list, list]:
    """
    Find pages whose word count >= PAGE_SPLIT_THRESHOLD[age_range], split each one at
    the sentence boundary closest to the text midpoint, insert a continuation page
    directly after it, and renumber all non-cover pages sequentially.

    Returns (new_pages, new_beats) — new_beats includes synthetic continuation beats so
    _persist_result can fill in narrative_role, characters_present, setting_note, etc.
    """
    from src.generation.constants import PAGE_SPLIT_THRESHOLD
    from src.generation.schemas import GeneratedPage, IllustrationMetadata, StoryBeat as SBeat

    threshold = PAGE_SPLIT_THRESHOLD.get(age_range, 9999)
    beat_map = {b.order: b for b in beats}

    expanded_pages: list = []
    extra_beat_queue: list[dict] = []   # raw dicts for continuation beats, order filled in later

    for page in sorted(pages, key=lambda p: p.order):
        if page.is_cover or not page.text or page.word_count < threshold:
            expanded_pages.append(page)
            continue

        sentences = _split_sentences(page.text)
        if len(sentences) < 2:
            expanded_pages.append(page)
            continue

        # Sentence boundary closest to midpoint word count
        target = page.word_count // 2
        running = 0
        split_idx = max(1, len(sentences) // 2)
        for i, sent in enumerate(sentences):
            running += len(sent.split())
            if running >= target:
                split_idx = i + 1
                break

        first_half_sents = sentences[:split_idx]
        second_half_sents = sentences[split_idx:]
        if not first_half_sents or not second_half_sents:
            expanded_pages.append(page)
            continue

        first_text  = " ".join(first_half_sents)
        second_text = " ".join(second_half_sents)

        expanded_pages.append(page.model_copy(update={
            "text": first_text,
            "word_count": len(first_text.split()),
        }))

        # Continuation illustration — same visual world, slightly shifted moment
        orig_meta = page.illustration_metadata
        cont_meta = IllustrationMetadata(
            mood=orig_meta.mood,
            characters_present=orig_meta.characters_present,
            key_visual_elements=orig_meta.key_visual_elements,
            composition_note=(
                "Continuation of the previous scene — same location, characters, and lighting. "
                "Slightly shifted angle or beat-moment. " + orig_meta.composition_note
            ),
            assembled_prompt=(
                "Continuation scene — same art style, characters, and location as the preceding image. "
                + orig_meta.assembled_prompt
            ),
            negative_prompt=orig_meta.negative_prompt,
        )

        cont_page = GeneratedPage(
            order=-1,  # placeholder; renumbered below
            is_cover=False,
            beat_reference=page.beat_reference + " (continued)",
            text=second_text,
            word_count=len(second_text.split()),
            illustration_metadata=cont_meta,
        )
        expanded_pages.append(cont_page)

        parent_beat = beat_map.get(page.order)
        extra_beat_queue.append({
            "order": -1,  # placeholder
            "narrative_role": "continuation",
            "beat": (parent_beat.beat + " (continued)") if parent_beat else page.beat_reference + " (continued)",
            "emotional_note": parent_beat.emotional_note if parent_beat else "",
            "characters_present": parent_beat.characters_present if parent_beat else [],
            "setting_note": parent_beat.setting_note if parent_beat else "",
        })

    # Renumber pages AND rebuild beat list so orders stay in sync.
    # expanded_pages may contain new continuation pages (order=-1) interleaved with
    # original pages whose old orders are no longer consecutive after splits.
    cover_pages   = [p for p in expanded_pages if p.is_cover]
    content_pages = [p for p in expanded_pages if not p.is_cover]

    extra_beat_iter = iter(extra_beat_queue)
    renumbered_pages: list = list(cover_pages)
    renumbered_beats: list = [b for b in beats if b.order == 0]  # keep cover beat(s)

    for new_order, p in enumerate(content_pages, start=1):
        renumbered_pages.append(p.model_copy(update={"order": new_order}))
        if p.order == -1:
            # Continuation page — synthesise a beat at the new order
            raw = next(extra_beat_iter)
            raw["order"] = new_order
            renumbered_beats.append(SBeat(**raw))
        else:
            # Original page — copy its beat with updated order so _persist_result finds it
            orig_beat = beat_map.get(p.order)
            if orig_beat is not None:
                renumbered_beats.append(orig_beat.model_copy(update={"order": new_order}))

    return renumbered_pages, renumbered_beats


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
