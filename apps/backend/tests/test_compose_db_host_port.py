"""SCOUT_DB_HOST_PORT URL normalization + repo-root .env discovery."""

from __future__ import annotations

import os
from pathlib import Path

from scout.config import (
    discover_dotenv_path,
    load_settings,
    normalize_database_url_for_compose_host_port,
)


def test_compose_port_rewrites_db_hostname() -> None:
    routed = normalize_database_url_for_compose_host_port(
        "postgresql+asyncpg://scout:scout@db:5432/scout",
        compose_published_host_port=9876,
    )
    assert routed == ("postgresql+asyncpg://scout:scout@127.0.0.1:9876/scout")


def test_compose_port_rewrites_localhost_port() -> None:
    routed = normalize_database_url_for_compose_host_port(
        "postgresql+asyncpg://scout:scout@localhost:5432/scout",
        compose_published_host_port=9876,
    )
    suffix_ok = routed.endswith(":9876/scout")

    assert suffix_ok


def test_compose_port_skips_explicit_remote_host() -> None:
    routed = normalize_database_url_for_compose_host_port(
        "postgresql+asyncpg://scout:scout@cloud.example.invalid:6432/db",
        compose_published_host_port=9876,
    )

    assert routed == ("postgresql+asyncpg://scout:scout@cloud.example.invalid:6432/db")


def test_compose_port_missing_leaves_dsns() -> None:
    src = "postgresql+asyncpg://scout:scout@db:5432/scout"

    routed = normalize_database_url_for_compose_host_port(
        src, compose_published_host_port=None
    )

    assert routed == src


def test_discover_dotenv_walks_up_to_repo_root(tmp_path: Path) -> None:
    repo_root = tmp_path / "fake_repo"
    nested = repo_root / "apps" / "backend"
    nested.mkdir(parents=True)
    env_path = repo_root / ".env"
    env_path.write_text("SCOUT_DATABASE_URL=postgresql+asyncpg://x:y@db:5432/scout\n")

    found = discover_dotenv_path(start=nested)

    assert found == env_path


def test_load_settings_reads_discovered_dotenv(
    tmp_path: Path,
    monkeypatch,
) -> None:
    repo_root = tmp_path / "fake_repo"
    nested = repo_root / "apps" / "backend"
    nested.mkdir(parents=True)
    (repo_root / ".env").write_text(
        "SCOUT_DATABASE_URL=postgresql+asyncpg://u:p@db:5432/scout\n"
        "SCOUT_DB_HOST_PORT=5544\n"
    )
    monkeypatch.chdir(nested)
    # Strip any inherited overrides so we exercise the .env path.
    for key in ("SCOUT_DATABASE_URL", "SCOUT_DB_HOST_PORT"):
        monkeypatch.delenv(key, raising=False)
    os.environ.pop("SCOUT_DATABASE_URL", None)
    os.environ.pop("SCOUT_DB_HOST_PORT", None)

    settings = load_settings()

    assert settings.db_host_port == 5544 and settings.database_url.endswith(
        "@db:5432/scout"
    )
