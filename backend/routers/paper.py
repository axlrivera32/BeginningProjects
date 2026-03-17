from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from backend.middleware.auth import get_current_user

router = APIRouter()

class PaperTradeRequest(BaseModel):
    market: str; side: str; size: float
    entryPrice: Optional[float] = None
    leverage: int = 1
    marketType: str = "futures"

@router.post("/trade")
async def trade(body: PaperTradeRequest, user=Depends(get_current_user)):
    return {"status": "ok"}

@router.get("/positions")
async def positions(user=Depends(get_current_user)):
    return {"positions": [], "balance": 10000}

@router.post("/reset")
async def reset(user=Depends(get_current_user)):
    return {"balance": 10000}
