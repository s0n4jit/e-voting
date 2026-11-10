from app.models.booth_slip import BoothSlip
from app.services.slip_pdf_service import SlipPdfService
from flask import Response
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
from app.services.photo_service import save_photo, delete_photo
from app.models.election_position import ElectionPosition
from app.models.programme import Programme
from app.models.voter_record import VoterRecord
from app.models.audit_log import AuditLog
from app.models.voting_token import STATIC_PIN_MINUTES, VotingToken
from app.models.kiosk_device import KioskDevice
from app.models.booth_create_token import TOKEN_LIFETIME, BoothCreateToken
from app.routes.booth import _hash, new_create_token
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

import time
_audit_stats_cache = {"ts": 0.0, "stats": None}

def _csv_safe(value):
    s = str(value if value is not None else "")
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s

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
    """List all elections. Cloned mock runs are filtered to avoid duplicates; in-place elections are always included."""
    q = Election.query.filter(Election.parent_election_id.is_(None))
    elections = q.order_by(Election.created_at.desc()).all()
    return jsonify([e.to_dict(include_candidates=True) for e in elections]), 200


@admin_bp.post("/elections")
@admin_required
def create_election():
    """Create a new election."""
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock:
        return jsonify({"error": "A mock election is currently active. End the mock run before creating a new election."}), 409
    if any(e.effective_status != "archived" for e in Election.query.filter_by(is_mock=False).all()):
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
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock:
        return jsonify({"error": "A mock election is currently active. Official election details cannot be changed until the mock run ends."}), 409

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
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock:
        return jsonify({"error": "A mock election is currently active. Official election cannot be deleted until the mock run ends."}), 409
    if election.effective_status == "voting_active":
        return jsonify({
            "error": "Election active",
            "message": "Cannot delete an ongoing active election. Close or archive the election before deleting.",
        }), 409

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
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and election.id != active_mock.id:
        return jsonify({"error": "A mock election is currently active. Official candidates cannot be modified until the mock run ends."}), 409

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
    db.session.add(candidate)
    db.session.flush()
    save_photo(candidate.id, photo[0], photo[1])
    candidate.photo_url = f"/api/photos/{candidate.id}"
    _audit("CANDIDATE_ADDED", f"Added {name} as a candidate for {position} in \u201c{election.title}\u201d.")
    commit_or_flush()

    return jsonify(candidate.to_dict()), 201


@admin_bp.route("/elections/<int:election_id>/candidates/<int:candidate_id>", methods=["PUT", "POST"])
@admin_bp.route("/candidates/<int:candidate_id>", methods=["PUT", "POST"])
@admin_required
def update_candidate(candidate_id, election_id=None):
    """Update candidate details (name, position, department, semester, bio, optional photo)."""
    candidate = db.session.get(Candidate, candidate_id)
    if not candidate or (election_id is not None and candidate.election_id != election_id):
        return jsonify({"error": "Candidate not found in this election."}), 404
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and candidate.election_id != active_mock.id:
        return jsonify({"error": "A mock election is currently active. Official candidates cannot be modified until the mock run ends."}), 409
    if election_locked(candidate.election):
        return jsonify({"error": "Candidates cannot be changed once voting has opened."}), 409

    payload = request.get_json(silent=True) or request.form
    name = sanitize_input(payload.get("name"))
    position = sanitize_input(payload.get("position", candidate.position))
    department = str(payload.get("department") or "").strip()
    semester = sanitize_input(payload.get("semester", ""))[:30]
    bio = sanitize_input(payload.get("bio", ""))
    upload = request.files.get("photo") if request.files else None

    if not name:
        return jsonify({"error": "Candidate name is required."}), 400

    allowed = [p.name for p in candidate.election.positions]
    if allowed and position not in allowed:
        return jsonify({"error": "Choose one of the election's positions."}), 400

    if upload and getattr(upload, "filename", None):
        photo, photo_error = read_photo(upload)
        if photo_error:
            return jsonify({"error": photo_error}), 400
        save_photo(candidate.id, photo[0], photo[1])
        candidate.photo_url = f"/api/photos/{candidate.id}"

    candidate.name = name
    candidate.position = position
    candidate.department = department
    candidate.semester = semester or None
    candidate.bio = bio

    _audit("CANDIDATE_UPDATED", f"Updated details for candidate {name} ({position}) in \u201c{candidate.election.title}\u201d.")
    commit_or_flush()
    return jsonify(candidate.to_dict()), 200


