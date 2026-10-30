"""
app/models/user.py — User ORM model.
"""

from datetime import datetime, timezone
import hashlib
import bcrypt
import pyotp
from flask import current_app

from app.extensions import db
from app.utils.timeutil import utc_iso


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False, default="")
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False, default="voter")
    department = db.Column(db.String(100), nullable=True)
    year = db.Column(db.Integer, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    photo = db.Column(db.Text, nullable=True)  # small profile picture as a data URL (staff only)
    programme_id = db.Column(db.Integer, db.ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True, index=True)
    registered_by = db.Column(db.Integer, nullable=True)
    otp_secret = db.Column(db.String(64), nullable=True)
    otp_enabled = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __init__(self, **kwargs):
        if "role" in kwargs and kwargs["role"] == "admin" and "is_admin" not in kwargs:
            kwargs["is_admin"] = True
        elif kwargs.get("is_admin") and "role" not in kwargs:
            kwargs["role"] = "admin"
        super().__init__(**kwargs)

    def set_password(self, raw_password: str) -> None:
        """Hash raw password with bcrypt and store in password_hash."""
        rounds = 12
        try:
            if current_app:
                rounds = current_app.config.get("BCRYPT_LOG_ROUNDS", 12)
        except Exception:
            rounds = 12
        salt = bcrypt.gensalt(rounds=rounds, prefix=b"2b")
        hashed = bcrypt.hashpw(raw_password.encode("utf-8"), salt)
        self.password_hash = hashed.decode("utf-8")

    def check_password(self, raw_password: str) -> bool:
        """Verify raw password against stored bcrypt hash."""
        if not self.password_hash or not raw_password:
            return False
        try:
            return bcrypt.checkpw(
                raw_password.encode("utf-8"),
                self.password_hash.encode("utf-8"),
            )
        except Exception:
            return False

    def verify_otp(self, code: str) -> bool:
        """Verify TOTP code using user's base-32 otp_secret."""
        if not self.otp_secret or not code:
            return False
        totp = pyotp.TOTP(self.otp_secret)
        return bool(totp.verify(str(code).strip(), valid_window=1))

    @staticmethod
    def hash_student_id(student_id: str) -> str:
        """Return SHA-256 hexadecimal digest of the student ID."""
        if not student_id:
            return ""
        return hashlib.sha256(str(student_id).strip().encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        """Return dictionary representation excluding sensitive authentication data."""
        return {
            "id": self.id,
            "student_id": self.student_id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "department": self.department,
            "year": self.year,
            "programme_id": self.programme_id,
            "photo": self.photo,
            "is_admin": self.is_admin or (self.role == "admin"),
            "is_active": self.is_active,
            "otp_enabled": self.otp_enabled,
            "created_at": utc_iso(self.created_at),
            "updated_at": utc_iso(self.updated_at),
        }
