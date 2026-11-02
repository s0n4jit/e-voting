"""
app/routes/desk.py — Student registration and voter slips (Desk Officers and Election Officers).

A registered student is a User(role="voter") whose student_id is a server-generated Voter Slip
ID. The original college student ID is never collected, so nothing here can leak it, and the
slip ID is the only identifier the voter ever presents at the desk or booth.
"""

import csv
import io
import secrets
from datetime import datetime, timezone

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.election import Election
from app.models.programme import Programme
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.voter_record import VoterRecord
from app.models.voting_token import STATIC_PIN_MINUTES, VotingToken
from app.utils.decorators import admin_required, desk_required
from app.utils.timeutil import utc_iso
from app.utils.validators import clean_name, sanitize_input, validate_person_name

desk_bp = Blueprint("desk", __name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _actor_id():
    ident = get_jwt_identity()
    return int(ident) if ident and str(ident).isdigit() else None


def _audit(action, details):
    db.session.add(AuditLog(
        user_id=_actor_id(),
        action=action,
        details=details,
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))


def new_slip_id(prefix=None) -> str:
    """<prefix><6 random digits>, prefix like SUE26-E1- (set per election). Uniqueness is enforced by users.student_id."""
    return f"{prefix or f'SUE{datetime.now(timezone.utc).year % 100:02d}-'}{secrets.randbelow(1_000_000):06d}"


def _statuses(users, election):
    """slip -> 'voted' | 'active' | 'pin_active' | 'registered', using two queries for the whole page."""
    if not users or not election:
        return {u.student_id: "registered" for u in users}
    by_hash = {User.hash_student_id(u.student_id): u.student_id for u in users}
    voted = {
        by_hash[r.voter_hash]
        for r in VoterRecord.query.filter(
            VoterRecord.election_id == election.id,
            VoterRecord.voter_hash.in_(list(by_hash)),
            VoterRecord.has_voted.is_(True),
        )
    }
    now = datetime.now(timezone.utc)
    pins, active = set(), set()
    for t in VotingToken.query.filter(
        VotingToken.election_id == election.id,
        VotingToken.student_id.in_([u.student_id for u in users]),
        VotingToken.is_used.is_(False),
    ):
        exp = t.expires_at if t.expires_at.tzinfo else t.expires_at.replace(tzinfo=timezone.utc)
        if exp > now:
            pins.add(t.student_id)
            auth = t.authenticated_at
            if auth and (now - (auth if auth.tzinfo else auth.replace(tzinfo=timezone.utc))).total_seconds() < 30 * 60:
                active.add(t.student_id)  # entered the PIN at a booth within the voter session length
    return {
        u.student_id: "voted" if u.student_id in voted else "active" if u.student_id in active
        else "pin_active" if u.student_id in pins else "registered"
        for u in users
    }


def _serialize(user, status, programmes, election=None):
    prog = programmes.get(user.programme_id)
    return {
        "slip_id": user.student_id,
        "name": user.name,
        "programme_id": user.programme_id,
        "programme": prog.programme if prog else (user.department or ""),
        "department": prog.department if prog else "",
        "term_label": prog.term_label if prog else "Semester",
        "term": prog.term_name(user.year) if prog and user.year else str(user.year or ""),
        "semester": user.year,
        "status": status,
        "registered_at": utc_iso(user.created_at),
        "election_title": election.title if election else None,
        "institution_name": SystemSetting.get("institution_name", ""),
    }


def _programme_map():
    return {p.id: p for p in Programme.query.all()}


def _of_election(query, election):
    """Students belong to the election whose slip prefix (e.g. SUE26-E1-) their Voter Slip ID carries."""
    if election and election.slip_prefix:
        return query.filter(User.student_id.like(f"{election.slip_prefix}%"))
    return query


def _find_voter(slip):
    slip = (slip or "").strip().upper()
    return User.query.filter(func.upper(User.student_id) == slip, User.role == "voter").first()


def _check_term(programme, semester):
    if not isinstance(semester, int) or isinstance(semester, bool) or not 1 <= semester <= programme.term_count:
        return f"Choose a valid {programme.term_label.lower()} (1-{programme.term_count})."
    return None


def _csv_safe(value):
    s = str(value if value is not None else "")
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


# ── programmes (read-only for desks) ──────────────────────────────────────────

@desk_bp.get("/programmes")
@desk_required
def list_programmes():
    rows = Programme.query.filter_by(is_active=True).order_by(Programme.name).all()
    return jsonify([p.to_dict() for p in rows]), 200


@desk_bp.get("/state")
@desk_required
def desk_state():
    """Polled by the desk screens: false once the officer has closed voting."""
    election = Election.current()
    return jsonify({"open": bool(election.desk_open) if election else True,
                    "paused": bool(election and election.voting_paused),
                    "mock": bool(election and election.is_mock),
                    "status": election.effective_status if election else None}), 200


# ── registration ──────────────────────────────────────────────────────────────

@desk_bp.post("/registrations")
@desk_required
def register_student():
    payload = request.get_json(silent=True) or {}
    name = clean_name(payload.get("name"))
    ok, msg = validate_person_name(name)
    if not ok:
        return jsonify({"error": msg, "field": "name"}), 400

    programme = db.session.get(Programme, payload.get("programme_id")) if isinstance(payload.get("programme_id"), int) else None
    if not programme or not programme.is_active:
        return jsonify({"error": "Select a programme or class.", "field": "programme_id"}), 400
    err = _check_term(programme, payload.get("semester"))
    if err:
        return jsonify({"error": err, "field": "semester"}), 400
    semester = payload["semester"]
    current = Election.current()
    if current and not current.desk_open:
        return jsonify({"error": "Voting has ended, so no more students can be registered and no more PINs can be issued.", "code": "voting_ended"}), 409

    name = sanitize_input(name)
    duplicate = _of_election(User.query.filter(
        User.role == "voter",
        func.lower(User.name) == name.lower(),
        User.programme_id == programme.id,
        User.year == semester,
    ), current).first()
    if duplicate and not payload.get("confirm_duplicate"):
        return jsonify({
            "error": "A student with this name is already registered for this programme and "
                     f"{programme.term_label.lower()}.",
            "code": "possible_duplicate",
            "existing_slip_id": duplicate.student_id,
        }), 409

    election = Election.current()
    prefix = election.ensure_slip_prefix() if election else None
    user = None
    for _ in range(10):
        slip = new_slip_id(prefix)
        user = User(
            student_id=slip,
            name=name,
            email=f"{slip.lower()}@voters.invalid",
            role="voter",
            department=programme.name,
            year=semester,
            programme_id=programme.id,
            registered_by=_actor_id(),
            is_active=True,
            otp_enabled=False,
        )
        user.set_password(secrets.token_urlsafe(24))  # voters authenticate with a desk PIN, never a password
        try:
            with db.session.begin_nested():
                db.session.add(user)
        except IntegrityError:
            user = None
            continue
        break
    if user is None:
        return jsonify({"error": "Could not generate a unique Voter Slip ID. Please try again."}), 503

    pin = None
    if election and election.desk_open:
        db.session.add(VoterRecord(
            election_id=election.id, voter_hash=User.hash_student_id(user.student_id), has_voted=False
        ))
        # no PIN yet: the officer issues it with "Issue PIN" (one student) or "Issue PINs" (all)
    _audit("STUDENT_REGISTERED", f"Registered {user.name} ({user.student_id}) in {programme.name}, {programme.term_name(semester)}.")
    db.session.commit()

    return jsonify({**_serialize(user, "registered", {programme.id: programme}, election), "pin": pin}), 201


@desk_bp.post("/registrations/import")
@desk_required
def import_registrations():
    """Register many students from a CSV (name, programme, department, semester). All or nothing."""
    from app.student_import import import_students

    election = Election.current()
    if election and not election.desk_open:
        return jsonify({"error": "Voting has ended, so no more students can be registered.", "code": "voting_ended"}), 409
    upload = request.files.get("file")
    raw = upload.read(2_000_001) if upload else b""
    if not raw or len(raw) > 2_000_000:
        return jsonify({"error": "Choose a CSV file under 2 MB."}), 400
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return jsonify({"error": "The file is not a valid UTF-8 CSV."}), 400
    created, skipped, errors = import_students(text, election, _actor_id())
    if errors:
        db.session.rollback()
        return jsonify({"error": f"{len(errors)} problem(s) found. Nothing was imported.", "errors": errors[:30]}), 400
    _audit("STUDENTS_IMPORTED", f"Imported {len(created)} students from a list ({skipped} duplicates skipped).")
    db.session.commit()
    return jsonify({"created": len(created), "skipped": skipped, "students": created,
                    "election_title": election.title if election else ""}), 201


@desk_bp.delete("/registrations")
@admin_required
def remove_all_registrations():
    """Election Officer: remove every student registered for the current election, before voting opens."""
    election = Election.current()
    if not election:
        return jsonify({"error": "There is no election."}), 404
    if (request.get_json(silent=True) or {}).get("confirm") != "DELETE":
        return jsonify({"error": "Type DELETE to confirm."}), 400
    if election.effective_status not in ("setup", "registration", "ready"):
        return jsonify({"error": "Students can only be removed before voting opens."}), 409
    students = _of_election(User.query.filter(User.role == "voter"), election).all()
    slips = [u.student_id for u in students]
    hashes = [User.hash_student_id(s) for s in slips]
    for i in range(0, len(slips), 500):
        VotingToken.query.filter(VotingToken.election_id == election.id,
                                 VotingToken.student_id.in_(slips[i:i + 500])).delete(synchronize_session=False)
        VoterRecord.query.filter(VoterRecord.election_id == election.id,
                                 VoterRecord.voter_hash.in_(hashes[i:i + 500])).delete(synchronize_session=False)
    for u in students:
        db.session.delete(u)
    _audit("STUDENTS_REMOVED", f"Removed all {len(students)} registered students from \u201c{election.title}\u201d.")
    db.session.commit()
    return jsonify({"removed": len(students)}), 200


@desk_bp.get("/registrations")
@desk_required
def list_registrations():
    q = clean_name(request.args.get("q"))
    election = Election.current()
    query = _of_election(User.query.filter(User.role == "voter"), election)
    if q:
        term = f"%{q}%"
        query = query.filter(User.student_id.ilike(term) | User.name.ilike(term))
    if request.args.get("programme_id", type=int):
        query = query.filter(User.programme_id == request.args.get("programme_id", type=int))
    if request.args.get("semester", type=int):
        query = query.filter(User.year == request.args.get("semester", type=int))

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 25, type=int), 1), 100)
    total = query.count()
    users = query.order_by(User.created_at.desc(), User.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    status = _statuses(users, election)
    programmes = _programme_map()
    return jsonify({
        "registrations": [_serialize(u, status[u.student_id], programmes) for u in users],
        "total": total,
        "page": page,
        "per_page": per_page,
        "election": {"id": election.id, "title": election.title, "status": election.effective_status} if election else None,
    }), 200


@desk_bp.get("/registrations/export")
@desk_required
def export_registrations():
    election = Election.current()
    users = _of_election(User.query.filter_by(role="voter"), election).order_by(User.created_at).all()
    status = _statuses(users, election)
    programmes = _programme_map()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Voter Slip ID", "Name", "Programme", "Department/Stream", "Semester/Year", "Status", "Registered At"])
    for u in users:
        row = _serialize(u, status[u.student_id], programmes)
        w.writerow([row["slip_id"], _csv_safe(row["name"]), _csv_safe(row["programme"]),
                    _csv_safe(row["department"]), row["term"], row["status"], row["registered_at"]])
    _audit("REGISTRATIONS_EXPORTED", f"Downloaded the registrations list ({len(users)} students).")
    db.session.commit()
    return Response(
        out.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=registrations.csv"},
    )


@desk_bp.post("/registrations/issue-pins")
@desk_required
def issue_all_pins():
    """Give every student who has no active PIN one, and return all slips (with PINs) of students who have not voted."""
    election = Election.current()
    if not election or not election.desk_open or election.voting_paused:
        return jsonify({"error": "PINs can only be issued while registration or voting is open and not paused."}), 409
    users = _of_election(User.query.filter_by(role="voter"), election).order_by(User.student_id).all()
    status = _statuses(users, election)
    programmes = _programme_map()
    slips, issued = [], 0
    for u in users:
        if status[u.student_id] == "voted":
            continue
        tok = (VotingToken.query.filter_by(student_id=u.student_id, election_id=election.id, is_used=False)
               .order_by(VotingToken.created_at.desc()).first())
        pin = tok.reveal_pin() if tok and (tok.failed_attempts or 0) < 5 else None
        if not pin:
            pin, _t = VotingToken.generate_pin(u.student_id, election.id, _actor_id(), STATIC_PIN_MINUTES, rounds=8)
            issued += 1
        slips.append({**_serialize(u, status[u.student_id], programmes, election), "pin": pin})
    _audit("PINS_ISSUED_BULK", f"Issued {issued} new voting PINs and printed {len(slips)} slips.")
    db.session.commit()
    return jsonify({"issued": issued, "students": slips, "election_title": election.title}), 200


@desk_bp.get("/registrations/<slip_id>/pin")
@desk_required
def view_pin(slip_id):
    """The student's current voting PIN, so the slip can be printed again. Not available once it has been used."""
    user = _find_voter(slip_id)
    election = Election.current()
    if not user or not election:
        return jsonify({"error": "No registration found for this Voter Slip ID."}), 404
    token = (VotingToken.query
             .filter_by(student_id=user.student_id, election_id=election.id, is_used=False)
             .order_by(VotingToken.created_at.desc()).first())
    pin = token.reveal_pin() if token and (token.failed_attempts or 0) < 5 else None
    if pin:
        _audit("PIN_VIEWED", f"Viewed the voting PIN of {user.name} ({user.student_id}) to print the slip.")
        db.session.commit()
    return jsonify({"pin": pin}), 200


@desk_bp.get("/registrations/<slip_id>")
@desk_required
def get_registration(slip_id):
    user = _find_voter(slip_id)
    if not user:
        return jsonify({"error": "No registration found for this Voter Slip ID."}), 404
    election = Election.current()
    status = _statuses([user], election)[user.student_id]
    if request.args.get("checkin") == "1":
        said = {"registered": "no PIN yet", "active": "at a booth now", "pin_active": "PIN already issued", "voted": "already voted"}[status]
        _audit("DESK_CHECKIN", f"Checked in {user.name} ({user.student_id}) at the desk: {said}.")
        db.session.commit()
    return jsonify(_serialize(user, status, _programme_map(), election)), 200


@desk_bp.patch("/registrations/<slip_id>")
@desk_required
def update_registration(slip_id):
    user = _find_voter(slip_id)
    if not user:
        return jsonify({"error": "No registration found for this Voter Slip ID."}), 404
    election = Election.current()
    if _statuses([user], election)[user.student_id] == "voted":
        return jsonify({"error": "This voter has already voted and can no longer be edited."}), 409

    payload = request.get_json(silent=True) or {}
    if "name" in payload:
        name = clean_name(payload["name"])
        ok, msg = validate_person_name(name)
        if not ok:
            return jsonify({"error": msg, "field": "name"}), 400
        user.name = sanitize_input(name)

    programme = db.session.get(Programme, user.programme_id) if user.programme_id else None
    if "programme_id" in payload:
        programme = db.session.get(Programme, payload["programme_id"]) if isinstance(payload["programme_id"], int) else None
        if not programme or not programme.is_active:
            return jsonify({"error": "Select a programme or class.", "field": "programme_id"}), 400
        user.programme_id, user.department = programme.id, programme.name
    if "semester" in payload or "programme_id" in payload:
        semester = payload.get("semester", user.year)
        err = _check_term(programme, semester) if programme else "Select a programme or class."
        if err:
            return jsonify({"error": err, "field": "semester"}), 400
        user.year = semester

    _audit("STUDENT_UPDATED", f"Edited the registration details of {user.name} ({user.student_id}).")
    db.session.commit()
    return jsonify(_serialize(user, _statuses([user], election)[user.student_id], _programme_map(), election)), 200
