"""
app/routes/manage.py — Election Officer management: overview, lifecycle, positions,
programmes, instance settings and reports. Every route is admin-only.
"""

import csv
import io
import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.voting_token import VotingToken
from app.models.election_position import ElectionPosition
from app.models.programme import Programme
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.voter_record import VoterRecord
from app.programme_import import DUPLICATE, programme_fields, import_programme_csv
from app.routes.setup import validate_payload
from app.services.vote_service import VoteService
from app.utils.decorators import admin_required
from app.utils.timeutil import utc_iso
from app.utils.validators import clean_name, sanitize_input

manage_bp = Blueprint("manage", __name__)

logger = logging.getLogger(__name__)

_LOCKED_AFTER = Election.STATUSES.index("voting_active")  # positions/candidates frozen from here on


def _audit(action, details):
    ident = get_jwt_identity()
    db.session.add(AuditLog(
        user_id=int(ident) if ident and str(ident).isdigit() else None,
        action=action,
        details=details,
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))


def election_locked(election) -> bool:
    return Election.STATUSES.index(election.effective_status) >= _LOCKED_AFTER


def transition(election, target):
    """Apply a lifecycle change. Returns an error message, or None on success."""
    cur = election.effective_status
    order = Election.STATUSES
    if target not in order:
        return "Unknown election status."
    i, j = order.index(cur), order.index(target)
    if j == i:
        return None
    # Forward one step at a time; before voting opens an officer may also step back.
    if j != i + 1 and not (j < i and i <= order.index("ready")):
        return f"An election cannot move from {Election.STATUS_LABELS[cur]} to {Election.STATUS_LABELS[target]}."

    if target == "voting_active":
        active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
        if active_mock or election.is_mock:
            return "A mock election is currently active. Please end the mock election and reset before opening live voting."
        names = [p.name for p in election.positions]
        if not names:
            return "Add at least one position before opening voting."
        covered = {r[0] for r in db.session.query(Candidate.position).filter_by(election_id=election.id)}
        missing = [n for n in names if n not in covered]
        if missing:
            return "Every position needs at least one candidate. Missing: " + ", ".join(missing) + "."
    election.set_status(target)
    if target == "voting_closed":  # PINs handed out but not used can no longer start a vote
        now = datetime.now(timezone.utc)
        VotingToken.query.filter_by(election_id=election.id, is_used=False).update({"expires_at": now})
    return None


# ── overview ──────────────────────────────────────────────────────────────────

