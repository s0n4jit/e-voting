"""
config.py — Application configuration classes.

Supports Development, Testing, and Production environments.
Values are loaded from environment variables (via python-dotenv).
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

# Load .env file at import time so os.environ is populated.
load_dotenv()


class Config:
    """Base configuration shared by all environments."""

    # ── Flask ────────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    DEBUG: bool = False
    TESTING: bool = False

    # ── SQLAlchemy ───────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL",
        "sqlite:///evoting_dev.db",
    )
    # Silence the deprecation warning about modification tracking
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    # Connection pool settings (meaningful for PostgreSQL)
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,        # Detect stale connections
        "pool_recycle": 300,          # Recycle every 5 minutes
        "pool_size": 10,
        "max_overflow": 20,
    }

    # ── JWT ──────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "jwt-dev-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 60))
    )
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 7))
    )
    # Use cookies or headers — we use Authorization header (Bearer)
    JWT_TOKEN_LOCATION: list = ["headers"]
    JWT_BLACKLIST_ENABLED: bool = True
    JWT_BLACKLIST_TOKEN_CHECKS: list = ["access", "refresh"]

    # ── OTP ──────────────────────────────────────────────────────────────────
    OTP_SECRET_LENGTH: int = int(os.environ.get("OTP_SECRET_LENGTH", 32))
    OTP_VALID_WINDOW: int = int(os.environ.get("OTP_VALID_WINDOW", 1))
    OTP_ISSUER: str = os.environ.get("OTP_ISSUER", "CampusEVoting")

    # ── Voting ───────────────────────────────────────────────────────────────
    # Extra seconds allowed after election end_time for in-flight requests
    VOTING_WINDOW_BUFFER: int = int(os.environ.get("VOTING_WINDOW_BUFFER", 30))

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATELIMIT_DEFAULT: str = os.environ.get("RATELIMIT_DEFAULT", "30000 per hour")
    RATELIMIT_STORAGE_URL: str = os.environ.get("RATELIMIT_STORAGE_URL", "memory://")
    RATELIMIT_STORAGE_URI: str = os.environ.get("RATELIMIT_STORAGE_URL", "memory://")  # name Flask-Limiter 3 reads

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    ]

    # ── Logging ──────────────────────────────────────────────────────────────
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")

    # ── Backup ───────────────────────────────────────────────────────────────
    BACKUP_DIR: str = os.environ.get("BACKUP_DIR", "/var/backups/evoting")
    BACKUP_RETENTION_DAYS: int = int(os.environ.get("BACKUP_RETENTION_DAYS", 30))

    # ── Kiosk & Staff Maintenance ────────────────────────────────────────────
    BOOTH_ID: str = os.environ.get("BOOTH_ID", "BOOTH-LAB-01")
    MAINTENANCE_MAX_ATTEMPTS: int = int(os.environ.get("MAINTENANCE_MAX_ATTEMPTS", 5))
    MAINTENANCE_LOCKOUT_SECONDS: int = int(os.environ.get("MAINTENANCE_LOCKOUT_SECONDS", 900))
    VOTING_APP_URL: str = os.environ.get("VOTING_APP_URL", "http://localhost:3000/kiosk/vote")


class DevelopmentConfig(Config):
    """Development configuration — verbose, SQLite by default."""

    DEBUG = True
    LOG_LEVEL = "DEBUG"

    # Override pool settings for SQLite (no pool needed)
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }


class TestingConfig(Config):
    """Testing configuration — in-memory SQLite, no emails sent."""

    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///:memory:")
    # Disable CSRF and rate limiting in tests
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False
    # Use a short-lived token for test speed
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    DEMO_OTP_CODE = "123456"  # tests only; never set outside TestingConfig

    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }


class ProductionConfig(Config):
    """Production configuration — strict, PostgreSQL required."""

    DEBUG = False
    LOG_LEVEL = "WARNING"

    # Enforce that a real secret key is set
    @classmethod
    def init_app(cls, app):
        Config.init_app(app) if hasattr(Config, "init_app") else None
        assert os.environ.get("SECRET_KEY"), (
            "SECRET_KEY environment variable must be set in production!"
        )
        assert os.environ.get("JWT_SECRET_KEY"), (
            "JWT_SECRET_KEY environment variable must be set in production!"
        )
        assert os.environ.get("DATABASE_URL"), (
            "DATABASE_URL environment variable must be set in production!"
        )


# ── Config registry ───────────────────────────────────────────────────────────
config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}


def get_config() -> Config:
    """Return the appropriate Config class based on FLASK_ENV."""
    env = os.environ.get("FLASK_ENV", "development").lower()
    return config_map.get(env, DevelopmentConfig)
