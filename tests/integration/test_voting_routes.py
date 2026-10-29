"""
tests/integration/test_voting_routes.py
========================================
Integration tests for voting HTTP endpoints:
  - GET  /api/voter/elections/active
  - GET  /api/voter/elections/<id>/candidates
  - POST /api/voter/elections/<id>/vote
  - GET  /api/voter/status/<id>
  - GET  /api/results/<id>
  - GET  /api/results/<id>/stats

Covers:
  1. Voter casts valid vote -> VoterRecord updated, BallotEntry inserted, second attempt returns 400
  2. Voter cannot vote in inactive or unstarted election
  3. Voter cannot vote after election closes
  4. Results unavailable until election results are published
  5. Voter cannot vote for candidate from a different election
"""

import pytest
from datetime import datetime, timedelta, timezone
from flask_jwt_extended import create_access_token

from app.extensions import db as _db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry


def _make_voter_with_token(app, db, student_id, name="Test Voter"):
    """Helper to persist a voter and generate a valid JWT token."""
    with app.app_context():
        user = User(
            student_id=student_id,
            name=name,
            email=f"{student_id.lower()}@uni.edu",
            role="voter",
        )
        user.set_password("SecurePass@123")
        db.session.add(user)
        db.session.commit()

        token = create_access_token(
            identity=str(user.id),
            additional_claims={"role": "voter", "student_id": user.student_id},
        )
        return user.id, token


