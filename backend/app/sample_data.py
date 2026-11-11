"""
app/sample_data.py — Sample data for the local test environment (never used in production).

Creates an installed instance with an Election Officer, two Desk Officers, an
election with positions and candidates, and pre-generated booth slips.
"""

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.election_position import ElectionPosition
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.booth_slip import BoothSlip

OFFICER = {"username": "officer", "email": "officer@example.edu", "password": "Officer@12345"}
DESKS = [
    {"username": "desk1", "email": "desk1@example.edu", "name": "Asha Verma", "password": "Desk@12345"},
    {"username": "desk2", "email": "desk2@example.edu", "name": "Rohan Das", "password": "Desk@12345"},
]
POSITIONS = {
    "President": ["Nilav Sarma", "Ananya Kalita"],
    "Vice President": ["Debojit Das", "Priyanka Nath"],
    "General Secretary": ["Bhaskar Jyoti Rabha", "Sneha Barman"],
    "Assistant General Secretary": ["Arindam Boro", "Rashmi Rekha Deka"],
    "Cultural Secretary": ["Manash Pratim Nath", "Rimpi Bora"],
    "Magazine Secretary": ["Chinmoy Dutta", "Pallabi Saikia"],
    "Major Games Secretary": ["Himangshu Medhi", "Bikramjit Ray"],
    "Minor Games Secretary": ["Subrata Roy", "Deepjyoti Das"],
    "Boys' Common Room Secretary": ["Saurav Jyoti Hazarika", "Pranjal Pratim Borah"],
    "Girls' Common Room Secretary": ["Barasha Rani Das", "Dimpi Kalita"],
}


def seed_sample_data() -> dict:
    now = datetime.now(timezone.utc)
    for k, v in {
        "installed": "true", "installed_at": now.isoformat(), "institution_name": "Example University",
        "system_name": "Campus Election Portal", "logo": "", "timezone": "Asia/Kolkata", "language": "en",
    }.items():
        SystemSetting.put(k, v)

    officer = User(student_id=OFFICER["username"], name="Dr. Meera Krishnan", email=OFFICER["email"],
                   role="admin", is_admin=True, is_active=True)
    officer.set_password(OFFICER["password"])
    db.session.add(officer)
    for d in DESKS:
        u = User(student_id=d["username"], name=d["name"], email=d["email"], role="polling_officer", is_active=True)
        u.set_password(d["password"])
        db.session.add(u)
    db.session.flush()

    election = Election(
        title="Student Council Election 2026",
        description="Annual election of the student council.",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(days=7),
        created_by=officer.id,
    )
    election.set_status("voting_active")
    db.session.add(election)
    db.session.flush()

    for i, (position, names) in enumerate(POSITIONS.items()):
        db.session.add(ElectionPosition(election_id=election.id, name=position, sort_order=i))
        for n in names:
            db.session.add(Candidate(election_id=election.id, name=n, position=position,
                                     department="General", bio=f"{n} is running for {position}."))

    slips = BoothSlip.generate_batch(election.id, booth_number=1, count=50)
    db.session.commit()
    return {"officer": OFFICER, "desks": DESKS, "slips": len(slips), "election": election.title}