@admin_bp.route("/elections/<int:election_id>/candidates/<int:candidate_id>", methods=["DELETE"])
@admin_bp.route("/candidates/<int:candidate_id>", methods=["DELETE"])
@admin_required
def delete_candidate(candidate_id, election_id=None):
    """Remove a candidate."""
    candidate = db.session.get(Candidate, candidate_id)
    if not candidate or (election_id is not None and candidate.election_id != election_id):
        return jsonify({"error": "Candidate not found in this election."}), 404
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and candidate.election_id != active_mock.id:
        return jsonify({"error": "A mock election is currently active. Official candidates cannot be modified until the mock run ends."}), 409
    if election_locked(candidate.election):
        return jsonify({"error": "Candidates cannot be changed once voting has opened."}), 409

    delete_photo(candidate.id)
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

    now = time.time()
    if _audit_stats_cache["stats"] and (now - _audit_stats_cache["ts"] < 3.0):
        stats = _audit_stats_cache["stats"]
    else:
        # Calculate summary metrics (ballots cast matches actual used voter slips for current election)
        cur_election = Election.current()
        if cur_election:
            actual_ballots = BoothSlip.query.filter_by(election_id=cur_election.id, is_used=True).count()
        else:
            actual_ballots = BoothSlip.query.filter_by(is_used=True).count()

        desk_actions = ["DESK_CHECKIN", "STUDENT_REGISTERED", "STUDENTS_IMPORTED", "PIN_ISSUED"]
        pin_actions = ["SLIPS_GENERATED", "SLIP_CANCELLED", "PIN_ISSUED"]
        sec_actions = CATEGORY_ACTIONS.get("security", [])
        booth_actions = CATEGORY_ACTIONS.get("booth", [])

        # Single grouped aggregation query replaces 5 separate full-table count scans
        agg = db.session.query(
            db.func.count(AuditLog.id),
            db.func.count(db.case((AuditLog.action.in_(desk_actions), 1))),
            db.func.count(db.case((AuditLog.action.in_(pin_actions), 1))),
            db.func.count(db.case((AuditLog.action.in_(sec_actions), 1))),
            db.func.count(db.case((AuditLog.action.in_(booth_actions), 1))),
        ).first()

        stats = {
            "total_records": agg[0] or 0,
            "ballots_cast": actual_ballots,
            "desk_enrollments": agg[1] or 0,
            "pins_issued": agg[2] or 0,
            "security_alerts": agg[3] or 0,
            "kiosk_actions": agg[4] or 0,
        }
        _audit_stats_cache["ts"] = now
        _audit_stats_cache["stats"] = stats

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
        elif log.action in ("VOTE_CAST_BOOTH", "BALLOT_CAST", "VOTE_CAST", "BOOTH_SESSION_ENDED") or "Voting ID" in (log.details or "") or "Voter Slip ID" in (log.details or ""):
            import re
            m = re.search(r"(?:Voting ID|Voter Slip ID)\s+([A-Za-z0-9_-]+)", log.details or "")
            item["actor_name"] = "Voter"
            item["actor_student_id"] = m.group(1) if m else "Voter Slip"
            item["actor_role"] = "voter"
        elif "BOOTH-" in (log.details or "") or log.action in ("BOOTH_REVOKED", "BOOTH_DEVICE_REGISTERED", "BOOTH_RESET"):
            import re
            m = re.search(r"(BOOTH-\d+)", log.details or "")
            item["actor_name"] = "Voting Booth"
            item["actor_student_id"] = m.group(1) if m else "Booth"
            item["actor_role"] = "booth"
        else:
            item["actor_name"] = "System" if not log.user_id else f"User #{log.user_id}"
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
            _csv_safe(log.action),
            log.user_id or "SYSTEM",
            _csv_safe(actor.name if actor else "SYSTEM/ANONYMOUS"),
            _csv_safe(actor.student_id if actor else ""),
            _csv_safe(actor.role if actor else "system"),
            _csv_safe(log.details or ""),
            _csv_safe(log.ip_address or ""),
            _csv_safe(log.user_agent or ""),
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

    from app.services.vote_service import VoteService, VotingError
    try:
        raw_pin, token_record = VoteService.issue_desk_pin(
            user=user,
            election=election,
            actor_id=admin_id,
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "desk",
        )
    except VotingError as err:
        return jsonify({
            "error": "Already Voted",
            "message": str(err),
        }), 400

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

@admin_bp.get("/booths/next-available")
@admin_required
def get_next_available_booth():
    """Returns the next available booth number, active booth count, and available unallotted slips per booth."""
    election = Election.current()
    if not election:
        return jsonify({"next_booth_number": 1, "next_booth_id": "BOOTH-01", "total_active_booths": 0, "existing_booth_numbers": [], "available_slips_by_booth": []}), 200
    booths = KioskDevice.query.filter_by(election_id=election.id).all()
    used_numbers = {b.number for b in booths}
    n = 1
    while n in used_numbers:
        n += 1

    from app.models.booth_slip import BoothSlip
    max_b = max([4] + list(used_numbers))
    slip_summary = []

    # Unassigned pool info
    unassigned_slips = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        BoothSlip.booth_number == None,
        BoothSlip.booth_id == None,
        BoothSlip.is_used == False
    ).order_by(BoothSlip.sequence_number.asc()).all()

    slip_summary.append({
        "booth_number": None,
        "booth_id": "Unassigned Pool",
        "total_slips": len(unassigned_slips),
        "unallotted_count": len(unassigned_slips),
        "allotted_count": 0,
        "used_count": 0,
        "first_unallotted_id": unassigned_slips[0].voting_id if unassigned_slips else None,
        "last_unallotted_id": unassigned_slips[-1].voting_id if unassigned_slips else None,
    })

    for b_num in range(1, max_b + 2):
        slips_all = BoothSlip.query.filter_by(election_id=election.id, booth_number=b_num).order_by(BoothSlip.sequence_number.asc()).all()
        unallotted = [s for s in slips_all if s.booth_id is None and not s.is_used]
        allotted = [s for s in slips_all if s.booth_id is not None]
        used = [s for s in slips_all if s.is_used]

        # If booth has no direct unallotted slips, include unassigned pool as fallback availability
        avail_count = len(unallotted) if unallotted else len(unassigned_slips)
        first_id = unallotted[0].voting_id if unallotted else (unassigned_slips[0].voting_id if unassigned_slips else None)
        last_id = unallotted[-1].voting_id if unallotted else (unassigned_slips[-1].voting_id if unassigned_slips else None)

        slip_summary.append({
            "booth_number": b_num,
            "total_slips": len(slips_all),
            "unallotted_count": avail_count,
            "direct_unallotted_count": len(unallotted),
            "allotted_count": len(allotted),
            "used_count": len(used),
            "first_unallotted_id": first_id,
            "last_unallotted_id": last_id,
        })

    return jsonify({
        "next_booth_number": n,
        "next_booth_id": f"BOOTH-{n:02d}",
        "total_active_booths": len([b for b in booths if b.is_active]),
        "existing_booth_numbers": sorted(list(used_numbers)),
        "available_slips_by_booth": slip_summary,
        "unassigned_pool_count": len(unassigned_slips),
    }), 200


