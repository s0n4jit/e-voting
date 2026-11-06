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
from app.models.kiosk_device import KioskDevice, hash_token
from app.models.booth_slip import BoothSlip
from app.models.system_setting import SystemSetting
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
    return (
        request.headers.get("X-Kiosk-Token")
        or request.form.get("kiosk_token")
        or (request.get_json(silent=True) or {}).get("kiosk_token")
        or ""
    ).strip()


def require_booth(claims=None, election_id=None):
    """
    Returns (device, None) for a valid booth, else (None, (response, status)). With `claims` (a voter's
    JWT claims) the voter's session must have started at this booth; with `election_id` the booth
    must belong to that election.
    """
    ok, device = KioskDevice.verify_token(booth_token_from_request())
    denied = (jsonify({"error": "Unauthorized booth", "message": "Votes can only be cast from an authorized voting booth."}), 403)
    if not ok:
        try:
            db.session.add(AuditLog(
                action="UNAUTHORIZED_BOOTH_ATTEMPT",
                details=f"Unauthorized access attempt to {request.path} from IP {request.remote_addr}. Invalid or missing kiosk token.",
                ip_address=request.remote_addr or "",
                user_agent=(request.user_agent.string or "")[:255],
            ))
            db.session.commit()
        except Exception:
            pass
        return None, denied
    if claims is not None and claims.get("booth_ref") != device.ref:
        try:
            db.session.add(AuditLog(
                action="TAMPER_DETECTED",
                details=f"Cross-booth tamper attempt! Session started at {claims.get('booth_ref')} but attempted action from {device.device_name} (IP: {request.remote_addr}).",
                ip_address=request.remote_addr or "",
                user_agent=(request.user_agent.string or "")[:255],
            ))
            db.session.commit()
        except Exception:
            pass
        return None, (jsonify({"error": "Unauthorized booth", "message": "This voting session did not start at this booth. Please start again.", "booth_mismatch": True}), 403)
    if election_id is not None and device.election_id not in (None, election_id):
        try:
            db.session.add(AuditLog(
                action="TAMPER_DETECTED",
                details=f"Election mismatch tamper attempt! Device {device.device_name} tried access to election #{election_id} from IP {request.remote_addr}.",
                ip_address=request.remote_addr or "",
                user_agent=(request.user_agent.string or "")[:255],
            ))
            db.session.commit()
        except Exception:
            pass
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
            or not officer.otp_enabled or not code or not officer.verify_otp(code, valid_window=3)
            or not election or election.effective_status == "archived"):
        try:
            db.session.add(AuditLog(
                action="BOOTH_SETUP_FAILED",
                details=f"Wrong PIN or invalid setup code entered during booth setup from IP {request.remote_addr}.",
                ip_address=request.remote_addr or "",
                user_agent=(request.user_agent.string or "")[:255],
            ))
            db.session.commit()
        except Exception:
            pass
        return failure

    # single use: only one request can flip used_at from NULL
    claimed = BoothCreateToken.query.filter_by(id=row.id, used_at=None).update(
        {"used_at": datetime.now(timezone.utc)}, synchronize_session=False)
    if claimed != 1:
        return failure

    from app.models.booth_slip import BoothSlip
    device = None
    if getattr(row, "kiosk_id", None):
        device = db.session.get(KioskDevice, row.kiosk_id)
        if device:
            raw = f"booth_{secrets.token_urlsafe(32)}"
            now = datetime.now(timezone.utc)
            device.kiosk_token = hash_token(raw)
            device.is_active = True
            device.ip_address = request.remote_addr or ""
            device.last_heartbeat = now
            booth_id = device.device_name

    if not device:
        booth_num = getattr(row, "booth_number", None) or 1
        booth_id = f"BOOTH-{booth_num:02d}"
        device, raw = KioskDevice.activate(booth_id, request.remote_addr or "", election.id)
        device.booth_number = booth_num

    # Ensure unlinked slips matching this booth number get associated
    BoothSlip.query.filter_by(election_id=election.id, booth_number=device.number, booth_id=None).update(
        {"booth_id": device.id}, synchronize_session=False
    )
    db.session.add(AuditLog(
        user_id=officer.id,
        action="BOOTH_ACTIVATED",
        details=f"Set up booth {booth_id} for \u201c{election.title}\u201d (session {device.ref}), approved by {officer.name}.",
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))
    commit_or_flush()
    return jsonify({"booth_token": raw, "booth_id": booth_id}), 201


@booth_bp.get("/current-slip")
@limiter.exempt
def get_current_slip():
    """
    Returns the current unused sequential voting ID for this kiosk terminal's booth.
    """
    ok, device = KioskDevice.verify_token(booth_token_from_request())
    if not ok:
        return jsonify({"error": "Unauthorized booth"}), 403

    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and device.election_id == active_mock.id:
        election = active_mock
    else:
        election = device.election or Election.current()
    if not election:
        return jsonify({
            "booth_id": device.booth_id,
            "booth_number": device.number,
            "current_voting_id": None,
            "has_slips": False,
            "is_exhausted": False,
            "slips_remaining": 0,
            "total_slips": 0,
        }), 200

    current_slip = (
        BoothSlip.query.filter_by(election_id=election.id, booth_id=device.id, is_used=False)
        .order_by(BoothSlip.sequence_number.asc())
        .first()
    )
    if not current_slip:
        current_slip = BoothSlip.get_current_slip(election.id, device.number, booth_id=device.id)

    total_slips = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        (BoothSlip.booth_id == device.id) | (BoothSlip.booth_number == device.number)
    ).count()
    used_slips = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        (BoothSlip.booth_id == device.id) | (BoothSlip.booth_number == device.number),
        BoothSlip.is_used == True
    ).count()
    remaining = total_slips - used_slips

    return jsonify({
        "booth_id": device.booth_id,
        "booth_number": device.number,
        "current_voting_id": current_slip.voting_id if current_slip else None,
        "has_slips": bool(current_slip),
        "is_exhausted": total_slips > 0 and remaining == 0,
        "slips_remaining": remaining,
        "total_slips": total_slips,
        "is_mock": bool(election and election.is_mock),
    }), 200


