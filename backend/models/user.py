# backend/models/user.py
import time
import uuid as _uuid
from sqlalchemy import Column, String, Boolean, BigInteger, Text
from sqlalchemy.orm import mapped_column, Mapped
from backend.services.db import Base


class User(Base):
    __tablename__ = "users"

    # Use String(36) for UUID so it works in both SQLite and PostgreSQL
    id             = Column(String(36),  primary_key=True, default=lambda: str(_uuid.uuid4()))
    email          = Column(String(255), unique=True, nullable=False, index=True)
    name           = Column(String(255), nullable=False)
    password_hash  = Column(String(255), nullable=True)   # NULL for wallet-only accounts
    avatar         = Column(String(10),  nullable=True)
    wallet_address = Column(String(42),  nullable=True,   index=True)
    is_wallet_user = Column(Boolean,     default=False,   nullable=False)
    totp_secret    = Column(String(32),  nullable=True)
    created_at     = Column(BigInteger,  nullable=False,  default=lambda: int(time.time() * 1000))
    last_login     = Column(BigInteger,  nullable=True)
    is_active      = Column(Boolean,     default=True,    nullable=False)