@admin_bp.post("/booth-tokens")
@admin_required
def create_booth_token():
    """
    Generate a one-time token for setting up a voting booth.
    Allots specified slips (or unallotted slips in range) to the booth machine at the time of token generation.
    """
    import secrets
    from app.models.booth_create_token import TOKEN_LIFETIME, BoothCreateToken
    from app.routes.booth import _hash, new_create_token
    from app.models.kiosk_device import hash_token
    from app.models.booth_slip import BoothSlip

    officer = db.session.get(User, int(get_jwt_identity()))
    election = Election.current()
    if not election or election.effective_status == "archived":
        return jsonify({"error": "There is no election to set booths up for."}), 409
    if not officer.otp_enabled:
        return jsonify({"error": "Turn on two-step verification first; booths are approved with your authenticator code."}), 409

    payload = request.get_json(silent=True) or {}
    booth_num = payload.get("booth_number")

    if not booth_num:
        used_nums = {k.number for k in KioskDevice.query.filter_by(election_id=election.id).all()}
        n = 1
        while n in used_nums:
            n += 1
        booth_num = n
    else:
        booth_num = int(booth_num)

    # 1. Pre-create or retrieve KioskDevice for this booth
    kiosk = KioskDevice.query.filter(
        KioskDevice.election_id == election.id,
        (KioskDevice.booth_number == booth_num) | (KioskDevice.device_name == f"BOOTH-{booth_num:02d}")
    ).first()
    if not kiosk:
        raw_dummy = f"pending_{secrets.token_urlsafe(32)}"
        kiosk = KioskDevice(
            device_name=f"BOOTH-{booth_num:02d}",
            booth_number=booth_num,
            kiosk_token=hash_token(raw_dummy),
            election_id=election.id,
            is_active=False,
        )
        db.session.add(kiosk)
        db.session.flush()
    elif kiosk.booth_number is None:
        kiosk.booth_number = booth_num

    # Link any slips that already exist for this booth_num to this kiosk device
    BoothSlip.query.filter_by(
        election_id=election.id,
        booth_number=booth_num,
        booth_id=None
    ).update({"booth_id": kiosk.id}, synchronize_session=False)

    # 2. Create one-time booth activation token
    token = new_create_token()
    expires = datetime.now(timezone.utc) + TOKEN_LIFETIME
    db.session.add(BoothCreateToken(
        token_hash=_hash(token.replace("-", "")),
        election_id=election.id,
        created_by=officer.id,
        expires_at=expires,
        booth_number=booth_num,
        kiosk_id=kiosk.id,
        from_slip_id=None,
        to_slip_id=None,
        slips_count=0,
    ))
    db.session.add(AuditLog(
        user_id=officer.id,
        action="BOOTH_TOKEN_CREATED",
        details=f"Generated a booth token for Booth {booth_num} ({election.title}) for machine {kiosk.device_name}.",
        ip_address=request.remote_addr or ""
    ))
    db.session.commit()

    from app.utils.timeutil import utc_iso

    return jsonify({
        "success": True,
        "token": token,
        "create_token": token,
        "expires_at": utc_iso(expires),
        "election_title": election.title,
        "booth_number": booth_num,
        "booth_id": kiosk.device_name,
    }), 201


@admin_bp.get("/kiosk/list")
@desk_required
def list_kiosks():
    """List registered computer lab kiosk terminals for the active/current election."""
    election_id = request.args.get("election_id", type=int)
    if not election_id:
        election = Election.current()
        election_id = election.id if election else None

    query = KioskDevice.query
    if election_id:
        query = query.filter_by(election_id=election_id)
    kiosks = query.order_by(KioskDevice.booth_number.asc(), KioskDevice.id.asc()).all()
    return jsonify([k.to_dict() for k in kiosks]), 200


