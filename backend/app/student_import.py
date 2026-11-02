"""
app/student_import.py — Bulk registration of students from a CSV (installation wizard and Registrations page).

CSV columns: name, programme, department, semester  (the programme and department exactly as listed under
Programmes; for Higher Secondary the programme is "Higher Secondary" and the department is the stream).
Each student gets a Voter Slip ID like a desk registration would.
"""

import csv
import io
import itertools
import secrets

from app.extensions import db
from app.models.programme import Programme
from app.models.user import User
from app.models.voter_record import VoterRecord
from app.utils.validators import clean_name, sanitize_input, validate_person_name

MAX_STUDENTS = 5000
TEMPLATE_CSV = (
    "name,programme,department,semester\n"
    "Anita Das,Bachelor of Science,Physics,3\n"
    "Rahul Borah,Bachelor of Arts,English,1\n"
    "Mina Gogoi,Higher Secondary,Science,2\n"
)


def import_students(text, election, actor_id=None, dry_run=False):
    """
    Add the students in a CSV to the session without committing.
    Returns (created, skipped, errors): `created` is a list of dicts (name, slip_id, programme, semester),
    `skipped` counts rows that duplicate an existing student, `errors` are readable per-line messages.
    With dry_run nothing needs to be rolled back by the caller beyond the usual session rollback.
    """
    try:
        rows = list(itertools.islice(csv.DictReader(io.StringIO(text)), MAX_STUDENTS + 1))
    except csv.Error:
        return [], 0, ["The text is not a valid CSV."]
    if not rows or len(rows) > MAX_STUDENTS:
        return [], 0, [f"The student list must have between 1 and {MAX_STUDENTS} rows."]

    by_name = {(p.programme.lower(), p.department.lower()): p for p in Programme.query.filter_by(is_active=True).all()}
    prefix = election.ensure_slip_prefix() if election else "SUE00-E0-"
    existing = {
        (n.lower(), pid, yr)
        for n, pid, yr in db.session.query(User.name, User.programme_id, User.year).filter(
            User.role == "voter", User.student_id.like(f"{prefix}%")
        )
    }
    used = {s for (s,) in db.session.query(User.student_id).filter(User.student_id.like(f"{prefix}%"))}
    make_record = bool(election and election.desk_open and election.id)

    shared = User()
    shared.set_password(secrets.token_urlsafe(24))  # voters never sign in with a password: one unusable hash for all rows

    created, skipped, errors = [], 0, []
    users = []
    for line, row in enumerate(rows, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if isinstance(v, (str, type(None)))}
        name = clean_name(row.get("name", ""))
        ok, msg = validate_person_name(name)
        if not ok:
            errors.append(f"Line {line}: {msg}")
            continue
        programme = by_name.get((row.get("programme", "").lower(), row.get("department", "").lower()))
        if not programme:
            errors.append(f"Line {line}: programme and department \"{row.get('programme', '')} / {row.get('department', '')}\" are not in the Programmes list.")
            continue
        sem = row.get("semester") or row.get("year") or row.get("term") or ""
        if not sem.isdigit() or not 1 <= int(sem) <= programme.term_count:
            errors.append(f"Line {line}: {programme.term_label.lower()} must be a number from 1 to {programme.term_count}.")
            continue
        semester = int(sem)
        name = sanitize_input(name)
        key = (name.lower(), programme.id, semester)
        if key in existing:
            skipped += 1
            continue
        existing.add(key)

        slip = f"{prefix}{secrets.randbelow(1_000_000):06d}"
        while slip in used:
            slip = f"{prefix}{secrets.randbelow(1_000_000):06d}"
        used.add(slip)
        user = User(
            student_id=slip, name=name, email=f"{slip.lower()}@voters.invalid", role="voter",
            department=programme.name, year=semester, programme_id=programme.id, registered_by=actor_id,
            is_active=True, otp_enabled=False, password_hash=shared.password_hash,
        )
        db.session.add(user)
        if make_record:
            db.session.add(VoterRecord(election_id=election.id, voter_hash=User.hash_student_id(slip), has_voted=False))
        created.append({"name": name, "slip_id": slip, "programme": programme.name, "semester": semester})
        users.append(user)

    return created, skipped, errors
