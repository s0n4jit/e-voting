"""
app/routes/setup.py — First-run installation wizard API.

Only usable while the instance is not installed. Completion is atomic and guarded by the
primary key of the "installed" system setting, so a second request can never create another
initial Election Officer.
"""

import hmac
import os
import re
import secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, Response, current_app, jsonify, request
from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy.exc import IntegrityError

from app.extensions import db, limiter
from app.models.audit_log import AuditLog
from app.models.election import Election
from app.models.election_position import ElectionPosition
from app.models.system_setting import SystemSetting
from app.programme_import import TEMPLATE_CSV, import_programme_csv
from app.models.user import User
from app.utils.validators import (
    clean_name,
    sanitize_input,
    validate_email,
    validate_password,
    validate_person_name,
)

setup_bp = Blueprint("setup", __name__)

LANGUAGES = {"en": "English", "hi": "Hindi", "bn": "Bengali", "as": "Assamese"}
LOGO_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
MAX_LOGO_CHARS = 400_000


def ensure_setup_token(app) -> None:
    """In production the wizard is always protected: without a SETUP_TOKEN, make one and print it in the log."""
    if app.config.get("TESTING") or os.environ.get("FLASK_ENV", "").lower() != "production":
        return
    if os.environ.get("SETUP_TOKEN") or SystemSetting.is_installed():
        return
    token = secrets.token_urlsafe(18)
    os.environ["SETUP_TOKEN"] = token  # one gunicorn process, so the environment is shared by all requests
    print(f"SETUP TOKEN (enter it in the setup wizard): {token}", flush=True)


def _setup_token_ok() -> bool:
    expected = os.environ.get("SETUP_TOKEN", "")
    if not expected:
        return True
    given = request.headers.get("X-Setup-Token", "")
    return hmac.compare_digest(given.encode(), expected.encode())


def voting_window(el, tz_name):
    """Combine election date + local start/end times into UTC datetimes."""
    try:
        tz = ZoneInfo(tz_name)
        start = datetime.fromisoformat(f"{el.get('date')}T{el.get('start_time')}").replace(tzinfo=tz)
        end = datetime.fromisoformat(f"{el.get('date')}T{el.get('end_time')}").replace(tzinfo=tz)
    except Exception:
        raise ValueError("Enter the election date and the voting start and end times.")
    if end <= start:
        raise ValueError("Voting must end after it starts.")
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def validate_payload(data: dict, steps=("system", "officer", "election")) -> dict:
    """Return {section: {field: message}} for the requested sections."""
    errors = {}

    if "system" in steps:
        s, e = data.get("system") or {}, {}
        if not clean_name(s.get("institution_name")):
            e["institution_name"] = "Institution name is required."
        if not clean_name(s.get("system_name")):
            e["system_name"] = "Election system name is required."
        try:
            ZoneInfo(s.get("timezone") or "")
        except Exception:
            e["timezone"] = "Choose a valid timezone."
        if s.get("language") not in LANGUAGES:
            e["language"] = "Choose a supported language."
        if not re.fullmatch(r"[A-Za-z]{2,6}", s.get("slip_code") or "SUE"):
            e["slip_code"] = "Use 2 to 6 letters, for example SUE."
        logo = s.get("logo")
        if logo and (len(logo) > MAX_LOGO_CHARS or not LOGO_RE.match(logo)):
            e["logo"] = "Logo must be a PNG, JPEG or WebP image under 300 KB."
        if e:
            errors["system"] = e

    if "officer" in steps:
        o, e = data.get("officer") or {}, {}
        ok, msg = validate_person_name(clean_name(o.get("name")))
        if not ok:
            e["name"] = msg
        if not validate_email(o.get("email") or ""):
            e["email"] = "Enter a valid email address."
        if not re.fullmatch(r"[A-Za-z0-9._\-]{3,32}", o.get("username") or ""):
            e["username"] = "Username must be 3-32 characters: letters, digits, dot, dash or underscore."
        photo = o.get("photo")
        if photo and (len(photo) > MAX_LOGO_CHARS or not LOGO_RE.match(photo)):
            e["photo"] = "Photo must be a PNG, JPEG or WebP image under 300 KB."
        ok, msg = validate_password(o.get("password") or "")
        if not ok:
            e["password"] = msg
        elif o.get("password") != o.get("confirm_password"):
            e["confirm_password"] = "Passwords do not match."
        if e:
            errors["officer"] = e

    if "election" in steps:
        el, e = data.get("election") or {}, {}
        if not clean_name(el.get("title")):
            e["title"] = "Election title is required."
        try:
            voting_window(el, (data.get("system") or {}).get("timezone") or "UTC")
        except ValueError as exc:
            e["schedule"] = str(exc)
        positions = [clean_name(p) for p in el.get("positions") or [] if clean_name(p)]
        if not positions:
            e["positions"] = "Add at least one position."
        elif len({p.lower() for p in positions}) != len(positions):
            e["positions"] = "Position names must be unique."
        elif any(len(p) > 100 for p in positions):
            e["positions"] = "Position names must be 100 characters or fewer."
        if (el.get("programmes_csv") or "").strip():
            _created, _skipped, bad = import_programme_csv(el["programmes_csv"])
            db.session.rollback()  # dry run only
            if bad:
                e["programmes_csv"] = " ".join(bad[:5])
        if (el.get("students_csv") or "").strip():
            from app.student_import import import_students

            if (el.get("programmes_csv") or "").strip():
                import_programme_csv(el["programmes_csv"])  # students are checked against the programmes being created
            _made, _skipped, bad_students = import_students(el["students_csv"], None, dry_run=True)
            db.session.rollback()
            if bad_students:
                e["students_csv"] = " ".join(bad_students[:5])
        if e:
            errors["election"] = e

    return errors