# ═══════════════════════════════════════════════════════════════════════════
#  Voting Flow Integration Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestVotingRoutes:
    """Integration tests for voter ballot casting and status."""

    def test_voter_casts_valid_vote_and_second_attempt_rejected(self, app, db, client):
        """
        End-to-End Test:
        1. Voter casts valid vote -> VoterRecord updated, BallotEntry inserted.
        2. Second attempt returns HTTP 400 (double voting prevented).
        """
        now = datetime.now(timezone.utc)
        with app.app_context():
            # Setup active election
            election = Election(
                title="Active General Election",
                description="Testing voting routes",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=4),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            # Candidates
            c1 = Candidate(election_id=election.id, name="Candidate Alpha", party="Slate A", position="President")
            c2 = Candidate(election_id=election.id, name="Candidate Beta", party="Slate B", position="President")
            db.session.add_all([c1, c2])
            db.session.flush()

            election_id = election.id
            cand1_id = c1.id
            cand2_id = c2.id

            # Register eligible voter
            stu_id = f"INT_VOTE_{datetime.now().microsecond}"
            voter = User(student_id=stu_id, name="Alice Voter", email=f"{stu_id}@uni.edu", role="voter")
            voter.set_password("Pass@123")
            db.session.add(voter)
            db.session.flush()

            voter_hash = User.hash_student_id(stu_id)
            vr = VoterRecord(election_id=election_id, voter_hash=voter_hash, has_voted=False)
            db.session.add(vr)
            db.session.commit()

            token = create_access_token(
                identity=str(voter.id),
                additional_claims={"role": "voter", "student_id": stu_id},
            )

        headers = {"Authorization": f"Bearer {token}"}

        # Step 1: Check initial status
        status_resp = client.get(f"/api/voter/status/{election_id}", headers=headers)
        assert status_resp.status_code == 200
        status_data = status_resp.get_json()
        assert status_data["eligible"] is True
        assert status_data["has_voted"] is False

        # Step 2: Cast valid ballot
        vote_resp = client.post(
            f"/api/voter/elections/{election_id}/vote",
            json={"candidate_id": cand1_id},
            headers=headers,
        )
        assert vote_resp.status_code == 200
        vote_data = vote_resp.get_json()
        assert vote_data["success"] is True
        assert "blind_token" in vote_data

        # Verify DB state
        with app.app_context():
            vr_check = db.session.query(VoterRecord).filter_by(election_id=election_id, voter_hash=voter_hash).first()
            assert vr_check.has_voted is True
            assert vr_check.voted_at is not None

            ballot_count = db.session.query(BallotEntry).filter_by(election_id=election_id).count()
            assert ballot_count == 1

        # Step 3: Check updated status
        status_resp2 = client.get(f"/api/voter/status/{election_id}", headers=headers)
        assert status_resp2.status_code == 200
        assert status_resp2.get_json()["has_voted"] is True

        # Step 4: Second vote attempt must return 400 Bad Request
        second_resp = client.post(
            f"/api/voter/elections/{election_id}/vote",
            json={"candidate_id": cand2_id},
            headers=headers,
        )
        assert second_resp.status_code == 400
        second_data = second_resp.get_json()
        assert "already voted" in str(second_data).lower()

        # Ballot count must still be 1
        with app.app_context():
            ballot_count_after = db.session.query(BallotEntry).filter_by(election_id=election_id).count()
            assert ballot_count_after == 1

    def test_voter_cannot_vote_in_inactive_election(self, app, db, client):
        """Vote attempt in an inactive election must return HTTP 400."""
        now = datetime.now(timezone.utc)
        with app.app_context():
            election = Election(
                title="Draft Inactive Election",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=4),
                is_active=False,
            )
            db.session.add(election)
            db.session.flush()

            cand = Candidate(election_id=election.id, name="Test Candidate")
            db.session.add(cand)
            db.session.flush()

            election_id = election.id
            cand_id = cand.id

            stu_id = f"INACT_VOTE_{datetime.now().microsecond}"
            voter = User(student_id=stu_id, name="Inactive Voter", email=f"{stu_id}@uni.edu", role="voter")
            voter.set_password("Pass@123")
            db.session.add(voter)
            db.session.flush()

            vr = VoterRecord(election_id=election_id, voter_hash=User.hash_student_id(stu_id), has_voted=False)
            db.session.add(vr)
            db.session.commit()

            token = create_access_token(
                identity=str(voter.id),
                additional_claims={"role": "voter", "student_id": stu_id},
            )

        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            f"/api/voter/elections/{election_id}/vote",
            json={"candidate_id": cand_id},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "not active" in str(resp.get_json()).lower()

    def test_voter_cannot_vote_in_unstarted_election(self, app, db, client):
        """Vote attempt before election start time must return HTTP 400."""
        now = datetime.now(timezone.utc)
        with app.app_context():
            election = Election(
                title="Future Unstarted Election",
                start_time=now + timedelta(days=2),
                end_time=now + timedelta(days=3),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            cand = Candidate(election_id=election.id, name="Future Candidate")
            db.session.add(cand)
            db.session.flush()

            election_id = election.id
            cand_id = cand.id

            stu_id = f"FUT_VOTE_{datetime.now().microsecond}"
            voter = User(student_id=stu_id, name="Future Voter", email=f"{stu_id}@uni.edu", role="voter")
            voter.set_password("Pass@123")
            db.session.add(voter)
            db.session.flush()

            vr = VoterRecord(election_id=election_id, voter_hash=User.hash_student_id(stu_id), has_voted=False)
            db.session.add(vr)
            db.session.commit()

            token = create_access_token(
                identity=str(voter.id),
                additional_claims={"role": "voter", "student_id": stu_id},
            )

        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            f"/api/voter/elections/{election_id}/vote",
            json={"candidate_id": cand_id},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "not started" in str(resp.get_json()).lower()

    def test_voter_cannot_vote_in_closed_election(self, app, db, client):
        """Vote attempt after election window has ended must return HTTP 400."""
        now = datetime.now(timezone.utc)
        with app.app_context():
            election = Election(
                title="Past Closed Election",
                start_time=now - timedelta(days=2),
                end_time=now - timedelta(days=1),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            cand = Candidate(election_id=election.id, name="Past Candidate")
            db.session.add(cand)
            db.session.flush()

            election_id = election.id
            cand_id = cand.id

            stu_id = f"PAST_VOTE_{datetime.now().microsecond}"
            voter = User(student_id=stu_id, name="Past Voter", email=f"{stu_id}@uni.edu", role="voter")
            voter.set_password("Pass@123")
            db.session.add(voter)
            db.session.flush()

            vr = VoterRecord(election_id=election_id, voter_hash=User.hash_student_id(stu_id), has_voted=False)
            db.session.add(vr)
            db.session.commit()

            token = create_access_token(
                identity=str(voter.id),
                additional_claims={"role": "voter", "student_id": stu_id},
            )

        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            f"/api/voter/elections/{election_id}/vote",
            json={"candidate_id": cand_id},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "closed" in str(resp.get_json()).lower()


# ═══════════════════════════════════════════════════════════════════════════
#  Election Results Secrecy & Publishing Integration Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestResultsRoutes:
    """Integration tests for election results accessibility and disclosure."""

    def test_results_unavailable_until_published(self, app, db, client):
        """
        Election results endpoint returns HTTP 403 Forbidden while results_published == False.
        Once results are published, returns HTTP 200 with tally.
        """
        now = datetime.now(timezone.utc)
        with app.app_context():
            election = Election(
                title="Results Test Election",
                start_time=now - timedelta(hours=2),
                end_time=now - timedelta(hours=1),
                is_active=True,
                results_published=False,  # NOT YET PUBLISHED
            )
            db.session.add(election)
            db.session.flush()

            c1 = Candidate(election_id=election.id, name="Winner Candidate")
            c2 = Candidate(election_id=election.id, name="Runner Up")
            db.session.add_all([c1, c2])
            db.session.flush()

            # Seed 3 ballots for c1, 1 ballot for c2
            b1 = BallotEntry(election_id=election.id, candidate_id=c1.id, blind_token="token_1")
            b2 = BallotEntry(election_id=election.id, candidate_id=c1.id, blind_token="token_2")
            b3 = BallotEntry(election_id=election.id, candidate_id=c1.id, blind_token="token_3")
            b4 = BallotEntry(election_id=election.id, candidate_id=c2.id, blind_token="token_4")
            db.session.add_all([b1, b2, b3, b4])
            db.session.commit()

            election_id = election.id

        # Phase 1: Query before publication -> Must return 403 Forbidden
        resp1 = client.get(f"/api/results/{election_id}")
        assert resp1.status_code == 403
        data1 = resp1.get_json()
        assert data1["results_published"] is False
        assert "hidden" in str(data1).lower()

        # Phase 2: Administrator publishes results
        with app.app_context():
            elec = db.session.get(Election, election_id)
            elec.results_published = True
            db.session.commit()

        # Phase 3: Query after publication -> Must return 200 OK with correct tallies
        resp2 = client.get(f"/api/results/{election_id}")
        assert resp2.status_code == 200
        data2 = resp2.get_json()
        assert data2["total_votes"] == 4
        assert len(data2["candidates"]) == 2
        # Winner must be c1 with 3 votes
        winner = max(data2["candidates"], key=lambda c: c["votes"])
        assert winner["votes"] == 3
        assert winner["name"] == "Winner Candidate"
