"""
Streaming book generation service.

Runs the full pipeline (write → character sheets → illustrate → narrate)
and yields SSE-compatible event dicts at each step so the client sees
live progress without polling.

Event types
-----------
stage_change  — a pipeline phase has started
page_done     — one page finished illustrating or narrating
book_ready    — entire pipeline complete; full BookOut embedded in data
error         — unrecoverable failure
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from src.books.models import Book, GenerationStage
from src.books.schemas import BookOut
from src.books.service import (
    _persist_result,
    _pipeline,
    get_book,
)
from src.exceptions import NotFoundError
from src.generation.pipeline import ModelConfig

logger = logging.getLogger(__name__)


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _event(event_type: str, data: dict, event_id: str | None = None) -> dict:
    payload: dict = {"event": event_type, "data": json.dumps(data)}
    if event_id:
        payload["id"] = event_id
    return payload


def _stage_event(stage: str, page_total: int | None = None) -> dict:
    return _event("stage_change", {"stage": stage, "page_total": page_total})


def _page_done_event(stage: str, page_order: int, done: int, total: int, page_id: str) -> dict:
    return _event(
        "page_done",
        {"stage": stage, "page_id": page_id, "page_order": page_order, "done": done, "total": total},
        event_id=f"{stage}:{page_order}",
    )


def _error_event(message: str, stage: str | None = None) -> dict:
    return _event("error", {"message": message, "stage": stage})


# ── Main streaming generator ──────────────────────────────────────────────────

async def generate_book_stream(
    db: AsyncSession,
    book_id: uuid.UUID,
    user_id: uuid.UUID,
    art_style: str,
    resume_from: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Async generator that runs the full book pipeline and yields SSE event dicts.

    resume_from — value of the Last-Event-ID header from a reconnecting client,
                  formatted as "{stage}:{page_order}". Committed DB state is
                  used to fast-forward past already-completed steps.
    """
    current_stage: str = "writing"

    try:
        # ── Load book ────────────────────────────────────────────────────────
        try:
            book = await get_book(db, book_id, user_id)
        except NotFoundError:
            yield _error_event("Book not found", stage=None)
            return

        cfg = ModelConfig(provider=book.model_provider, model_name=book.model_name)
        pipeline = _pipeline(cfg)

        # ── Stage 1: Write story text ────────────────────────────────────────
        # Skip if we already have a brief (reconnect fast-forward).
        if book.brief is None:
            book.art_style = art_style
            book.stage = GenerationStage.ENHANCING
            await db.flush()

            yield _stage_event("writing")

            result = await pipeline.generate(
                raw_prompt=book.raw_prompt,
                age_range=book.age_range,
                tone=book.tone,
                art_style=art_style,
                safety=book.safety_mode,
                page_count=book.page_count,
            )

            await _persist_result(
                db, book,
                result.brief, result.characters, result.beats, result.pages,
            )
            book.title = result.brief.title
            book.stage = GenerationStage.COMPLETE
            await db.commit()
            book = await get_book(db, book_id, user_id)
        else:
            # Brief already exists — fast-forward, ensure art_style is set.
            if not book.art_style:
                book.art_style = art_style
                await db.commit()
                book = await get_book(db, book_id, user_id)

        pages = sorted(book.pages, key=lambda p: p.order)

        # ── Stage 2: Character reference sheets ──────────────────────────────
        current_stage = "characters"
        chars_done = all(c.reference_image_key for c in book.characters)

        if not chars_done and book.characters:
            yield _stage_event("characters", page_total=len(pages))

            from src.storage import minio_client as mc

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
            book = await get_book(db, book_id, user_id)
            pages = sorted(book.pages, key=lambda p: p.order)
        else:
            yield _stage_event("characters", page_total=len(pages))

        # ── Stage 3: Illustrate pages ────────────────────────────────────────
        current_stage = "illustrating"
        pages_to_illustrate = [p for p in pages if p.image_key is None]
        total_illustrate = len(pages)
        done_count = total_illustrate - len(pages_to_illustrate)

        yield _stage_event("illustrating", page_total=total_illustrate)

        if pages_to_illustrate:
            from src.storage import minio_client

            # Build character refs once
            character_refs: dict[str, bytes] = {}
            for char in book.characters:
                if char.reference_image_key:
                    try:
                        data, _ = minio_client.download(char.reference_image_key)
                        character_refs[char.name] = data
                    except Exception:
                        pass

            for page in pages_to_illustrate:
                if page.illustration_metadata is None:
                    done_count += 1
                    continue

                # Build per-page character refs (only characters present on this page)
                present = set(page.characters_present or [])
                page_char_refs = {k: v for k, v in character_refs.items() if k in present}

                img = await pipeline.illustrate_single(
                    page=page,
                    visual_seed=book.visual_seed,
                    character_refs=page_char_refs or None,
                )

                if page.image_key:
                    minio_client.delete_image(page.image_key)
                key = minio_client.upload_image(
                    book_id=str(book_id),
                    page_id=str(page.id),
                    data=img.image_data,
                    mime_type=img.mime_type,
                )
                page.image_key = key
                await db.commit()

                done_count += 1
                yield _page_done_event(
                    stage="illustrating",
                    page_order=page.order,
                    done=done_count,
                    total=total_illustrate,
                    page_id=str(page.id),
                )

        # ── Stage 4: Narrate pages ───────────────────────────────────────────
        current_stage = "narrating"
        book = await get_book(db, book_id, user_id)
        text_pages = sorted(
            [p for p in book.pages if p.text],
            key=lambda p: p.order,
        )
        pages_to_narrate = [p for p in text_pages if p.audio_key is None]
        total_narrate = len(text_pages)
        narrate_done = total_narrate - len(pages_to_narrate)

        yield _stage_event("narrating", page_total=total_narrate)

        if pages_to_narrate:
            from src.storage import minio_client
            from src.generation.tts import synthesize

            for page in pages_to_narrate:
                raw_key = f"audio/{book_id}/{page.id}.raw.pcm"
                wav = await synthesize(page.text, debug_raw_key=raw_key)

                if page.audio_key:
                    try:
                        minio_client.delete_image(page.audio_key)
                    except Exception:
                        pass
                key = minio_client.upload_audio(str(book_id), str(page.id), wav)
                page.audio_key = key
                await db.commit()

                narrate_done += 1
                yield _page_done_event(
                    stage="narrating",
                    page_order=page.order,
                    done=narrate_done,
                    total=total_narrate,
                    page_id=str(page.id),
                )

        # ── Done ─────────────────────────────────────────────────────────────
        final_book = await get_book(db, book_id, user_id)
        book_out = BookOut.model_validate(final_book)
        yield _event("book_ready", {"book_id": str(book_id), "book": book_out.model_dump(mode="json")})

    except Exception as exc:
        logger.exception("Streaming generation failed for book %s at stage %s", book_id, current_stage)
        try:
            book_obj = await db.get(Book, book_id)
            if book_obj:
                book_obj.stage = GenerationStage.FAILED
                book_obj.error = str(exc)[:1000]
                await db.commit()
        except Exception:
            pass
        yield _error_event(str(exc) or "Generation failed", stage=current_stage)