@admin_bp.post("/kiosk/<int:kiosk_id>/revoke")
@admin_required
def revoke_kiosk(kiosk_id):
    """Revoke an active booth session, reset unused slips to pool, and issue a fresh setup token + TOTP."""
    kiosk = db.session.get(KioskDevice, kiosk_id)
    if not kiosk:
        return jsonify({"error": "Kiosk terminal not found."}), 404

    officer_id = int(get_jwt_identity())
    officer = db.session.get(User, officer_id)
    election = kiosk.election or Election.current()

    # 1. Keep printed slips assigned to this booth machine so pre-printed slips match when re-setup

    # 2. Invalidate active token and session on the booth machine
    import secrets
    kiosk.kiosk_token = f"revoked_{secrets.token_hex(16)}"
    kiosk.is_active = False
    kiosk.last_heartbeat = None

    # 3. Generate a fresh one-time BoothCreateToken for this booth machine
    token = new_create_token()
    expires = datetime.now(timezone.utc) + TOKEN_LIFETIME
    db.session.add(BoothCreateToken(
        token_hash=_hash(token.replace("-", "")),
        election_id=election.id if election else None,
        created_by=officer.id,
        expires_at=expires,
        booth_number=kiosk.number,
        kiosk_id=kiosk.id,
        from_slip_id=None,
        to_slip_id=None,
        slips_count=0,
    ))

    # 4. Audit log
    db.session.add(AuditLog(
        user_id=officer.id,
        action="BOOTH_REVOKED",
        details=f"Revoked booth session for {kiosk.device_name} (Booth {kiosk.number}). Session terminated on terminal; pre-printed slips kept assigned to booth.",
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    from app.utils.timeutil import utc_iso
    return jsonify({
        "success": True,
        "message": f"Booth {kiosk.device_name} session was revoked. The terminal session was terminated and existing slips remain assigned for reconnection.",
        "token": token,
        "create_token": token,
        "booth_id": kiosk.device_name,
        "booth_number": kiosk.number,
        "election_title": election.title if election else "",
        "expires_at": utc_iso(expires),
    }), 200


@admin_bp.post("/kiosk/<int:kiosk_id>/setup-token")
@admin_required
def get_kiosk_setup_token(kiosk_id):
    """Retrieve or generate a fresh setup token and TOTP for a booth without reconfiguring from scratch."""
    kiosk = db.session.get(KioskDevice, kiosk_id)
    if not kiosk:
        return jsonify({"error": "Kiosk terminal not found."}), 404

    officer_id = int(get_jwt_identity())
    officer = db.session.get(User, officer_id)
    election = kiosk.election or Election.current()
    if not election or election.effective_status == "archived":
        return jsonify({"error": "There is no election to set booths up for."}), 409
    if not officer.otp_enabled:
        return jsonify({"error": "Turn on two-step verification first; booths are approved with your authenticator code."}), 409

    token = new_create_token()
    expires = datetime.now(timezone.utc) + TOKEN_LIFETIME
    db.session.add(BoothCreateToken(
        token_hash=_hash(token.replace("-", "")),
        election_id=election.id if election else None,
        created_by=officer.id,
        expires_at=expires,
        booth_number=kiosk.number,
        kiosk_id=kiosk.id,
        from_slip_id=None,
        to_slip_id=None,
        slips_count=0,
    ))

    db.session.add(AuditLog(
        user_id=officer.id,
        action="BOOTH_TOKEN_GENERATED",
        details=f"Generated fresh setup token for {kiosk.device_name}.",
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    from app.utils.timeutil import utc_iso
    return jsonify({
        "success": True,
        "token": token,
        "create_token": token,
        "booth_id": kiosk.device_name,
        "booth_number": kiosk.number,
        "election_title": election.title if election else "",
        "expires_at": utc_iso(expires),
    }), 200


@admin_bp.post("/kiosk/<int:kiosk_id>/slips")
@admin_required
def manage_kiosk_slips(kiosk_id):
    """Manage and adjust slips allotment for an existing booth machine post-setup."""
    kiosk = db.session.get(KioskDevice, kiosk_id)
    if not kiosk:
        return jsonify({"error": "Kiosk terminal not found."}), 404

    payload = request.get_json(silent=True) or {}
    action = payload.get("action", "update")
    from app.models.booth_slip import BoothSlip
    officer_id = int(get_jwt_identity())
    election = kiosk.election or Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 400

    if action == "return_unused":
        unallotted_count = BoothSlip.query.filter(
            (BoothSlip.booth_id == kiosk.id) | (BoothSlip.booth_number == kiosk.number),
            BoothSlip.is_used == False
        ).update({"booth_id": None, "booth_number": None}, synchronize_session=False)

        db.session.add(AuditLog(
            user_id=officer_id,
            action="BOOTH_SLIPS_RETURNED",
            details=f"Returned {unallotted_count} unused slip(s) from {kiosk.device_name} (Booth {kiosk.number}) to unassigned pool.",
            ip_address=request.remote_addr or "",
        ))
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Returned {unallotted_count} unused slip(s) from {kiosk.device_name} to unassigned pool.",
            "allotted_count": 0,
            "from_slip_id": None,
            "to_slip_id": None,
        }), 200

    # Action: update (re-allot specified count / range)
    slips_count = max(1, int(payload.get("slips_count", 50)))
    from_slip_id = str(payload.get("from_slip_id") or "").strip()
    to_slip_id = str(payload.get("to_slip_id") or "").strip()

    # 1. Unlink current unused slips for this booth first so candidate pool has them
    BoothSlip.query.filter(
        (BoothSlip.booth_id == kiosk.id) | (BoothSlip.booth_number == kiosk.number),
        BoothSlip.is_used == False
    ).update({"booth_id": None, "booth_number": None}, synchronize_session=False)

    # 2. Get unassigned candidate slips
    candidates = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        BoothSlip.booth_id == None,
        BoothSlip.booth_number == None,
        BoothSlip.is_used == False,
    ).order_by(BoothSlip.sequence_number.asc()).all()

    slips_to_allot = []
    def _extract_num(vid):
        digits = "".join(filter(str.isdigit, str(vid).split("-")[-1]))
        return int(digits) if digits else 0

    if from_slip_id and to_slip_id:
        f_num = _extract_num(from_slip_id)
        t_num = _extract_num(to_slip_id)
        if f_num and t_num and t_num >= f_num:
            slips_to_allot = [
                s for s in candidates
                if f_num <= _extract_num(s.voting_id) <= t_num
            ]
        else:
            slips_to_allot = [
                s for s in candidates
                if from_slip_id <= s.voting_id <= to_slip_id
            ]
    elif slips_count > 0:
        slips_to_allot = candidates[:slips_count]
    else:
        slips_to_allot = candidates

    # If pool doesn't have enough and user specified a count without fixed IDs, generate missing
    needed = slips_count - len(slips_to_allot)
    if needed > 0 and not (from_slip_id and to_slip_id):
        new_slips = BoothSlip.generate_batch(election.id, count=needed, booth_number=kiosk.number, booth_id=kiosk.id)
        for s in new_slips:
            db.session.add(s)
        slips_to_allot.extend(new_slips)

    for s in slips_to_allot:
        s.booth_id = kiosk.id
        s.booth_number = kiosk.number

    from_id = slips_to_allot[0].voting_id if slips_to_allot else None
    to_id = slips_to_allot[-1].voting_id if slips_to_allot else None

    used_count = BoothSlip.query.filter_by(
        election_id=election.id,
        booth_id=kiosk.id,
        is_used=True
    ).count()

    db.session.add(AuditLog(
        user_id=officer_id,
        action="BOOTH_SLIPS_REALLOCATED",
        details=f"Reallocated slips for {kiosk.device_name} (Booth {kiosk.number}): {len(slips_to_allot)} slip(s) allotted ({from_id or 'none'} to {to_id or 'none'}).",
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Updated slips allotment for {kiosk.device_name}: {len(slips_to_allot)} slip(s) allotted ({from_id or 'none'} to {to_id or 'none'}).",
        "allotted_count": len(slips_to_allot),
        "from_slip_id": from_id,
        "to_slip_id": to_id,
        "used_count": used_count,
        "booth_id": kiosk.device_name,
        "booth_number": kiosk.number,
    }), 200


@admin_bp.delete("/kiosk/<int:kiosk_id>")
@admin_required
def delete_kiosk(kiosk_id):
    """Revoke and delete a registered kiosk terminal."""
    kiosk = db.session.get(KioskDevice, kiosk_id)
    if not kiosk:
        return jsonify({"error": "Kiosk terminal not found."}), 404

    election = kiosk.election or Election.current()
    if election and (election.is_active or election.effective_status in ("ready", "voting_active", "voting_paused", "voting_closed")):
        return jsonify({
            "error": "Election active",
            "message": f"Voting booth {kiosk.device_name} cannot be deleted while the election is in '{election.effective_status}' stage. Use 'Revoke' to reset the booth terminal instead."
        }), 409

    from app.models.booth_slip import BoothSlip
    from app.models.booth_create_token import BoothCreateToken

    slips_count = BoothSlip.query.filter_by(
        election_id=kiosk.election_id,
        booth_id=kiosk.id
    ).count()
    used_slips_count = BoothSlip.query.filter_by(
        election_id=kiosk.election_id,
        booth_number=kiosk.number,
        is_used=True
    ).count()
    if slips_count > 0 or used_slips_count > 0:
        return jsonify({
            "error": "Slips exist",
            "message": f"Voting booth {kiosk.device_name} cannot be deleted because voter slips have already been generated for it. Use 'Revoke' to reset the booth terminal instead."
        }), 409

    # Unlink or delete tokens for this kiosk
    BoothCreateToken.query.filter_by(kiosk_id=kiosk.id).delete()

    # Unlink any unused slips from this kiosk device id
    BoothSlip.query.filter_by(
        election_id=kiosk.election_id,
        booth_id=kiosk.id,
        is_used=False
    ).update({"booth_id": None}, synchronize_session=False)

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()),
        action="BOOTH_REMOVED",
        details=f"Deleted booth {kiosk.device_name} (session {kiosk.ref}).",
        ip_address=request.remote_addr or "",
    ))
    db.session.delete(kiosk)
    db.session.commit()
    return jsonify({"message": f"Booth {kiosk.device_name} was deleted successfully."}), 200


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


