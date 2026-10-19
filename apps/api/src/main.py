import secrets

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator

from src.admin.router import router as admin_router
from src.auth.router import router as auth_router
from src.billing.router import router as billing_router
from src.books.router import router as books_router
from src.profiles.router import router as profiles_router
from src.voices.router import router as voices_router
from src.config import Environment, settings
from src.exceptions import register_exception_handlers
from src import metrics as _metrics  # noqa: F401 — registers custom metrics at startup

app = FastAPI(
    title="Storybook Studio API",
    version=settings.APP_VERSION,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
    docs_url="/docs" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != Environment.PRODUCTION else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# ── Prometheus metrics ──────────────────────────────────────────────────────
# Collect default HTTP metrics (request count, latency, status) across all
# routes except the scrape endpoint itself. Exposed via a token-guarded
# /metrics below so an internal Prometheus can scrape it.
Instrumentator(
    excluded_handlers=["/metrics", "/health"],
).instrument(app)


@app.get("/metrics", include_in_schema=False)
async def metrics(authorization: str | None = Header(default=None)) -> Response:
    token = settings.METRICS_TOKEN
    if token:
        expected = f"Bearer {token}"
        if not authorization or not secrets.compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="Unauthorized")
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(billing_router, prefix="/billing", tags=["Billing"])
app.include_router(books_router, prefix="/books", tags=["Books"])
app.include_router(profiles_router, prefix="/profiles", tags=["Profiles"])
app.include_router(voices_router, prefix="/voices", tags=["Voices"])
app.include_router(admin_router, prefix="/admin", tags=["Admin"])


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.APP_VERSION}
