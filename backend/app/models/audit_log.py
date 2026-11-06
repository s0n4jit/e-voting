"""
app/models/audit_log.py — AuditLog ORM model.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import synonym
from app.extensions import db
from app.utils.timeutil import utc_iso


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True, index=True)
    action = db.Column(db.String(100), nullable=False, index=True)
    details = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    actor_id = synonym("user_id")
    timestamp = synonym("created_at")

    def __init__(self, **kwargs):
        if "actor_id" in kwargs and "user_id" not in kwargs:
            kwargs["user_id"] = kwargs.pop("actor_id")
        if "timestamp" in kwargs and "created_at" not in kwargs:
            kwargs["created_at"] = kwargs.pop("timestamp")
        super().__init__(**kwargs)

    def to_dict(self) -> dict:
        """Return dict representation."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "actor_id": self.user_id,
            "action": self.action,
            "details": self.details,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "created_at": utc_iso(self.created_at),
            "timestamp": utc_iso(self.created_at),
        }
