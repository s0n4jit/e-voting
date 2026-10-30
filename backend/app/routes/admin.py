"""
app/routes/admin.py — Administrator routes.
"""

import csv
import io
from datetime import datetime, timezone
from dateutil import parser as date_parser
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import get_jwt_identity

from app.extensions import db, commit_or_flush
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.audit_log import AuditLog
from app.models.voting_token import VotingToken
from app.models.kiosk_device import KioskDevice
from app.services.otp_service import OTPService
from app.utils.decorators import admin_required, desk_required
from app.utils.validators import (
    sanitize_input,
    validate_email,
    validate_student_id,
)

admin_bp = Blueprint("admin", __name__)


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
    if "is_active" in payload:
        election.is_active = bool(payload["is_active"])
    if "results_published" in payload:
        election.results_published = bool(payload["results_published"])

    commit_or_flush()
    return jsonify(election.to_dict(include_candidates=True)), 200


@admin_bp.delete("/elections/<int:election_id>")
@admin_required
def delete_election(election_id):
    """Delete an election and cascaded child entries."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

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

    election.is_active = True
    commit_or_flush()
    return jsonify({"message": "Election activated.", "election": election.to_dict()}), 200


@admin_bp.post("/elections/<int:election_id>/close")
@admin_required
def close_election(election_id):
    """Close an ongoing election."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    election.is_active = False
    commit_or_flush()
    return jsonify({"message": "Election closed.", "election": election.to_dict()}), 200


