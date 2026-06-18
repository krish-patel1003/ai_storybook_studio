import uuid
from typing import Sequence

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.books import service
from src.books.dependencies import current_user, owned_book
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
    StorySeedOut,
    UpdateBookIn,
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
    user: User = Depends(current_user),
) -> BrainstormOut:
    """Generate 6 short story seed ideas to inspire the user before they write their prompt."""
    result = await service.brainstorm(data)
    return BrainstormOut(seeds=[StorySeedOut(title=s.title, hook=s.hook) for s in result.seeds])


@router.post("/prompts/expand", response_model=ExpandedPromptOut)
async def expand_prompt(
    data: ExpandPromptIn,
    user: User = Depends(current_user),
) -> ExpandedPromptOut:
    """Expand a user's prompt into a rich story concept."""
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
    user: User = Depends(current_user),
) -> BriefOut:
    """Generate a single story brief from the user's prompt and settings."""
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
    user: User = Depends(current_user),
) -> BriefOut:
    """Regenerate a single field of an existing brief, keeping everything else intact."""
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
    book = await service.create_and_generate(db, user.id, data)
    return BookOut.model_validate(book)


@router.get("", response_model=list[BookSummaryOut])
async def list_books(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
    request: Request = None,
) -> list[BookSummaryOut]:
    rows = await service.list_books(db, user.id)
    result = []
    for book, illustrated_count, cover_page_id in rows:
        summary = BookSummaryOut.model_validate(book)
        summary.illustrated_page_count = illustrated_count
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
    book = await service.create_draft(db, user.id, data)
    return BookOut.model_validate(book)


# ── Public endpoints (no auth — must be BEFORE /{book_id}) ───────────────────

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
    """Return available TTS voices with descriptions."""
    from src.generation.tts import AVAILABLE_VOICES, DEFAULT_VOICE
    return {
        "voices": [
            {"id": k, "description": v, "is_default": k == DEFAULT_VOICE}
            for k, v in AVAILABLE_VOICES.items()
        ]
    }


@router.get("/{book_id}", response_model=BookOut)
async def get_book(book: Book = Depends(owned_book)) -> BookOut:
    return BookOut.model_validate(book)


@router.patch("/{book_id}", response_model=BookOut)
async def update_book(
    data: UpdateBookIn,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.update_book(db, book.id, book.user_id, data)
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
    author = getattr(user, "pen_name", "") or ""
    pdf_bytes = await build_pdf(title, export_pages, author=author, font_id=font_id)
    safe_title = _re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "storybook"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
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
    author = getattr(user, "pen_name", "") or ""
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
) -> BookOut:
    updated = await service.generate_from_draft(db, book.id, book.user_id, data)
    return BookOut.model_validate(updated)


@router.post("/{book_id}/characters/sheets", response_model=BookOut)
async def generate_character_sheets(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.generate_character_sheets(db, book.id, book.user_id)
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


@router.post("/{book_id}/pages/{page_id}/illustrate", response_model=BookOut)
async def illustrate_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    updated = await service.illustrate_page(db, book.id, page_id, book.user_id)
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
) -> BookOut:
    updated = await service.narrate_page(
        db, book.id, page_id, book.user_id,
        voice_name=data.voice_name,
        voice_profile_id=data.voice_profile_id,
    )
    return BookOut.model_validate(updated)


@router.post("/{book_id}/narrate", response_model=BookOut)
async def narrate_book(
    data: NarrateIn = NarrateIn(),
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> BookOut:
    """Narrate all un-narrated pages in the book sequentially."""
    updated = await service.narrate_book(
        db, book.id, book.user_id,
        voice_name=data.voice_name,
        voice_profile_id=data.voice_profile_id,
    )
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
