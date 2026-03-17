from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:diner_invertido666@localhost/nexdefi"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET_KEY: str = "nexdefi-jwt-secret-change-in-production!!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SENDGRID_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@nexdefi.app"
    FRONTEND_URL: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    class Config:
        env_file = "backend/.env"
        env_file_encoding = "utf-8"

settings = Settings()