@admin_bp.post("/elections/<int:election_id>/publish-results")
@admin_required
def publish_results(election_id):
    """Publish election outcome."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    election.results_published = True
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

    payload = request.get_json(silent=True) or {}
    name = sanitize_input(payload.get("name"))
    position = sanitize_input(payload.get("position", "General Secretary"))
    party = sanitize_input(payload.get("party", ""))
    department = sanitize_input(payload.get("department", ""))
    bio = sanitize_input(payload.get("bio", ""))
    photo_url = sanitize_input(payload.get("photo_url", ""))

    if not name:
        return jsonify({"error": "Candidate name is required."}), 400

    candidate = Candidate(
        election_id=election.id,
        name=name,
        position=position,
        party=party,
        department=department,
        bio=bio,
        photo_url=photo_url,
    )
    db.session.add(candidate)
    commit_or_flush()

    return jsonify(candidate.to_dict()), 201


@admin_bp.delete("/elections/<int:election_id>/candidates/<int:candidate_id>")
@admin_required
def delete_candidate(election_id, candidate_id):
    """Remove a candidate."""
    candidate = db.session.get(Candidate, candidate_id)
    if not candidate or candidate.election_id != election_id:
        return jsonify({"error": "Candidate not found in this election."}), 404

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
    """Create a single voter and optionally whitelist them for an election."""
    payload = request.get_json(silent=True) or {}
    student_id = sanitize_input(payload.get("student_id"))
    name = sanitize_input(payload.get("name"))
    email = sanitize_input(payload.get("email"))
    department = sanitize_input(payload.get("department", ""))
    year = payload.get("year")
    election_id = payload.get("election_id")
    password = payload.get("password", "Student@1234")

    if not student_id or not name or not email:
        return jsonify({"error": "student_id, name, and email are required."}), 400

    if not validate_student_id(student_id):
        return jsonify({"error": "Invalid student ID format."}), 400

    if not validate_email(email):
        return jsonify({"error": "Invalid email address format."}), 400

    if User.query.filter((User.student_id == student_id) | (User.email == email)).first():
        return jsonify({"error": "User with this student_id or email already exists."}), 409

    user = User(
        student_id=student_id,
        name=name,
        email=email,
        department=department,
        year=int(year) if year else None,
        role="voter",
        otp_secret=OTPService.generate_secret(),
        otp_enabled=True,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    if election_id:
        voter_hash = User.hash_student_id(student_id)
        existing_record = VoterRecord.query.filter_by(
            election_id=election_id, voter_hash=voter_hash
        ).first()
        if not existing_record:
            vr = VoterRecord(election_id=election_id, voter_hash=voter_hash, has_voted=False)
            db.session.add(vr)

    commit_or_flush()
    return jsonify(user.to_dict()), 201


@admin_bp.post("/voters/import")
@admin_required
def import_voters():
    """
    Bulk import voters via CSV file upload or JSON body.
    Format expected:
      CSV header: student_id,name,email,department,year
      or JSON: {"election_id": 1, "voters": [{"student_id": "...", ...}]}
    """
    election_id = request.form.get("election_id") or request.args.get("election_id")
    records = []

    if "file" in request.files:
        file = request.files["file"]
        stream = io.StringIO(file.stream.read().decode("utf-8-sig", errors="ignore"))
        reader = csv.DictReader(stream)
        for row in reader:
            records.append({
                "student_id": row.get("student_id", "").strip(),
                "name": row.get("name", "").strip(),
                "email": row.get("email", "").strip(),
                "department": row.get("department", "").strip(),
                "year": row.get("year", "").strip(),
            })
    else:
        payload = request.get_json(silent=True) or {}
        if "election_id" in payload and not election_id:
            election_id = payload["election_id"]
        records = payload.get("voters", [])

    if not records:
        return jsonify({"error": "No voter records supplied."}), 400

    imported_count = 0
    whitelisted_count = 0
    errors = []

    for idx, rec in enumerate(records):
        sid = sanitize_input(rec.get("student_id"))
        name = sanitize_input(rec.get("name", f"Student {sid}"))
        email = sanitize_input(rec.get("email"))

        if not sid or not email:
            errors.append(f"Row {idx + 1}: missing student_id or email.")
            continue

        user = User.query.filter_by(student_id=sid).first()
        if not user:
            user = User(
                student_id=sid,
                name=name,
                email=email,
                department=sanitize_input(rec.get("department", "")),
                year=int(rec.get("year")) if rec.get("year") and str(rec.get("year")).isdigit() else None,
                role="voter",
                otp_secret=OTPService.generate_secret(),
                otp_enabled=True,
            )
            user.set_password(rec.get("password", "Student@1234"))
            db.session.add(user)
            db.session.flush()
            imported_count += 1

        if election_id:
            v_hash = User.hash_student_id(sid)
            existing_vr = VoterRecord.query.filter_by(
                election_id=int(election_id), voter_hash=v_hash
            ).first()
            if not existing_vr:
                vr = VoterRecord(
                    election_id=int(election_id), voter_hash=v_hash, has_voted=False
                )
                db.session.add(vr)
                whitelisted_count += 1

    commit_or_flush()

    return (
        jsonify({
            "message": "Import finished.",
            "imported_users": imported_count,
            "whitelisted_voters": whitelisted_count,
            "errors": errors,
        }),
        200,
    )


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

    # Category filters
    CATEGORY_ACTIONS = {
        "ballot": ["BALLOT_CAST", "VOTE_CAST", "BALLOT_SEALED"],
        "pin": ["PIN_ISSUED", "PIN_LOGIN_SUCCESS", "VOTING_TOKEN_GENERATED"],
        "auth": ["LOGIN_SUCCESS", "LOGIN_FAILED", "MFA_VERIFIED", "LOGOUT", "TOTP_2FA_ENABLED", "TOTP_2FA_DISABLED"],
        "kiosk": ["STAFF_MAINTENANCE_ACTION", "KIOSK_REGISTERED", "KIOSK_AUTHENTICATED"],
        "enroll": ["STUDENT_AUTO_ENROLLED_AT_DESK", "VOTER_REGISTERED", "VOTER_IMPORT"],
    }

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
        "desk_enrollments": AuditLog.query.filter(AuditLog.action == "STUDENT_AUTO_ENROLLED_AT_DESK").count(),
        "kiosk_actions": AuditLog.query.filter(AuditLog.action == "STAFF_MAINTENANCE_ACTION").count(),
    }

    serialized = []
    for log in logs:
        item = log.to_dict()
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

    user = User.query.filter_by(student_id=student_id).first()
    is_new_registration = False
    admin_identity = get_jwt_identity()
    admin_id = int(admin_identity) if str(admin_identity).isdigit() else None

    # On-the-spot voter registration at the Polling Desk
    if not user:
        name = sanitize_input(payload.get("name")) or f"Student {student_id}"
        department = sanitize_input(payload.get("department")) or "General"
        user = User(
            student_id=student_id,
            name=name,
            email=f"{student_id.lower()}@campus.local",
            role="voter",
            is_active=True,
            department=department,
            otp_secret=OTPService.generate_secret(),
            otp_enabled=False,
        )
        user.set_password(f"Voter@{student_id[-4:] if len(student_id) >= 4 else '2026'}")
        db.session.add(user)
        db.session.flush()
        is_new_registration = True

        audit_enroll = AuditLog(
            user_id=admin_id,
            action="STUDENT_AUTO_ENROLLED_AT_DESK",
            details=f"Student {student_id} ({name}, Dept: {department}) enrolled on-the-spot at polling desk for election {election.id}",
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "desk",
        )
        db.session.add(audit_enroll)

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
        validity_minutes=20,
    )

    # Audit log PIN issuance
    audit_pin = AuditLog(
        user_id=admin_id,
        action="PIN_ISSUED",
        details=f"Single-use voting PIN generated for student {user.student_id} in election {election.id} by officer {admin_id}",
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
            "validity_minutes": 20,
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


# ── Authorized Computer Lab Kiosks ───────────────────────────────────────────

@admin_bp.post("/kiosk/register")
@admin_required
def register_kiosk():
    """Register a new computer terminal as an authorized lab kiosk."""
    payload = request.get_json(silent=True) or {}
    device_name = sanitize_input(payload.get("device_name"))

    if not device_name:
        return jsonify({"error": "device_name is required."}), 400

    ip_addr = request.remote_addr or "127.0.0.1"
    kiosk = KioskDevice.register_device(device_name=device_name, ip_address=ip_addr)
    db.session.commit()

    return (
        jsonify({
            "message": "Kiosk terminal registered successfully.",
            "kiosk_token": kiosk.kiosk_token,
            "kiosk": kiosk.to_dict(),
            "id": kiosk.id,
            "device_name": kiosk.device_name,
            "created_at": kiosk.created_at.isoformat() if kiosk.created_at else None,
        }),
        201,
    )


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

    db.session.delete(kiosk)
    db.session.commit()
    return jsonify({"message": f"Kiosk terminal {kiosk_id} revoked successfully."}), 200


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
        otp_secret=OTPService.generate_secret(),
        otp_enabled=True,
    )
    officer.set_password(password)
    db.session.add(officer)
    db.session.commit()

    return (
        jsonify({
            "message": f"Polling Desk Officer '{name}' ({student_id}) created successfully.",
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

    db.session.delete(officer)
    db.session.commit()
    return (
        jsonify({"message": f"Polling desk officer '{officer.name}' removed successfully."}),
        200,
    )
