"""
app/services/auth_service.py — Authentication service helper.
"""

import bcrypt
from flask import current_app


class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a plaintext password using bcrypt."""
        rounds = 12
        try:
            if current_app:
                rounds = current_app.config.get("BCRYPT_LOG_ROUNDS", 12)
        except Exception:
            rounds = 12
        salt = bcrypt.gensalt(rounds=rounds, prefix=b"2b")
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def check_password(password: str, hashed_password: str) -> bool:
        """Verify a plaintext password against a bcrypt hash."""
        if not password or not hashed_password:
            return False
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception:
            return False
