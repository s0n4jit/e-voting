"""
app/routes/system.py — Full backup (ZIP) and factory reset, Election Officer only.

Reset needs a backup downloaded in the last 30 minutes, the officer's current authenticator code and the
word RESET. Afterwards the database is empty and the installation wizard appears again.
"""

import io
import json
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity

from app.extensions import db, limiter
from app.models.audit_log import AuditLog
from app.models.election import Election
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.utils.decorators import admin_required

system_bp = Blueprint("system", __name__)

BACKUP_VALID_MINUTES = 30
FORMAT_VERSION = 1

_README = """Campus E-Voting backup
======================

db/<table>.json   every row of every table
files/            binary data (candidate photos)
manifest.json     when and by whom this backup was made

THIS FILE IS SECRET. It contains password hashes, authenticator secrets, voter records and all ballots.
Store it encrypted and offline, share it with nobody, and delete it when it is no longer needed.
"""


def _json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _build_backup(actor) -> bytes:
    buf = io.BytesIO()
    counts = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for table in db.metadata.sorted_tables:
            rows = []
            for r in db.session.execute(table.select()).mappings():
                row = {}
                for col, val in r.items():
                    if isinstance(val, (bytes, bytearray, memoryview)):
                        pk = "-".join(str(r[c.name]) for c in table.primary_key.columns)
                        path = f"files/{table.name}/{pk}.{col}.bin"
                        z.writestr(path, bytes(val))
                        val = {"$file": path}
                    row[col] = val
                rows.append(row)
            counts[table.name] = len(rows)
            z.writestr(f"db/{table.name}.json", json.dumps(rows, default=_json_default, indent=1))
        z.writestr("manifest.json", json.dumps({
            "format": FORMAT_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": actor.email if actor else None,
            "rows": counts,
        }, indent=1))
        z.writestr("README.txt", _README)
    return buf.getvalue()


def _audit(action, details):
    ident = get_jwt_identity()
    db.session.add(AuditLog(
        user_id=int(ident) if ident and str(ident).isdigit() else None,
        action=action, details=details,
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))


@system_bp.post("/export")
@admin_required
@limiter.limit("10 per hour")
def export_backup():
    actor = db.session.get(User, int(get_jwt_identity()))
    data = _build_backup(actor)
    SystemSetting.put("last_backup_at", datetime.now(timezone.utc).isoformat())
    _audit("SYSTEM_BACKUP_DOWNLOADED", "Downloaded a full backup of the system.")
    db.session.commit()
    name = f"evoting-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.zip"
    return send_file(io.BytesIO(data), mimetype="application/zip", as_attachment=True, download_name=name)


def _recent_backup() -> bool:
    raw = SystemSetting.get("last_backup_at")
    try:
        at = datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return False
    return datetime.now(timezone.utc) - at <= timedelta(minutes=BACKUP_VALID_MINUTES)


@system_bp.post("/reset")
@admin_required
@limiter.limit("5 per minute")
def reset_system():
    body = request.get_json(silent=True) or {}
    user = db.session.get(User, int(get_jwt_identity()))
    if body.get("confirm") != "RESET":
        return jsonify({"error": "Type RESET to confirm."}), 400
    if not user or not user.otp_enabled or not user.verify_otp(str(body.get("code") or "").strip()):
        return jsonify({"error": "The authenticator code is not correct."}), 403
    if any(e.effective_status == "voting_active" for e in Election.query.all()):
        return jsonify({"error": "Voting is open. Close voting before resetting."}), 409
    if not _recent_backup():
        return jsonify({"error": f"Download a backup first (it must be less than {BACKUP_VALID_MINUTES} minutes old)."}), 409

    from app.migrations import run_migrations

    db.session.commit()
    db.session.remove()
    db.drop_all()
    run_migrations()  # create_all + defaults: an empty, not-yet-installed system
    from app.routes.setup import ensure_setup_token

    ensure_setup_token(current_app)
    return jsonify({"message": "The system was reset. Set it up again."}), 200


# ── import ────────────────────────────────────────────────────────────────────

MAX_UPLOAD = 100 * 1024 * 1024
MAX_UNPACKED = 400 * 1024 * 1024


class BackupError(Exception):
    pass


