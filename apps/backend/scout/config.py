"""Application settings (`SCOUT_*` env vars, pydantic-settings)."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated configuration loaded once per process."""

    model_config = SettingsConfigDict(
        env_prefix="SCOUT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://scout:scout@localhost:5432/postgres",
        description="Primary async Postgres DSN; override per environment.",
    )
    cors_allowlist_csv: str = Field(
        default="",
        description=(
            "Comma-separated browser origins permitted when explicitly enabled."
        ),
    )
    routing_provider: str = Field(
        default="openrouteservice",
        description="routing adapter: openrouteservice | stub",
    )
    geocoding_provider: str = Field(
        default="photon",
        description="geocoding adapter: photon | stub",
    )
    restrooms_provider: str = Field(
        default="refuge",
        description="restrooms adapter: refuge | stub",
    )
    ors_base_url: str = Field(default="https://api.openrouteservice.org")
    ors_api_key: str | None = Field(default=None)
    photon_base_url: str = Field(
        default="https://photon.komoot.io",
        description=(
            "Photon endpoint. Default is Komoot's upstream community service "
            "(fair-use); production flips this to the self-hosted Fly machine "
            "added in the DEC-022 follow-up PR."
        ),
    )
    photon_user_agent: str = Field(
        default="scout-dev/0.1 (+https://example.invalid)",
        description="Polite User-Agent string emitted on every Photon request.",
    )
    refuge_base_url: str = Field(
        default="https://www.refugerestrooms.org/api/v1",
    )
    cache_dir: str = Field(default="./.scout-cache")
    log_level: str = Field(default="INFO")
    trust_proxy_headers: bool = Field(
        default=False,
        description="Trust edge IP headers — enable only behind a terminating proxy.",
    )
    client_ip_header: str = Field(
        default="X-Forwarded-For",
        description=(
            "When trust_proxy_headers is True: HTTP header with the original client "
            "IP (e.g. X-Forwarded-For, Cf-Connecting-IP, True-Client-IP, X-Real-IP)."
        ),
    )
    rate_limit_enabled: bool = Field(default=True)


def cors_origin_list(csv: str) -> list[str]:
    """Normalize the optional CORS CSV field."""

    return [chunk.strip() for chunk in csv.split(",") if chunk.strip()]


def load_settings() -> Settings:
    """Factory for Depends wiring — keeps tests able to reload settings cleanly."""

    return Settings()


def migrate_sync_database_url(database_url: str) -> str:
    """Alembic uses a synchronous SQLAlchemy driver in this scaffold."""

    if "+asyncpg" in database_url:
        return database_url.replace("+asyncpg", "+psycopg", 1)
    return database_url


_settings_token: Settings | None = None


def cached_settings() -> Settings:
    """Process-wide Settings singleton consumed by routers that lack FastAPI Depends."""

    global _settings_token
    if _settings_token is None:
        _settings_token = load_settings()
    return _settings_token
