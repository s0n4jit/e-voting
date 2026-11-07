"""
app/models/kiosk_device.py — Voting booths (lab kiosks).

A booth is set up on the kiosk machine with a Booth ID and an Election Officer's authenticator
code. That creates a booth token, which the machine keeps. Only a hash of the token is stored, so
it cannot be read back from the database. Deleting the booth revokes the token at once.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.extensions import db

ONLINE_WITHIN = timedelta(seconds=20)


def hash_token(token: str) -> str:
    return hashlib.sha256(str(token).strip().encode("utf-8")).hexdigest()


class KioskVerifyResult(tuple):
    """is_valid, device = KioskDevice.verify_token(token)"""

    def __new__(cls, is_valid: bool, device=None):
        return super().__new__(cls, (is_valid, device))

    @property
    def is_valid(self) -> bool:
        return self[0]

    @property
    def device(self):
        return self[1]


class KioskDevice(db.Model):
    __tablename__ = "kiosk_devices"
    __table_args__ = (
        db.UniqueConstraint("election_id", "device_name", name="uq_kiosk_devices_election_device_name"),
        db.UniqueConstraint("election_id", "booth_number", name="uq_kiosk_devices_election_booth_number"),
    )

    id = db.Column(db.Integer, primary_key=True)
    device_name = db.Column(db.String(100), nullable=False)  # the Booth ID, e.g. BOOTH-01
    kiosk_token = db.Column(db.String(128), unique=True, nullable=False, index=True)  # SHA-256 of the booth token
    ip_address = db.Column(db.String(45), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_heartbeat = db.Column(db.DateTime(timezone=True), nullable=True)
    election_id = db.Column(db.Integer, db.ForeignKey("elections.id", ondelete="CASCADE"), nullable=True, index=True)
    booth_number = db.Column(db.Integer, nullable=True)
    election = db.relationship("Election")

    @property
    def number(self) -> int:
        if self.booth_number is not None:
            return self.booth_number
        try:
            import re
            m = re.search(r'\d+', str(self.device_name))
            return int(m.group(0)) if m else 1
        except Exception:
            return 1

    @property
    def booth_id(self) -> str:
        return self.device_name

    @property
    def ref(self) -> str:
        """Short, non-secret identifier of this booth session, used in the audit log."""
        return self.kiosk_token[:8]

    @property
    def online(self) -> bool:
        beat = self.last_heartbeat
        if not beat:
            return False
        beat = beat if beat.tzinfo else beat.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - beat < ONLINE_WITHIN

    @classmethod
    def next_booth_id(cls, election_id) -> str:
        """BOOTH-01, BOOTH-02, ... the lowest number not in use for this election."""
        used = {d.device_name for d in cls.query.filter_by(election_id=election_id)}
        n = 1
        while f"BOOTH-{n:02d}" in used:
            n += 1
        return f"BOOTH-{n:02d}"

    @classmethod
    def activate(cls, booth_id: str, ip_address: str = None, election_id: int = None):
        """Create or reactivate the booth and return (device, raw_token). The raw token is never stored."""
        raw = f"booth_{secrets.token_urlsafe(32)}"
        now = datetime.now(timezone.utc)
        if election_id:
            device = cls.query.filter_by(election_id=election_id, device_name=booth_id).first()
            if device:
                device.kiosk_token = hash_token(raw)
                device.ip_address = ip_address
                device.is_active = True
                device.last_heartbeat = now
                db.session.flush()
                return device, raw

        device = cls(
            device_name=booth_id,
            kiosk_token=hash_token(raw),
            ip_address=ip_address,
            is_active=True,
            election_id=election_id,
            created_at=now,
            last_heartbeat=now,
        )
        db.session.add(device)
        db.session.flush()
        return device, raw

    @classmethod
    def verify_token(cls, token_str) -> KioskVerifyResult:
        """Valid only while the booth exists and is active. Refreshes the booth's last-seen time."""
        if not token_str or not str(token_str).strip():
            return KioskVerifyResult(False, None)
        device = cls.query.filter_by(kiosk_token=hash_token(token_str), is_active=True).first()
        if not device:
            return KioskVerifyResult(False, None)
        if device.election and device.election.effective_status == "archived":
            return KioskVerifyResult(False, None)  # a booth belongs to one election
        device.last_heartbeat = datetime.now(timezone.utc)
        db.session.flush()
        return KioskVerifyResult(True, device)

    def to_dict(self, stats=None) -> dict:
        from app.utils.timeutil import utc_iso
        from app.models.booth_slip import BoothSlip

        if stats and self.id in stats:
            s = stats[self.id]
            allotted_count, used_count = s.get("allotted_count", 0), s.get("used_count", 0)
            from_slip_id, to_slip_id = s.get("from_slip_id"), s.get("to_slip_id")
        else:
            slips = BoothSlip.query.filter_by(election_id=self.election_id, booth_id=self.id).order_by(BoothSlip.sequence_number.asc()).all()
            allotted_count = len(slips)
            used_count = sum(1 for slip in slips if slip.is_used)
            from_slip_id = slips[0].voting_id if slips else None
            to_slip_id = slips[-1].voting_id if slips else None

        from app.models.election import Election
        election = self.election or Election.current()
        is_active_election = bool(election and (election.is_active or election.effective_status in ("ready", "voting_active", "voting_paused", "voting_closed")))
        can_del = bool(not is_active_election and allotted_count == 0 and used_count == 0)

        return {
            "id": self.id,
            "booth_id": self.device_name,
            "booth_number": self.number,
            "number": self.number,
            "election_id": self.election_id,
            "election_title": self.election.title if self.election else None,
            "election_is_active": is_active_election,
            "can_delete": can_del,
            "device_name": self.device_name,
            "session_ref": self.ref,
            "ip_address": self.ip_address,
            "is_active": self.is_active,
            "online": self.online,
            "allotted_count": allotted_count,
            "used_count": used_count,
            "remaining_count": max(0, allotted_count - used_count),
            "from_slip_id": from_slip_id,
            "to_slip_id": to_slip_id,
            "created_at": utc_iso(self.created_at),
            "last_heartbeat": utc_iso(self.last_heartbeat),
        }