def _convert(column, value, z):
    from sqlalchemy import Date, DateTime

    if value is None:
        return None
    if isinstance(value, dict) and "$file" in value:
        name = value["$file"]
        if not str(name).startswith("files/") or name not in z.namelist():
            raise BackupError("The backup refers to a file that is missing.")
        return z.read(name)
    try:
        if isinstance(column.type, DateTime):
            return datetime.fromisoformat(value)
        if isinstance(column.type, Date):
            return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise BackupError("The backup contains an invalid date.")
    return value


def _parse_backup(data: bytes) -> dict:
    """Read and validate the whole ZIP before anything is changed."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        if sum(i.file_size for i in z.infolist()) > MAX_UNPACKED:
            raise BackupError("The backup is too large.")
        manifest = json.loads(z.read("manifest.json"))
    except (zipfile.BadZipFile, KeyError, ValueError):
        raise BackupError("This is not a Campus E-Voting backup file.")
    if manifest.get("format") != FORMAT_VERSION:
        raise BackupError("This backup was made by an incompatible version.")

    tables = {t.name: t for t in db.metadata.sorted_tables}
    parsed = {}
    for name in z.namelist():
        if not (name.startswith("db/") and name.endswith(".json")) or name[3:-5] not in tables:
            continue
        cols = tables[name[3:-5]].columns
        try:
            rows = json.loads(z.read(name))
            parsed[name[3:-5]] = [{k: _convert(cols[k], v, z) for k, v in row.items() if k in cols} for row in rows]
        except (ValueError, AttributeError):
            raise BackupError(f"The backup table {name[3:-5]} is damaged.")
    if not any(u.get("role") == "admin" for u in parsed.get("users", [])):
        raise BackupError("The backup has no election officer, so nobody could sign in.")
    return parsed


def _restore(parsed: dict) -> None:
    """Replace all data inside one transaction: either everything is restored or nothing changes."""
    from sqlalchemy import Integer, text

    ordered = db.metadata.sorted_tables
    for table in reversed(ordered):
        db.session.execute(table.delete())
    for table in ordered:
        rows = parsed.get(table.name)
        if not rows:
            continue
        pk = list(table.primary_key.columns)
        if len(pk) == 1 and isinstance(pk[0].type, Integer):
            rows.sort(key=lambda r: r.get(pk[0].name) or 0)  # referenced rows first
        db.session.execute(table.insert(), rows)
    # Authenticator secrets in a backup are not carried over: every account sets two-step verification up
    # again on its next sign-in (mandatory for Election Officers), so nobody is locked out by a stale secret.
    users = db.metadata.tables["users"]
    db.session.execute(users.update().values(otp_enabled=False, otp_secret=None))
    if db.engine.dialect.name == "postgresql":  # keep new ids after the highest restored one
        for table in ordered:
            pk = list(table.primary_key.columns)
            if len(pk) == 1 and isinstance(pk[0].type, Integer):
                db.session.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table.name}', '{pk[0].name}'), "
                    f"COALESCE((SELECT MAX({pk[0].name}) FROM {table.name}), 1))"
                ))


@system_bp.post("/import")
@admin_required
@limiter.limit("5 per minute")
def import_backup():
    user = db.session.get(User, int(get_jwt_identity()))
    if request.form.get("confirm") != "IMPORT":
        return jsonify({"error": "Type IMPORT to confirm."}), 400
    if not user or not user.otp_enabled or not user.verify_otp(str(request.form.get("code") or "").strip()):
        return jsonify({"error": "The authenticator code is not correct."}), 403
    if any(e.effective_status == "voting_active" for e in Election.query.all()):
        return jsonify({"error": "Voting is open. Close voting before importing."}), 409
    upload = request.files.get("file")
    data = upload.read(MAX_UPLOAD + 1) if upload else b""
    if not data or len(data) > MAX_UPLOAD:
        return jsonify({"error": "Choose a backup ZIP smaller than 100 MB."}), 400
    try:
        parsed = _parse_backup(data)
    except BackupError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        _restore(parsed)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "The backup could not be restored. Nothing was changed."}), 500

    from app.migrations import run_migrations

    db.session.remove()
    run_migrations()  # fills in columns that a backup from an older version does not have
    return jsonify({"message": "The backup was restored. Sign in with the accounts from the backup and set up two-step verification again."}), 200
