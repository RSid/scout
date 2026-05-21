"""Alembic environment configuration."""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from scout.config import migrate_sync_database_url
from scout.data.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


_DEFAULT_ASYNC_DSN = "postgresql+asyncpg://scout:scout@localhost:5432/postgres"


def resolve_migration_database_url() -> str:
    return migrate_sync_database_url(os.getenv("SCOUT_DATABASE_URL", _DEFAULT_ASYNC_DSN))


config.set_main_option("sqlalchemy.url", resolve_migration_database_url())

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Render SQL without connecting (``alembic upgrade --sql``)."""

    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations via a pooled synchronous SQLAlchemy engine."""

    section = config.get_section(config.config_ini_section, {}) or {}
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
