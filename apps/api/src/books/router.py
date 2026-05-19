import uuid
from typing import Sequence

from fastapi import APIRouter, Depends, status
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
    books = await service.list_books(db, user.id)
    return [BookSummaryOut.model_validate(b) for b in books]


@router.post("/draft", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_draft(
    data: CreateDraftIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> BookOut:
    book = await service.create_draft(db, user.id, data)
    return BookOut.model_validate(book)


@router.get("/{book_id}", response_model=BookOut)
async def get_book(book: Book = Depends(owned_book)) -> BookOut:
    return BookOut.model_validate(book)


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
