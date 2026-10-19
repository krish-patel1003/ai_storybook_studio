import uuid
from typing import Sequence

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.books import service
from src.books.dependencies import current_user, owned_book
from src.rate_limit import rate_limit
from src.books.models import Book
from src.books.schemas import (
    AddCharacterIn,
    AddPageIn,
    BookOut,
    BookSummaryOut,
    BrainstormIn,
    BrainstormOut,
    BriefFieldRegenerateIn,
    BriefGenerateIn,
    BriefOptionsOut,
    BriefOut,
    CreateBookIn,
    CreateDraftIn,
    ExpandPromptIn,
    ExpandedPromptOut,
    GenerateIn,
    ModelInfo,
    ModelsOut,
    NarrateIn,
    PageCountOptionsOut,
    PageOut,
    ProviderInfo,
    RecalibrateIn,
    ReflowIn,
    StorySeedOut,
    UpdateBookIn,
    BulkPageStyleIn,
    UpdatePageIn,
)
from src.books.kdp import KDPOut, KDPUpdateIn, generate_kdp_fields
from src.config import settings
from src.database import get_db
from src.generation.gemini import GeminiClient
from src.generation.constants import (
    DEFAULT_PAGE_COUNT,
    MAX_PAGE_COUNT,
    MIN_PAGE_COUNT,
    PAGE_COUNT_OPTIONS,
)

router = APIRouter()


def _generation_detail(exc: Exception) -> str:
    """Convert a generation exception to a user-facing HTTP detail string."""
    from fastapi import HTTPException
    msg = str(exc)
    if "SAFETY_BLOCK:" in msg:
        return msg.split("SAFETY_BLOCK:", 1)[-1].strip()
    if "429" in msg or "quota" in msg.lower() or "rate limit" in msg.lower():
        return "AI quota exceeded — please wait a moment and try again."
    if "timeout" in msg.lower() or "504" in msg or "timed out" in msg.lower():
        return "The AI took too long to respond — please try again."
    if "503" in msg or "unavailable" in msg.lower() or "overloaded" in msg.lower():
        return "The AI service is temporarily overloaded — please try again in a moment."
    if "No image returned" in msg or "No image data" in msg:
        return "The AI didn't return an image — try a different prompt or art style."
    if "empty response" in msg.lower():
        return "The AI returned an empty response — try rephrasing your prompt."
    return "Generation failed — please try again. If the problem persists, try adjusting your prompt."


@router.get("/models", response_model=ModelsOut)
async def list_models(user: User = Depends(current_user)) -> ModelsOut:
    from src.config import settings
    from src.generation.ollama_client import list_ollama_models

    ollama_raw = await list_ollama_models(settings.OLLAMA_BASE_URL)
    ollama_models = [
        ModelInfo(
            id=m["name"],
            name=m["name"],
            description=f"{m.get('details', {}).get('parameter_size', '')} · {m.get('details', {}).get('family', '')}".strip(" ·"),
            size=m.get("details", {}).get("parameter_size", ""),
        )
        for m in ollama_raw
    ]

    return ModelsOut(
        providers=[
            ProviderInfo(
                id="gemini",
                name="Google Gemini",
                description="Cloud-hosted · High quality",
                available=bool(settings.GEMINI_API_KEY),
                models=[
                    ModelInfo(id="gemini-3.5-flash", name="Gemini Flash", description="Fast & efficient · Best for drafting", size="cloud"),
                    ModelInfo(id="gemini-3.1-pro-preview", name="Gemini Pro", description="Highest quality · Slower", size="cloud"),
                ],
            ),
            ProviderInfo(
                id="ollama",
                name="Ollama (Local)",
                description="Private · Runs on your machine",
                available=len(ollama_models) > 0,
                models=ollama_models,
            ),
        ]
    )


@router.post("/prompts/brainstorm", response_model=BrainstormOut)
async def brainstorm_ideas(
    data: BrainstormIn,
    user: User = Depends(rate_limit("brainstorm", 30)),
) -> BrainstormOut:
    """Generate 6 short story seed ideas to inspire the user before they write their prompt."""
    from src.billing.guards import check_page_pool
    check_page_pool(user, data.page_count)
    result = await service.brainstorm(data)
    return BrainstormOut(seeds=[StorySeedOut(title=s.title, hook=s.hook) for s in result.seeds])


