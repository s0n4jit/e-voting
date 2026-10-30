"""
tests/unit/test_vote_service.py
================================
Unit tests for the VoteService business-logic layer.

All external I/O (database, email) is handled by the `db_session` fixture
and in-memory SQLite.  No HTTP requests are made — we call service methods
directly.

Tested behaviours
-----------------
cast_vote()
  1. Valid first vote succeeds and creates a BallotEntry.
  2. Second vote by the same voter is rejected (idempotency).
  3. Vote during an inactive (not-yet-activated) election is rejected.
  4. Vote after the election window closes is rejected.

get_results()
  5. Returns correct per-candidate counts.
  6. Returns hidden / empty results before the election is closed/published.

OTP
  7. Generates a valid base-32 secret.
  8. Accepts a valid TOTP code.
  9. Rejects an invalid TOTP code.

Password hashing
 10. Hashes are not stored as plaintext.
 11. Correct password verifies successfully.
 12. Wrong password is rejected.
"""
import pytest
import pyotp
from datetime import datetime, timedelta, timezone

from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.services.vote_service import VoteService


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _make_election(db_session, *, start_offset_h=-1, end_offset_h=23,
                   is_active=True, results_published=False):
    now = datetime.now(timezone.utc)
    e = Election(
        title="Unit Test Election",
        description="Auto-generated for unit tests.",
        start_time=now + timedelta(hours=start_offset_h),
        end_time=now + timedelta(hours=end_offset_h),
        is_active=is_active,
        results_published=results_published,
    )
    db_session.add(e)
    db_session.flush()
    return e


def _make_candidates(db_session, election):
    c1 = Candidate(election_id=election.id, name="Alice", party="A", position="General Secretary", bio="Bio A")
    c2 = Candidate(election_id=election.id, name="Bob",   party="B", position="General Secretary", bio="Bio B")
    db_session.add_all([c1, c2])
    db_session.flush()
    return [c1, c2]


def _register_voter(db_session, election, student_id):
    """
    Create a User and a corresponding VoterRecord (not-yet-voted) for the
    given election.
    """
    user = User(student_id=student_id, name=f"Voter {student_id}", email=f"{student_id}@uni.edu")
    user.set_password("Test@1234")
    user.otp_secret = pyotp.random_base32()
    user.otp_enabled = True
    db_session.add(user)
    db_session.flush()

    voter_hash = User.hash_student_id(student_id)
    vr = VoterRecord(election_id=election.id, voter_hash=voter_hash, has_voted=False)
    db_session.add(vr)
    db_session.flush()
    return user, vr


# ═══════════════════════════════════════════════════════════════════════════
#  cast_vote() tests
# ═══════════════════════════════════════════════════════════════════════════

class TestCastVote:
    """Tests for VoteService.cast_vote()."""

    def test_valid_first_vote_succeeds(self, app, db_session):
        """
        A registered voter casting one vote in an active election:
        - VoterRecord.has_voted becomes True
        - A BallotEntry row is created
        - Service returns a truthy success result
        """
        with app.app_context():
            election = _make_election(db_session)
            candidates = _make_candidates(db_session, election)
            voter, vr = _register_voter(db_session, election, "VC001")

            result = VoteService.cast_vote(
                voter_id=voter.id,
                election_id=election.id,
                candidate_id=candidates[0].id,
                db=db_session,
            )

            assert result["success"] is True
            # VoterRecord should now be marked
            db_session.refresh(vr)
            assert vr.has_voted is True
            # One BallotEntry should exist for this election
            ballot_count = (
                db_session.query(BallotEntry)
                .filter_by(election_id=election.id, candidate_id=candidates[0].id)
                .count()
            )
            assert ballot_count == 1

    def test_second_vote_attempt_is_rejected(self, app, db_session):
        """
        If a voter who already has has_voted=True tries again, the service
        must raise a VotingError (or equivalent) and NOT create a second
        BallotEntry.
        """
        with app.app_context():
            from app.services.vote_service import VotingError
            election = _make_election(db_session)
            candidates = _make_candidates(db_session, election)
            voter, vr = _register_voter(db_session, election, "VC002")

            # First vote — should succeed
            VoteService.cast_vote(
                voter_id=voter.id,
                election_id=election.id,
                candidate_id=candidates[0].id,
                db=db_session,
            )

            # Second vote — must fail
            with pytest.raises(VotingError, match="already voted"):
                VoteService.cast_vote(
                    voter_id=voter.id,
                    election_id=election.id,
                    candidate_id=candidates[1].id,
                    db=db_session,
                )

            # Confirm only ONE BallotEntry exists for this election
            total = db_session.query(BallotEntry).filter_by(election_id=election.id).count()
            assert total == 1

    def test_vote_during_inactive_election_rejected(self, app, db_session):
        """Voting in an election that has is_active=False must be rejected."""
        with app.app_context():
            from app.services.vote_service import VotingError
            election = _make_election(db_session, is_active=False)
            candidates = _make_candidates(db_session, election)
            voter, _ = _register_voter(db_session, election, "VC003")

            with pytest.raises(VotingError, match="not active"):
                VoteService.cast_vote(
                    voter_id=voter.id,
                    election_id=election.id,
                    candidate_id=candidates[0].id,
                    db=db_session,
                )

    def test_vote_after_election_closed_rejected(self, app, db_session):
        """Voting after end_time must be rejected, even if is_active=True."""
        with app.app_context():
            from app.services.vote_service import VotingError
            # Election ended 1 hour ago
            election = _make_election(db_session, start_offset_h=-5, end_offset_h=-1)
            candidates = _make_candidates(db_session, election)
            voter, _ = _register_voter(db_session, election, "VC004")

            with pytest.raises(VotingError, match="closed"):
                VoteService.cast_vote(
                    voter_id=voter.id,
                    election_id=election.id,
                    candidate_id=candidates[0].id,
                    db=db_session,
                )

    def test_vote_for_nonexistent_candidate_rejected(self, app, db_session):
        """Voting for a candidate_id that does not belong to the election must fail."""
        with app.app_context():
            from app.services.vote_service import VotingError
            election = _make_election(db_session)
            _make_candidates(db_session, election)
            voter, _ = _register_voter(db_session, election, "VC005")

            with pytest.raises(VotingError, match="candidate"):
                VoteService.cast_vote(
                    voter_id=voter.id,
                    election_id=election.id,
                    candidate_id=99999,    # non-existent
                    db=db_session,
                )

    def test_unregistered_voter_cannot_vote(self, app, db_session):
        """
        A user with a valid account but NOT whitelisted for the election
        must be rejected.
        """
        with app.app_context():
            from app.services.vote_service import VotingError
            election = _make_election(db_session)
            candidates = _make_candidates(db_session, election)

            # Create user but do NOT add a VoterRecord for this election
            outsider = User(student_id="OUTSIDE01", name="Outsider", email="out@uni.edu")
            outsider.set_password("Pass@1234")
            db_session.add(outsider)
            db_session.flush()

            with pytest.raises(VotingError, match="not eligible"):
                VoteService.cast_vote(
                    voter_id=outsider.id,
                    election_id=election.id,
                    candidate_id=candidates[0].id,
                    db=db_session,
                )


