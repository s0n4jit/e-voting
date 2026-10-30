"""
app/programme_import.py — Validation and CSV import of programmes, plus the college's default list.
"""

import csv
import io
import itertools

from sqlalchemy import func

from app.extensions import db
from app.models.programme import Programme
from app.utils.validators import clean_name, sanitize_input

DUPLICATE = "This programme and department already exist."
MAX_ROWS = 500

# Departments of Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga, grouped by degree.
_SCIENCE = ["Botany", "Chemistry", "Computer Science", "Mathematics", "Physics", "Zoology"]
_ARTS = ["Assamese", "English", "Education", "Economics", "Political Science", "Sociology", "History"]
TEMPLATE_CSV = "\n".join(
    ["level,programme,department,terms"]
    + [f"degree,Bachelor of Science,{d},6" for d in _SCIENCE]
    + [f"degree,Bachelor of Arts,{d},6" for d in _ARTS]
    + ["hs,Higher Secondary,Arts,2", "hs,Higher Secondary,Science,2"]
) + "\n"


def programme_fields(payload, programme=None):
    """Validate programme input (falling back to the existing row's values); returns (fields, error)."""
    def get(key, default):
        return payload.get(key, getattr(programme, key) if programme else default)

    level = get("level", "degree")
    if level not in ("hs", "degree"):
        return None, "Choose Higher Secondary or Degree."
    prog = clean_name(get("programme", "")) or ("Higher Secondary" if level == "hs" else "")
    dept = clean_name(get("department", ""))
    count = get("term_count", 2 if level == "hs" else 6)
    if not prog or not dept or len(prog) > 100 or len(dept) > 100:
        return None, "Programme and department (or stream) are required."
    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 12:
        return None, "Number of terms must be between 1 and 12."
    name = f"{sanitize_input(prog)} - {sanitize_input(dept)}"
    clash = Programme.query.filter(func.lower(Programme.name) == name.lower())
    if programme:
        clash = clash.filter(Programme.id != programme.id)
    if clash.first():
        return None, DUPLICATE
    return {
        "level": level, "programme": sanitize_input(prog), "department": sanitize_input(dept), "name": name,
        "term_label": "Year" if level == "hs" else "Semester", "term_count": count,
    }, None


def import_programme_csv(text):
    """
    Add the programmes in a CSV (columns level, programme, department, terms) to the session without
    committing. Returns (created, skipped, errors); a file-level problem comes back as one error.
    """
    try:
        rows = list(itertools.islice(csv.DictReader(io.StringIO(text)), MAX_ROWS + 1))
    except csv.Error:
        return 0, 0, ["The text is not a valid CSV."]
    if not rows or len(rows) > MAX_ROWS:
        return 0, 0, [f"The CSV must have between 1 and {MAX_ROWS} rows."]

    created, skipped, errors = 0, 0, []
    for line, row in enumerate(rows, start=2):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k and isinstance(v, (str, type(None)))}
        level = {"higher secondary": "hs", "hs": "hs"}.get(row.get("level", "").lower(), row.get("level", "").lower())
        payload = {"level": level, "programme": row.get("programme", ""), "department": row.get("department", "")}
        if row.get("terms"):
            payload["term_count"] = int(row["terms"]) if row["terms"].isdigit() else row["terms"]
        fields, err = programme_fields(payload)
        if err == DUPLICATE:
            skipped += 1
        elif err:
            errors.append(f"Line {line}: {err}")
        else:
            db.session.add(Programme(**fields))
            db.session.flush()  # so a repeated row later in the file counts as a duplicate
            created += 1
    return created, skipped, errors
