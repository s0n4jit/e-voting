"""
app/models/candidate.py — Candidate ORM model.
"""

from datetime import datetime, timezone
from app.extensions import db


class Candidate(db.Model):
    __tablename__ = "candidates"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(120), nullable=False)
    position = db.Column(db.String(100), nullable=False, default="General Secretary")
    department = db.Column(db.String(100), nullable=True)
    semester = db.Column(db.String(30), nullable=True)  # e.g. "Semester 3", shown on the voting card
    bio = db.Column(db.Text, nullable=True)
    photo_url = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    ballot_entries = db.relationship(
        "BallotEntry",
        backref="candidate",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __init__(self, **kwargs):
        kwargs.pop("party", None)
        super().__init__(**kwargs)

    def to_dict(self) -> dict:
        """Return dict representation."""
        return {
            "id": self.id,
            "election_id": self.election_id,
            "name": self.name,
            "position": self.position,
            "department": self.department,
            "semester": self.semester,
            "bio": self.bio,
            "photo_url": self.photo_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


@db.event.listens_for(Candidate, "after_delete")
def _cleanup_candidate_photo(mapper, connection, target):
    from app.services.photo_service import delete_photo
    delete_photo(target.id)