@router.post("/prompts/expand", response_model=ExpandedPromptOut)
async def expand_prompt(
    data: ExpandPromptIn,
    user: User = Depends(rate_limit("expand", 40)),
) -> ExpandedPromptOut:
    """Expand a user's prompt into a rich story concept."""
    from src.billing.guards import check_page_pool
    check_page_pool(user, data.page_count)
    result = await service.expand_prompt(data)
    return ExpandedPromptOut(
        title=result.title,
        story_concept=result.story_concept,
        key_characters=result.key_characters,
        story_highlights=result.story_highlights,
        themes=result.themes,
        visual_style=result.visual_style,
    )


@router.post("/briefs/generate", response_model=BriefOut)
async def generate_brief(
    data: BriefGenerateIn,
    user: User = Depends(rate_limit("brief", 40)),
) -> BriefOut:
    """Generate a single story brief from the user's prompt and settings."""
    from src.billing.guards import check_page_pool
    check_page_pool(user, data.page_count)
    b = await service.generate_brief(data)
    from src.books.schemas import ArcStageOut
    return BriefOut(
        title=b.title,
        description=b.description,
        characters_intro=b.characters_intro,
        themes=b.themes,
        lesson=b.lesson,
        arc=[ArcStageOut(name=a.name, description=a.description, page_span=a.page_span) for a in b.arc],
    )


@router.post("/briefs/regenerate-field", response_model=BriefOut)
async def regenerate_brief_field(
    data: BriefFieldRegenerateIn,
    user: User = Depends(rate_limit("brief_field", 60)),
) -> BriefOut:
    """Regenerate a single field of an existing brief, keeping everything else intact."""
    from src.billing.guards import check_page_pool
    check_page_pool(user, data.page_count)
    merged = await service.regenerate_brief_field(data)
    return BriefOut(**merged)


