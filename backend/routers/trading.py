from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from backend.middleware.auth import get_current_user

router = APIRouter()

class OrderRequest(BaseModel):
    exchange: str; coin: str; isBuy: bool; size: float
    limitPrice: Optional[float] = None
    tpPrice: Optional[float] = None
    slPrice: Optional[float] = None
    leverage: int = 1
    marketType: str = "futures"   # "futures" | "spot"
    amountUSD: Optional[float] = None

@router.post("/order")
async def place_order(body: OrderRequest, user=Depends(get_current_user)):
    return {"status": "logged", "exchange": body.exchange, "coin": body.coin, "marketType": body.marketType}

@router.get("/positions")
async def positions(user=Depends(get_current_user)):
    return {"positions": []}

@router.get("/history")
async def history(user=Depends(get_current_user)):
    return {"history": []}
