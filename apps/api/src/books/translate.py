"""
Direct translation of a storybook's page text for the reader's language toggle.

The book is generated in English; when a reader picks another language we
translate the page text (and title) once with Gemini and cache the result on
`book.translations[lang]` so subsequent reads are instant and cost nothing.
"""
from __future__ import annotations

import json
import logging
import uuid

from pydantic import BaseModel

from src.config import settings
from src.generation.constants import GEMINI_FLASH
from src.generation.gemini import GeminiClient

logger = logging.getLogger(__name__)

# Supported reader languages (code → English name used in the prompt).
SUPPORTED_LANGUAGES: dict[str, str] = {
    "ar": "Arabic",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "hi": "Hindi",
}
# Right-to-left languages — the reader sets text direction accordingly.
RTL_LANGUAGES = {"ar"}


class _TranslatedPage(BaseModel):
    id: str
    text: str


class _TranslationResult(BaseModel):
    title: str
    pages: list[_TranslatedPage]


async def translate_book(db, book_id: uuid.UUID, user_id: uuid.UUID, language: str) -> dict:
    """Return `{language, title, pages: {page_id: text}}` for the book in the
    given language, translating + caching on first request. Raises ValueError for
    an unsupported language."""
    from fastapi import HTTPException
    from src.books.service import get_book

    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language '{language}'.")

    book = await get_book(db, book_id, user_id)

    cache = dict(book.translations or {})
    cached = cache.get(language)
    if cached and cached.get("pages"):
        return {"language": language, **cached}

    # Collect the page text to translate (content pages that have text).
    content = [
        (str(p.id), p.text)
        for p in sorted(book.pages, key=lambda p: p.order)
        if p.text and p.text.strip()
    ]
    original_title = book.title or (book.brief or {}).get("title") or "Untitled"

    if not content:
        payload = {"title": original_title, "pages": {}}
        cache[language] = payload
        book.translations = cache
        await db.commit()
        return {"language": language, **payload}

    language_name = SUPPORTED_LANGUAGES[language]
    pages_json = json.dumps([{"id": pid, "text": text} for pid, text in content], ensure_ascii=False)

    system = (
        f"You are a professional translator of children's picture books into {language_name}. "
        "Translate naturally and idiomatically for young children, preserving the meaning, tone, "
        "rhythm and reading level of the original. Keep names of people and places unless they have "
        "a well-known local form. Do not add, remove, explain or summarise anything. "
        f"Return the title and every page translated into {language_name}, keeping each page's id unchanged."
    )
    prompt = (
        f"Book title: {original_title}\n\n"
        f"Translate the title and each page below into {language_name}. "
        f"Return the same page ids with their translated text.\n\nPages (JSON):\n{pages_json}"
    )

    client = GeminiClient(api_key=settings.GEMINI_API_KEY)
    result = await client.generate(
        prompt=prompt,
        schema=_TranslationResult,
        system=system,
        model=GEMINI_FLASH,
        temperature=0.3,
    )

    translated_by_id = {tp.id: tp.text for tp in result.pages}
    # Fall back to the original text for any page the model dropped.
    pages_map = {pid: translated_by_id.get(pid) or original for pid, original in content}
    payload = {"title": (result.title or original_title).strip(), "pages": pages_map}

    cache[language] = payload
    book.translations = cache  # reassign so SQLAlchemy flags the JSONB change
    await db.commit()
    logger.info("Translated book %s into %s (%d pages)", book_id, language, len(pages_map))
    return {"language": language, **payload}