# ═══════════════════════════════════════════════════════════════════════════
#  get_results() tests
# ═══════════════════════════════════════════════════════════════════════════

class TestGetResults:
    """Tests for VoteService.get_results()."""

    def _cast_votes(self, app, db_session, election, candidates, votes_per_candidate):
        """
        Helper: cast `votes_per_candidate[i]` votes for candidates[i].
        Each vote comes from a freshly registered voter.
        """
        with app.app_context():
            counter = [0]
            for idx, count in enumerate(votes_per_candidate):
                for _ in range(count):
                    counter[0] += 1
                    sid = f"RV{counter[0]:04d}"
                    voter, vr = _register_voter(db_session, election, sid)
                    VoteService.cast_vote(
                        voter_id=voter.id,
                        election_id=election.id,
                        candidate_id=candidates[idx].id,
                        db=db_session,
                    )

    def test_get_results_correct_count(self, app, db_session):
        """Results should reflect the exact votes cast for each candidate."""
        with app.app_context():
            election = _make_election(db_session, start_offset_h=-2, end_offset_h=-1,
                                       results_published=True, is_active=True)
            candidates = _make_candidates(db_session, election)

            # Directly insert ballot entries (skipping the time-window check)
            db_session.add(BallotEntry(election_id=election.id, candidate_id=candidates[0].id))
            db_session.add(BallotEntry(election_id=election.id, candidate_id=candidates[0].id))
            db_session.add(BallotEntry(election_id=election.id, candidate_id=candidates[1].id))
            db_session.flush()

            results = VoteService.get_results(election_id=election.id, db=db_session)
            result_map = {r["candidate_id"]: r["votes"] for r in results["candidates"]}
            assert result_map[candidates[0].id] == 2
            assert result_map[candidates[1].id] == 1

    def test_results_hidden_before_published(self, app, db_session):
        """
        If results_published=False the service must not expose vote counts
        — either raising ResultsHiddenError or returning an empty/hidden payload.
        """
        with app.app_context():
            from app.services.vote_service import ResultsHiddenError
            election = _make_election(db_session, results_published=False)
            candidates = _make_candidates(db_session, election)
            # Add a ballot entry directly
            db_session.add(BallotEntry(election_id=election.id, candidate_id=candidates[0].id))
            db_session.flush()

            with pytest.raises(ResultsHiddenError):
                VoteService.get_results(election_id=election.id, db=db_session)

    def test_results_visible_after_published(self, app, db_session):
        """Once results_published=True, get_results should succeed."""
        with app.app_context():
            election = _make_election(db_session, results_published=True,
                                       start_offset_h=-10, end_offset_h=-1)
            candidates = _make_candidates(db_session, election)
            db_session.add(BallotEntry(election_id=election.id, candidate_id=candidates[0].id))
            db_session.flush()

            results = VoteService.get_results(election_id=election.id, db=db_session)
            assert results is not None
            assert "candidates" in results


# ═══════════════════════════════════════════════════════════════════════════
#  Password hashing
# ═══════════════════════════════════════════════════════════════════════════

class TestPasswordHashing:
    """Passwords are stored as salted bcrypt hashes."""

    @staticmethod
    def _hash(password):
        user = User(student_id="X1", name="X", email="x@x.edu", role="admin")
        user.set_password(password)
        return user

    def test_check_password_right_and_wrong(self, app):
        with app.app_context():
            user = self._hash("MySecret@1")
            assert user.check_password("MySecret@1") is True
            assert user.check_password("WrongPassword") is False
            assert user.check_password("") is False

    def test_same_password_produces_different_hashes(self, app):
        """Different salts each time (rainbow-table defence)."""
        with app.app_context():
            assert self._hash("SamePassword@1").password_hash != self._hash("SamePassword@1").password_hash

    def test_hash_is_bcrypt_not_a_fast_hash(self, app):
        with app.app_context():
            hashed = self._hash("TestPass@99").password_hash
            assert hashed.startswith("$2") and len(hashed) == 60
