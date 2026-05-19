from enum import StrEnum

from pydantic import PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: PostgresDsn
    REDIS_URL: RedisDsn

    ENVIRONMENT: Environment = Environment.LOCAL

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    CORS_HEADERS: list[str] = ["*"]

    APP_VERSION: str = "0.1.0"

    GEMINI_API_KEY: str = ""

    # Ollama — override when running inside Docker
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"

    # MinIO (local object storage for illustrations)
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "illustrations"
    MINIO_SECURE: bool = False


settings = Config()
