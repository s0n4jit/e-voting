"""
app/models/voting_token.py — VotingToken ORM model for physical registration desk PIN slips.
"""

from datetime import datetime, timedelta, timezone
import secrets
import bcrypt

from app.extensions import db


class PinResult(str):
    """
    Subclass of str supporting both string usage and tuple unpacking:
      pin = VotingToken.generate_pin(...)        # pin is '849201'
      pin, token = VotingToken.generate_pin(...) # pin is '849201', token is VotingToken
      pin.token                                 # access VotingToken directly
    """

    def __new__(cls, pin: str, token=None):
        obj = super().__new__(cls, pin)
        obj.token = token
        return obj

    def __iter__(self):
        yield str(self)
        yield self.token


class VotingToken(db.Model):
    __tablename__ = "voting_tokens"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    student_id = db.Column(db.String(50), nullable=False, index=True)
    pin_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    is_used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    election = db.relationship(
        "Election",
        backref=db.backref("voting_tokens", cascade="all, delete-orphan", lazy="select"),
    )
    user = db.relationship(
        "User",
        foreign_keys=[user_id],
        backref=db.backref("voting_tokens", lazy="select"),
    )

    @classmethod
    def generate_pin(
        cls,
        student_id: str,
        election_id: int,
        created_by=None,
        validity_minutes: int = 20,
    ) -> PinResult:
        """
        Generate a random single-use 6-digit PIN valid for validity_minutes (default 20m).
        Invalidates existing active tokens for this student/election.
        Persists record with bcrypt-hashed PIN.
        Returns PinResult (raw 6-digit PIN and token record).
        """
        from app.models.user import User

        student_id_clean = str(student_id).strip()
        raw_pin = f"{secrets.randbelow(1_000_000):06d}"
        salt = bcrypt.gensalt(rounds=10, prefix=b"2b")
        pin_hash = bcrypt.hashpw(raw_pin.encode("utf-8"), salt).decode("utf-8")

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=validity_minutes)

        # Invalidate any previously active unused tokens for this voter and election
        cls.query.filter_by(
            student_id=student_id_clean,
            election_id=election_id,
            is_used=False,
        ).update({"is_used": True}, synchronize_session=False)

        user = User.query.filter_by(student_id=student_id_clean).first()
        user_id = user.id if user else None

        token_record = cls(
            election_id=election_id,
            user_id=user_id,
            student_id=student_id_clean,
            pin_hash=pin_hash,
            expires_at=expires_at,
            is_used=False,
            created_at=now,
            created_by=created_by,
        )
        db.session.add(token_record)
        db.session.flush()

        return PinResult(raw_pin, token_record)

    @classmethod
    def verify_pin(
        cls,
        student_id: str,
        election_id: int,
        raw_pin: str,
    ):
        """
        Verify a raw 6-digit PIN for student_id in election_id.
        Returns (True, VotingToken) if valid, active, and unexpired.
        Returns (False, None) otherwise.
        """
        if not student_id or not election_id or not raw_pin:
            return False, None

        student_id_clean = str(student_id).strip()
        raw_pin_clean = str(raw_pin).strip()

        # Find unused tokens for this student & election
        active_tokens = (
            cls.query.filter_by(
                student_id=student_id_clean,
                election_id=election_id,
                is_used=False,
            )
            .order_by(cls.created_at.desc())
            .all()
        )

        now = datetime.now(timezone.utc)
        for token in active_tokens:
            exp = token.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if now > exp:
                continue

            try:
                if bcrypt.checkpw(raw_pin_clean.encode("utf-8"), token.pin_hash.encode("utf-8")):
                    return True, token
            except Exception:
                continue

        return False, None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "election_id": self.election_id,
            "user_id": self.user_id,
            "student_id": self.student_id,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_used": self.is_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
        }
