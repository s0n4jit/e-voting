"""
app/models/booth_create_token.py — One-time token an Election Officer generates in the panel; the
kiosk machine exchanges it (with the officer's authenticator code) for a booth.
"""

from datetime import datetime, timedelta, timezone

from app.extensions import db

TOKEN_LIFETIME = timedelta(minutes=15)


class BoothCreateToken(db.Model):
    __tablename__ = "booth_create_tokens"

    id = db.Column(db.Integer, primary_key=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    booth_number = db.Column(db.Integer, nullable=True)
    kiosk_id = db.Column(db.Integer, db.ForeignKey("kiosk_devices.id", ondelete="SET NULL"), nullable=True)
    from_slip_id = db.Column(db.String(30), nullable=True)
    to_slip_id = db.Column(db.String(30), nullable=True)
    slips_count = db.Column(db.Integer, nullable=True)

    kiosk = db.relationship("KioskDevice", foreign_keys=[kiosk_id], lazy="select")

    @property
    def expired(self) -> bool:
        exp = self.expires_at if self.expires_at.tzinfo else self.expires_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > exp
