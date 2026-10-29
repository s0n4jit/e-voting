"""
app/models/ballot_entry.py — BallotEntry ORM model.

Secret-ballot architecture:
This model records WHAT was voted for (candidate choice and anonymous blind token),
NEVER who cast it. It strictly forbids storing any user_id, voter_id, or student_id.
"""

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
        nullable=False,
        index=True,
    )
    blind_token = db.Column(db.String(128), nullable=True)
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
            "blind_token": self.blind_token,
            "cast_at": self.cast_at.isoformat() if self.cast_at else None,
        }
