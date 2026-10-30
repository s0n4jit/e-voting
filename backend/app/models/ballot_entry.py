"""
app/models/ballot_entry.py — BallotEntry ORM model.

Secret-ballot architecture:
This model records WHAT was voted for (candidate choice or NOTA, per position,
under an anonymous blind token), NEVER who cast it.
It strictly forbids storing any user_id, voter_id, or student_id.
"""

import uuid
from datetime import datetime, timezone
from app.extensions import db


class BallotEntry(db.Model):
    __tablename__ = "ballot_entries"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id = db.Column(
        db.Integer,
        db.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    position = db.Column(db.String(100), nullable=False, default="President", index=True)
    is_nota = db.Column(db.Boolean, default=False, nullable=False)
    blind_token = db.Column(
        db.String(128),
        nullable=False,
        default=lambda: uuid.uuid4().hex,
        index=True,
    )
    cast_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self) -> dict:
        """Return dict representation."""
        return {
            "id": self.id,
            "election_id": self.election_id,
            "candidate_id": self.candidate_id,
            "position": self.position,
            "is_nota": self.is_nota,
            "blind_token": self.blind_token,
            "cast_at": self.cast_at.isoformat() if self.cast_at else None,
        }