# ── Booth Slips & Printable Credentials Endpoints ─────────────────────────

@admin_bp.get("/booths/slips-metrics")
@desk_required
def get_booths_slips_metrics():
    """Returns real-time slip inventory and progress metrics across all voting booths."""
    election_id = request.args.get("election_id", type=int)
    election = db.session.get(Election, election_id) if election_id else Election.current()
    if not election:
        return jsonify({
            "total_booths": 0,
            "total_generated": 0,
            "total_used": 0,
            "total_active": 0,
            "total_unused": 0,
            "completion_rate": 0.0,
            "booths": [],
        }), 200

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    # Active kiosks and active slips
    active_kiosks = KioskDevice.query.filter_by(election_id=election.id, is_active=True).all()
    active_booth_numbers = {k.number for k in active_kiosks if k.number is not None}
    active_slip_ids = set()
    for k in active_kiosks:
        cur = BoothSlip.get_current_slip(election.id, k.number)
        if cur:
            active_slip_ids.add(cur.id)

    recent_auth_slips = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        BoothSlip.is_used == False,
        BoothSlip.authenticated_at != None,
    ).all()
    for s in recent_auth_slips:
        if s.authenticated_at:
            auth_t = s.authenticated_at if s.authenticated_at.tzinfo else s.authenticated_at.replace(tzinfo=timezone.utc)
            if (now - auth_t).total_seconds() < 20 * 60:
                active_slip_ids.add(s.id)

    # Get all booth numbers from registered kiosks and existing booth slips
    kiosk_numbers = {k.number for k in KioskDevice.query.filter_by(election_id=election.id).all() if k.number is not None}
    slip_numbers = {
        r[0] for r in db.session.query(BoothSlip.booth_number)
        .filter_by(election_id=election.id)
        .distinct()
        .all()
        if r[0] is not None
    }
    distinct_nums = sorted(list(kiosk_numbers | slip_numbers))

    booth_stats = []
    total_gen = 0
    total_used = 0

    for b_num in distinct_nums:
        if b_num is None:
            continue
        slips_query = BoothSlip.query.filter_by(election_id=election.id, booth_number=b_num)
        total_for_booth = slips_query.count()
        used_for_booth = slips_query.filter_by(is_used=True, is_cancelled=False).count()
        cancelled_for_booth = slips_query.filter_by(is_cancelled=True).count()
        unused_for_booth = slips_query.filter_by(is_used=False, is_cancelled=False).count()

        cur_slip = BoothSlip.get_current_slip(election.id, b_num)
        cur_id = cur_slip.voting_id if cur_slip else ("Exhausted" if total_for_booth > 0 else "None")

        is_b_active = b_num in active_booth_numbers
        active_for_booth = 1 if (is_b_active and cur_slip and cur_slip.id in active_slip_ids) else 0

        rate = round((used_for_booth / total_for_booth * 100), 1) if total_for_booth > 0 else 0.0

        booth_stats.append({
            "booth_number": b_num,
            "booth_id": f"BOOTH-{b_num:02d}",
            "total_slips": total_for_booth,
            "used_slips": used_for_booth,
            "active_slips": active_for_booth,
            "unused_slips": unused_for_booth,
            "cancelled_slips": cancelled_for_booth,
            "current_voting_id": cur_id,
            "progress_rate": rate,
        })
        total_gen += total_for_booth
        total_used += used_for_booth

    # Include unassigned pool slips in metrics
    unassigned_count = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        BoothSlip.booth_number == None
    ).count()

    if unassigned_count > 0:
        unassigned_used = BoothSlip.query.filter(
            BoothSlip.election_id == election.id,
            BoothSlip.booth_number == None,
            BoothSlip.is_used == True
        ).count()
        booth_stats.insert(0, {
            "booth_number": None,
            "booth_id": "Unassigned Pool",
            "total_slips": unassigned_count,
            "used_slips": unassigned_used,
            "active_slips": 0,
            "unused_slips": unassigned_count - unassigned_used,
            "current_voting_id": "Allot at booth setup",
            "progress_rate": 0.0,
        })

    # Exact total from all slips
    total_gen = BoothSlip.query.filter_by(election_id=election.id).count()
    total_cancelled = BoothSlip.query.filter_by(election_id=election.id, is_cancelled=True).count()
    total_used = BoothSlip.query.filter_by(election_id=election.id, is_used=True, is_cancelled=False).count()
    total_active = len(active_slip_ids)
    total_unused = BoothSlip.query.filter_by(election_id=election.id, is_used=False, is_cancelled=False).count()
    overall_rate = round((total_used / total_gen * 100), 1) if total_gen > 0 else 0.0

    return jsonify({
        "election_id": election.id,
        "election_title": election.title,
        "total_booths": len(distinct_nums),
        "total_generated": total_gen,
        "total_used": total_used,
        "total_active": total_active,
        "total_unused": total_unused,
        "total_cancelled": total_cancelled,
        "completion_rate": overall_rate,
        "booths": booth_stats,
    }), 200


