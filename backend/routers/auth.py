# backend/routers/auth.py
# Full DB-backed auth: register, login, wallet auth, password recovery, profile.

import secrets
import time
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.middleware.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    get_current_user,
)
from backend.services.db import get_db
from backend.services.email import send_recovery_email
from backend.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Recovery code store (Redis if available, else in-memory) ──────────────────
_codes: dict[str, str] = {}

async def _save_code(email: str, code: str) -> None:
    try:
        import redis.asyncio as aioredis
        from backend.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.setex(f"recovery:{email.lower()}", 600, code)
        return
    except Exception:
        pass
    _codes[email.lower()] = code

async def _load_code(email: str) -> str | None:
    try:
        import redis.asyncio as aioredis
        from backend.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        v = await r.get(f"recovery:{email.lower()}")
        if v:
            return v
    except Exception:
        pass
    return _codes.get(email.lower())

async def _clear_code(email: str) -> None:
    try:
        import redis.asyncio as aioredis
        from backend.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.delete(f"recovery:{email.lower()}")
    except Exception:
        pass
    _codes.pop(email.lower(), None)


# ── Request/Response models ───────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    firstName: str
    lastName:  str
    email:     EmailStr
    password:  str

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class WalletLoginRequest(BaseModel):
    address: str
    name:    str | None = None

class RecoveryRequest(BaseModel):
    email: EmailStr

class ResetRequest(BaseModel):
    email:       EmailStr
    code:        str
    newPassword: str

class UpdateProfileRequest(BaseModel):
    name: str

class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str


# ── Helpers ───────────────────────────────────────────────────────────────────
def _user_to_dict(user: User) -> dict:
    return {
        "id":            user.id,
        "email":         user.email,
        "name":          user.name,
        "avatar":        user.avatar,
        "walletAddress": user.wallet_address,
        "isWalletUser":  user.is_wallet_user,
        "createdAt":     user.created_at,
        "lastLogin":     user.last_login,
    }

async def _get_user_by_email(email: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    return result.scalar_one_or_none()

async def _get_user_by_wallet(address: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.wallet_address == address.lower()))
    return result.scalar_one_or_none()

async def _get_user_by_id(user_id: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Validate
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if not body.firstName.strip() or not body.lastName.strip():
        raise HTTPException(400, "First and last name are required.")

    email = body.email.lower().strip()
    existing = await _get_user_by_email(email, db)
    if existing:
        raise HTTPException(409, "An account with this email already exists.")

    # Create user
    first = body.firstName.strip()
    last  = body.lastName.strip()
    user  = User(
        email         = email,
        name          = f"{first} {last}",
        password_hash = hash_password(body.password),
        avatar        = (first[0] + last[0]).upper(),
        is_wallet_user= False,
        created_at    = int(time.time() * 1000),
        last_login    = int(time.time() * 1000),
        is_active     = True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info(f"✓ User registered: {user.id} | {user.email} | {user.name}")

    # Return JWT so the frontend can start a session immediately
    access  = create_access_token({"sub": user.id, "email": user.email})
    refresh = create_refresh_token({"sub": user.id})
    return {
        "accessToken":  access,
        "refreshToken": refresh,
        "user":         _user_to_dict(user),
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()
    user  = await _get_user_by_email(email, db)

    if not user:
        logger.warning(f"⚠ Login failed: no user found with email {email}")
        raise HTTPException(401, "No account found with this email.")
    if not user.password_hash or not verify_password(body.password, user.password_hash):
        logger.warning(f"⚠ Login failed: incorrect password for {email}")
        raise HTTPException(401, "Incorrect password.")
    if not user.is_active:
        logger.warning(f"⚠ Login failed: account disabled for {email}")
        raise HTTPException(403, "Account is disabled.")

    # Update last login
    user.last_login = int(time.time() * 1000)
    await db.commit()
    logger.info(f"✓ User login: {user.id} | {user.email}")

    access  = create_access_token({"sub": user.id, "email": user.email})
    refresh = create_refresh_token({"sub": user.id})
    return {
        "accessToken":  access,
        "refreshToken": refresh,
        "user":         _user_to_dict(user),
    }


@router.post("/wallet-login")
async def wallet_login(body: WalletLoginRequest, db: AsyncSession = Depends(get_db)):
    """Create or retrieve account linked to a wallet address."""
    address = body.address.lower().strip()
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(400, "Invalid wallet address.")

    user = await _get_user_by_wallet(address, db)

    if not user:
        # Auto-create wallet-linked account
        short_name = body.name or f"{address[:6]}…{address[-4:]}"
        user = User(
            email          = f"{address}@wallet.local",
            name           = short_name,
            password_hash  = None,
            avatar         = "MM",
            wallet_address = address,
            is_wallet_user = True,
            created_at     = int(time.time() * 1000),
            last_login     = int(time.time() * 1000),
            is_active      = True,
        )
        db.add(user)
    else:
        user.last_login = int(time.time() * 1000)

    await db.commit()
    await db.refresh(user)

    access  = create_access_token({"sub": user.id, "email": user.email})
    refresh = create_refresh_token({"sub": user.id})
    return {
        "accessToken":  access,
        "refreshToken": refresh,
        "user":         _user_to_dict(user),
    }


@router.get("/me")
async def me(
    current: dict       = Depends(get_current_user),
    db: AsyncSession    = Depends(get_db),
):
    user = await _get_user_by_id(current["user_id"], db)
    if not user:
        raise HTTPException(404, "User not found.")
    return _user_to_dict(user)


@router.put("/profile")
async def update_profile(
    body:    UpdateProfileRequest,
    current: dict       = Depends(get_current_user),
    db:      AsyncSession = Depends(get_db),
):
    user = await _get_user_by_id(current["user_id"], db)
    if not user:
        raise HTTPException(404, "User not found.")
    if not body.name.strip():
        raise HTTPException(400, "Name cannot be empty.")
    user.name = body.name.strip()
    await db.commit()
    return _user_to_dict(user)


@router.post("/change-password")
async def change_password(
    body:    ChangePasswordRequest,
    current: dict       = Depends(get_current_user),
    db:      AsyncSession = Depends(get_db),
):
    user = await _get_user_by_id(current["user_id"], db)
    if not user:
        raise HTTPException(404, "User not found.")
    if not user.password_hash or not verify_password(body.oldPassword, user.password_hash):
        raise HTTPException(401, "Current password is incorrect.")
    if len(body.newPassword) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")
    user.password_hash = hash_password(body.newPassword)
    await db.commit()
    return {"message": "Password updated successfully."}


@router.post("/send-recovery")
async def send_recovery(body: RecoveryRequest, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # Check user exists but always return 200 (don't leak email existence)
    user = await _get_user_by_email(str(body.email), db)
    if user:
        code = str(secrets.randbelow(900000) + 100000)
        await _save_code(str(body.email), code)
        bg.add_task(send_recovery_email, str(body.email), code)
    return {"message": "If this email exists, a recovery code was sent."}


@router.post("/reset-password")
async def reset_password(body: ResetRequest, db: AsyncSession = Depends(get_db)):
    stored = await _load_code(str(body.email))
    if not stored or stored != body.code.strip():
        raise HTTPException(400, "Invalid or expired recovery code.")
    if len(body.newPassword) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")

    user = await _get_user_by_email(str(body.email), db)
    if not user:
        raise HTTPException(404, "User not found.")

    user.password_hash = hash_password(body.newPassword)
    await db.commit()
    await _clear_code(str(body.email))
    return {"message": "Password reset successfully."}
