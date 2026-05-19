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


settings = Config()