@admin_bp.post("/slips/generate")
@admin_required
def generate_voter_slips():
    """
    Generate sequential voting slips with 4-digit PINs.
    booth_number is optional: if omitted or null, slips are added to unassigned pool
    and will be allotted when setting up booth machines.
    """
    payload = request.get_json(silent=True) or {}
    count = int(payload.get("count", 50))
    raw_b = payload.get("booth_number")
    booth_number = None
    if raw_b is not None and str(raw_b).strip() != "" and str(raw_b).lower() not in ("none", "null", "all", "unassigned"):
        try:
            booth_number = int(raw_b)
        except (ValueError, TypeError):
            booth_number = None

    if booth_number is None or booth_number < 1:
        return jsonify({
            "error": "Booth selection required",
            "message": "Please select a specific Voting Booth. Slips must be assigned directly to a booth."
        }), 400

    election_id = payload.get("election_id")
    election = db.session.get(Election, int(election_id)) if election_id else Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 404

    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and (not election_id or int(election_id) != active_mock.id):
        return jsonify({
            "error": "Mock election in progress",
            "message": "Cannot generate official voter slips while a mock election is in progress. Official slips must be created before starting a mock run."
        }), 409

    if count <= 0 or count > 500:
        return jsonify({"error": "Invalid count", "message": "Slip count must be between 1 and 500 per batch."}), 400

    kiosk_device = KioskDevice.query.filter_by(election_id=election.id, booth_number=booth_number).first()
    booth_id = kiosk_device.id if kiosk_device else None

    created = BoothSlip.generate_batch(
        election_id=election.id,
        booth_number=booth_number,
        count=count,
        booth_id=booth_id,
    )

    details = f"Generated {count} voting slips for BOOTH-{booth_number:02d} in “{election.title}” (IDs {created[0].voting_id} – {created[-1].voting_id})."

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()),
        action="BOOTHSLIPS_GENERATED",
        details=details,
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    return jsonify({
        "success": True,
        "booth_number": booth_number,
        "count_created": len(created),
        "first_voting_id": created[0].voting_id,
        "last_voting_id": created[-1].voting_id,
        "message": f"Successfully generated {len(created)} voting slips for BOOTH-{booth_number:02d} ({created[0].voting_id} – {created[-1].voting_id}).",
    }), 201