@setup_bp.get("/status")
@limiter.exempt
def status():
    """Public: whether setup is needed, plus the branding shown on public screens."""
    installed = SystemSetting.is_installed()
    body = {"installed": installed}
    if installed:
        b = SystemSetting.branding()
        body["branding"] = {k: b[k] for k in ("institution_name", "system_name", "logo", "language")}
    else:
        body["requires_token"] = bool(os.environ.get("SETUP_TOKEN"))
    return jsonify(body), 200


@setup_bp.get("/programme-template")
@limiter.exempt
def programme_template():
    """CSV of the college's departments, used to pre-fill the wizard and as the import template."""
    return Response(TEMPLATE_CSV, mimetype="text/csv")


@setup_bp.get("/student-template")
@limiter.exempt
def student_template():
    from app.student_import import TEMPLATE_CSV

    return Response(TEMPLATE_CSV, mimetype="text/csv")


@setup_bp.post("/validate")
@limiter.limit("60 per minute")
def validate():
    if SystemSetting.is_installed():
        return jsonify({"error": "Setup has already been completed."}), 403
    if not _setup_token_ok():
        return jsonify({"error": "Invalid setup token."}), 403
    body = request.get_json(silent=True) or {}
    step = body.get("step")
    if step not in ("system", "officer", "election"):
        return jsonify({"error": "Unknown step."}), 400
    return jsonify({"errors": validate_payload(body.get("data") or {}, (step,))}), 200


@setup_bp.post("/complete")
@limiter.limit("10 per minute")
def complete():
    if SystemSetting.is_installed():
        return jsonify({"error": "Setup has already been completed."}), 403
    if not _setup_token_ok():
        return jsonify({"error": "Invalid setup token."}), 403

    data = request.get_json(silent=True) or {}
    errors = validate_payload(data)
    if errors:
        return jsonify({"error": "Please correct the highlighted fields.", "errors": errors}), 400

    s, o, el = data["system"], data["officer"], data["election"]
    start, end = voting_window(el, s["timezone"])
    username, email = o["username"].strip(), o["email"].strip().lower()

    try:
        # The primary key on "installed" makes this the single winner of any race.
        db.session.add(SystemSetting(key="installed", value="true"))
        db.session.flush()

        for key in ("institution_name", "system_name"):
            SystemSetting.put(key, sanitize_input(clean_name(s[key])))
        SystemSetting.put("logo", s.get("logo") or "")
        SystemSetting.put("slip_code", (s.get("slip_code") or "SUE").upper())
        SystemSetting.put("timezone", s["timezone"])
        SystemSetting.put("language", s["language"])
        SystemSetting.put("installed_at", datetime.now(timezone.utc).isoformat())

        officer = User(
            student_id=username,
            name=sanitize_input(clean_name(o["name"])),
            email=email,
            role="admin",
            is_admin=True,
            is_active=True,
            otp_enabled=False,
            photo=o.get("photo") or None,
        )
        officer.set_password(o["password"])
        db.session.add(officer)
        db.session.flush()

        election = Election(
            title=sanitize_input(clean_name(el["title"])),
            description=sanitize_input(el.get("description") or ""),
            start_time=start,
            end_time=end,
            created_by=officer.id,
        )
        election.set_status("setup")
        db.session.add(election)
        db.session.flush()
        election.ensure_slip_prefix()
        for i, name in enumerate(clean_name(p) for p in el["positions"] if clean_name(p)):
            db.session.add(ElectionPosition(election_id=election.id, name=sanitize_input(name), sort_order=i))

        if (el.get("programmes_csv") or "").strip():
            import_programme_csv(el["programmes_csv"])
        if (el.get("students_csv") or "").strip():
            from app.student_import import import_students

            db.session.flush()
            made, _skipped, bad_students = import_students(el["students_csv"], election, officer.id)
            if bad_students:
                raise ValueError("student list: " + bad_students[0])
            current_app.logger.info("Imported %d students during setup.", len(made))

        db.session.add(AuditLog(
            user_id=officer.id,
            action="SYSTEM_INSTALLED",
            details=f"Completed the first-time setup for {sanitize_input(s['institution_name'])}.",
            ip_address=request.remote_addr or "",
            user_agent=(request.user_agent.string or "")[:255],
        ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Setup has already been completed."}), 403
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Setup failed")
        return jsonify({"error": "Setup could not be completed. Please try again."}), 500

    claims = {"role": "admin", "student_id": officer.student_id, "name": officer.name}
    return jsonify({
        "access_token": create_access_token(identity=str(officer.id), additional_claims=claims),
        "refresh_token": create_refresh_token(identity=str(officer.id), additional_claims=claims),
        "user": officer.to_dict(),
    }), 201