@booth_bp.get("/status")
@limiter.exempt
def status():
    """Polled by the kiosk every few seconds: is this booth still authorized, and is voting open?"""
    ok, device = KioskDevice.verify_token(booth_token_from_request())
    if not ok:
        return jsonify({"valid": False}), 200
    commit_or_flush()  # keeps the "last seen" time
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and device.election_id == active_mock.id:
        election = active_mock
    else:
        election = device.election or Election.current()
    data = election.to_dict() if election else None

    # Retrieve current slip info for this booth
    current_slip = (
        BoothSlip.query.filter_by(election_id=election.id, booth_id=device.id, is_used=False, is_cancelled=False)
        .order_by(BoothSlip.sequence_number.asc())
        .first()
    ) if election else None
    if not current_slip and election:
        current_slip = BoothSlip.get_current_slip(election.id, device.number, booth_id=device.id)

    if election:
        counts = db.session.query(
            db.func.count(BoothSlip.id),
            db.func.count(db.case((BoothSlip.is_used == True, 1))),
        ).filter(
            BoothSlip.election_id == election.id,
            (BoothSlip.booth_id == device.id) | (BoothSlip.booth_number == device.number),
        ).first()
        total_slips, used_slips = (counts[0] or 0), (counts[1] or 0)
    else:
        total_slips, used_slips = 0, 0
    remaining = total_slips - used_slips

    return jsonify({
        "valid": True,
        "booth_id": device.booth_id,
        "booth_number": device.number,
        "current_voting_id": current_slip.voting_id if current_slip else None,
        "has_slips": bool(current_slip),
        "is_exhausted": total_slips > 0 and remaining == 0,
        "slips_remaining": remaining,
        "total_slips": total_slips,
        "is_mock": bool(election and election.is_mock),
        "slip_prefix": election.ensure_slip_prefix() if election else None,
        "voting_open": bool(election and election.is_ongoing),
        "voting_ended": bool(election and not election.desk_open),
        "print": SystemSetting.printing(),
        "election": {"id": election.id, "title": election.title, "status": election.effective_status, "paused": bool(election.voting_paused), "is_mock": bool(election.is_mock),
                     "start_time": data["start_time"], "end_time": data["end_time"]} if election else None,
    }), 200

@booth_bp.post("/receipt-upload")
@limiter.limit("60 per minute")
def upload_booth_receipt():
    """
    Real-time receipt upload from booth terminals.
    Receives the exact vector PDF generated by the booth machine and saves it centrally.
    """
    import os
    import re
    raw_slip = (request.form.get("slip_id") or request.form.get("receipt_ref") or "").strip()
    slip_id = re.sub(r"[^A-Za-z0-9_-]", "", raw_slip)
    if not slip_id:
        return jsonify({"error": "slip_id is required"}), 400

    election_id = request.form.get("election_id", type=int)
    device, denied = require_booth(election_id=election_id)
    if denied:
        return denied
    booth_name = device.booth_id

    is_mock = request.form.get("is_mock", "false").lower() in ("true", "1", "yes")
    html_content = request.form.get("html") or ""
    choices_raw = request.form.get("choices") or "[]"

    from app.services.receipt_service import get_receipt_dir
    from app.models.vote_receipt import VoteReceipt
    from app.models.election import Election

    if not election_id:
        election_id = device.election_id or (Election.current().id if Election.current() else 1)

    storage_dir = os.path.abspath(get_receipt_dir(is_mock))
    pdf_filename = f"{slip_id}.pdf"
    pdf_path = os.path.abspath(os.path.join(storage_dir, pdf_filename))
    if not pdf_path.startswith(storage_dir):
        return jsonify({"error": "Invalid storage path"}), 400

    pdf_file = request.files.get("pdf")
    if pdf_file:
        pdf_file.save(pdf_path)

    if html_content:
        html_path = os.path.abspath(os.path.join(storage_dir, f"{slip_id}.html"))
        if html_path.startswith(storage_dir):
            try:
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html_content)
            except Exception:
                pass

    now = datetime.now(timezone.utc)
    receipt = VoteReceipt.query.filter_by(slip_id=slip_id).first()
    if not receipt:
        receipt = VoteReceipt(
            slip_id=slip_id,
            election_id=election_id,
            booth_name=booth_name,
            is_mock=is_mock,
            choices_json=choices_raw,
            html_content=html_content,
            pdf_filename=pdf_filename,
            created_at=now,
        )
        db.session.add(receipt)
    else:
        receipt.booth_name = booth_name
        receipt.is_mock = is_mock
        receipt.choices_json = choices_raw
        if html_content:
            receipt.html_content = html_content
        receipt.pdf_filename = pdf_filename
        receipt.created_at = now

    mode_str = "mock" if is_mock else "official"
    try:
        import json
        parsed_c = json.loads(choices_raw) if choices_raw else []
        choices_cnt = len(parsed_c) if isinstance(parsed_c, list) else 0
    except Exception:
        choices_cnt = 0

    db.session.add(AuditLog(
        action="RECEIPT_ARCHIVED",
        details=f"Receipt slip {slip_id} archived centrally from {booth_name} ({mode_str}, {choices_cnt} position(s) voted).",
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
        created_at=now,
    ))

    db.session.commit()
    return jsonify({"success": True, "slip_id": slip_id}), 200