@admin_bp.post("/booths/<int:booth_number>/generate-slips")
@admin_required
def generate_booth_slips(booth_number):
    """
    Generate sequential voting slips with cryptographically secure 4-digit PINs for a specific booth.
    """
    payload = request.get_json(silent=True) or {}
    count = int(payload.get("count", 50))
    election_id = payload.get("election_id")
    election = db.session.get(Election, int(election_id)) if election_id else Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 404

    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and (not election_id or int(election_id) != active_mock.id):
        return jsonify({
            "error": "Mock election in progress",
            "message": "Cannot generate official voter slips while a mock election is in progress. Official slips must be created before starting a mock run."
        }), 409

    if count <= 0 or count > 500:
        return jsonify({"error": "Invalid count", "message": "Slip count must be between 1 and 500 per batch."}), 400

    created = BoothSlip.generate_batch(
        election_id=election.id,
        booth_number=booth_number,
        count=count,
        booth_id=None,
    )

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()),
        action="BOOTHSLIPS_GENERATED",
        details=f"Generated {count} voting slips for Booth {booth_number} in “{election.title}” (IDs {created[0].voting_id} – {created[-1].voting_id}).",
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    return jsonify({
        "success": True,
        "booth_number": booth_number,
        "count_created": len(created),
        "first_voting_id": created[0].voting_id,
        "last_voting_id": created[-1].voting_id,
        "message": f"Successfully generated {len(created)} voting slips for Booth {booth_number} (IDs {created[0].voting_id} – {created[-1].voting_id}).",
    }), 201


@admin_bp.post("/booths/generate-all-slips")
@admin_required
def generate_all_booth_slips():
    """
    Configures and generates voting slips for all active booths simultaneously.
    """
    payload = request.get_json(silent=True) or {}
    count_per_booth = int(payload.get("count_per_booth", 50))
    election_id = payload.get("election_id")
    election = db.session.get(Election, int(election_id)) if election_id else Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 404

    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    if active_mock and (not election_id or int(election_id) != active_mock.id):
        return jsonify({
            "error": "Mock election in progress",
            "message": "Cannot generate official voter slips while a mock election is in progress. Official slips must be created before starting a mock run."
        }), 409

    if count_per_booth <= 0 or count_per_booth > 2000:
        return jsonify({"error": "Invalid count", "message": "Slip count must be between 1 and 2,000."}), 400

    kiosks = KioskDevice.query.filter_by(election_id=election.id, is_active=True).all()
    # Default to Booths 1-4 if no kiosks activated yet
    booth_numbers = sorted(list({k.number for k in kiosks})) if kiosks else [1, 2, 3, 4]

    summary = []
    total_created = 0
    for b_num in booth_numbers:
        created = BoothSlip.generate_batch(
            election_id=election.id,
            booth_number=b_num,
            count=count_per_booth,
            booth_id=None,
        )
        if created:
            total_created += len(created)
            summary.append({
                "booth_number": b_num,
                "count": len(created),
                "first_id": created[0].voting_id,
                "last_id": created[-1].voting_id,
            })

    db.session.add(AuditLog(
        user_id=int(get_jwt_identity()),
        action="BOOTHSLIPS_BULK_GENERATED",
        details=f"Generated {total_created} voting slips across {len(booth_numbers)} booths ({count_per_booth}/booth) for “{election.title}”.",
        ip_address=request.remote_addr or "",
    ))
    db.session.commit()

    return jsonify({
        "success": True,
        "total_created": total_created,
        "booth_count": len(booth_numbers),
        "summary": summary,
        "message": f"Successfully generated {total_created} slips across {len(booth_numbers)} booths.",
    }), 201


@admin_bp.get("/booths/<int:booth_number>/slips-pdf")
@desk_required
def download_booth_slips_pdf(booth_number):
    """
    Downloads printable A4 PDF voting slips for a specific booth (8 slips per page).
    """
    election_id = request.args.get("election_id", type=int)
    election = db.session.get(Election, election_id) if election_id else Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 404

    slips = (
        BoothSlip.query.filter_by(election_id=election.id, booth_number=booth_number)
        .order_by(BoothSlip.sequence_number.asc())
        .all()
    )
    if not slips:
        return jsonify({"error": "No slips found", "message": f"No voting slips generated for Booth {booth_number} yet."}), 404

    pdf_bytes = SlipPdfService.generate_slips_pdf(slips=slips, election=election)
    filename = f"voting-slips-booth-{booth_number:02d}-{election.id}.pdf"

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@admin_bp.get("/slips/<int:slip_id>/pdf")
@desk_required
def download_single_slip_pdf(slip_id):
    """
    Downloads an individual voter slip PDF for printing.
    """
    slip = db.session.get(BoothSlip, slip_id)
    if not slip:
        return jsonify({"error": "Voter slip not found."}), 404

    election = slip.election or Election.current()
    from app.models.system_setting import SystemSetting
    branding = SystemSetting.branding()
    pdf_bytes = SlipPdfService.generate_single_slip_pdf(
        slip=slip,
        election=election,
        institution_name=branding.get("institution_name"),
        logo_b64=branding.get("logo"),
    )
    filename = f"voting-slip-{slip.voting_id}.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@admin_bp.get("/booths/all-slips-pdf")
