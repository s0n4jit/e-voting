"""
app/routes/admin.py — Administrator routes.
"""

import csv
import io
from datetime import datetime, timezone
from dateutil import parser as date_parser
from PIL import Image
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import get_jwt_identity

from app.extensions import db, commit_or_flush
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.candidate_photo import CandidatePhoto
from app.models.election_position import ElectionPosition
from app.models.programme import Programme
from app.models.voter_record import VoterRecord
from app.models.audit_log import AuditLog
from app.models.voting_token import STATIC_PIN_MINUTES, VotingToken
from app.models.kiosk_device import KioskDevice
from app.utils.decorators import admin_required, desk_required
from app.audit_categories import ACTIONS, ALIASES, CATEGORIES, action_label, category_of
from app.routes.manage import election_locked, transition
from app.utils.validators import (
    sanitize_input,
    validate_email,
    validate_password,
    validate_student_id,
)

admin_bp = Blueprint("admin", __name__)

def _audit(action, details):
    ident = get_jwt_identity()
    db.session.add(AuditLog(
        user_id=int(ident) if ident and str(ident).isdigit() else None, action=action, details=details,
        ip_address=request.remote_addr or "", user_agent=(request.user_agent.string or "")[:255],
    ))


MAX_PHOTO_BYTES = 2 * 1024 * 1024
PHOTO_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


def read_photo(upload):
    """Validate an uploaded candidate photo. Returns ((content_type, bytes), None) or (None, error)."""
    data = upload.stream.read(MAX_PHOTO_BYTES + 1) if upload else b""
    if not data:
        return None, "A candidate photo is required."
    if len(data) > MAX_PHOTO_BYTES:
        return None, "The photo must be 2 MB or smaller."
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()  # content is decoded, not trusted from the file name or client header
            kind = PHOTO_TYPES.get(img.format)
    except Exception:
        kind = None
    if not kind:
        return None, "Upload a PNG, JPEG or WebP image."
    return (kind, data), None


# ── Elections CRUD ────────────────────────────────────────────────────────────

@admin_bp.get("/elections")
@admin_required
def list_elections():
    """List all elections."""
    elections = Election.query.order_by(Election.created_at.desc()).all()
    return jsonify([e.to_dict(include_candidates=True) for e in elections]), 200


@admin_bp.post("/elections")
@admin_required
def create_election():
    """Create a new election."""
    if any(e.effective_status != "archived" for e in Election.query.all()):
        return jsonify({"error": "Only one election can run at a time. Archive the current election first."}), 409
    payload = request.get_json(silent=True) or {}
    title = sanitize_input(payload.get("title"))
    description = sanitize_input(payload.get("description", ""))
    start_time_raw = payload.get("start_time")
    end_time_raw = payload.get("end_time")

    if not title or not start_time_raw or not end_time_raw:
        return (
            jsonify({"error": "Title, start_time, and end_time are required."}),
            400,
        )

    try:
        start_time = date_parser.parse(start_time_raw)
        end_time = date_parser.parse(end_time_raw)
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
    except Exception as exc:
        return jsonify({"error": f"Invalid date format: {exc}"}), 400

    if end_time <= start_time:
        return jsonify({"error": "End time must be after start time."}), 400

    admin_id = get_jwt_identity()
    election = Election(
        title=title,
        description=description,
        start_time=start_time,
        end_time=end_time,
        is_active=bool(payload.get("is_active", False)),
        results_published=bool(payload.get("results_published", False)),
        created_by=int(admin_id) if admin_id and str(admin_id).isdigit() else None,
    )
    db.session.add(election)
    db.session.flush()
    election.ensure_slip_prefix()
    _audit("ELECTION_CREATED", f"Created the election \u201c{election.title}\u201d.")
    names, seen = [], set()
    for raw in payload.get("positions") or []:
        n = sanitize_input(" ".join(str(raw).split()))
        if n and len(n) <= 100 and n.lower() not in seen:
            seen.add(n.lower())
            names.append(n)
    for i, n in enumerate(names):
        db.session.add(ElectionPosition(election_id=election.id, name=n, sort_order=i))
    commit_or_flush()

    return jsonify(election.to_dict()), 201


