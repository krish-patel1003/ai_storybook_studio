import uuid
from typing import Sequence

from fastapi import APIRouter, Depends, Response, status
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
    BriefGenerateIn,
    BriefOptionsOut,
    CreateBookIn,
    CreateDraftIn,
    GenerateIn,
    ModelInfo,
    ModelsOut,
    PageCountOptionsOut,
    PageOut,
    ProviderInfo,
    RecalibrateIn,
    UpdateBookIn,
    UpdatePageIn,
)
from src.database import get_db
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
                    ModelInfo(id="gemini-2.0-flash", name="Gemini Flash", description="Fast & efficient · Best for drafting", size="cloud"),
                    ModelInfo(id="gemini-1.5-pro", name="Gemini Pro", description="Highest quality · Slower", size="cloud"),
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


@router.post("/briefs/generate", response_model=BriefOptionsOut)
async def generate_brief_options(
    data: BriefGenerateIn,
    user: User = Depends(current_user),
) -> BriefOptionsOut:
    briefs = await service.generate_brief_options(data)
    from src.books.schemas import BriefOut, ArcStageOut
    return BriefOptionsOut(
        briefs=[
            BriefOut(
                title=b.title,
                logline=b.logline,
                central_conflict=b.central_conflict,
                moral=b.moral,
                world=b.world,
                narrative_structure=b.narrative_structure,
                arc=[ArcStageOut(name=a.name, description=a.description, page_span=a.page_span) for a in b.arc],
            )
            for b in briefs
        ]
    )


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
) -> list[BookSummaryOut]:
    rows = await service.list_books(db, user.id)
    result = []
    for book, illustrated_count in rows:
        summary = BookSummaryOut.model_validate(book)
        summary.illustrated_page_count = illustrated_count
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


# ── Export endpoints (must be BEFORE /{book_id}/pages/{page_id}) ─────────────

@router.get("/{book_id}/export/pdf")
async def export_pdf(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    from src.books import service
    from src.books.export import build_pdf
    from fastapi.responses import Response as FastAPIResponse

    export_pages = await service.build_export_pages(db, book)
    title = book.brief.get("title", book.title) if book.brief else book.title
    pdf_bytes = await build_pdf(title, export_pages)
    return FastAPIResponse(content=pdf_bytes, media_type="application/pdf")


@router.get("/{book_id}/export/epub")
async def export_epub(
    db: AsyncSession = Depends(get_db),
    book: Book = Depends(owned_book),
) -> Response:
    from src.books import service
    from src.books.export import build_epub
    from fastapi.responses import Response as FastAPIResponse

    export_pages = await service.build_export_pages(db, book)
    title = book.brief.get("title", book.title) if book.brief else book.title
    epub_bytes = await build_epub(title, "AI Storybook Studio", export_pages)
    return FastAPIResponse(content=epub_bytes, media_type="application/epub+zip")


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
