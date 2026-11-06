"""
app/models/booth_slip.py — Pre-generated Booth Slips & PIN-Only Voting Credentials.

Supports multiple independent voting booths with sequential voting IDs:
  Booth 1: 1001, 1002, 1003...
  Booth 2: 2001, 2002, 2003...
  Booth 3: 3001, 3002, 3003...

Credentials:
  - Cryptographically secure 4-digit PINs (0000 - 9999).
  - Salted bcrypt hash stored in DB for verification.
  - Plaintext PIN stored encrypted via Fernet solely for official slip PDF printing.
  - No association with student names or personal identities.
  - Strictly no self-destruct or permanent invalidation on failed attempts.
"""

from datetime import datetime, timezone
import secrets
import bcrypt
import base64
import hashlib
from cryptography.fernet import Fernet
from flask import current_app

from app.extensions import db


class BoothSlip(db.Model):
    __tablename__ = "booth_slips"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booth_id = db.Column(
        db.Integer,
        db.ForeignKey("kiosk_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    booth_number = db.Column(db.Integer, nullable=True, index=True)
    sequence_number = db.Column(db.Integer, nullable=False)
    voting_id = db.Column(db.String(40), nullable=False, index=True)
    pin_hash = db.Column(db.String(255), nullable=False)
    pin_enc = db.Column(db.Text, nullable=True)  # Fernet encrypted for PDF export
    is_used = db.Column(db.Boolean, default=False, nullable=False, index=True)
    is_cancelled = db.Column(db.Boolean, default=False, nullable=False, server_default=db.false(), index=True)
    is_mock = db.Column(db.Boolean, default=False, nullable=False, server_default=db.false(), index=True)
    authenticated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    cancelled_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint("election_id", "voting_id", name="uq_election_voting_id"),
        db.UniqueConstraint("election_id", "booth_number", "sequence_number", name="uq_election_booth_seq"),
        db.Index("idx_slip_booth_used", "election_id", "booth_id", "is_used", "sequence_number"),
    )

    # Relationships
    election = db.relationship("Election", backref=db.backref("booth_slips", cascade="all, delete-orphan", lazy="select"))
    booth = db.relationship("KioskDevice", backref=db.backref("booth_slips", lazy="select"))

    @staticmethod
    def _fernet():
        secret = current_app.config.get("SECRET_KEY", "default-dev-secret-key-12345")
        key = hashlib.sha256(b"evote-booth-pin|" + str(secret).encode()).digest()
        return Fernet(base64.urlsafe_b64encode(key))

    @classmethod
    def seal_pin(cls, raw_pin: str) -> str:
        return cls._fernet().encrypt(raw_pin.encode("utf-8")).decode("utf-8")

    def reveal_pin(self) -> str | None:
        if not self.pin_enc:
            return None
        try:
            return self._fernet().decrypt(self.pin_enc.encode("utf-8")).decode("utf-8")
        except Exception:
            return None

    @staticmethod
    def generate_random_4digit_pin() -> str:
        """Generate a cryptographically secure 4-digit PIN (0000-9999) preserving leading zeros."""
        return f"{secrets.randbelow(10000):04d}"

    @classmethod
    def hash_pin(cls, raw_pin: str) -> str:
        return bcrypt.hashpw(raw_pin.strip().encode("utf-8"), bcrypt.gensalt(rounds=8)).decode("utf-8")

    def verify_pin(self, raw_pin: str) -> bool:
        """Constant-time verification of submitted PIN against salted bcrypt hash."""
        if not raw_pin or not self.pin_hash:
            return False
        try:
            return bcrypt.checkpw(raw_pin.strip().encode("utf-8"), self.pin_hash.encode("utf-8"))
        except Exception:
            return False

    @classmethod
    def get_current_slip(cls, election_id: int, booth_number: int = None, booth_id: int = None):
        """
        Retrieves the earliest unused sequential voting slip for a specific booth.
        Returns None if all slips for this booth are exhausted.
        """
        q = cls.query.filter_by(election_id=election_id, is_used=False, is_cancelled=False)
        if booth_id is not None and booth_number is not None:
            q = q.filter((cls.booth_id == booth_id) | (cls.booth_number == booth_number))
        elif booth_id is not None:
            q = q.filter_by(booth_id=booth_id)
        elif booth_number is not None:
            q = q.filter_by(booth_number=booth_number)
        return q.order_by(cls.sequence_number.asc()).first()

    @classmethod
    def generate_batch(cls, election_id: int, booth_number: int = None, count: int = 50, booth_id: int = None, is_mock: bool = False):
        """
        Generates 'count' sequential slips for the given election.
        IDs are formatted with the election slip prefix: e.g. SUE26-E1-1001 or MOCK-B01-1001.
        """
        if count <= 0:
            return []

        MAX_BATCH_SIZE = 500
        if count > MAX_BATCH_SIZE:
            count = MAX_BATCH_SIZE

        from app.models.election import Election
        from app.models.system_setting import SystemSetting
        # Lock election row to prevent concurrent race conditions on sequence numbers
        election = db.session.query(Election).filter_by(id=election_id).with_for_update().first()
        mock_run = is_mock or bool(election and election.is_mock)
        code = SystemSetting.get("slip_code") or "SUE"
        year = (election.start_time or datetime.now(timezone.utc)).year % 100 if election else datetime.now(timezone.utc).year % 100
        if mock_run:
            prefix = f"MOCK-B{booth_number:02d}-" if booth_number else "MOCK-"
        elif booth_number is not None and booth_number > 0:
            prefix = f"{code}{year:02d}-B{booth_number}-"
        else:
            prefix = election.ensure_slip_prefix() if election else f"{code}{year:02d}-E{election_id}-"

        # Collect all existing voting IDs for this election to guarantee uniqueness
        existing_vids = {r[0] for r in db.session.query(cls.voting_id).filter_by(election_id=election_id).all() if r[0]}

        if booth_number is not None and booth_number > 0:
            max_seq = (
                db.session.query(db.func.max(cls.sequence_number))
                .filter_by(election_id=election_id, booth_number=booth_number)
                .scalar()
                or 0
            )
            booth_prefix_str = str(booth_number)
            existing_for_booth = []
            for vid in existing_vids:
                suffix = vid.split("-")[-1]
                digits = "".join(filter(str.isdigit, suffix))
                if digits and digits.startswith(booth_prefix_str) and len(digits) >= 4:
                    try:
                        existing_for_booth.append(int(digits))
                    except ValueError:
                        pass
            start_num = max(existing_for_booth) if existing_for_booth else (booth_number * 1000)
        else:
            max_seq = (
                db.session.query(db.func.max(cls.sequence_number))
                .filter(cls.election_id == election_id, cls.booth_number == None)
                .scalar()
                or 0
            )
            existing_pool = []
            for vid in existing_vids:
                suffix = vid.split("-")[-1]
                digits = "".join(filter(str.isdigit, suffix))
                if digits:
                    try:
                        existing_pool.append(int(digits))
                    except ValueError:
                        pass
            start_num = max(existing_pool) if existing_pool else 1000

        created = []
        curr_num = start_num
        for i in range(1, count + 1):
            seq = max_seq + i
            curr_num += 1
            voting_id = f"{prefix}{curr_num}"
            while voting_id in existing_vids:
                curr_num += 1
                voting_id = f"{prefix}{curr_num}"
            existing_vids.add(voting_id)

            raw_pin = cls.generate_random_4digit_pin()
            pin_hash = cls.hash_pin(raw_pin)
            pin_enc = cls.seal_pin(raw_pin)

            slip = cls(
                election_id=election_id,
                booth_id=booth_id,
                booth_number=booth_number,
                sequence_number=seq,
                voting_id=voting_id,
                pin_hash=pin_hash,
                pin_enc=pin_enc,
                is_used=False,
                is_mock=mock_run,
            )
            slip.raw_pin = raw_pin  # In-memory only for immediate PDF rendering
            db.session.add(slip)
            created.append(slip)

        db.session.commit()
        return created

    def to_dict(self, include_pin: bool = False) -> dict:
        data = {
            "id": self.id,
            "election_id": self.election_id,
            "booth_id": self.booth_id,
            "booth_number": self.booth_number,
            "sequence_number": self.sequence_number,
            "voting_id": self.voting_id,
            "is_used": self.is_used,
            "is_cancelled": bool(self.is_cancelled),
            "is_mock": bool(self.is_mock),
            "authenticated_at": self.authenticated_at.isoformat() if self.authenticated_at else None,
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_pin:
            data["pin"] = getattr(self, "raw_pin", None) or self.reveal_pin()
        return data
