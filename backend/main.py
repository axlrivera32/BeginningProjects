# backend/main.py
# Run from nexdefi-v5/ folder:
#   uvicorn backend.main:app --reload --port 8000

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import auth, trading, bot, paper, prices
from backend.config import settings


async def _init_db() -> None:
    """
    Create all DB tables on startup.
    Works with SQLite (default) and PostgreSQL.
    SQLite file is created automatically at ./nexdefi.db — no setup required.
    """
    try:
        # Import models so SQLAlchemy knows about them before create_all
        import backend.models.user  # noqa: F401
        from backend.services.db import init_db
        await init_db()
        is_sqlite = settings.DATABASE_URL.startswith("sqlite")
        db_type   = "SQLite (nexdefi.db)" if is_sqlite else "PostgreSQL"
        print(f"[DB] ✓ Connected — {db_type}")
    except Exception as e:
        print(f"[DB] ✗ Failed ({type(e).__name__}): {e}")
        if "aiosqlite" in str(e):
            print("[DB]   → Install aiosqlite:  pip install aiosqlite")
        elif "asyncpg" in str(e):
            print("[DB]   → PostgreSQL not reachable. Switch to SQLite in backend/.env:")
            print("[DB]     DATABASE_URL=sqlite+aiosqlite:///./nexdefi.db")
        raise   # Re-raise so uvicorn reports startup failure clearly


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _init_db()
    yield


app = FastAPI(
    title="NexDeFi API v5",
    version="5.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Restrict to FRONTEND_URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,    prefix="/api/auth",    tags=["Auth"])
app.include_router(trading.router, prefix="/api/trading", tags=["Trading"])
app.include_router(bot.router,     prefix="/api/bot",     tags=["Bot"])
app.include_router(paper.router,   prefix="/api/paper",   tags=["Paper"])
app.include_router(prices.router,  prefix="/api/prices",  tags=["Prices"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "5.0.0",
            "db": "sqlite" if settings.DATABASE_URL.startswith("sqlite") else "postgresql"}
