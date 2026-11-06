"""
app/models/vote_receipt.py — VoteReceipt ORM model.
Stores election receipt data centrally on the server for auditing, viewing, and bulk export.
"""

from datetime import datetime, timezone
import json
from app.extensions import db
from app.utils.timeutil import utc_iso


class VoteReceipt(db.Model):
    __tablename__ = "vote_receipts"

    id = db.Column(db.Integer, primary_key=True)
    slip_id = db.Column(db.String(64), nullable=False, unique=True, index=True)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id", ondelete="CASCADE"), nullable=False, index=True)
    booth_name = db.Column(db.String(100), nullable=True, default="", index=True)
    is_mock = db.Column(db.Boolean, default=False, nullable=False, index=True)
    choices_json = db.Column(db.Text, nullable=False)
    html_content = db.Column(db.Text, nullable=True)
    pdf_filename = db.Column(db.String(255), nullable=True)
    is_printed = db.Column(db.Boolean, default=True, nullable=False, server_default=db.true(), index=True)
    print_error = db.Column(db.String(255), nullable=True)
    reprinted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    election = db.relationship("Election", backref=db.backref("receipts", cascade="all, delete-orphan", passive_deletes=True, lazy="dynamic"))

    def get_choices(self) -> list:
        try:
            return json.loads(self.choices_json) if self.choices_json else []
        except Exception:
            return []

    def to_dict(self) -> dict:
        title = ""
        if self.election:
            title = f"[MOCK] {self.election.title}" if (self.is_mock and not self.election.title.startswith("[MOCK]")) else self.election.title
        return {
            "id": self.id,
            "slip_id": self.slip_id,
            "election_id": self.election_id,
            "election_title": title,
            "booth_name": self.booth_name or "Booth",
            "is_mock": self.is_mock,
            "choices": self.get_choices(),
            "pdf_filename": self.pdf_filename,
            "is_printed": bool(self.is_printed),
            "print_error": self.print_error,
            "reprinted_at": utc_iso(self.reprinted_at) if self.reprinted_at else None,
            "created_at": utc_iso(self.created_at),
        }
