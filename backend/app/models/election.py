"""
app/models/election.py — Election ORM model.
"""

from datetime import datetime, timezone
from app.extensions import db


class Election(db.Model):
    __tablename__ = "elections"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=False)
    end_time = db.Column(db.DateTime(timezone=True), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=False)
    results_published = db.Column(db.Boolean, nullable=False, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
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

    # Relationships
    candidates = db.relationship(
        "Candidate",
        backref="election",
        cascade="all, delete-orphan",
        lazy="select",
    )
    voter_records = db.relationship(
        "VoterRecord",
        backref="election",
        cascade="all, delete-orphan",
        lazy="select",
    )
    ballot_entries = db.relationship(
        "BallotEntry",
        backref="election",
        cascade="all, delete-orphan",
        lazy="select",
    )

    @property
    def is_ongoing(self) -> bool:
        """
        True if the election is marked active and the current UTC time
        falls within [start_time, end_time].
        """
        if not self.is_active or not self.start_time or not self.end_time:
            return False
        now = datetime.now(timezone.utc)
        start = self.start_time
        end = self.end_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return start <= now <= end

    def to_dict(self, include_candidates: bool = False) -> dict:
        """Return dict representation."""
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "is_active": self.is_active,
            "is_ongoing": self.is_ongoing,
            "results_published": self.results_published,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_candidates:
            data["candidates"] = [c.to_dict() for c in self.candidates]
        return data
