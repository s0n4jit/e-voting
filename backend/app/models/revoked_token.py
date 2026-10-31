"""
app/models/revoked_token.py — Signed-out tokens, kept in the database so a server restart does not revive them.
"""

from datetime import datetime, timezone

from app.extensions import db


class RevokedToken(db.Model):
    __tablename__ = "revoked_tokens"

    jti = db.Column(db.String(64), primary_key=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)  # row can be deleted after this
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    @classmethod
    def revoke(cls, payload) -> None:
        """Add a decoded token to the list (caller commits)."""
        jti = payload.get("jti")
        if jti and not db.session.get(cls, jti):
            exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
            db.session.add(cls(jti=jti, expires_at=exp))

    @classmethod
    def purge_expired(cls) -> None:
        cls.query.filter(cls.expires_at < datetime.now(timezone.utc)).delete()