@admin_bp.get("/elections/<int:election_id>")
@admin_required
def get_election(election_id):
    """Retrieve details for a single election."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    return jsonify(election.to_dict(include_candidates=True)), 200


@admin_bp.put("/elections/<int:election_id>")
@admin_required
def update_election(election_id):
    """Update existing election configuration."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    payload = request.get_json(silent=True) or {}
    if "title" in payload:
        election.title = sanitize_input(payload["title"])
    if "description" in payload:
        election.description = sanitize_input(payload["description"])
    if ("start_time" in payload or "end_time" in payload) and election.effective_status == "archived":
        return jsonify({"error": "An archived election cannot be changed."}), 409
    if "start_time" in payload:
        try:
            st = date_parser.parse(payload["start_time"])
            election.start_time = st if st.tzinfo else st.replace(tzinfo=timezone.utc)
        except Exception as exc:
            return jsonify({"error": f"Invalid start_time: {exc}"}), 400
    if "end_time" in payload:
        try:
            et = date_parser.parse(payload["end_time"])
            election.end_time = et if et.tzinfo else et.replace(tzinfo=timezone.utc)
        except Exception as exc:
            return jsonify({"error": f"Invalid end_time: {exc}"}), 400
    # Status changes go through /elections/<id>/status so the lifecycle stays consistent.
    if election.start_time and election.end_time and election.end_time <= election.start_time:
        return jsonify({"error": "End time must be after start time."}), 400

    _audit("ELECTION_UPDATED", f"Updated the details of \u201c{election.title}\u201d.")
    commit_or_flush()
    return jsonify(election.to_dict(include_candidates=True)), 200


@admin_bp.delete("/elections/<int:election_id>")
@admin_required
def delete_election(election_id):
    """Delete an election and cascaded child entries."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    _audit("ELECTION_DELETED", f"Deleted the election \u201c{election.title}\u201d.")
    db.session.delete(election)
    commit_or_flush()
    return jsonify({"message": f"Election {election_id} deleted successfully."}), 200


@admin_bp.post("/elections/<int:election_id>/activate")
@admin_required
def activate_election(election_id):
    """Activate election for voting."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    # Walk the lifecycle forward to "voting active" (legacy one-click activation).
    while election.effective_status != "voting_active":
        nxt = Election.STATUSES[Election.STATUSES.index(election.effective_status) + 1]
        err = transition(election, nxt)
        if err:
            return jsonify({"error": err}), 409
    commit_or_flush()
    return jsonify({"message": "Election activated.", "election": election.to_dict()}), 200


@admin_bp.post("/elections/<int:election_id>/close")
@admin_required
def close_election(election_id):
    """Close an ongoing election."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    err = transition(election, "voting_closed") if election.effective_status == "voting_active" else None
    if err:
        return jsonify({"error": err}), 409
    commit_or_flush()
    return jsonify({"message": "Election closed.", "election": election.to_dict()}), 200


@admin_bp.post("/elections/<int:election_id>/publish-results")
@admin_required
def publish_results(election_id):
    """Publish election outcome."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    err = None
    if election.effective_status == "voting_active":
        err = transition(election, "voting_closed")
    if not err and election.effective_status == "voting_closed":
        election.set_status("results_published")
    if err or election.effective_status != "results_published":
        return jsonify({"error": err or "Close voting before publishing results."}), 409
    commit_or_flush()
    return jsonify({"message": "Results published.", "election": election.to_dict()}), 200


# ── Candidates Management ─────────────────────────────────────────────────────

