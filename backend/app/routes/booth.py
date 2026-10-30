"""
app/routes/booth.py — Voting booth set-up and status.

1. An Election Officer generates a one-time booth create token in the officer panel.
2. On the kiosk machine someone enters that token and the officer's current authenticator code.
3. The server creates the booth (Booth ID numbered per election: BOOTH-01, BOOTH-02, ...) and
   returns the booth token, which the machine keeps.
"""

import hashlib
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app.extensions import commit_or_flush, db, limiter
from app.models.audit_log import AuditLog
from app.models.booth_create_token import BoothCreateToken
from app.models.election import Election
from app.models.kiosk_device import KioskDevice
from app.models.user import User
from app.utils.timeutil import utc_iso

booth_bp = Blueprint("booth", __name__)

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_create_token() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalise(token) -> str:
    return "".join(c for c in str(token or "").upper() if c.isalnum())


def booth_token_from_request():
    return (request.headers.get("X-Kiosk-Token") or (request.get_json(silent=True) or {}).get("kiosk_token") or "").strip()


def require_booth(claims=None, election_id=None):
    """
    Returns (device, None) for a valid booth, else (None, (response, status)). With `claims` (a voter's
    JWT claims) the voter's session must have started at this booth; with `election_id` the booth
    must belong to that election.
    """
    ok, device = KioskDevice.verify_token(booth_token_from_request())
    denied = (jsonify({"error": "Unauthorized booth", "message": "Votes can only be cast from an authorized voting booth."}), 403)
    if not ok:
        return None, denied
    if claims is not None and claims.get("booth_ref") != device.ref:
        return None, (jsonify({"error": "Unauthorized booth", "message": "This voting session did not start at this booth. Please start again."}), 403)
    if election_id is not None and device.election_id not in (None, election_id):
        return None, denied
    return device, None


@booth_bp.post("/activate")
@limiter.limit("5 per minute")
@limiter.limit("30 per hour")
def activate():
    """Exchange a booth create token plus the creating officer's authenticator code for a booth."""
    payload = request.get_json(silent=True) or {}
    token, code = normalise(payload.get("create_token")), str(payload.get("code") or "").strip()
    failure = (jsonify({"error": "Not authorized", "message": "The booth token or the authenticator code is not correct, or the token has expired. Create a new token in the officer panel."}), 403)

    row = BoothCreateToken.query.filter_by(token_hash=_hash(token)).first() if token else None
    officer = db.session.get(User, row.created_by) if row else None
    election = db.session.get(Election, row.election_id) if row else None
    if (not row or row.used_at or row.expired or not officer or officer.role != "admin" or not officer.is_active
            or not officer.otp_enabled or not code or not officer.verify_otp(code)
            or not election or election.effective_status == "archived"):
        return failure

    # single use: only one request can flip used_at from NULL
    claimed = BoothCreateToken.query.filter_by(id=row.id, used_at=None).update(
        {"used_at": datetime.now(timezone.utc)}, synchronize_session=False)
    if claimed != 1:
        return failure

    booth_id = KioskDevice.next_booth_id(election.id)
    device, raw = KioskDevice.activate(booth_id, request.remote_addr or "", election.id)
    db.session.add(AuditLog(
        user_id=officer.id,
        action="BOOTH_ACTIVATED",
        details=f"Set up booth {booth_id} for \u201c{election.title}\u201d (session {device.ref}), approved by {officer.name}.",
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))
    commit_or_flush()
    return jsonify({"booth_token": raw, "booth_id": booth_id}), 201


@booth_bp.get("/status")
@limiter.exempt
def status():
    """Polled by the kiosk every few seconds: is this booth still authorized, and is voting open?"""
    ok, device = KioskDevice.verify_token(booth_token_from_request())
    if not ok:
        return jsonify({"valid": False}), 200
    commit_or_flush()  # keeps the "last seen" time
    election = device.election or Election.current()
    data = election.to_dict() if election else None
    return jsonify({
        "valid": True,
        "booth_id": device.booth_id,
        "slip_prefix": election.ensure_slip_prefix() if election else None,
        "voting_open": bool(election and election.is_ongoing),
        "election": {"id": election.id, "title": election.title, "status": election.effective_status,
                     "start_time": data["start_time"], "end_time": data["end_time"]} if election else None,
    }), 200
