from datetime import timedelta

from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    JWT_EXP: int = 15  # minutes

    REFRESH_TOKEN_EXP_DAYS: int = 30

    GOOGLE_CLIENT_ID: str = ""

    @property
    def refresh_token_exp(self) -> timedelta:
        return timedelta(days=self.REFRESH_TOKEN_EXP_DAYS)


auth_settings = AuthConfig()