@admin_bp.post("/elections/<int:election_id>/candidates")
@admin_required
def add_candidate(election_id):
    """Add a candidate to an election."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    payload = request.form  # multipart: fields plus the photo file
    name = sanitize_input(payload.get("name"))
    position = sanitize_input(payload.get("position", "General Secretary"))
    department = str(payload.get("department") or "").strip()
    semester = sanitize_input(payload.get("semester", ""))[:30]
    bio = sanitize_input(payload.get("bio", ""))
    upload = request.files.get("photo")

    if not name:
        return jsonify({"error": "Candidate name is required."}), 400
    if not Programme.query.filter_by(name=department, is_active=True).first():
        return jsonify({"error": "Choose the candidate's department from the list."}), 400
    photo, photo_error = read_photo(upload)
    if photo_error:
        return jsonify({"error": photo_error}), 400
    if election_locked(election):
        return jsonify({"error": "Candidates cannot be changed once voting has opened."}), 409
    allowed = [p.name for p in election.positions]
    if allowed and position not in allowed:
        return jsonify({"error": "Choose one of the election's positions."}), 400

    candidate = Candidate(
        election_id=election.id,
        name=name,
        position=position,
        department=department,
        semester=semester or None,
        bio=bio,
    )
    candidate.photo = CandidatePhoto(content_type=photo[0], data=photo[1])
    db.session.add(candidate)
    db.session.flush()
    candidate.photo_url = f"/api/photos/{candidate.id}"
    _audit("CANDIDATE_ADDED", f"Added {name} as a candidate for {position} in \u201c{election.title}\u201d.")
    commit_or_flush()  # one transaction: if anything fails above, no photo is stored either

    return jsonify(candidate.to_dict()), 201


@admin_bp.delete("/elections/<int:election_id>/candidates/<int:candidate_id>")
@admin_required
def delete_candidate(election_id, candidate_id):
    """Remove a candidate."""
    candidate = db.session.get(Candidate, candidate_id)
    if not candidate or candidate.election_id != election_id:
        return jsonify({"error": "Candidate not found in this election."}), 404
    if election_locked(candidate.election):
        return jsonify({"error": "Candidates cannot be changed once voting has opened."}), 409

    _audit("CANDIDATE_REMOVED", f"Removed {candidate.name} (candidate for {candidate.position}) from \u201c{candidate.election.title}\u201d.")
    db.session.delete(candidate)
    commit_or_flush()
    return jsonify({"message": "Candidate removed successfully."}), 200


# ── Voters Management & Bulk Import ───────────────────────────────────────────

@admin_bp.get("/voters")
@admin_required
def list_voters():
    """List voter accounts."""
    voters = User.query.filter_by(role="voter").all()
    return jsonify([v.to_dict() for v in voters]), 200


@admin_bp.post("/voters")
@admin_required
def add_single_voter():
    """Superseded by Desk Officer registration (/api/desk/registrations)."""
    return jsonify({"error": "Voters are registered at the desk, which generates their voter slip ID."}), 410


@admin_bp.post("/voters/import")
@admin_required
def import_voters():
    """Superseded by Desk Officer registration (/api/desk/registrations)."""
    return jsonify({"error": "Voters are registered at the desk, which generates their voter slip ID."}), 410


# ── Audit Trail ───────────────────────────────────────────────────────────────

@admin_bp.get("/audit-logs")
@admin_required
def get_audit_logs():
    """
    Retrieve rich, filtered, searchable audit logs for transparency reporting.
    Supports full-text query, category chip filters, and user population.
    """
    action = request.args.get("action")
    category = (request.args.get("category") or "all").lower().strip()
    search = (request.args.get("search") or request.args.get("query") or "").strip()
    user_id = request.args.get("user_id")
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))

    query = AuditLog.query

    category = ALIASES.get(category, category)
    CATEGORY_ACTIONS = ACTIONS

    if category in CATEGORY_ACTIONS:
        query = query.filter(AuditLog.action.in_(CATEGORY_ACTIONS[category]))
    elif action:
        query = query.filter(AuditLog.action == action)

    if user_id and user_id.isdigit():
        query = query.filter(AuditLog.user_id == int(user_id))

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (AuditLog.action.ilike(search_term))
            | (AuditLog.details.ilike(search_term))
            | (AuditLog.ip_address.ilike(search_term))
            | (AuditLog.user_agent.ilike(search_term))
        )

    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    # Pre-fetch user profiles for actors
    actor_ids = {log.user_id for log in logs if log.user_id}
    actors = {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}

    # Calculate summary metrics
    stats = {
        "total_records": AuditLog.query.count(),
        "ballots_cast": AuditLog.query.filter(AuditLog.action.in_(CATEGORY_ACTIONS["ballot"])).count(),
        "pins_issued": AuditLog.query.filter(AuditLog.action == "PIN_ISSUED").count(),
        "desk_enrollments": AuditLog.query.filter(AuditLog.action.in_(["DESK_CHECKIN", "STUDENT_REGISTERED"])).count(),
        "kiosk_actions": AuditLog.query.filter(AuditLog.action.in_(CATEGORY_ACTIONS["booth"])).count(),
    }

    serialized = []
    for log in logs:
        item = log.to_dict()
        item["category"] = category_of(log.action)
        item["action_label"] = action_label(log.action)
        actor = actors.get(log.user_id)
        if actor:
            item["actor_name"] = actor.name
            item["actor_student_id"] = actor.student_id
            item["actor_role"] = actor.role
        else:
            item["actor_name"] = "Automated System / Voter" if not log.user_id else f"User #{log.user_id}"
            item["actor_student_id"] = ""
            item["actor_role"] = "system" if not log.user_id else "unknown"
        serialized.append(item)

    return (
        jsonify({
            "total": total,
            "limit": limit,
            "offset": offset,
            "category": category,
            "categories": [{"id": cid, "label": label} for cid, label, _ in CATEGORIES],
            "stats": stats,
            "logs": serialized,
        }),
        200,
    )


@admin_bp.get("/audit-logs/export")
@admin_required
def export_audit_logs():
    """Export complete election audit trail as certified CSV."""
    logs = AuditLog.query.order_by(AuditLog.created_at.asc()).all()

    actor_ids = {log.user_id for log in logs if log.user_id}
    actors = {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Event ID",
        "Timestamp (UTC)",
        "Action Type",
        "Actor ID",
        "Actor Name",
        "Actor Student ID",
        "Actor Role",
        "Details",
        "IP Address",
        "User Agent",
    ])

    for log in logs:
        actor = actors.get(log.user_id)
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else "",
            log.action,
            log.user_id or "SYSTEM",
            actor.name if actor else "SYSTEM/ANONYMOUS",
            actor.student_id if actor else "",
            actor.role if actor else "system",
            log.details or "",
            log.ip_address or "",
            log.user_agent or "",
        ])

    csv_data = output.getvalue()
    filename = f"cevs_audit_trail_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Physical Desk (Voting Token Slip) ─────────────────────────────────────────

@admin_bp.post("/desk/issue-pin")
@desk_required
def issue_desk_pin():
    """
    Physical Polling Desk:
    Volunteer verifies student identity and issues a single-use 6-digit voting PIN
    valid for 20 minutes.
    """
    payload = request.get_json(silent=True) or {}
    student_id = sanitize_input(payload.get("student_id"))
    election_id = payload.get("election_id")

    if not student_id:
        return (
            jsonify({"error": "student_id is required."}),
            400,
        )

    if election_id:
        try:
            election_id = int(election_id)
            election = db.session.get(Election, election_id)
        except (ValueError, TypeError):
            return jsonify({"error": "election_id must be an integer."}), 400
    else:
        active_elections = Election.query.filter_by(is_active=True).all()
        ongoing = [e for e in active_elections if e.is_ongoing]
        election = ongoing[0] if ongoing else (
            active_elections[0] if active_elections else Election.query.order_by(Election.created_at.desc()).first()
        )

    if not election:
        return jsonify({"error": "No active election found."}), 404
    if election.voting_paused:
        return jsonify({"error": "Voting paused", "message": "Voting is paused, so voting PINs cannot be issued. Try again when the officer resumes voting."}), 409
    if not election.desk_open:
        return jsonify({"error": "Voting ended", "message": "Voting has ended, so no more students can be registered and no more PINs can be issued."}), 409

    user = User.query.filter(
        db.func.upper(User.student_id) == student_id.strip().upper(), User.role == "voter"
    ).first()
    if not user:
        return jsonify({
            "error": "Not registered",
            "message": "No registration found for this voter slip ID. Register the student first.",
        }), 404
    is_new_registration = False
    admin_identity = get_jwt_identity()
    admin_id = int(admin_identity) if str(admin_identity).isdigit() else None

    # Check if voter has already cast a ballot in this election
    voter_hash = User.hash_student_id(user.student_id)
    voter_rec = VoterRecord.query.filter_by(
        election_id=election.id, voter_hash=voter_hash
    ).first()

    if voter_rec and voter_rec.has_voted:
        return (
            jsonify({
                "error": "Already Voted",
                "message": f"Student '{user.name}' ({user.student_id}) has already cast their ballot in this election. Slip cannot be re-issued.",
            }),
            400,
        )

    # If not registered yet, register eligible student at desk
    if not voter_rec:
        voter_rec = VoterRecord(
            election_id=election.id,
            voter_hash=voter_hash,
            has_voted=False,
        )
        db.session.add(voter_rec)
        db.session.flush()

    # Generate 6-digit PIN valid for 20 minutes
    raw_pin, token_record = VotingToken.generate_pin(
        student_id=user.student_id,
        election_id=election.id,
        created_by=admin_id,
        validity_minutes=STATIC_PIN_MINUTES,
    )

    # Audit log PIN issuance
    audit_pin = AuditLog(
        user_id=admin_id,
        action="PIN_ISSUED",
        details=f"Issued a voting PIN to {user.name} ({user.student_id}) for \u201c{election.title}\u201d.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "desk",
    )
    db.session.add(audit_pin)

    db.session.commit()

    return (
        jsonify({
            "student_id": user.student_id,
            "name": user.name,
            "department": getattr(user, "department", "General"),
            "pin": str(raw_pin),
            "voting_pin": str(raw_pin),
            "expires_at": token_record.expires_at.isoformat(),
            "validity_minutes": STATIC_PIN_MINUTES,
            "election_id": election.id,
            "election_title": election.title,
            "is_new_registration": is_new_registration,
            "message": f"Single-use voting PIN slip generated for {user.name} ({user.student_id}).",
        }),
        200,
    )


@admin_bp.get("/desk/voters")
@desk_required
def get_desk_voters():
    """
    Search and list enrolled voters for desk staff with live election status
    (Already Voted / PIN Active / Ready).
    """
    search_query = request.args.get("query") or request.args.get("search") or ""
    election_id_raw = request.args.get("election_id")

    election = None
    if election_id_raw and str(election_id_raw).isdigit():
        election = db.session.get(Election, int(election_id_raw))

    if not election:
        # Default to active ongoing election or latest election
        active_elections = Election.query.filter_by(is_active=True).all()
        ongoing = [e for e in active_elections if e.is_ongoing]
        election = ongoing[0] if ongoing else (
            active_elections[0] if active_elections else Election.query.order_by(Election.created_at.desc()).first()
        )

    # Base query on voters
    query = User.query.filter(User.role == "voter")
    if search_query.strip():
        term = f"%{search_query.strip()}%"
        query = query.filter(
            (User.student_id.ilike(term))
            | (User.name.ilike(term))
            | (User.email.ilike(term))
            | (User.department.ilike(term))
        )

    students = query.order_by(User.student_id.asc()).limit(200).all()

    now = datetime.now(timezone.utc)
    results = []

    for s in students:
        has_voted = False
        is_pin_active = False
        pin_expires_at = None

        if election:
            v_hash = User.hash_student_id(s.student_id)
            vr = VoterRecord.query.filter_by(election_id=election.id, voter_hash=v_hash).first()
            if vr and vr.has_voted:
                has_voted = True

            if not has_voted:
                tok = (
                    VotingToken.query.filter_by(
                        student_id=s.student_id,
                        election_id=election.id,
                        is_used=False,
                    )
                    .order_by(VotingToken.created_at.desc())
                    .first()
                )
                if tok:
                    exp = tok.expires_at
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    if now <= exp:
                        is_pin_active = True
                        pin_expires_at = tok.expires_at.isoformat()

        if has_voted:
            status = "Already Voted"
        elif is_pin_active:
            status = "PIN Active"
        else:
            status = "Ready"

        results.append({
            "id": s.id,
            "student_id": s.student_id,
            "name": s.name,
            "email": s.email,
            "department": s.department or "",
            "year": s.year or "Undergraduate",
            "status": status,
            "has_voted": has_voted,
            "pin_active": is_pin_active,
            "pin_expires_at": pin_expires_at,
        })

    active_elections = Election.query.filter_by(is_active=True).all()
    return jsonify({
        "voters": results,
        "total": len(results),
        "election": election.to_dict() if election else None,
        "elections": [e.to_dict() for e in active_elections],
    }), 200


# ── Voting booths (created on the booth itself, see routes/booth.py) ───────────────────────────────────────────

@admin_bp.post("/booth-tokens")
@admin_required
def create_booth_token():
    """Generate a one-time token (shown once, valid 15 minutes) for setting up a voting booth."""
    from app.models.booth_create_token import TOKEN_LIFETIME, BoothCreateToken
    from app.routes.booth import _hash, new_create_token

    officer = db.session.get(User, int(get_jwt_identity()))
    election = Election.current()
    if not election or election.effective_status == "archived":
        return jsonify({"error": "There is no election to set booths up for."}), 409
    if not officer.otp_enabled:
        return jsonify({"error": "Turn on two-step verification first; booths are approved with your authenticator code."}), 409

    token = new_create_token()
    expires = datetime.now(timezone.utc) + TOKEN_LIFETIME
    db.session.add(BoothCreateToken(token_hash=_hash(token.replace("-", "")), election_id=election.id,
                                    created_by=officer.id, expires_at=expires))
    db.session.add(AuditLog(user_id=officer.id, action="BOOTH_TOKEN_CREATED",
                            details=f"Generated a booth token for \u201c{election.title}\u201d.", ip_address=request.remote_addr or ""))
    db.session.commit()
    from app.utils.timeutil import utc_iso
    return jsonify({"token": token, "expires_at": utc_iso(expires), "election_title": election.title}), 201


@admin_bp.get("/kiosk/list")
@admin_required
def list_kiosks():
    """List all registered computer lab kiosk terminals."""
    kiosks = KioskDevice.query.order_by(KioskDevice.created_at.desc()).all()
    return jsonify([k.to_dict() for k in kiosks]), 200


@admin_bp.delete("/kiosk/<int:kiosk_id>")
@admin_required
def delete_kiosk(kiosk_id):
    """Revoke and delete a registered kiosk terminal."""
    kiosk = db.session.get(KioskDevice, kiosk_id)
    if not kiosk:
        return jsonify({"error": "Kiosk terminal not found."}), 404

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()), action="BOOTH_REMOVED",
        details=f"Deleted booth {kiosk.booth_id} (session {kiosk.ref}). Its token no longer works.",
        ip_address=request.remote_addr or "",
    ))
    db.session.delete(kiosk)
    db.session.commit()
    return jsonify({"message": f"Booth {kiosk.booth_id} was deleted and signed out."}), 200


# ── Polling Desk Officers Management ──────────────────────────────────────────

@admin_bp.get("/officers")
@admin_required
def list_officers():
    """List all registered polling desk officers."""
    officers = (
        User.query.filter(User.role == "polling_officer")
        .order_by(User.created_at.desc())
        .all()
    )
    return jsonify([u.to_dict() for u in officers]), 200


@admin_bp.post("/officers")
@admin_required
def create_officer():
    """
    Election Officer creates a Polling Desk Officer credential.
    Desk officers have minimal capability: only look up students & issue PIN slips.
    """
    payload = request.get_json(silent=True) or {}
    student_id = sanitize_input(payload.get("student_id") or payload.get("officer_id"))
    name = sanitize_input(payload.get("name"))
    email = sanitize_input(payload.get("email"))
    password = payload.get("password")
    department = sanitize_input(payload.get("department", "Polling Desk Administration"))

    if not student_id or not name or not email or not password:
        return (
            jsonify({
                "error": "Missing fields",
                "message": "Officer ID, Name, Email, and Password are required.",
            }),
            400,
        )

    ok, msg = validate_password(password)
    if not ok or not validate_email(email) or not validate_student_id(student_id):
        return jsonify({
            "error": "Invalid fields",
            "message": msg if not ok else "Enter a valid email and a username of 3-32 letters, digits, dashes or underscores.",
        }), 400

    # Check for existing user
    if User.query.filter_by(student_id=student_id).first():
        return (
            jsonify({
                "error": "Conflict",
                "message": f"An account with ID '{student_id}' already exists.",
            }),
            409,
        )

    if User.query.filter_by(email=email).first():
        return (
            jsonify({
                "error": "Conflict",
                "message": f"An account with email '{email}' already exists.",
            }),
            409,
        )

    officer = User(
        student_id=student_id,
        name=name,
        email=email,
        role="polling_officer",
        department=department,
        is_admin=False,
        is_active=True,
        otp_enabled=False,
    )
    officer.set_password(password)
    db.session.add(officer)
    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()), action="DESK_OFFICER_CREATED",
        details=f"Created a desk officer account for {name} (username {student_id}).", ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    return (
        jsonify({
            "message": f"Polling desk officer '{name}' ({student_id}) created successfully.",
            "officer": officer.to_dict(),
        }),
        201,
    )


@admin_bp.delete("/officers/<int:officer_id>")
@admin_required
def delete_officer(officer_id):
    """Revoke/remove a polling desk officer."""
    officer = db.session.get(User, officer_id)
    if not officer or officer.role != "polling_officer":
        return jsonify({"error": "Polling desk officer not found."}), 404

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()), action="DESK_OFFICER_REMOVED",
        details=f"Removed the desk officer account of {officer.name} (username {officer.student_id}).", ip_address=request.remote_addr or "",
    ))
    db.session.delete(officer)
    db.session.commit()
    return (
        jsonify({"message": f"Polling desk officer '{officer.name}' removed successfully."}),
        200,
    )


@admin_bp.patch("/officers/<int:officer_id>")
@admin_required
def update_officer(officer_id):
    """Deactivate/reactivate a Desk Officer or reset their password."""
    officer = db.session.get(User, officer_id)
    if not officer or officer.role != "polling_officer":
        return jsonify({"error": "Polling desk officer not found."}), 404
    payload = request.get_json(silent=True) or {}
    changes = []
    if "is_active" in payload:
        officer.is_active = bool(payload["is_active"])
        changes.append("account activated" if officer.is_active else "account deactivated")
    if payload.get("password"):
        changes.append("password reset")
    if payload.get("password"):
        ok, msg = validate_password(payload["password"])
        if not ok:
            return jsonify({"error": "Invalid fields", "message": msg}), 400
        officer.set_password(payload["password"])
    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()), action="DESK_OFFICER_UPDATED",
        details=f"Updated the desk officer account of {officer.name} ({', '.join(changes)}).", ip_address=request.remote_addr or "",
    ))
    db.session.commit()
    return jsonify(officer.to_dict()), 200
