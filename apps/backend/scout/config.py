"""Application settings (`SCOUT_*` env vars, pydantic-settings)."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine.url import make_url


class Settings(BaseSettings):
    """Validated configuration loaded once per process."""

    model_config = SettingsConfigDict(
        env_prefix="SCOUT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://scout:scout@localhost:5432/scout",
        description=(
            "Primary async Postgres DSN; override per environment. "
            "Host-side tooling must use localhost + Compose-published port "
            "and DB name `scout` (see README / .env.example)."
        ),
    )
    db_host_port: int | None = Field(
        default=None,
        ge=1,
        le=65535,
        description=(
            "Host-published Postgres port from docker-compose (`SCOUT_DB_HOST_PORT`). "
            "Applied by host-side CLIs such as ingest when the DSN hostname is "
            "`db`, `localhost`, or loopback."
        ),
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
        default="local_dc",
        description="geocoding adapter: local_dc | stub",
    )
    restrooms_provider: str = Field(
        default="refuge",
        description="restrooms adapter: refuge | stub",
    )
    ors_base_url: str = Field(default="https://api.heigit.org")
    ors_api_key: str | None = Field(default=None)
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

    @field_validator("db_host_port", mode="before")
    @classmethod
    def empty_db_host_port_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


def cors_origin_list(csv: str) -> list[str]:
    """Normalize the optional CORS CSV field."""

    return [chunk.strip() for chunk in csv.split(",") if chunk.strip()]


_ENV_FILE_SEARCH_DEPTH = 6


def discover_dotenv_path(start: Path | None = None) -> Path | None:
    """Walk up from ``start`` (default CWD) looking for the project ``.env``.

    pydantic-settings only consults a ``.env`` relative to the process working
    directory by default, but Scout's canonical ``.env`` lives at the **repo
    root**. CLIs invoked from a subdirectory (``uv run --directory
    apps/backend …``, ``cd apps/backend && alembic …``) would otherwise miss
    it silently.
    """

    cursor = (start or Path.cwd()).resolve()
    for _ in range(_ENV_FILE_SEARCH_DEPTH):
        candidate = cursor / ".env"
        if candidate.is_file():
            return candidate
        if cursor.parent == cursor:
            return None
        cursor = cursor.parent
    return None


def load_settings() -> Settings:
    """Factory for Depends wiring — keeps tests able to reload settings cleanly."""

    discovered = discover_dotenv_path()
    if discovered is not None:
        return Settings(_env_file=str(discovered))  # type: ignore[call-arg]
    return Settings()


def migrate_sync_database_url(database_url: str) -> str:
    """Alembic uses a synchronous SQLAlchemy driver in this scaffold."""

    if "+asyncpg" in database_url:
        return database_url.replace("+asyncpg", "+psycopg", 1)
    return database_url


_PUBLISHED_HOST_PORT_DNS = frozenset({"db", "localhost", "127.0.0.1", "::1"})


def normalize_database_url_for_compose_host_port(
    database_url: str,
    *,
    compose_published_host_port: int | None,
) -> str:
    """Point DB URLs used on the laptop at the Compose-published Postgres port."""

    if compose_published_host_port is None:
        return database_url

    parsed = make_url(database_url)
    hostname = parsed.host
    if hostname is None or hostname not in _PUBLISHED_HOST_PORT_DNS:
        return database_url

    adjusted = parsed.set(host="127.0.0.1", port=compose_published_host_port)
    return adjusted.render_as_string(hide_password=False)


_settings_token: Settings | None = None


def cached_settings() -> Settings:
    """Process-wide Settings singleton consumed by routers that lack FastAPI Depends."""

    global _settings_token
    if _settings_token is None:
        _settings_token = load_settings()
    return _settings_token