@desk_required
def download_all_slips_pdf():
    """
    Downloads a single combined printable A4 PDF with slips for all booths.
    """
    election_id = request.args.get("election_id", type=int)
    election = db.session.get(Election, election_id) if election_id else Election.current()
    if not election:
        return jsonify({"error": "No active election found."}), 404

    slips = (
        BoothSlip.query.filter_by(election_id=election.id)
        .order_by(BoothSlip.booth_number.asc(), BoothSlip.sequence_number.asc())
        .all()
    )
    if not slips:
        return jsonify({"error": "No slips found", "message": "No voting slips generated for this election yet."}), 404

    pdf_bytes = SlipPdfService.generate_slips_pdf(slips=slips, election=election)
    filename = f"voting-slips-all-booths-election-{election.id}.pdf"

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@admin_bp.get("/booths/slips")
@desk_required
def list_booth_slips():
    """Paginated list of booth slips with filtering by booth, search by voting ID, and status."""
    election_id = request.args.get("election_id", type=int)
    election = db.session.get(Election, election_id) if election_id else Election.current()
    if not election:
        return jsonify({"items": [], "total": 0, "pages": 1, "page": 1}), 200

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    # Active kiosks and active slips
    active_kiosks = KioskDevice.query.filter_by(election_id=election.id, is_active=True).all()
    active_slip_ids = set()
    for k in active_kiosks:
        cur = BoothSlip.get_current_slip(election.id, k.number)
        if cur:
            active_slip_ids.add(cur.id)

    recent_auth_slips = BoothSlip.query.filter(
        BoothSlip.election_id == election.id,
        BoothSlip.is_used == False,
        BoothSlip.authenticated_at != None,
    ).all()
    for s in recent_auth_slips:
        if s.authenticated_at:
            auth_t = s.authenticated_at if s.authenticated_at.tzinfo else s.authenticated_at.replace(tzinfo=timezone.utc)
            if (now - auth_t).total_seconds() < 20 * 60:
                active_slip_ids.add(s.id)

    query = BoothSlip.query.filter_by(election_id=election.id)

    booth_num_raw = str(request.args.get("booth_number") or "").strip()
    if booth_num_raw.lower() in ("unassigned", "none", "0", "pool"):
        query = query.filter(BoothSlip.booth_number == None)
    elif booth_num_raw and booth_num_raw.lower() not in ("all", "*"):
        import re
        match = re.search(r"(\d+)", booth_num_raw)
        if match:
            b_val = int(match.group(1))
            query = query.filter(BoothSlip.booth_number == b_val)

    status_filter = request.args.get("status") or request.args.get("statusFilter")
    is_used = request.args.get("is_used")
    if status_filter:
        sf = status_filter.lower().strip()
        if sf == "used":
            query = query.filter(BoothSlip.is_used == True, BoothSlip.is_cancelled == False)
        elif sf == "cancelled":
            query = query.filter(BoothSlip.is_cancelled == True)
        elif sf == "active":
            query = query.filter(BoothSlip.is_used == False, BoothSlip.is_cancelled == False, BoothSlip.id.in_(list(active_slip_ids) if active_slip_ids else [-1]))
        elif sf == "unused":
            query = query.filter(BoothSlip.is_used == False, BoothSlip.is_cancelled == False)
    elif is_used is not None and is_used != "":
        used_bool = is_used.lower() in ("true", "1", "yes")
        query = query.filter_by(is_used=used_bool, is_cancelled=False)

    search = request.args.get("search", "").strip()
    if search:
        query = query.filter(BoothSlip.voting_id.ilike(f"%{search}%"))

    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(10, request.args.get("per_page", 50, type=int)))

    pagination = query.order_by(BoothSlip.booth_number.asc().nulls_last(), BoothSlip.sequence_number.asc(), BoothSlip.id.asc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    items = []
    for s in pagination.items:
        d = s.to_dict(include_pin=False)
        if s.is_cancelled:
            d["status"] = "cancelled"
            d["booth_id"] = None
        elif s.is_used:
            d["status"] = "used"
        elif s.id in active_slip_ids:
            d["status"] = "active"
        else:
            d["status"] = "unused"
        d["is_active"] = (d["status"] == "active")
        items.append(d)

    total_gen = BoothSlip.query.filter_by(election_id=election.id).count()
    total_cancelled = BoothSlip.query.filter_by(election_id=election.id, is_cancelled=True).count()
    total_used = BoothSlip.query.filter_by(election_id=election.id, is_used=True, is_cancelled=False).count()
    total_active = len(active_slip_ids)
    total_unused = BoothSlip.query.filter_by(election_id=election.id, is_used=False, is_cancelled=False).count()

    return jsonify({
        "items": items,
        "total": pagination.total,
        "pages": pagination.pages,
        "page": page,
        "per_page": per_page,
        "metrics": {
            "total_generated": total_gen,
            "total_used": total_used,
            "total_active": total_active,
            "total_unused": total_unused,
            "total_cancelled": total_cancelled,
        }
    }), 200


@admin_bp.post("/slips/<int:slip_id>/cancel")
@admin_required
def cancel_booth_slip(slip_id):
    """Cancel / void an individual voter slip (e.g. damaged or misprinted) so it cannot be cast."""
    from app.models.booth_slip import BoothSlip
    slip = db.session.get(BoothSlip, slip_id)
    if not slip:
        return jsonify({"error": "Voter slip not found."}), 404

    if slip.is_used and not slip.is_cancelled:
        return jsonify({"error": "Cannot cancel a slip that has already been cast."}), 400

    if slip.is_cancelled:
        return jsonify({"error": "This slip has already been cancelled."}), 400

    now = datetime.now(timezone.utc)
    slip.is_used = False
    slip.is_cancelled = True
    slip.booth_id = None
    slip.used_at = None
    slip.cancelled_at = now

    _audit("SLIP_CANCELLED", f"Voter slip {slip.voting_id} (Booth {slip.booth_number or 'unassigned'}) was cancelled/voided by Election Authority.")
    db.session.commit()
    return jsonify({"message": f"Voter slip {slip.voting_id} has been cancelled.", "slip": slip.to_dict()}), 200

