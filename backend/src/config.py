"""Application configuration using pydantic-settings."""

import json
from functools import lru_cache
from typing import Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Application
    # Безопасное значение по умолчанию: dev-вход и /docs включаются только явным APP_ENV=development
    APP_ENV: str = "production"
    APP_DEBUG: bool = False
    APP_SECRET_KEY: str

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Сколько прокси перед приложением дописывают адрес в X-Forwarded-For (включая nginx).
    # Адрес клиента берётся справа: левые элементы заголовка контролирует клиент.
    TRUSTED_PROXY_COUNT: int = 1

    # Срок хранения IP и User-Agent в журналах (ФЗ-152), дней
    AUDIT_RETENTION_DAYS: int = 365

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://nexora.digitaldrugs.tech",
    ]

    # Logging
    LOG_LEVEL: str = "INFO"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                result: list[str] = json.loads(v)
                return result
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        if isinstance(v, list):
            return [str(x) for x in v]
        return []

    @model_validator(mode="after")
    def _reject_weak_secrets(self) -> "Settings":
        """В production не запускаемся с примерными или короткими секретами."""
        if self.APP_ENV != "production":
            return self
        for name in ("APP_SECRET_KEY", "JWT_SECRET_KEY"):
            value = getattr(self, name)
            if len(value) < 32 or value.lower().startswith(("change-me", "вставьте")):
                raise ValueError(f"{name}: в production нужен случайный секрет от 32 символов")
        if self.APP_SECRET_KEY == self.JWT_SECRET_KEY:
            raise ValueError("APP_SECRET_KEY и JWT_SECRET_KEY должны различаться")
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
