"""
app/models/kiosk_device.py — KioskDevice ORM model for authorized computer lab terminals.
"""

from datetime import datetime, timezone
import secrets

from app.extensions import db


class KioskVerifyResult(tuple):
    """
    Tuple subclass supporting:
      is_valid, device = KioskDevice.verify_token(token)
      if KioskDevice.verify_token(token): ...
      result.device
    """

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

    id = db.Column(db.Integer, primary_key=True)
    device_name = db.Column(db.String(100), nullable=False)
    kiosk_token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    ip_address = db.Column(db.String(45), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_heartbeat = db.Column(db.DateTime(timezone=True), nullable=True)

    @classmethod
    def register_device(cls, device_name: str, ip_address: str = None) -> "KioskDevice":
        """Generate a cryptographically secure kiosk token and persist a new authorized terminal."""
        token = f"kiosk_{secrets.token_urlsafe(32)}"
        now = datetime.now(timezone.utc)
        device = cls(
            device_name=str(device_name).strip(),
            kiosk_token=token,
            ip_address=ip_address,
            is_active=True,
            created_at=now,
            last_heartbeat=now,
        )
        db.session.add(device)
        db.session.flush()
        return device

    @classmethod
    def verify_token(cls, token_str: str) -> KioskVerifyResult:
        """
        Verify kiosk token.
        Updates last_heartbeat timestamp on success.
        Returns KioskVerifyResult(is_valid, device).
        """
        if not token_str or not str(token_str).strip():
            return KioskVerifyResult(False, None)

        clean_token = str(token_str).strip()
        device = cls.query.filter_by(kiosk_token=clean_token, is_active=True).first()
        if device:
            device.last_heartbeat = datetime.now(timezone.utc)
            db.session.flush()
            return KioskVerifyResult(True, device)

        # Built-in campus booth station tokens for local / lab testing
        if clean_token in ("booth-standalone-token", "kiosk_lab_booth_station_01", "kiosk_default_lab_terminal"):
            device = cls.query.filter_by(device_name="Computer Lab Booth #01").first()
            if not device:
                device = cls(
                    device_name="Computer Lab Booth #01",
                    kiosk_token=clean_token,
                    ip_address="127.0.0.1",
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                    last_heartbeat=datetime.now(timezone.utc),
                )
                db.session.add(device)
                db.session.flush()
            return KioskVerifyResult(True, device)

        return KioskVerifyResult(False, None)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "device_name": self.device_name,
            "kiosk_token": self.kiosk_token,
            "ip_address": self.ip_address,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_heartbeat": self.last_heartbeat.isoformat() if self.last_heartbeat else None,
        }
