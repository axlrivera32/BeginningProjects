# backend/routers/bot.py  ·  NexDeFi v6
# IL Hedge Bot — per-boundary config (lower SHORT / upper LONG)
# All execution logic lives in the browser; this router stores/retrieves
# pool-bot configs in the DB and provides a status endpoint.

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from backend.middleware.auth import get_current_user

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class BoundaryConfig(BaseModel):
    enabled:    bool  = False
    amountUSD:  float = 50.0
    leverage:   float = 10.0
    trailPct:   float = 1.5    # trailing stop % — closes only when profitable


class PoolHedgeConfig(BaseModel):
    """Per-pool IL hedge bot configuration."""
    tokenId:    str                     # Uniswap V3 NFT token ID
    pair:       str                     # e.g. "ETH/USDC"
    priceLower: float
    priceUpper: float
    coin:       str                     # base asset e.g. "ETH"
    marketType: str   = "futures"       # "futures" | "spot"
    lower:      BoundaryConfig = BoundaryConfig()
    upper:      BoundaryConfig = BoundaryConfig()
    exchange:   str   = "hl"            # "hl" | "bx"


class GlobalBotConfig(BaseModel):
    """Legacy global bot config — kept for backward compatibility."""
    maxPositionPct:  float = 5.0
    trailingStopPct: float = 1.5
    breakEvenPct:    float = 1.0
    confirmCandles:  int   = 2
    marketType:      str   = "futures"


# ── In-memory bot state (replace with Redis in production) ───────────────────
_bot_configs: dict[str, PoolHedgeConfig] = {}  # tokenId → config
_bot_running: dict[str, bool]            = {}  # tokenId → running


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/pool/configure")
async def configure_pool_bot(cfg: PoolHedgeConfig, user=Depends(get_current_user)):
    """Save or update the hedge bot config for a specific pool."""
    _bot_configs[cfg.tokenId] = cfg
    return {"status": "saved", "tokenId": cfg.tokenId}


@router.post("/pool/{token_id}/start")
async def start_pool_bot(token_id: str, user=Depends(get_current_user)):
    """Mark bot as running (actual execution is client-side)."""
    if token_id not in _bot_configs:
        return {"status": "error", "message": "No config found for this pool."}
    _bot_running[token_id] = True
    return {"status": "started", "tokenId": token_id}


@router.post("/pool/{token_id}/stop")
async def stop_pool_bot(token_id: str, user=Depends(get_current_user)):
    _bot_running[token_id] = False
    return {"status": "stopped", "tokenId": token_id}


@router.get("/pool/{token_id}/status")
async def pool_bot_status(token_id: str, user=Depends(get_current_user)):
    cfg     = _bot_configs.get(token_id)
    running = _bot_running.get(token_id, False)
    return {
        "tokenId": token_id,
        "running": running,
        "configured": cfg is not None,
        "config": cfg.model_dump() if cfg else None,
    }


@router.get("/pool/all")
async def all_pool_bots(user=Depends(get_current_user)):
    return {
        "pools": [
            {
                "tokenId": tid,
                "running": _bot_running.get(tid, False),
                "config":  cfg.model_dump(),
            }
            for tid, cfg in _bot_configs.items()
        ]
    }


# ── Legacy global bot endpoints (backward-compatible) ────────────────────────

@router.post("/start")
async def start(config: GlobalBotConfig, user=Depends(get_current_user)):
    return {"status": "started", "config": config.model_dump()}


@router.post("/stop")
async def stop(user=Depends(get_current_user)):
    return {"status": "stopped"}


@router.get("/status")
async def status(user=Depends(get_current_user)):
    running_pools = [t for t, r in _bot_running.items() if r]
    return {
        "running": len(running_pools) > 0,
        "activePools": running_pools,
        "pnl": 0,
        "trades": 0,
        "hedges": len(running_pools),
    }
