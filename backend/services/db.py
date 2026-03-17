# backend/services/db.py
# Supports both SQLite (default, zero-config) and PostgreSQL (production).
# The DATABASE_URL in .env controls which driver is used:
#   SQLite:     sqlite+aiosqlite:///./nexdefi.db
#   PostgreSQL: postgresql+asyncpg://user:pass@host/dbname

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

# SQLite needs check_same_thread=False; PostgreSQL needs pool settings
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_engine_kwargs: dict = {"echo": False}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs.update({"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10})

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables. Called at startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
