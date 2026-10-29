"""
app/models/voter_record.py — VoterRecord ORM model.

Secret-ballot architecture:
This model records WHO voted (voter eligibility and status per election),
NOT what they voted for. It must NEVER reference Candidate or BallotEntry.
"""

from datetime import datetime, timezone
from app.extensions import db


class VoterRecord(db.Model):
    __tablename__ = "voter_records"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    voter_hash = db.Column(db.String(64), nullable=False, index=True)
    has_voted = db.Column(db.Boolean, nullable=False, default=False)
    voted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("election_id", "voter_hash", name="uq_election_voter_hash"),
    )

    def to_dict(self) -> dict:
        """Return dict representation."""
        return {
            "id": self.id,
            "election_id": self.election_id,
            "voter_hash": self.voter_hash,
            "has_voted": self.has_voted,
            "voted_at": self.voted_at.isoformat() if self.voted_at else None,
        }
