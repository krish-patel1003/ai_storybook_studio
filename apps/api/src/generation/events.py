"""
Generation event logging — fire-and-forget cost tracking.

Call set_context(user_id, book_id) at the top of any route handler that
triggers generation. Then call log_event() from inside stages/clients —
it reads context vars and writes to generation_events asynchronously without
blocking the caller.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

_user_ctx: ContextVar[uuid.UUID | None] = ContextVar("gen_user_id", default=None)
_book_ctx: ContextVar[uuid.UUID | None] = ContextVar("gen_book_id", default=None)


def set_context(user_id: uuid.UUID | None, book_id: uuid.UUID | None = None) -> None:
    _user_ctx.set(user_id)
    _book_ctx.set(book_id)


# ── Pricing ───────────────────────────────────────────────────────────────────
# Per-token rates (input, output) for known LLM models
_LLM_RATES: dict[str, tuple[float, float]] = {
    "gemini-3.5-flash":            (0.075e-6, 0.300e-6),
    "gemini-3.1-pro-preview":      (1.250e-6, 10.00e-6),
    "gemini-3.1-flash-tts-preview":(0.000,    0.000),     # billed per char below
}
_IMAGE_RATE_PER_IMAGE   = 0.070   # gemini-3-pro-image
_TTS_GEMINI_PER_CHAR    = 0.50e-6 # $0.50 / 1M chars
_TTS_EL_PER_CHAR        = 0.0002  # ElevenLabs turbo v2.5


def _calc_cost(
    event_type: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    image_count: int | None,
    char_count: int | None,
) -> float:
    if event_type == "llm_text":
        in_r, out_r = _LLM_RATES.get(model, (0.075e-6, 0.30e-6))
        return (input_tokens or 0) * in_r + (output_tokens or 0) * out_r
    if event_type in ("image", "avatar"):
        return (image_count or 1) * _IMAGE_RATE_PER_IMAGE
    if event_type == "tts_gemini":
        return (char_count or 0) * _TTS_GEMINI_PER_CHAR
    if event_type == "tts_elevenlabs":
        return (char_count or 0) * _TTS_EL_PER_CHAR
    return 0.0


def log_event(
    event_type: str,
    model: str,
    *,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    image_count: int | None = None,
    char_count: int | None = None,
) -> None:
    """Schedule a DB write for this generation event. Never raises."""
    user_id = _user_ctx.get()
    if user_id is None:
        return  # Not in a user request context

    book_id = _book_ctx.get()
    cost = _calc_cost(event_type, model, input_tokens, output_tokens, image_count, char_count)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            _write_event(
                user_id=user_id,
                book_id=book_id,
                event_type=event_type,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                image_count=image_count,
                char_count=char_count,
                cost_usd=cost,
            )
        )
    except RuntimeError:
        pass  # No running loop — skip silently


async def _write_event(
    *,
    user_id: uuid.UUID,
    book_id: uuid.UUID | None,
    event_type: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    image_count: int | None,
    char_count: int | None,
    cost_usd: float,
) -> None:
    from src.database import async_session_maker
    from src.generation.event_models import GenerationEvent

    try:
        async with async_session_maker() as session:
            session.add(
                GenerationEvent(
                    user_id=user_id,
                    book_id=book_id,
                    event_type=event_type,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    image_count=image_count,
                    char_count=char_count,
                    cost_usd=cost_usd,
                    created_at=datetime.now(UTC),
                )
            )
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to log generation event (%s/%s): %s", event_type, model, exc)
