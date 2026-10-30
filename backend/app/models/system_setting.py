"""
app/models/system_setting.py — Key/value store for instance-wide settings.

The row with key "installed" is the server-side installation flag; its primary-key
uniqueness is what stops two concurrent setup requests from both succeeding.
"""

from datetime import datetime, timezone

from app.extensions import db


class SystemSetting(db.Model):
    __tablename__ = "system_settings"

    key = db.Column(db.String(64), primary_key=True)
    value = db.Column(db.Text, nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    BRANDING_KEYS = ("institution_name", "system_name", "logo", "timezone", "language", "slip_code")

    @classmethod
    def get(cls, key, default=None):
        row = db.session.get(cls, key)
        return row.value if row and row.value is not None else default

    @classmethod
    def put(cls, key, value):
        """Upsert without committing (caller owns the transaction)."""
        row = db.session.get(cls, key)
        if row:
            row.value = value
        else:
            db.session.add(cls(key=key, value=value))

    @classmethod
    def branding(cls) -> dict:
        return {k: cls.get(k, "") for k in cls.BRANDING_KEYS}

    @classmethod
    def is_installed(cls) -> bool:
        """Installed if the flag exists, or an Election Officer already exists (legacy deployments)."""
        from app.models.user import User

        if db.session.get(cls, "installed") is not None:
            return True
        return db.session.query(User.id).filter(User.role == "admin").first() is not None
