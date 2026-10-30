"""
app/models/election.py — Election ORM model.
"""

import secrets
from datetime import datetime, timezone
from app.extensions import db
from app.utils.timeutil import utc_iso


class Election(db.Model):
    __tablename__ = "elections"

    # Lifecycle, in order. Voting is only possible in "voting_active".
    STATUSES = (
        "setup",
        "registration",
        "ready",
        "voting_active",
        "voting_closed",
        "results_published",
        "archived",
    )
    STATUS_LABELS = {
        "setup": "Setup",
        "registration": "Registration",
        "ready": "Ready",
        "voting_active": "Voting Active",
        "voting_closed": "Voting Closed",
        "results_published": "Results Published",
        "archived": "Archived",
    }

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=False)
    end_time = db.Column(db.DateTime(timezone=True), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=False)
    slip_prefix = db.Column(db.String(20), nullable=True)  # e.g. "SUE26-E1-", fixed when the election is created
    public_token = db.Column(db.String(64), unique=True, nullable=True)  # unguessable link to the published results
    status = db.Column(db.String(20), nullable=False, default="setup", server_default="setup")
    results_published = db.Column(db.Boolean, nullable=False, default=False)
    # Voting is opened, paused and closed by the Election Officer, never by the clock. start_time and
    # end_time are the announced schedule and are shown for information only.
    voting_paused = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
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

    positions = db.relationship(
        "ElectionPosition",
        backref="election",
        cascade="all, delete-orphan",
        order_by="ElectionPosition.sort_order",
        lazy="select",
    )

    @classmethod
    def current(cls):
        """The election desks and kiosks work against: ongoing, else newest non-archived."""
        active = cls.query.filter_by(is_active=True).all()
        ongoing = [e for e in active if e.is_ongoing]
        if ongoing:
            return ongoing[0]
        if active:
            return active[0]
        return cls.query.filter(cls.status != "archived").order_by(cls.created_at.desc()).first()

    def set_status(self, status: str) -> None:
        """Move to a lifecycle status, keeping the legacy is_active / results_published flags in sync."""
        self.status = status
        self.is_active = status == "voting_active"
        self.voting_paused = False  # a pause only exists inside "voting_active"
        if status == "results_published":
            self.results_published = True
        elif status not in ("archived",):
            self.results_published = False

    def ensure_slip_prefix(self) -> str:
        """Voter Slip IDs of this election start with this prefix; only the 6 digits are typed at a booth."""
        if not self.slip_prefix:
            from app.models.system_setting import SystemSetting

            year = (self.start_time or datetime.now(timezone.utc)).year
            code = SystemSetting.get("slip_code") or "SUE"  # letters chosen in the setup wizard / settings
            self.slip_prefix = f"{code}{year % 100:02d}-E{self.id}-"  # call after the election has an id
        return self.slip_prefix

    def ensure_public_token(self) -> str:
        if not self.public_token:
            self.public_token = secrets.token_urlsafe(18)
        return self.public_token

    @property
    def effective_status(self) -> str:
        """Stored status, reconciled with the legacy flags and the voting window."""
        st = self.status or "setup"
        if self.is_active and st in ("setup", "registration", "ready"):
            st = "voting_active"
        if self.results_published and st in ("setup", "registration", "ready", "voting_active", "voting_closed"):
            return "results_published"
        return st

    @property
    def desk_open(self) -> bool:
        """Students can be registered and PINs issued until the officer closes voting."""
        return self.effective_status in ("setup", "registration", "ready", "voting_active")

    @property
    def is_ongoing(self) -> bool:
        """True while the officer has voting open and not paused. The scheduled times play no part."""
        return bool(self.is_active) and not self.voting_paused

    def to_dict(self, include_candidates: bool = False) -> dict:
        """Return dict representation."""
        from app.models.voter_record import VoterRecord
        try:
            total_votes = VoterRecord.query.filter_by(election_id=self.id, has_voted=True).count()
            registered_voters = VoterRecord.query.filter_by(election_id=self.id).count()
        except Exception:
            total_votes = 0
            registered_voters = 0

        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "start_time": utc_iso(self.start_time),
            "end_time": utc_iso(self.end_time),
            "is_active": self.is_active,
            "status": self.effective_status,
            "status_label": "Voting Paused" if self.is_active and self.voting_paused
            else self.STATUS_LABELS.get(self.effective_status, self.status),
            "voting_paused": bool(self.voting_paused),
            "positions": [p.name for p in self.positions],
            "is_ongoing": self.is_ongoing,
            "results_published": self.results_published,
            "created_by": self.created_by,
            "total_votes": total_votes,
            "ballots_cast": total_votes,
            "votes_count": total_votes,
            "registered_voters": registered_voters,
            "created_at": utc_iso(self.created_at),
            "updated_at": utc_iso(self.updated_at),
        }
        if include_candidates:
            data["candidates"] = [c.to_dict() for c in self.candidates]
        return data