@manage_bp.get("/overview")
@admin_required
def overview():
    election = Election.current()
    from app.models.booth_slip import BoothSlip
    slips_total = BoothSlip.query.filter_by(election_id=election.id).count() if election else 0
    slips_used = BoothSlip.query.filter_by(election_id=election.id, is_used=True).count() if election else 0
    voters = slips_total if slips_total > 0 else User.query.filter_by(role="voter").count()
    cast = slips_used if slips_total > 0 else (
        VoterRecord.query.filter_by(election_id=election.id, has_voted=True).count() if election else 0
    )
    candidates = Candidate.query.filter_by(election_id=election.id).count() if election else 0
    desk_officers = User.query.filter_by(role="polling_officer").count()

    from app.models.kiosk_device import KioskDevice
    kiosks = KioskDevice.query.filter_by(election_id=election.id).all() if election else []
    total_booths = len(kiosks)
    online_booths = sum(1 for k in kiosks if k.online and k.is_active)
    active_booths = sum(1 for k in kiosks if k.is_active)

    recent = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()
    user_ids = {a.user_id for a in recent if a.user_id}
    actors = {u.id: u.name for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
    recent_activity = []
    import re
    for a in recent:
        actor_name = actors.get(a.user_id)
        if not actor_name:
            if a.action in ("VOTE_CAST_BOOTH", "BALLOT_CAST", "BOOTH_SESSION_ENDED") or "Voting ID" in (a.details or "") or "Voter Slip ID" in (a.details or ""):
                m = re.search(r"(?:Voting ID|Voter Slip ID)\s+([A-Za-z0-9_-]+)", a.details or "")
                actor_name = f"Voter ({m.group(1)})" if m else "Voter"
            elif "BOOTH-" in (a.details or ""):
                m = re.search(r"(BOOTH-\d+)", a.details or "")
                actor_name = m.group(1) if m else "Voting Booth"
            else:
                actor_name = "System"
        recent_activity.append({
            "action": a.action,
            "details": a.details,
            "actor": actor_name,
            "at": utc_iso(a.created_at),
        })
    return jsonify({
        "election": election.to_dict() if election else None,
        "stats": {
            "registered_voters": voters,
            "desk_officers": desk_officers,
            "candidates": candidates,
            "votes_cast": cast,
            "remaining_voters": max(voters - cast, 0),
            "turnout_percent": round(cast / voters * 100, 1) if voters else 0.0,
            "voting_booths": total_booths,
            "online_booths": online_booths,
            "active_booths": active_booths,
        },
        "setup": {
            "voter_slips": slips_total,
            "positions": len(election.positions) if election else 0,
            "candidates": candidates,
            "desk_officers": desk_officers,
            "voting_booths": total_booths,
        },
        "recent_activity": recent_activity,
    }), 200
# ── lifecycle ─────────────────────────────────────────────────────────────────

@manage_bp.post("/elections/<int:election_id>/status")
@admin_required
def set_election_status(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    target = (request.get_json(silent=True) or {}).get("status")
    err = transition(election, target)
    if err:
        return jsonify({"error": err}), 409
    _audit("ELECTION_STATUS_CHANGED", f"Moved \u201c{election.title}\u201d to the stage \u201c{Election.STATUS_LABELS[target]}\u201d.")
    db.session.commit()
    return jsonify(election.to_dict()), 200


@manage_bp.post("/elections/<int:election_id>/pause")
@admin_required
def pause_voting(election_id):
    """Pause voting (for example a break): booths stop accepting votes until it is resumed."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status != "voting_active":
        return jsonify({"error": "Voting can only be paused while it is open."}), 409
    if not election.voting_paused:
        election.voting_paused = True
        _audit("VOTING_PAUSED", f"Paused voting in \u201c{election.title}\u201d.")
        db.session.commit()
    return jsonify(election.to_dict()), 200


@manage_bp.post("/elections/<int:election_id>/resume")
@admin_required
def resume_voting(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status != "voting_active":
        return jsonify({"error": "Voting is not open."}), 409
    if election.voting_paused:
        election.voting_paused = False
        _audit("VOTING_RESUMED", f"Resumed voting in \u201c{election.title}\u201d.")
        db.session.commit()
    return jsonify(election.to_dict()), 200



# ── mock election ─────────────────────────────────────────────────────────────

@manage_bp.get("/mock/status")
@admin_required
def get_mock_status():
    """Returns current mock election state, participating booths, and slip statistics."""
    from app.models.kiosk_device import KioskDevice
    from app.models.booth_slip import BoothSlip

    mock_election = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if not mock_election:
        return jsonify({"is_running": False, "mock": None}), 200

    assigned_kiosks = KioskDevice.query.filter_by(election_id=mock_election.id).all()
    booth_numbers = sorted(list({k.number for k in assigned_kiosks if k.number is not None}))
    if not booth_numbers:
        booth_numbers = sorted(list({
            r[0] for r in db.session.query(BoothSlip.booth_number).filter_by(election_id=mock_election.id).all() if r[0] is not None
        }))

    slips_total = BoothSlip.query.filter_by(election_id=mock_election.id).count()
    slips_used = BoothSlip.query.filter_by(election_id=mock_election.id, is_used=True).count()

    return jsonify({
        "is_running": True,
        "mock": {
            "id": mock_election.id,
            "title": mock_election.title,
            "parent_election_id": mock_election.parent_election_id,
            "booth_numbers": booth_numbers,
            "slips_total": slips_total,
            "slips_used": slips_used,
            "slips_remaining": max(0, slips_total - slips_used),
            "started_at": mock_election.mock_started_at.isoformat() if mock_election.mock_started_at else None,
        }
    }), 200


@manage_bp.post("/mock/start")
@manage_bp.post("/elections/<int:election_id>/mock/start")
@admin_required
def start_mock(election_id=None):
    """
    Start mock election: separate pre-election dry run to verify booths, hardware, and slip flow.
    Real election slips, candidates, and setup remain completely isolated and untouched.
    """
    from app.models.kiosk_device import KioskDevice
    from app.models.booth_slip import BoothSlip

    existing_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if existing_mock:
        return jsonify({
            "error": "A mock election is already running.",
            "mock_id": existing_mock.id,
        }), 409

    body = request.get_json(silent=True) or {}
    eid = election_id or body.get("election_id")
    if eid:
        real_election = db.session.get(Election, eid)
    else:
        real_election = Election.query.filter(Election.status != "archived", Election.is_mock == False).order_by(Election.created_at.desc()).first()

    if not real_election:
        return jsonify({"error": "No election found to run a mock dry run on."}), 404

    # Backwards compatibility check: If called with NO request body (e.g. legacy test) on an election in ready stage
    is_legacy_call = not body and election_id is not None
    if is_legacy_call:
        if real_election.effective_status != "ready":
            return jsonify({"error": "A mock election can only start while the election is in the Ready stage."}), 409
        err = transition(real_election, "voting_active")
        if err:
            return jsonify({"error": err}), 409
        real_election.is_mock = True
        real_election.mock_started_at = datetime.now(timezone.utc)
        _audit("MOCK_STARTED", f"Started a legacy mock election for “{real_election.title}”.")
        db.session.commit()
        return jsonify(real_election.to_dict()), 200

    # Separate Mock Election Workflow:
    slip_count = max(1, min(int(body.get("slip_count") or 10), 100))
    candidate_mode = str(body.get("candidate_mode") or "demo").strip().lower()
    booth_numbers = body.get("booth_numbers")
    if not isinstance(booth_numbers, list) or len(booth_numbers) == 0:
        first_kiosk = KioskDevice.query.filter_by(is_active=True).first()
        booth_numbers = [first_kiosk.number] if first_kiosk else [1]
    else:
        booth_numbers = [int(b) for b in booth_numbers if str(b).isdigit()]
        if not booth_numbers:
            booth_numbers = [1]

    now = datetime.now(timezone.utc)
    mock_election = Election(
        title=f"[MOCK] {real_election.title}",
        description="Dry-run mock election conducted prior to voting.",
        start_time=now,
        end_time=now + timedelta(hours=2),
        status="voting_active",
        is_active=True,
        is_mock=True,
        mock_started_at=now,
        slip_prefix="MOCK-",
        parent_election_id=real_election.id,
        created_by=real_election.created_by,
    )
    db.session.add(mock_election)
    db.session.flush()

    if candidate_mode == "real" and real_election.positions:
        for pos in real_election.positions:
            mock_pos = ElectionPosition(
                election_id=mock_election.id,
                name=pos.name,
                sort_order=pos.sort_order,
            )
            db.session.add(mock_pos)
        for cand in real_election.candidates:
            mock_cand = Candidate(
                election_id=mock_election.id,
                name=cand.name,
                position=cand.position,
                party=cand.party,
                department=cand.department,
                semester=cand.semester,
                bio=cand.bio,
                photo_url=cand.photo_url,
            )
            db.session.add(mock_cand)
    else:
        demo_positions = [
            {
                "name": "President",
                "sort_order": 1,
                "candidates": [
                    {"name": "Narendra Modi", "party": "Progress Alliance", "bio": "Progress & Development Alliance."},
                    {"name": "Donald Trump", "party": "Liberty Movement", "bio": "Liberty & Prosperity Movement."},
                    {"name": "Barack Obama", "party": "Progressive Unity", "bio": "Progressive Student Coalition."},
                ],
            },
            {
                "name": "General Secretary",
                "sort_order": 2,
                "candidates": [
                    {"name": "Sarah Chen (Demo)", "party": "Campus Voice", "bio": "Campus Welfare & Activity Board."},
                    {"name": "Vikram Malhotra (Demo)", "party": "Students United", "bio": "Students Democratic Union."},
                ],
            },
        ]
        for p_info in demo_positions:
            pos = ElectionPosition(
                election_id=mock_election.id,
                name=p_info["name"],
                sort_order=p_info["sort_order"],
            )
            db.session.add(pos)
            for c_info in p_info["candidates"]:
                cand = Candidate(
                    election_id=mock_election.id,
                    name=c_info["name"],
                    position=p_info["name"],
                    party=c_info.get("party"),
                    bio=c_info.get("bio"),
                )
                db.session.add(cand)

    db.session.flush()

    for b_num in booth_numbers:
        kiosk = KioskDevice.query.filter_by(booth_number=b_num).first()
        if not kiosk:
            kiosk = KioskDevice.query.filter_by(device_name=f"BOOTH-{b_num:02d}").first()
        k_id = None
        if kiosk:
            kiosk.election_id = mock_election.id
            k_id = kiosk.id

        BoothSlip.generate_batch(
            election_id=mock_election.id,
            booth_number=b_num,
            count=slip_count,
            booth_id=k_id,
            is_mock=True,
        )

    _audit("MOCK_STARTED", f"Started separate mock election #{mock_election.id} for '{real_election.title}' on booths {booth_numbers} with {slip_count} slips per booth ({candidate_mode} candidates).")
    db.session.commit()

    res = mock_election.to_dict()
    res.update({
        "parent_election_id": real_election.id,
        "booth_numbers": booth_numbers,
        "slip_count": slip_count,
        "candidate_mode": candidate_mode,
        "mock_election_id": mock_election.id,
    })
    return jsonify(res), 200


@manage_bp.post("/mock/end")
@manage_bp.post("/elections/<int:election_id>/mock/end")
@admin_required
def end_mock(election_id=None):
    """
    End the mock: wipe mock ballots, mock PINs, mock slips, and restore kiosk booth machines.
    Real election slips and data are 100% untouched and preserved.
    """
    from app.models.ballot_entry import BallotEntry
    from app.models.booth_slip import BoothSlip
    from app.models.kiosk_device import KioskDevice
    from app.services.receipt_service import ReceiptService

    body = request.get_json(silent=True) or {}
    if body.get("confirm") not in ("RESET", True, "yes"):
        if body.get("confirm") != "RESET":
            return jsonify({"error": "Type RESET to confirm."}), 400

    mock_election = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    target_election = db.session.get(Election, election_id) if election_id else None

    if target_election and target_election.is_mock and (not mock_election or mock_election.id == target_election.id):
        mock_election = target_election

    if not mock_election and not (target_election and target_election.is_mock):
        return jsonify({"error": "No mock election is running."}), 409

    active_mock_id = mock_election.id if mock_election else target_election.id
    parent_id = getattr(mock_election, "parent_election_id", None)
    if not parent_id:
        real_e = Election.query.filter(Election.is_mock == False, Election.status != "archived").order_by(Election.created_at.desc()).first()
        parent_id = real_e.id if real_e else None

    ballots = BallotEntry.query.filter_by(election_id=active_mock_id).delete(synchronize_session=False)
    pins = VotingToken.query.filter_by(election_id=active_mock_id).delete(synchronize_session=False)

    slips = BoothSlip.query.filter(
        (BoothSlip.election_id == active_mock_id) | (BoothSlip.is_mock == True)
    ).delete(synchronize_session=False)

    voted = VoterRecord.query.filter_by(election_id=active_mock_id).update({"has_voted": False, "voted_at": None})

    try:
        ReceiptService.clear_mock_receipts(election_id=active_mock_id)
    except Exception as e:
        logger.warning(f"Failed to clear mock receipts during end_mock: {e}")

    started_at = (mock_election.mock_started_at if mock_election else None) or (target_election.mock_started_at if target_election else None)
    if started_at:
        AuditLog.query.filter(AuditLog.created_at >= started_at).delete(synchronize_session=False)

    KioskDevice.query.filter_by(election_id=active_mock_id).update({"election_id": parent_id})
    db.session.flush()

    if mock_election and mock_election.parent_election_id:
        _audit("MOCK_RESET", f"Mock election #{mock_election.id} ended and purged: {ballots} ballots, {pins} PINs, {slips} mock slips removed. Booths restored to election #{parent_id}.")
        db.session.delete(mock_election)
        db.session.commit()
        real_election = db.session.get(Election, parent_id) if parent_id else None
        return jsonify({
            "message": "Mock election ended successfully. Booth machines restored to real election.",
            "status": real_election.status if real_election else "ready",
            "is_mock": False,
        }), 200
    else:
        target_election.set_status("ready")
        target_election.is_mock = False
        target_election.mock_started_at = None
        target_election.public_token = None
        _audit("MOCK_RESET", f"A mock election was run and reset: {ballots} ballot rows, {pins} PINs, {slips} voter slips and 0 log entries removed; {voted} voters reset.")
        db.session.commit()
        return jsonify(target_election.to_dict()), 200


# ── positions ─────────────────────────────────────────────────────────────────

@manage_bp.get("/elections/<int:election_id>/positions")
@admin_required
def get_positions(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    return jsonify([p.name for p in election.positions]), 200


@manage_bp.put("/elections/<int:election_id>/positions")
@admin_required
def put_positions(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election_locked(election):
        return jsonify({"error": "Positions cannot be changed once voting has opened."}), 409

    names = [clean_name(n) for n in (request.get_json(silent=True) or {}).get("positions", []) if clean_name(n)]
    if not names:
        return jsonify({"error": "Add at least one position."}), 400
    if len({n.lower() for n in names}) != len(names) or any(len(n) > 100 for n in names):
        return jsonify({"error": "Position names must be unique and under 100 characters."}), 400
    names = [sanitize_input(n) for n in names]

    in_use = {r[0] for r in db.session.query(Candidate.position).filter_by(election_id=election.id)}
    dropped = in_use - set(names)
    if dropped:
        return jsonify({"error": "Remove the candidates first for: " + ", ".join(sorted(dropped)) + "."}), 409

    existing = {p.name: p for p in election.positions}
    for i, n in enumerate(names):
        if n in existing:
            existing[n].sort_order = i
        else:
            db.session.add(ElectionPosition(election_id=election.id, name=n, sort_order=i))
    for n, p in existing.items():
        if n not in names:
            db.session.delete(p)
    _audit("POSITIONS_UPDATED", f"Set the positions for \u201c{election.title}\u201d: {', '.join(names)}.")
    db.session.commit()
    db.session.refresh(election)
    return jsonify([p.name for p in election.positions]), 200


# ── programmes ────────────────────────────────────────────────────────────────

@manage_bp.get("/programmes")
@admin_required
def list_programmes():
    return jsonify([p.to_dict() for p in Programme.query.order_by(Programme.name).all()]), 200


@manage_bp.post("/programmes")
@admin_required
def create_programme():
    fields, err = programme_fields(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    p = Programme(**fields)
    db.session.add(p)
    _audit("PROGRAMME_CREATED", f"Added the programme \u201c{p.name}\u201d.")
    db.session.commit()
    return jsonify(p.to_dict()), 201


@manage_bp.post("/programmes/import")
@admin_required
def import_programmes():
    """CSV columns: level (hs|degree), programme, department (stream for hs), terms (optional)."""
    upload = request.files.get("file")
    raw = upload.stream.read(200_001) if upload else b""
    if not raw or len(raw) > 200_000:
        return jsonify({"error": "Choose a CSV file under 200 KB."}), 400
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return jsonify({"error": "The file is not a valid UTF-8 CSV."}), 400
    created, skipped, errors = import_programme_csv(text)
    if errors and not created and not skipped:  # file-level problem (empty, too many rows)
        return jsonify({"error": errors[0]}), 400
    _audit("PROGRAMMES_IMPORTED", f"Imported programmes from a CSV file: {created} added, {skipped} already existed, {len(errors)} rows had problems.")
    db.session.commit()
    return jsonify({"created": created, "skipped": skipped, "errors": errors}), 200


@manage_bp.put("/programmes/<int:programme_id>")
@admin_required
def update_programme(programme_id):
    p = db.session.get(Programme, programme_id)
    if not p:
        return jsonify({"error": "Programme not found."}), 404
    payload = request.get_json(silent=True) or {}
    if any(k in payload for k in ("level", "programme", "department", "term_count")):
        fields, err = programme_fields(payload, p)
        if err:
            return jsonify({"error": err}), 400
        if fields["term_count"] < p.term_count and User.query.filter(
            User.programme_id == p.id, User.year > fields["term_count"]
        ).first():
            return jsonify({"error": "Registered students are enrolled in the terms you are removing."}), 409
        for k, v in fields.items():
            setattr(p, k, v)
        User.query.filter_by(programme_id=p.id).update({"department": p.name})
    if "is_active" in payload:
        p.is_active = bool(payload["is_active"])
    _audit("PROGRAMME_UPDATED", f"Updated the programme \u201c{p.name}\u201d.")
    db.session.commit()
    return jsonify(p.to_dict()), 200


@manage_bp.delete("/programmes/<int:programme_id>")
@admin_required
def delete_programme(programme_id):
    p = db.session.get(Programme, programme_id)
    if not p:
        return jsonify({"error": "Programme not found."}), 404
    if User.query.filter_by(programme_id=p.id).first():
        return jsonify({"error": "Students are registered under this programme. Deactivate it instead."}), 409
    _audit("PROGRAMME_DELETED", f"Deleted the programme \u201c{p.name}\u201d.")
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Programme deleted."}), 200


# ── instance settings ─────────────────────────────────────────────────────────

@manage_bp.get("/settings")
@admin_required
def get_settings():
    return jsonify(SystemSetting.branding()), 200


@manage_bp.put("/settings")
@admin_required
def put_settings():
    payload = request.get_json(silent=True) or {}
    merged = {**SystemSetting.branding(), **{k: payload[k] for k in SystemSetting.BRANDING_KEYS if k in payload}}
    errors = validate_payload({"system": merged}, ("system",))
    if errors:
        return jsonify({"error": "Please correct the highlighted fields.", "errors": errors}), 400
    merged["slip_code"] = (merged.get("slip_code") or "SUE").upper()
    for k, v in merged.items():
        if k in ("institution_name", "system_name"):
            val = sanitize_input(clean_name(v))
        elif k == "enable_theme_toggle":
            # Store as explicit "true"/"false" to avoid bool-or-empty coercion bug
            val = "true" if str(v).strip().lower() in ("true", "1", "yes", "on") else "false"
        else:
            val = v or ""
        SystemSetting.put(k, val)
    _audit("SETTINGS_UPDATED", "Updated the institution settings.")
    db.session.commit()
    return jsonify(SystemSetting.branding()), 200


@manage_bp.get("/settings/printing")
@admin_required
def get_printing():
    return jsonify(SystemSetting.printing()), 200


@manage_bp.put("/settings/printing")
@admin_required
def put_printing():
    p = request.get_json(silent=True) or {}
    printer = str(p.get("printer") or "").strip()
    if len(printer) > 100 or not all(ch.isalnum() or ch in "-_. " for ch in printer):
        return jsonify({"error": "The printer name may only contain letters, numbers, spaces, dots, dashes and underscores."}), 400
    try:
        copies = int(p.get("copies", 1))
    except (TypeError, ValueError):
        copies = 0
    if not 1 <= copies <= 3:
        return jsonify({"error": "Copies must be 1 to 3."}), 400
    SystemSetting.put("print_enabled", "1" if p.get("enabled", True) else "0")
    SystemSetting.put("print_printer", printer)
    SystemSetting.put("print_copies", str(copies))
    _audit("SETTINGS_UPDATED", "Updated the booth printing settings.")
    db.session.commit()
    return jsonify(SystemSetting.printing()), 200


# ── reports ───────────────────────────────────────────────────────────────────

@manage_bp.get("/elections/<int:election_id>/results")
@admin_required
def election_results(election_id):
    """Results for officers, only once published (before that: turnout and the position list). Includes the public share path."""
    from app.routes.results import results_payload

    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    published = election.effective_status in ("results_published", "archived")
    voting_over = election.effective_status not in ("setup", "registration", "ready", "voting_active")
    if published or election.is_mock:  # a mock election shows live results so the whole run can be checked
        data = results_payload(election, force=True)
    else:
        # Counts, winners and candidates' votes stay hidden until the officer publishes the results.
        from app.services.vote_service import VoteService

        order = [p.name for p in election.positions]
        data = {
            "locked": True,
            "election": {"id": election.id, "title": election.title},
            "turnout": VoteService.calculate_turnout(election_id=election.id),
            "by_position": [{"position": n} for n in order],
        }
    data["published"] = published
    data["mock"] = bool(election.is_mock)
    data["voting_over"] = voting_over
    data["public_path"] = f"/results/{election.public_token}" if election.public_token else None
    return jsonify(data), 200


@manage_bp.post("/elections/<int:election_id>/public-link")
@admin_required
def create_public_link(election_id):
    """The officer decides when the results become public, typically after the projector reveal."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status not in ("results_published", "archived"):
        return jsonify({"error": "A public link can be created only after the results are published."}), 409
    election.ensure_public_token()
    _audit("PUBLIC_LINK_CREATED", f"Created a public results link for \u201c{election.title}\u201d.")
    db.session.commit()
    return jsonify({"public_path": f"/results/{election.public_token}"}), 201


@manage_bp.delete("/elections/<int:election_id>/public-link")
@admin_required
def delete_public_link(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    election.public_token = None
    _audit("PUBLIC_LINK_DELETED", f"Deleted the public results link for \u201c{election.title}\u201d.")
    db.session.commit()
    return jsonify({"message": "The public link no longer works."}), 200


@manage_bp.get("/elections/<int:election_id>/report")
@admin_required
def election_report(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status not in ("results_published", "archived"):
        return jsonify({"error": "The report is available after the results are published."}), 409
    results = VoteService.get_results(election_id=election.id, force=True)
    turnout = VoteService.calculate_turnout(election_id=election.id)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Election", election.title])
    w.writerow(["Status", election.STATUS_LABELS[election.effective_status]])
    w.writerow(["Registered voters", turnout["total_registered"]])
    w.writerow(["Ballots cast", turnout["ballots_cast"]])
    w.writerow(["Registered voters who did not vote", turnout["total_registered"] - turnout["ballots_cast"]])
    w.writerow([])
    w.writerow(["Position", "Candidate", "Votes"])
    for pos in results["by_position"]:
        for c in pos["candidates"]:
            w.writerow([pos["position"], c["name"], c["votes"]])
        w.writerow([pos["position"], "NOTA (None of the Above, not a candidate)", pos["nota_count"]])
    _audit("REPORT_GENERATED", f"Downloaded the results report for \u201c{election.title}\u201d.")
    db.session.commit()
    return Response(
        out.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=election-{election.id}-report.csv"},
    )