@router.get("/page-count-options", response_model=PageCountOptionsOut)
async def page_count_options() -> PageCountOptionsOut:
    return PageCountOptionsOut(
        options=PAGE_COUNT_OPTIONS,
        default=DEFAULT_PAGE_COUNT,
        min=MIN_PAGE_COUNT,
        max=MAX_PAGE_COUNT,
    )


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_book(
    data: CreateBookIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> BookOut:
    from src.billing.guards import reserve_pages
    from src.generation.tasks import enqueue_generation

    # Reserve the pages up front (reserve-at-start) — this both checks and
    # consumes atomically, so there's no window where a second book can slip
    # through while this one is still generating. Refunded if generation fails.
    charged_m, charged_t = await reserve_pages(db, user, data.page_count)
    book = await service.create_book_record(db, user.id, data, pages_charged=charged_m, pages_charged_topup=charged_t)
    enqueued = await enqueue_generation(book.id, user.id, mode="create")
    if not enqueued:
        # Cloud Tasks not configured — run generation inline (previous behaviour).
        await service.run_generation(book.id, user.id)
        book = await service.get_book(db, book.id, user.id)
    return BookOut.model_validate(book)


@router.post("/_internal/generate", include_in_schema=False)
async def _generate_worker(request: Request) -> dict:
    """Internal endpoint invoked by Cloud Tasks to run a generation job.

    Authenticated via the task's OIDC token (verified in-process). Returns 200
    once generation finishes — whether it succeeded or recorded a FAILED stage —
    so Cloud Tasks only retries when the worker never responded (e.g. the
    instance was reclaimed mid-run), which is exactly the resilience we want.
    """
    from src.generation.tasks import verify_worker_request

    verify_worker_request(request.headers.get("authorization"))
    body = await request.json()
    book_id = uuid.UUID(body["book_id"])
    user_id = uuid.UUID(body["user_id"])
    await service.run_generation(book_id, user_id)
    return {"status": "ok"}


@router.get("", response_model=list[BookSummaryOut])
async def list_books(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
    request: Request = None,
) -> list[BookSummaryOut]:
    rows = await service.list_books(db, user.id)
    result = []
    for book, illustrated_count, narrated_count, cover_page_id, is_fully_illustrated in rows:
        summary = BookSummaryOut.model_validate(book)
        summary.illustrated_page_count = illustrated_count
        summary.narrated_page_count = narrated_count
        summary.is_fully_illustrated = is_fully_illustrated
        if cover_page_id:
            summary.cover_image_url = f"/books/{book.id}/pages/{cover_page_id}/image"
        result.append(summary)
    return result


@router.post("/draft", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_draft(
    data: CreateDraftIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> BookOut:
    from src.billing.guards import check_page_pool
    check_page_pool(user, data.page_count)
    book = await service.create_draft(db, user.id, data)
    return BookOut.model_validate(book)


# ── Public endpoints (no auth — must be BEFORE /{book_id}) ───────────────────

@router.get("/samples", response_model=list[BookSummaryOut])
async def get_sample_books(
    db: AsyncSession = Depends(get_db),
) -> list[BookSummaryOut]:
    """Return all books marked as samples (public, curated). Used by the landing page."""
    from sqlalchemy import select as sa_select
    from src.books.models import Book as BookModel, Page as PageModel
    from sqlalchemy import func, case

    rows = await db.execute(
        sa_select(
            BookModel,
            func.count(PageModel.id).filter(PageModel.image_key.isnot(None)).label("illustrated_count"),
            func.min(case((PageModel.image_key.isnot(None), PageModel.id.cast(sa.String)), else_=None)).label("cover_page_id"),
        )
        .outerjoin(PageModel, PageModel.book_id == BookModel.id)
        .where(BookModel.is_sample.is_(True), BookModel.visibility == "public")
        .group_by(BookModel.id)
        .order_by(BookModel.created_at.asc())
    )
    result = []
    for book, illustrated_count, cover_page_id in rows:
        summary = BookSummaryOut.model_validate(book)
        summary.illustrated_page_count = illustrated_count or 0
        if cover_page_id:
            summary.cover_image_url = f"/books/public/{book.id}/pages/{cover_page_id}/image"
        result.append(summary)
    return result


@router.get("/public/{book_id}", response_model=BookOut)
async def get_public_book(
    book_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> BookOut:
    from fastapi import HTTPException
    from sqlalchemy import select as sa_select
    from src.books.models import Book as BookModel
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        sa_select(BookModel).where(BookModel.id == book_id, BookModel.visibility == "public")
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found or not public")
    result2 = await db.execute(
        sa_select(BookModel)
        .options(selectinload(BookModel.pages), selectinload(BookModel.characters))
        .where(BookModel.id == book_id)
    )
    book = result2.scalar_one()

    # Sample books showcase both page styles: alternate Clear separation (3) and
    # Words on Picture (1) across the curated set, with the last one on Words on
    # Picture. Applied in-memory only (this is a read; nothing is persisted).
    if getattr(book, "is_sample", False):
        ids_res = await db.execute(
            sa_select(BookModel.id)
            .where(BookModel.is_sample.is_(True), BookModel.visibility == "public")
            .order_by(BookModel.created_at.asc())
        )
        sample_ids = [r[0] for r in ids_res.all()]
        if book_id in sample_ids:
            idx = sample_ids.index(book_id)
            is_last = idx == len(sample_ids) - 1
            mode = 1 if (is_last or idx % 2 == 1) else 3
            for p in book.pages:
                if not getattr(p, "is_cover", False) and not getattr(p, "is_back_cover", False):
                    p.text_mode = mode

    return BookOut.model_validate(book)


@router.get("/public/{book_id}/pages/{page_id}/image")
async def get_public_page_image(
    book_id: uuid.UUID,
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    from fastapi import HTTPException
    from sqlalchemy import select as sa_select
    from src.books.models import Book as BookModel, Page
    from src.storage import minio_client

    book_result = await db.execute(
        sa_select(BookModel.visibility).where(BookModel.id == book_id)
    )
    row = book_result.one_or_none()
    if row is None or row.visibility != "public":
        raise HTTPException(status_code=404, detail="Not found or not public")

    page_result = await db.execute(
        sa_select(Page.image_key).where(Page.id == page_id, Page.book_id == book_id)
    )
    page_row = page_result.one_or_none()
    if page_row is None or page_row.image_key is None:
        raise HTTPException(status_code=404, detail="Image not found")

    data, content_type = minio_client.download_image(page_row.image_key)
    return Response(content=data, media_type=content_type)


@router.get("/voices", response_model=dict)
async def list_voices(user: User = Depends(current_user)) -> dict:
    """Return the preset narration voices (ElevenLabs) with descriptions."""
    from src.generation.preset_voices import PRESET_VOICES
    return {
        "voices": [
            {"id": v["id"], "name": v["name"], "description": v["description"], "is_default": v["is_default"]}
            for v in PRESET_VOICES
        ]
    }


@router.get("/{book_id}", response_model=BookOut)
async def get_book(book: Book = Depends(owned_book)) -> BookOut:
    try:
        return BookOut.model_validate(book)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("BookOut.model_validate failed for book %s: %s", book.id, exc)
        raise


@router.patch("/{book_id}", response_model=BookOut)
async def update_book(
    data: UpdateBookIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.update_book(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.get("/translate/languages")
async def list_translate_languages() -> dict:
    """Languages the reader can translate a book into (direct translation)."""
    from src.books.translate import SUPPORTED_LANGUAGES, RTL_LANGUAGES
    return {
        "languages": [
            {"code": code, "name": name, "rtl": code in RTL_LANGUAGES}
            for code, name in SUPPORTED_LANGUAGES.items()
        ]
    }


@router.post("/{book_id}/translate")
async def translate_book(
    body: dict,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> dict:
    """Translate (and cache) a book's page text into a supported language.
    Body: {"language": "<code>"}. Returns {language, title, pages: {page_id: text}}."""
    from src.books.translate import translate_book as _translate
    language = (body or {}).get("language", "")
    return await _translate(db, book.id, book.user_id, language)


@router.patch("/{book_id}/brief", response_model=BookOut)
async def save_book_brief(
    data: BriefOut,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    """Persist the planning brief onto a draft so the user can resume where they
    left off instead of starting over (and re-spending tokens)."""
    updated = await service.save_brief(db, book.id, book.user_id, data.model_dump())
    return BookOut.model_validate(updated)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> None:
    await service.delete_book(db, book.id, book.user_id)


# ── Export font list ──────────────────────────────────────────────────────────

@router.get("/export/fonts")
async def list_export_fonts(user: User = Depends(current_user)) -> dict:
    """Return available fonts for PDF/EPUB export."""
    from src.books.export import EXPORT_FONTS, DEFAULT_EXPORT_FONT
    return {
        "fonts": [
            {"id": fid, "label": cfg["label"], "is_default": fid == DEFAULT_EXPORT_FONT}
            for fid, cfg in EXPORT_FONTS.items()
        ]
    }


# ── Export endpoints (must be BEFORE /{book_id}/pages/{page_id}) ─────────────

@router.get("/{book_id}/export/pdf")
async def export_pdf(
    font: str = Query(default="nunito"),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> Response:
    from src.books import service
    from src.books.export import build_pdf, EXPORT_FONTS, DEFAULT_EXPORT_FONT
    from fastapi.responses import Response as FastAPIResponse

    import re as _re
    font_id = font if font in EXPORT_FONTS else DEFAULT_EXPORT_FONT
    export_pages = await service.build_export_pages(db, book)
    title = book.brief.get("title", book.title) if book.brief else book.title
    author = book.author_name or getattr(user, "username", "") or ""
    pdf_bytes = await build_pdf(title, export_pages, author=author, font_id=font_id)
    safe_title = _re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "storybook"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
    )


@router.get("/{book_id}/export/cover-image")
async def export_cover_image(
    format: str = Query(default="jpeg"),
    with_text: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> Response:
    """Front cover as a raster image.

    with_text=True  → "Standard" cover (title + author baked in), returned as JPG.
    with_text=False → "Editor" cover (clean artwork, no text), returned as PNG so the
                      user can add their own title in the Amazon KDP cover editor.
    """
    import re as _re
    from src.books import service
    from src.books.export import build_cover_image
    from fastapi.responses import Response as FastAPIResponse

    export_pages = await service.build_export_pages(db, book)
    cover = next((p for p in export_pages if p.is_cover), None)
    if not cover:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No cover page found")

    fmt = "jpeg" if format.lower() in ("jpg", "jpeg") else "png"
    ext = "jpg" if fmt == "jpeg" else "png"
    media = f"image/{'jpeg' if fmt == 'jpeg' else 'png'}"

    title  = book.brief.get("title", book.title) if book.brief else book.title
    author = book.author_name or getattr(user, "username", "") or ""
    img_bytes  = await build_cover_image(title, cover, author=author, fmt=fmt, with_text=with_text)
    safe_title = _re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "storybook"
    variant = "" if with_text else "_editor"
    return FastAPIResponse(
        content=img_bytes,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_title}_cover{variant}.{ext}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{book_id}/export/epub")
async def export_epub(
    font: str = Query(default="nunito"),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> Response:
    import re as _re
    from src.books import service
    from src.books.export import build_epub, EXPORT_FONTS, DEFAULT_EXPORT_FONT
    from fastapi.responses import Response as FastAPIResponse

    font_id = font if font in EXPORT_FONTS else DEFAULT_EXPORT_FONT
    export_pages = await service.build_export_pages(db, book)
    title = book.brief.get("title", book.title) if book.brief else book.title
    author = book.author_name or getattr(user, "username", "") or ""
    epub_bytes = await build_epub(title, author or "AI Storybook Studio", export_pages, font_id=font_id)
    safe_title = _re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "storybook"
    return FastAPIResponse(
        content=epub_bytes,
        media_type="application/epub+zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.epub"'},
    )


# ── KDP publishing assistant ──────────────────────────────────────────────────

@router.get("/{book_id}/kdp", response_model=KDPOut)
async def get_kdp_fields(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> KDPOut:
    """Return KDP publishing fields for this book. Uses cached result if available."""
    client = GeminiClient(api_key=settings.GEMINI_API_KEY)
    out = await generate_kdp_fields(book, user, client)
    await db.commit()
    return out


@router.post("/{book_id}/kdp/regenerate", response_model=KDPOut)
async def regenerate_kdp_fields(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> KDPOut:
    """Force-regenerate KDP fields, overwriting any cached version."""
    client = GeminiClient(api_key=settings.GEMINI_API_KEY)
    out = await generate_kdp_fields(book, user, client, force=True)
    await db.commit()
    return out


@router.patch("/{book_id}/kdp", response_model=KDPOut)
async def update_kdp_fields(
    data: KDPUpdateIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> KDPOut:
    """Merge partial edits into the stored KDP fields."""
    from src.books.kdp import KDPOut as _KDPOut

    current = dict(book.kdp_fields or {})
    updates = data.model_dump(exclude_none=True)
    current.update(updates)
    book.kdp_fields = current
    await db.commit()
    return _KDPOut(**current, is_cached=True)


@router.patch("/{book_id}/pages/style", response_model=BookOut)
async def bulk_page_style(
    data: BulkPageStyleIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> BookOut:
    """Apply book-level style (font, size, color, mode) to every content page.

    This is the Parent-mode (Studio) advanced-editing endpoint, gated to tiers
    that include parent mode.
    """
    from src.billing.guards import require_feature
    require_feature(user, "parent_mode")
    updated = await service.bulk_apply_page_style(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.patch("/{book_id}/pages/{page_id}", response_model=BookOut)
async def update_page(
    page_id: uuid.UUID,
    data: UpdatePageIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.update_page(db, book.id, page_id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/pages/{page_id}/regenerate", response_model=BookOut)
async def regenerate_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.regenerate_page(db, book.id, page_id, book.user_id)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/recalibrate", response_model=BookOut)
async def recalibrate(
    data: RecalibrateIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.recalibrate_book(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/generate", response_model=BookOut)
async def generate_from_draft(
    data: GenerateIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> BookOut:
    from src.billing.guards import reserve_pages
    from src.generation.tasks import enqueue_generation

    # Reserve the pages atomically before committing to generation (see create_book).
    charged_m, charged_t = await reserve_pages(db, user, book.page_count)
    # Mark the draft as generating + persist the art style, then run async.
    updated = await service.prepare_draft_for_generation(db, book.id, book.user_id, data, pages_charged=charged_m, pages_charged_topup=charged_t)
    enqueued = await enqueue_generation(book.id, book.user_id, mode="draft")
    if not enqueued:
        await service.run_generation(book.id, book.user_id)
        updated = await service.get_book(db, book.id, book.user_id)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/characters/sheets", response_model=BookOut)
async def generate_character_sheets(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    from fastapi import HTTPException
    try:
        updated = await service.generate_character_sheets(db, book.id, book.user_id)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    return BookOut.model_validate(updated)


@router.get("/{book_id}/characters/{character_id}/image")
async def get_character_image(
    character_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    from fastapi import HTTPException
    from sqlalchemy import select as sa_select
    from src.books.models import Character
    from src.storage import minio_client

    result = await db.execute(
        sa_select(Character.reference_image_key).where(
            Character.id == character_id, Character.book_id == book.id
        )
    )
    row = result.one_or_none()
    if row is None or row.reference_image_key is None:
        raise HTTPException(status_code=404, detail="Character reference image not generated yet")

    data, content_type = minio_client.download(row.reference_image_key)
    return Response(content=data, media_type=content_type)


@router.post("/{book_id}/illustrating", response_model=BookOut)
async def mark_illustrating(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    """Mark that the user has entered the editor / started drawing pictures, so
    'continue' routes to the editor instead of the pages-review step."""
    updated = await service.mark_illustration_started(db, book.id, book.user_id)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/pages/{page_id}/illustrate", response_model=BookOut)
async def illustrate_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> BookOut:
    from fastapi import HTTPException
    from sqlalchemy import select as _sa_select, update as _sa_update
    from src.books.models import Page as _Page
    from src.billing.tiers import get_tier

    # Pages are paid for when they're WRITTEN (the pool is deducted at book creation),
    # so the FIRST illustration of any page is free/included. Re-illustrating (a remake)
    # is capped per tier: cover/back covers are always free, content pages get
    # `remakes_per_page` remakes. Extra remakes are blocked (upgrade to get more).
    row = (await db.execute(
        _sa_select(_Page.is_cover, _Page.is_back_cover, _Page.image_key, _Page.remake_count).where(
            _Page.id == page_id, _Page.book_id == book.id
        )
    )).one_or_none()
    is_extra = bool(row and (row.is_cover or row.is_back_cover))
    is_remake = bool(row and row.image_key is not None) and not is_extra

    if is_remake and not user.bypass_limits:
        allowance = get_tier(user.subscription_tier).remakes_per_page
        if (row.remake_count or 0) >= allowance:
            raise HTTPException(
                status_code=402,
                detail=(
                    "You've used your remake for this page. "
                    "Upgrade your plan for more picture remakes."
                    if allowance > 0 else
                    "Picture remakes aren't included on your plan. Upgrade to remake pictures."
                ),
            )
    try:
        updated = await service.illustrate_page(db, book.id, page_id, book.user_id)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    # Count the remake against this page's allowance (no pool deduction — pages were
    # already paid for at write-time).
    if is_remake and not user.bypass_limits:
        await db.execute(
            _sa_update(_Page).where(_Page.id == page_id).values(remake_count=_Page.remake_count + 1)
        )
        await db.commit()
    return BookOut.model_validate(updated)


@router.post("/{book_id}/pages/{page_id}/reflow", response_model=BookOut)
async def reflow_page(
    data: ReflowIn,
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    """Rewrite a page's text shorter so it fits the text area without shrinking the
    font. Triggered automatically by the reader when a page would overflow."""
    from fastapi import HTTPException
    try:
        updated = await service.reflow_page(db, book.id, page_id, book.user_id, data.max_words)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    return BookOut.model_validate(updated)


@router.post("/{book_id}/back-cover", response_model=BookOut)
async def create_back_cover(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.create_back_cover_page(db, book.id, book.user_id)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/back-cover/illustrate", response_model=BookOut)
async def illustrate_back_cover(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    from fastapi import HTTPException
    try:
        updated = await service.illustrate_back_cover(db, book.id, book.user_id)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    return BookOut.model_validate(updated)




@router.get("/{book_id}/pages/{page_id}/image")
async def get_page_image(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    from fastapi import HTTPException
    from sqlalchemy import select as sa_select
    from src.books.models import Page
    from src.storage import minio_client

    result = await db.execute(
        sa_select(Page.image_key).where(
            Page.id == page_id, Page.book_id == book.id
        )
    )
    row = result.one_or_none()
    if row is None or row.image_key is None:
        raise HTTPException(status_code=404, detail="Image not generated yet")

    data, content_type = minio_client.download_image(row.image_key)
    return Response(content=data, media_type=content_type)



@router.post("/{book_id}/pages/{page_id}/narrate", response_model=BookOut)
async def narrate_page(
    page_id: uuid.UUID,
    data: NarrateIn = NarrateIn(),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> BookOut:
    from fastapi import HTTPException
    from src.billing.guards import require_feature
    require_feature(user, "narration")
    try:
        updated = await service.narrate_page(
            db, book.id, page_id, book.user_id,
            voice_name=data.voice_name,
            voice_profile_id=data.voice_profile_id,
        )
    except (RuntimeError, ValueError) as exc:
        msg = str(exc)
        if "voice profile not found" in msg.lower():
            raise HTTPException(status_code=404, detail="Voice profile not found — it may have been deleted.")
        if "elevenlabs" in msg.lower() or "tts failed" in msg.lower():
            raise HTTPException(status_code=502, detail="Voice narration service error — please try again or switch to a built-in voice.")
        if "429" in msg or "quota" in msg.lower():
            raise HTTPException(status_code=429, detail="Narration quota exceeded — please wait a moment and try again.")
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    return BookOut.model_validate(updated)


@router.post("/{book_id}/narrate", response_model=BookOut)
async def narrate_book(
    data: NarrateIn = NarrateIn(),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
    user: User = Depends(current_user),
) -> BookOut:
    """Narrate all un-narrated pages in the book sequentially."""
    from fastapi import HTTPException
    from src.billing.guards import require_feature
    require_feature(user, "narration")
    try:
        updated = await service.narrate_book(
            db, book.id, book.user_id,
            voice_name=data.voice_name,
            voice_profile_id=data.voice_profile_id,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=_generation_detail(exc))
    return BookOut.model_validate(updated)


@router.get("/{book_id}/pages/{page_id}/audio")
async def get_page_audio(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    from fastapi import HTTPException
    from sqlalchemy import select as sa_select
    from src.books.models import Page
    from src.storage import minio_client
    from fastapi.responses import Response as FastAPIResponse

    result = await db.execute(
        sa_select(Page.audio_key).where(
            Page.id == page_id, Page.book_id == book.id
        )
    )
    row = result.one_or_none()
    if row is None or row.audio_key is None:
        raise HTTPException(status_code=404, detail="Audio not generated yet")

    data = minio_client.download_audio(row.audio_key)
    return FastAPIResponse(content=data, media_type="audio/wav")


@router.get("/{book_id}/pages/{page_id}/audio/raw")
async def get_page_audio_raw(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    """Download the raw PCM debug file for a page (saved alongside the WAV)."""
    from fastapi import HTTPException
    from src.config import settings
    from src.storage import minio_client
    from fastapi.responses import Response as FastAPIResponse

    raw_key = f"audio/{book.id}/{page_id}.raw.pcm"
    try:
        response = minio_client._client().get_object(settings.MINIO_BUCKET, raw_key)
        data = response.read()
        response.close()
        response.release_conn()
    except Exception:
        raise HTTPException(status_code=404, detail="Raw PCM not found — narrate the page first")

    return FastAPIResponse(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=\"page_{page_id}.raw.pcm\""},
    )


@router.post("/{book_id}/pages", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def add_page(
    data: AddPageIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.add_page(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/characters", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def add_character(
    data: AddCharacterIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.add_character(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)
