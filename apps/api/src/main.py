from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.auth.router import router as auth_router
from src.books.router import router as books_router
from src.config import Environment, settings
from src.exceptions import register_exception_handlers

app = FastAPI(
    title="Storybook Studio API",
    version=settings.APP_VERSION,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
    docs_url="/docs" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=settings.CORS_HEADERS,
)

register_exception_handlers(app)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(books_router, prefix="/books", tags=["Books"])


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.APP_VERSION}
