"""
app/migrations.py — Idempotent, versioned schema upgrades.

db.create_all() creates missing tables; this module adds columns/data fixes to tables that
already exist (e.g. an existing Supabase database) and records each step in schema_migrations,
so it is safe to run on every start and from `python manage.py migrate`.
"""

from datetime import datetime, timezone

from sqlalchemy import inspect, text

from app.extensions import db

_COLUMNS = [
    # (table, column, DDL type/default)
    ("users", "programme_id", "INTEGER"),
    ("users", "registered_by", "INTEGER"),
    ("users", "photo", "TEXT"),
    ("elections", "status", "VARCHAR(20) NOT NULL DEFAULT 'setup'"),
    ("voting_tokens", "failed_attempts", "INTEGER NOT NULL DEFAULT 0"),
    ("elections", "public_token", "VARCHAR(64)"),
    ("elections", "slip_prefix", "VARCHAR(20)"),
    ("elections", "voting_paused", "BOOLEAN NOT NULL DEFAULT false"),
    ("voting_tokens", "pin_enc", "TEXT"),
    ("candidates", "semester", "VARCHAR(30)"),
    ("users", "roll_no", "VARCHAR(40)"),
    ("elections", "is_mock", "BOOLEAN NOT NULL DEFAULT false"),
    ("elections", "mock_started_at", "TIMESTAMP WITH TIME ZONE"),
    ("voting_tokens", "authenticated_at", "TIMESTAMP WITH TIME ZONE"),
    ("kiosk_devices", "election_id", "INTEGER"),
    ("programmes", "level", "VARCHAR(10) NOT NULL DEFAULT 'degree'"),
    ("programmes", "programme", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("programmes", "department", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("kiosk_devices", "booth_number", "INTEGER"),
    ("booth_create_tokens", "booth_number", "INTEGER"),
    ("booth_create_tokens", "kiosk_id", "INTEGER"),
    ("booth_create_tokens", "from_slip_id", "VARCHAR(30)"),
    ("booth_create_tokens", "to_slip_id", "VARCHAR(30)"),
    ("booth_create_tokens", "slips_count", "INTEGER"),
    ("booth_slips", "authenticated_at", "TIMESTAMP WITH TIME ZONE"),
]


def _add_missing_columns():
    insp = inspect(db.engine)
    for table, column, ddl in _COLUMNS:
        if column not in {c["name"] for c in insp.get_columns(table)}:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    db.session.commit()


def _m001_election_status():
    """Derive lifecycle status for elections created before the status column existed."""
    from app.models.election import Election

    for e in Election.query.filter_by(status="setup").all():
        if e.results_published:
            e.status = "results_published"
        elif e.is_active:
            e.status = "voting_active"
        elif e.end_time and _past(e.end_time):
            e.status = "voting_closed"


def _past(dt):
    dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


def _m002_mark_installed():
    """Existing deployments already have an Election Officer: lock the setup wizard."""
    from app.models.system_setting import SystemSetting
    from app.models.user import User

    if db.session.query(User.id).filter(User.role == "admin").first():
        SystemSetting.put("installed", "true")
        SystemSetting.put("installed_at", datetime.now(timezone.utc).isoformat())


def _m003_drop_unbound_2fa():
    """
    The login flow used to accept a universal demo code for every account. Staff accounts that
    never bound an authenticator can no longer pass 2FA, so 2FA is switched off for them until
    they enable it again under Account security (staff with a real authenticator should re-enable).
    """
    from app.models.user import User

    User.query.filter(User.role.in_(("admin", "polling_officer"))).update(
        {"otp_enabled": False}, synchronize_session=False
    )


def _m004_programme_parts():
    """Programmes created before level/programme/department existed keep their name as the programme."""
    db.session.execute(text("UPDATE programmes SET programme = name WHERE programme = ''"))


def _m005_readable_audit_details():
    """Rewrite old audit texts that named elections/users by number into plain sentences."""
    import re

    from app.models.audit_log import AuditLog
    from app.models.election import Election
    from app.models.user import User

    titles = {e.id: e.title for e in Election.query.all()}
    names = {u.student_id: u.name for u in User.query.all()}
    t = lambda i: f"\u201c{titles.get(int(i), 'the election')}\u201d"
    rules = [
        (r"^Multi-position ballot submitted for election (\d+) \((\d+) positions\)$", lambda m: f"Cast a ballot in {t(m[1])} ({m[2]} positions)."),
        (r"^Ballot submitted for election (\d+)$", lambda m: f"Cast a ballot in {t(m[1])}."),
        (r"^Single-use voting PIN generated for student (\S+) in election (\d+) by officer \d+$",
         lambda m: f"Issued a voting PIN to {names.get(m[1], m[1])} ({m[1]}) for {t(m[2])}."),
        (r"^Voter authenticated with single-use PIN for election (\d+)$", lambda m: f"Entered a valid PIN and started voting in {t(m[1])}."),
        (r"^Election (\d+) moved to (.+)\.$", lambda m: f"Moved {t(m[1])} to the stage \u201c{m[2]}\u201d."),
        (r"^Election (\d+) positions set to: (.*)\.$", lambda m: f"Set the positions for {t(m[1])}: {m[2]}."),
        (r"^Election report generated for election (\d+)\.$", lambda m: f"Downloaded the results report for {t(m[1])}."),
        (r"^User signed in\.$", lambda m: "Signed in."),
        (r"^User logged out\.$", lambda m: "Signed out."),
        (r"^User completed 2FA login successfully\.$", lambda m: "Signed in."),
        (r"^User \S+ activated .*2FA\.$", lambda m: "Turned on two-step verification."),
        (r"^User \S+ deactivated .*2FA\.$", lambda m: "Turned off two-step verification."),
    ]
    for row in AuditLog.query.filter(AuditLog.details.isnot(None)).all():
        for pattern, build in rules:
            m = re.match(pattern, row.details)
            if m:
                row.details = build(m)
                break


def _m006_readable_audit_details_2():
    """Second batch of old audit texts (registrations, desk officers, programmes, maintenance)."""
    import re

    from app.models.audit_log import AuditLog
    from app.models.user import User

    names = {u.student_id: u.name for u in User.query.all()}
    who = lambda sid: names.get(sid, sid)
    rules = [
        (r"^Registered voter (\S+) \((.*)\)\.$", lambda m: f"Registered {who(m[1])} ({m[1]}) in {m[2]}."),
        (r"^Exported (\d+) registration records\.$", lambda m: f"Downloaded the registrations list ({m[1]} students)."),
        (r"^Updated registration (\S+)\.$", lambda m: f"Edited the registration details of {who(m[1])} ({m[1]})."),
        (r"^Created Desk Officer '(.+)'\.$", lambda m: f"Created a desk officer account for {who(m[1])} (username {m[1]})."),
        (r"^Removed Desk Officer '(.+)'\.$", lambda m: f"Removed the desk officer account of {who(m[1])} (username {m[1]})."),
        (r"^Updated Desk Officer '(.+)'\.$", lambda m: f"Updated the desk officer account of {who(m[1])}."),
        (r"^(Added|Updated|Deleted) programme '(.+)'\.$", lambda m: f"{m[1]} the programme \u201c{m[2]}\u201d."),
        (r"^Imported (\d+) programmes from CSV \((\d+) skipped, (\d+) errors\)\.$",
         lambda m: f"Imported programmes from a CSV file: {m[1]} added, {m[2]} already existed, {m[3]} rows had problems."),
        (r"^Instance settings updated\.$", lambda m: "Updated the institution settings."),
        (r"^Staff maintenance terminal unlocked from IP (.+)$", lambda m: f"Opened the booth maintenance screen (from {m[1]})."),
        (r"^Maintenance action '(.+)' executed from IP (.+)$", lambda m: f"Ran the booth maintenance action \u201c{m[1]}\u201d (from {m[2]})."),
        (r"^Installation completed for '(.+)'\.$", lambda m: f"Completed the first-time setup for {m[1]}."),
        (r"^Voting PIN invalidated after repeated incorrect entries\.$", lambda m: "The voting PIN was cancelled after 5 wrong entries."),
    ]
    for row in AuditLog.query.filter(AuditLog.details.isnot(None)).all():
        for pattern, build in rules:
            m = re.match(pattern, row.details)
            if m:
                row.details = build(m)
                break


def _m007_clear_old_booths():
    """Booth tokens are now stored hashed and issued by Booth ID + officer code. Old registrations
    (plaintext tokens, built-in lab tokens) are removed; each booth must be set up again."""
    db.session.execute(text("DELETE FROM kiosk_devices"))


def _m008_slip_prefix():
    from app.models.election import Election

    for e in Election.query.all():
        e.ensure_slip_prefix()


def _m009_new_slip_format():
    """Slip IDs become SUE<year>-E<election>-<6 digits>. Existing VSL-<year>-<6 digits> slips are renamed
    (user id, the voter-record hash that is derived from it, PIN records and audit texts)."""
    import re

    from app.models.audit_log import AuditLog
    from app.models.election import Election
    from app.models.user import User
    from app.models.voter_record import VoterRecord
    from app.models.voting_token import VotingToken

    elections = Election.query.order_by(Election.id).all()
    for e in elections:
        if e.slip_prefix and e.slip_prefix.startswith("VSL-"):
            e.slip_prefix = None
        e.ensure_slip_prefix()
    by_year = {}
    for e in elections:  # slips of a year belong to that year's newest election
        by_year[e.slip_prefix.split("-")[0][3:]] = e
    mapping = {}
    for u in User.query.filter(User.role == "voter", User.student_id.like("VSL-%")).all():
        m = re.fullmatch(r"VSL-(\d{4})-(\d{6})", u.student_id)
        target = by_year.get(m.group(1)) if m else None
        if target:
            mapping[u.student_id] = f"{target.slip_prefix}{m.group(2)}"
    for old, new in mapping.items():
        old_hash, new_hash = User.hash_student_id(old), User.hash_student_id(new)
        User.query.filter_by(student_id=old).update({"student_id": new}, synchronize_session=False)
        VoterRecord.query.filter_by(voter_hash=old_hash).update({"voter_hash": new_hash}, synchronize_session=False)
        VotingToken.query.filter_by(student_id=old).update({"student_id": new}, synchronize_session=False)
    if mapping:
        for row in AuditLog.query.filter(AuditLog.details.like("%VSL-%")).all():
            for old, new in mapping.items():
                if old in row.details:
                    row.details = row.details.replace(old, new)


def _m010_short_year_slip_format():
    """Slip IDs become <letters><2-digit year>-E<n>-<6 digits>, e.g. SUE26-E1-483920. Existing slips are renamed
    (user id, the voter-record hash derived from it, PIN records and audit texts)."""
    import re

    from app.models.audit_log import AuditLog
    from app.models.election import Election
    from app.models.user import User
    from app.models.voter_record import VoterRecord
    from app.models.voting_token import VotingToken

    for e in Election.query.order_by(Election.id).all():
        old = e.slip_prefix
        e.slip_prefix = None
        new = e.ensure_slip_prefix()
        if not old or old == new:
            continue
        for u in User.query.filter(User.role == "voter", User.student_id.like(old + "%")).all():
            if not re.fullmatch(r"\d{6}", u.student_id[len(old):]):
                continue
            was, now = u.student_id, new + u.student_id[len(old):]
            u.student_id = now
            VoterRecord.query.filter_by(voter_hash=User.hash_student_id(was)).update({"voter_hash": User.hash_student_id(now)}, synchronize_session=False)
            VotingToken.query.filter_by(student_id=was).update({"student_id": now}, synchronize_session=False)
            for row in AuditLog.query.filter(AuditLog.details.like(f"%{was}%")).all():
                row.details = row.details.replace(was, now)


def _m011_prefix_booth_slips():
    """Ensure all booth_slips have the election slip_prefix (e.g. SUE26-E1-1001)."""
    from app.models.election import Election
    from app.models.booth_slip import BoothSlip
    elections = Election.query.all()
    for el in elections:
        prefix = el.ensure_slip_prefix()
        slips = BoothSlip.query.filter_by(election_id=el.id).all()
        for s in slips:
            if s.voting_id and not s.voting_id.startswith(prefix):
                s.voting_id = f"{prefix}{s.voting_id}"
    db.session.commit()


_STEPS = [
    ("001_election_status", _m001_election_status),
    ("002_mark_installed", _m002_mark_installed),
    ("003_drop_unbound_2fa", _m003_drop_unbound_2fa),
    ("004_programme_parts", _m004_programme_parts),
    ("005_readable_audit_details", _m005_readable_audit_details),
    ("006_readable_audit_details_2", _m006_readable_audit_details_2),
    ("007_clear_old_booths", _m007_clear_old_booths),
    ("008_slip_prefix", _m008_slip_prefix),
    ("009_new_slip_format", _m009_new_slip_format),
    ("010_short_year_slip_format", _m010_short_year_slip_format),
    ("011_prefix_booth_slips", _m011_prefix_booth_slips),
]


def run_migrations() -> list:
    """Apply pending migrations; returns the list of step names applied."""
    db.create_all()
    db.session.execute(text("CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(64) PRIMARY KEY, applied_at VARCHAR(40))"))
    db.session.commit()

    # Several gunicorn workers start at once: serialise them with a PostgreSQL advisory lock held on
    # its own dedicated connection (a session-level lock must be released on the connection that took it).
    lock_conn = None
    if db.engine.dialect.name == "postgresql":
        lock_conn = db.engine.connect()
        lock_conn.execute(text("SELECT pg_advisory_lock(727274)"))
    applied = []
    try:
        _add_missing_columns()
        done = {r[0] for r in db.session.execute(text("SELECT name FROM schema_migrations"))}
        for name, fn in _STEPS:
            if name in done:
                continue
            fn()
            db.session.execute(
                text("INSERT INTO schema_migrations (name, applied_at) VALUES (:n, :t)"),
                {"n": name, "t": datetime.now(timezone.utc).isoformat()},
            )
            db.session.commit()
            applied.append(name)
    finally:
        if lock_conn is not None:
            lock_conn.execute(text("SELECT pg_advisory_unlock(727274)"))
            lock_conn.close()
    return applied
