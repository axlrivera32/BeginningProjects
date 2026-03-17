from fastapi import APIRouter
import httpx

router = APIRouter()
FALLBACK = {
    "ethereum": {"usd": 3248, "usd_24h_change": 2.1},
    "bitcoin":  {"usd": 67890, "usd_24h_change": -0.8},
    "solana":   {"usd": 178,   "usd_24h_change": 4.2},
    "arbitrum": {"usd": 1.84,  "usd_24h_change": 1.3},
}

@router.get("/")
async def get_prices():
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids":"ethereum,bitcoin,solana,arbitrum","vs_currencies":"usd","include_24hr_change":"true"})
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return FALLBACK

@router.get("/candles/{symbol}")
async def get_candles(symbol: str, tf: str = "1h", limit: int = 100):
    """Proxy to exchange OHLCV data. In production connect to Hyperliquid/BingX."""
    return {"symbol": symbol, "tf": tf, "note": "Connect to exchange API for real OHLCV data"}
