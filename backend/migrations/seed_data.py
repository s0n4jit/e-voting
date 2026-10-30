"""
migrations/seed_data.py — Campus Student Union Election Seed Script.

Configures:
  - 1 Election: "General Election of the Student Union 2026-27"
  - 9 Realistic Student Union Positions (3-4 candidates each):
      1. Vice President
      2. General Secretary
      3. Assistant General Secretary
      4. Cultural Secretary
      5. Magazine Secretary
      6. Boys Common Room Secretary
      7. Girls Common Room Secretary
      8. Major Games Secretary
      9. Minor Games Secretary
  - 1 Chief Election Administrator: ADMIN001 / Admin@1234
  - 2 Polling Desk Officers: DESK001 & DESK002 / Desk@1234
  - 20 Sample Enrolled Voters: STU001–STU020 / Student@1234
"""

import sys
import os

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.voting_token import VotingToken
from app.services.otp_service import OTPService


def seed():
    app = create_app()
    with app.app_context():
        print("🌱 Seeding Campus Student Union Election 2026-27...")

        # ── 1. Clean up old/extraneous elections ───────────────────────────────
        target_title = "General Election of the Student Union 2026-27"
        old_elections = Election.query.filter(Election.title != target_title).all()
        for old_e in old_elections:
            print(f"  🗑️ Removing old election: '{old_e.title}' (ID {old_e.id})")
            BallotEntry.query.filter_by(election_id=old_e.id).delete()
            VotingToken.query.filter_by(election_id=old_e.id).delete()
            VoterRecord.query.filter_by(election_id=old_e.id).delete()
            Candidate.query.filter_by(election_id=old_e.id).delete()
            db.session.delete(old_e)
        db.session.commit()

        # ── 2. Election Administrator (Chief Election Officer) ─────────────────
        admin = User.query.filter_by(student_id="ADMIN001").first()
        if not admin:
            admin = User(
                student_id="ADMIN001",
                name="Prof. D. K. Sharma (Chief Election Officer)",
                email="election.officer@campus.edu",
                role="admin",
                department="Election Commission",
                year=None,
                is_admin=True,
                is_active=True,
                otp_secret=OTPService.generate_secret(),
                otp_enabled=True,
            )
            admin.set_password("Admin@1234")
            db.session.add(admin)
            db.session.flush()
            print("  ✓ Created Election Officer: ADMIN001 (Admin@1234)")
        else:
            admin.name = "Prof. D. K. Sharma (Chief Election Officer)"
            admin.role = "admin"
            admin.is_admin = True
            admin.set_password("Admin@1234")
            print("  ℹ Updated Election Officer: ADMIN001")

        # ── 3. Polling Desk Officers (Minimal Capability Staff) ───────────────
        desk_officers_data = [
            {
                "id": "DESK001",
                "name": "Ananya Barman (Desk Officer 1)",
                "email": "desk001@campus.edu",
                "dept": "Polling Desk A (Auditorium)",
            },
            {
                "id": "DESK002",
                "name": "Bikash Saikia (Desk Officer 2)",
                "email": "desk002@campus.edu",
                "dept": "Polling Desk B (Library Lobby)",
            },
        ]

        for do in desk_officers_data:
            desk_user = User.query.filter_by(student_id=do["id"]).first()
            if not desk_user:
                desk_user = User(
                    student_id=do["id"],
                    name=do["name"],
                    email=do["email"],
                    role="polling_officer",
                    department=do["dept"],
                    is_admin=False,
                    is_active=True,
                    otp_secret=OTPService.generate_secret(),
                    otp_enabled=True,
                )
                desk_user.set_password("Desk@1234")
                db.session.add(desk_user)
                print(f"  ✓ Created Polling Desk Officer: {do['id']} (Desk@1234)")
            else:
                desk_user.role = "polling_officer"
                desk_user.name = do["name"]
                desk_user.set_password("Desk@1234")
                print(f"  ℹ Updated Polling Desk Officer: {do['id']}")

        # ── 4. Main Student Union Election ─────────────────────────────────────
        now = datetime.now(timezone.utc)
        election = Election.query.filter_by(title=target_title).first()
        if not election:
            election = Election(
                title=target_title,
                description=(
                    "Official General Election of the Student Union (2026–27). "
                    "Under college statutes, the Principal presides as ex-officio Union President. "
                    "Students elect representatives across 9 executive portfolios by single-choice secret ballot. "
                    "NOTA (None of the Above) is enabled for each position."
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
            election.is_active = True
            election.start_time = now - timedelta(days=1)
            election.end_time = now + timedelta(days=7)
            election.description = (
                "Official General Election of the Student Union (2026–27). "
                "Under college statutes, the Principal presides as ex-officio Union President. "
                "Students elect representatives across 9 executive portfolios by single-choice secret ballot. "
                "NOTA (None of the Above) is enabled for each position."
            )
            print(f"  ℹ Using existing Election: '{election.title}' (ID: {election.id})")

        # ── 5. Candidates across 9 Executive Portfolios (3-4 per position) ─────
        candidates_data = [
            # 1. Vice President (3 candidates)
            {
                "name": "Manash Pratim Das",
                "position": "Vice President",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Political Science",
                "bio": "Championing student welfare, transparent administrative dialogue, and hostel facility upgrades.",
                "photo_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300",
            },
            {
                "name": "Debasish Kalita",
                "position": "Vice President",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Economics",
                "bio": "Focused on subsidized cafeteria meals, career development cells, and active student representation.",
                "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300",
            },
            {
                "name": "Nabanita Medhi",
                "position": "Vice President",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of History",
                "bio": "Advocating for campus inclusivity, modern seminar halls, and mental health counseling support.",
                "photo_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300",
            },

            # 2. General Secretary (4 candidates)
            {
                "name": "Nilay Rabha",
                "position": "General Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Computer Science",
                "bio": "Pioneering high-speed campus Wi-Fi, 24/7 computer labs, and digitized student grievance tracking.",
                "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300",
            },
            {
                "name": "Digambor Rabha",
                "position": "General Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Political Science",
                "bio": "Committed to timely semester book deliveries, bus concession passes, and student empowerment.",
                "photo_url": "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300",
            },
            {
                "name": "Jyotirmoy Barua",
                "position": "General Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Physics",
                "bio": "Dedicated to merit scholarships, transparent union budget audits, and environmental green campus drives.",
                "photo_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300",
            },
            {
                "name": "Kalyan Jyoti Nath",
                "position": "General Secretary",
                "party": "Independent Campus Vanguard",
                "department": "Department of Mathematics",
                "bio": "Independent voice for students, free of external politics, focusing strictly on academic excellence.",
                "photo_url": "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300",
            },

            # 3. Assistant General Secretary (3 candidates)
            {
                "name": "Raktim Goswami",
                "position": "Assistant General Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Chemistry",
                "bio": "Ensuring well-equipped laboratory chemicals, safety apparatus, and academic mentoring circles.",
                "photo_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300",
            },
            {
                "name": "Pankaj Hazarika",
                "position": "Assistant General Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Commerce",
                "bio": "Working to streamline internship fairs, industry guest lectures, and student welfare relief funds.",
                "photo_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300",
            },
            {
                "name": "Arunav Bora",
                "position": "Assistant General Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of English",
                "bio": "Fostering inter-departmental debating leagues, communication workshops, and student assistance.",
                "photo_url": "https://images.unsplash.com/photo-1463453091185-61582044d556?w=300",
            },

            # 4. Cultural Secretary (3 candidates)
            {
                "name": "Upasana Sarma",
                "position": "Cultural Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Assamese",
                "bio": "Promoting indigenous folk performing arts, annual youth festival dominance, and acoustic auditorium sound.",
                "photo_url": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300",
            },
            {
                "name": "Subhalaxmi Deka",
                "position": "Cultural Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Philosophy",
                "bio": "Envisioning inter-college music battles, drama festivals, and campus cultural talent identification.",
                "photo_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300",
            },
            {
                "name": "Tanmayee Mahanta",
                "position": "Cultural Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of English",
                "bio": "Championing classical music circles, fine arts exhibitions, and student film clubs.",
                "photo_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300",
            },

            # 5. Magazine Secretary (3 candidates)
            {
                "name": "Padmini Khakhalary",
                "position": "Magazine Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Computer Science",
                "bio": "Revamping the college annual magazine with digital e-editions, student poetry, and investigative features.",
                "photo_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300",
            },
            {
                "name": "Prastuti Dutta",
                "position": "Magazine Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of English",
                "bio": "Advocating bilingual literary sections, student research papers, and creative writing contests.",
                "photo_url": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=300",
            },
            {
                "name": "Barun Kashyap",
                "position": "Magazine Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Education",
                "bio": "Committed to timely printed magazine circulation for every single enrolled student before semester end.",
                "photo_url": "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=300",
            },

            # 6. Boys Common Room Secretary (3 candidates)
            {
                "name": "Bishal Chetia",
                "position": "Boys Common Room Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Botany",
                "bio": "Upgrading table tennis boards, installing water coolers, and ensuring daily newspaper subscriptions.",
                "photo_url": "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300",
            },
            {
                "name": "Himangshu Roy",
                "position": "Boys Common Room Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Zoology",
                "bio": "Repairing common room seating, installing carrom boards, and ensuring hygiene and fan maintenance.",
                "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300",
            },
            {
                "name": "Dipankar Lahkar",
                "position": "Boys Common Room Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Geography",
                "bio": "Creating a calm study-cum-recreation corner with proper lighting and first aid facilities.",
                "photo_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300",
            },

            # 7. Girls Common Room Secretary (3 candidates)
            {
                "name": "Bandana Chutia",
                "position": "Girls Common Room Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Chemistry",
                "bio": "Installing automated sanitary vending & disposal units, clean washrooms, and private reading cubicles.",
                "photo_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300",
            },
            {
                "name": "Snigdha Barman",
                "position": "Girls Common Room Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Statistics",
                "bio": "Demanding full-time cleanliness attendants, emergency medicine kits, and cozy recreation spaces.",
                "photo_url": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300",
            },
            {
                "name": "Mousumi Das",
                "position": "Girls Common Room Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Botany",
                "bio": "Advocating for 24/7 security near common room entrances and indoor badminton shuttle kits.",
                "photo_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300",
            },

            # 8. Major Games Secretary (3 candidates)
            {
                "name": "Sahil Ali",
                "position": "Major Games Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Economics",
                "bio": "Leveling the campus football ground, purchasing professional cricket gear, and organizing annual sports meet.",
                "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300",
            },
            {
                "name": "Partha Pratim Talukdar",
                "position": "Major Games Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Commerce",
                "bio": "Securing university sports quotas, floodlit volleyball court renovation, and certified coach tie-ups.",
                "photo_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300",
            },
            {
                "name": "Bedabrat Tamuly",
                "position": "Major Games Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Political Science",
                "bio": "Dedicated sports kits for girls' football & cricket teams, and nutritious diet allowances during tournaments.",
                "photo_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300",
            },

            # 9. Minor Games Secretary (3 candidates)
            {
                "name": "Hrishikesh Boro",
                "position": "Minor Games Secretary",
                "party": "Progressive Students' Union (PSU)",
                "department": "Department of Physics",
                "bio": "Organizing college chess championships, indoor table tennis leagues, and carrom tournaments.",
                "photo_url": "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300",
            },
            {
                "name": "Chiranjib Nath",
                "position": "Minor Games Secretary",
                "party": "All Campus Students' Front (ACSF)",
                "department": "Department of Mathematics",
                "bio": "Procuring FIDE-standard chess clocks, tournament-grade carrom strikers, and arm-wrestling benches.",
                "photo_url": "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=300",
            },
            {
                "name": "Rupjyoti Gogoi",
                "position": "Minor Games Secretary",
                "party": "Students' Democratic Initiative (SDI)",
                "department": "Department of Philosophy",
                "bio": "Promoting mind games, e-sports gaming tournaments, and inter-departmental badminton duels.",
                "photo_url": "https://images.unsplash.com/photo-1463453091185-61582044d556?w=300",
            },
        ]

        # Reset candidate table for this election to make sure it matches the 9 positions cleanly
        Candidate.query.filter_by(election_id=election.id).delete()
        db.session.flush()

        for c in candidates_data:
            cand = Candidate(
                election_id=election.id,
                name=c["name"],
                position=c["position"],
                party=c["party"],
                department=c["department"],
                bio=c["bio"],
                photo_url=c["photo_url"],
            )
            db.session.add(cand)

        db.session.flush()
        print(f"  ✓ Populated {len(candidates_data)} candidates across 9 official Student Union portfolios.")

        # ── 6. 20 Sample Voters (STU001 – STU020) ─────────────────────────────
        departments = [
            "Department of Computer Science",
            "Department of Political Science",
            "Department of Economics",
            "Department of Chemistry",
            "Department of Physics",
            "Department of Commerce",
        ]

        whitelisted_count = 0
        for i in range(1, 21):
            sid = f"STU{i:03d}"
            email = f"student{i:03d}@campus.edu"
            dept = departments[(i - 1) % len(departments)]
            year = ((i - 1) % 3) + 1

            voter = User.query.filter_by(student_id=sid).first()
            if not voter:
                voter = User(
                    student_id=sid,
                    name=f"Student Voter {i:02d}",
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

            # Whitelist voter in VoterRecord
            v_hash = User.hash_student_id(sid)
            vr = VoterRecord.query.filter_by(election_id=election.id, voter_hash=v_hash).first()
            if not vr:
                vr = VoterRecord(
                    election_id=election.id,
                    voter_hash=v_hash,
                    has_voted=False,
                )
                db.session.add(vr)
                whitelisted_count += 1
            else:
                vr.has_voted = False
                whitelisted_count += 1

        db.session.commit()
        print(f"  ✓ {whitelisted_count} sample voters whitelisted and refreshed for '{election.title}'.")

        print("\n" + "=" * 70)
        print("🎉 CAMPUS ELECTION SEEDING COMPLETE!")
        print("=" * 70)
        print("  Election: 'General Election of the Student Union 2026-27' (Only Active Election)")
        print("  Positions (9 Total, 3-4 Candidates Each + NOTA):")
        print("    1. Vice President")
        print("    2. General Secretary")
        print("    3. Assistant General Secretary")
        print("    4. Cultural Secretary")
        print("    5. Magazine Secretary")
        print("    6. Boys Common Room Secretary")
        print("    7. Girls Common Room Secretary")
        print("    8. Major Games Secretary")
        print("    9. Minor Games Secretary")
        print("-" * 70)
        print("  Credentials:")
        print("    Chief Election Officer (Admin): ADMIN001 / Admin@1234")
        print("    Polling Desk Officer 1:        DESK001  / Desk@1234")
        print("    Polling Desk Officer 2:        DESK002  / Desk@1234")
        print("    Enrolled Voters:               STU001 to STU020 / Student@1234")
        print("=" * 70)


if __name__ == "__main__":
    seed()
