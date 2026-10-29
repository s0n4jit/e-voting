"""
migrations/seed_data.py — Initial seed data script.

Populates:
  - 1 Default Admin (ADMIN001 / Admin@1234)
  - 20 Sample Voters (STU001–STU020 / Student@1234)
  - 1 Active Sample Election: "Campus Student Council Election 2026"
  - 4 Candidates representing various faculties
  - 20 VoterRecord entries whitelisting all 20 sample voters
"""

import sys
import os
from datetime import datetime, timedelta, timezone

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.services.otp_service import OTPService


def seed():
    app = create_app()
    with app.app_context():
        print("🌱 Seeding database with initial dataset...")

        # 1. Admin User
        admin = User.query.filter_by(student_id="ADMIN001").first()
        if not admin:
            admin = User(
                student_id="ADMIN001",
                name="System Administrator",
                email="admin@campus.edu",
                role="admin",
                department="IT Administration",
                year=None,
                is_admin=True,
                is_active=True,
                otp_secret=OTPService.generate_secret(),
                otp_enabled=True,
            )
            admin.set_password("Admin@1234")
            db.session.add(admin)
            db.session.flush()
            print("  ✓ Created Administrator: ADMIN001 (Admin@1234)")
        else:
            print("  ℹ Administrator ADMIN001 already exists.")

        # 2. Sample Election
        election = Election.query.filter_by(title="Campus Student Council Election 2026").first()
        now = datetime.now(timezone.utc)
        if not election:
            election = Election(
                title="Campus Student Council Election 2026",
                description=(
                    "Annual general student election for campus leadership positions. "
                    "All registered students in good standing are eligible to cast one anonymous vote."
                ),
                start_time=now - timedelta(days=1),
                end_time=now + timedelta(days=7),
                is_active=True,
                results_published=False,
                created_by=admin.id,
            )
            db.session.add(election)
            db.session.flush()
            print(f"  ✓ Created Election: '{election.title}' (ID: {election.id})")
        else:
            print(f"  ℹ Election '{election.title}' already exists.")

        # 3. Candidates
        candidates_data = [
            {
                "name": "Sarah Connor",
                "party": "Progressive Student Alliance",
                "position": "President",
                "department": "Computer Science",
                "bio": "Dedicated to enhancing campus technology, open lab hours, and tech equity.",
                "photo_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300",
            },
            {
                "name": "Marcus Vance",
                "party": "Campus Voice Coalition",
                "position": "President",
                "department": "Political Science",
                "bio": "Championing cafeteria price reductions, mental health resources, and transparency.",
                "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300",
            },
            {
                "name": "Elena Rostova",
                "party": "Innovation & Green Campus",
                "position": "President",
                "department": "Environmental Engineering",
                "bio": "Committed to 100% renewable energy on campus and sustainable transportation.",
                "photo_url": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300",
            },
            {
                "name": "David Kim",
                "party": "Student Solidarity Movement",
                "position": "President",
                "department": "Business Administration",
                "bio": "Focused on career fairs, paid internship partnerships, and student club funding.",
                "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300",
            },
        ]

        for c_data in candidates_data:
            existing_c = Candidate.query.filter_by(
                election_id=election.id, name=c_data["name"]
            ).first()
            if not existing_c:
                cand = Candidate(
                    election_id=election.id,
                    name=c_data["name"],
                    party=c_data["party"],
                    position=c_data["position"],
                    department=c_data["department"],
                    bio=c_data["bio"],
                    photo_url=c_data["photo_url"],
                )
                db.session.add(cand)
                print(f"  ✓ Added Candidate: {cand.name} ({cand.party})")

        db.session.flush()

        # 4. 20 Sample Voters (STU001 - STU020)
        departments = [
            "Computer Science",
            "Electrical Engineering",
            "Business Administration",
            "Mechanical Engineering",
            "Physics",
        ]

        created_voter_count = 0
        whitelisted_count = 0

        for i in range(1, 21):
            sid = f"STU{i:03d}"
            email = f"student{i:03d}@campus.edu"
            dept = departments[(i - 1) % len(departments)]
            year = ((i - 1) % 4) + 1

            voter = User.query.filter_by(student_id=sid).first()
            if not voter:
                voter = User(
                    student_id=sid,
                    name=f"Student Voter {i:03d}",
                    email=email,
                    role="voter",
                    department=dept,
                    year=year,
                    is_admin=False,
                    is_active=True,
                    otp_secret=OTPService.generate_secret(),
                    otp_enabled=True,
                )
                voter.set_password("Student@1234")
                db.session.add(voter)
                db.session.flush()
                created_voter_count += 1

            # Whitelist voter for this election
            voter_hash = User.hash_student_id(sid)
            existing_vr = VoterRecord.query.filter_by(
                election_id=election.id, voter_hash=voter_hash
            ).first()
            if not existing_vr:
                vr = VoterRecord(
                    election_id=election.id,
                    voter_hash=voter_hash,
                    has_voted=False,
                )
                db.session.add(vr)
                whitelisted_count += 1

        db.session.commit()
        print(f"  ✓ Sample voters processed: {created_voter_count} created, {whitelisted_count} whitelisted.")
        print("\n🎉 Seed completed successfully!")
        print("  Admin Credentials: ADMIN001 / Admin@1234")
        print("  Voter Credentials: STU001–STU020 / Student@1234")


if __name__ == "__main__":
    seed()
