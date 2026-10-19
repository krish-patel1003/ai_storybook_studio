from enum import StrEnum

from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str

    ENVIRONMENT: Environment = Environment.LOCAL

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    CORS_HEADERS: list[str] = ["*"]

    APP_VERSION: str = "0.1.0"

    GEMINI_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""

    # Ollama — override when running inside Docker
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"

    # MinIO (local object storage for illustrations)
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "illustrations"
    MINIO_SECURE: bool = False

    # Email (Gmail SMTP / Google Workspace SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""          # e.g. ira-tech@csulb.edu
    SMTP_PASSWORD: str = ""      # Gmail App Password (16-char, no spaces)
    EMAIL_FROM: str = "Storybook.Studio <noreply@storybook.studio>"
    FRONTEND_URL: str = "https://ai-storybook-studio.vercel.app"
    API_URL: str = "https://storybook-api-741258687011.us-central1.run.app"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # Admin dashboard — REQUIRED: set via environment variables, no defaults
    ADMIN_USERNAME: str
    ADMIN_PASSWORD: str

    # Stripe billing
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # Price IDs — set after creating products in Stripe dashboard
    STRIPE_PRICE_STORYTELLER: str = ""
    STRIPE_PRICE_STUDIO: str = ""
    # One-time page-pack prices (top-ups)
    STRIPE_PRICE_PACK_MINI: str = ""
    STRIPE_PRICE_PACK_VALUE: str = ""
    STRIPE_PRICE_PACK_BULK: str = ""
    # Legacy (kept so old env files don't break; no longer used for new checkouts)
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_FAMILY: str = ""
    STRIPE_PRICE_CREATOR: str = ""

    # ── Async generation via Cloud Tasks ────────────────────────────────────
    # When TASKS_ENABLED is true, POST /books returns immediately and the heavy
    # generation runs on a Cloud Tasks-driven worker request (which keeps the
    # Cloud Run instance alive for the whole job and auto-retries if the
    # instance dies mid-run). When false, generation runs inline in the request
    # (the previous synchronous behaviour) — the safe default for local dev.
    TASKS_ENABLED: bool = False
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "us-central1"
    TASKS_QUEUE: str = "storybook-generation"
    # Service account email Cloud Tasks mints its OIDC token as; the worker
    # endpoint verifies inbound tokens carry exactly this verified email.
    TASKS_INVOKER_SA: str = ""
    # Max seconds Cloud Tasks waits for the worker before treating the attempt
    # as failed and retrying (HTTP task hard cap is 1800s / 30 min).
    TASKS_DISPATCH_DEADLINE_SECONDS: int = 1800

    # ── Observability ───────────────────────────────────────────────────────
    # When set, /metrics requires a matching bearer token (Prometheus scrape
    # config supplies it). Leave empty to expose /metrics without auth (dev only).
    METRICS_TOKEN: str = ""


settings = Config()
