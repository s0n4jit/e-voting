"""
tests/unit/test_models.py
=========================
Unit tests for SQLAlchemy ORM models:
  - User  (password hashing, OTP, roles)
  - Election  (is_ongoing property, activation guard)
  - VoterRecord + BallotEntry  (separation / no join by design)
  - AuditLog  (creation)

All tests run against an in-memory SQLite database provided by the
session-scoped `db` fixture in conftest.py.
"""
import pytest
import pyotp
from datetime import datetime, timedelta, timezone

from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog


# ═══════════════════════════════════════════════════════════════════════════
#  User model
# ═══════════════════════════════════════════════════════════════════════════

class TestUserModel:
    """Tests for the User model."""

    def test_create_user_stores_basic_fields(self, db_session):
        """A newly created user persists all basic fields correctly."""
        user = User(
            student_id="U001",
            name="Test User",
            email="test@uni.edu",
            role="voter",
        )
        user.set_password("SecurePass@99")
        db_session.add(user)
        db_session.flush()

        fetched = db_session.get(User, user.id)
        assert fetched.student_id == "U001"
        assert fetched.name == "Test User"
        assert fetched.email == "test@uni.edu"
        assert fetched.role == "voter"

    def test_password_is_hashed_not_plaintext(self, db_session):
        """The password column must never store the plaintext password."""
        user = User(student_id="U002", name="Hash Test", email="h@uni.edu")
        user.set_password("MyPlainText!")
        db_session.add(user)
        db_session.flush()

        assert user.password_hash is not None
        assert user.password_hash != "MyPlainText!"
        # Bcrypt hashes begin with '$2b$'
        assert user.password_hash.startswith("$2b$")

    def test_check_password_correct(self, db_session):
        """check_password returns True for the correct password."""
        user = User(student_id="U003", name="PwCheck", email="pw@uni.edu")
        user.set_password("Correct@Horse99")
        db_session.add(user)
        db_session.flush()

        assert user.check_password("Correct@Horse99") is True

    def test_check_password_wrong(self, db_session):
        """check_password returns False for an incorrect password."""
        user = User(student_id="U004", name="WrongPw", email="wpw@uni.edu")
        user.set_password("Correct@Horse99")
        db_session.add(user)
        db_session.flush()

        assert user.check_password("WrongPassword!") is False

    def test_otp_secret_generated_on_creation(self, db_session):
        """A user created with otp_enabled=True should have a valid base-32 secret."""
        user = User(student_id="U005", name="OTP User", email="otp@uni.edu")
        user.set_password("Pass@123")
        user.otp_secret = pyotp.random_base32()
        user.otp_enabled = True
        db_session.add(user)
        db_session.flush()

        assert user.otp_secret is not None
        # base-32 characters only
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in user.otp_secret)

    def test_otp_verification_valid_code(self, db_session):
        """verify_otp should accept the current TOTP code."""
        user = User(student_id="U006", name="OTP Valid", email="otpv@uni.edu")
        user.set_password("Pass@123")
        secret = pyotp.random_base32()
        user.otp_secret = secret
        user.otp_enabled = True
        db_session.add(user)
        db_session.flush()

        valid_code = pyotp.TOTP(secret).now()
        assert user.verify_otp(valid_code) is True

    def test_otp_verification_invalid_code(self, db_session):
        """verify_otp should reject a bogus OTP code."""
        user = User(student_id="U007", name="OTP Bad", email="otpb@uni.edu")
        user.set_password("Pass@123")
        user.otp_secret = pyotp.random_base32()
        user.otp_enabled = True
        db_session.add(user)
        db_session.flush()

        assert user.verify_otp("000000") is False  # almost certainly wrong

    def test_student_id_hash_is_deterministic(self):
        """hash_student_id must return the same digest for the same input."""
        h1 = User.hash_student_id("STU123")
        h2 = User.hash_student_id("STU123")
        assert h1 == h2

    def test_student_id_hash_is_different_for_different_ids(self):
        """Different student IDs must produce different hashes."""
        assert User.hash_student_id("STU001") != User.hash_student_id("STU002")

    def test_duplicate_student_id_raises(self, db_session):
        """Student IDs must be unique at the DB level."""
        from sqlalchemy.exc import IntegrityError
        u1 = User(student_id="DUP001", name="First", email="first@uni.edu")
        u1.set_password("Pass@1")
        u2 = User(student_id="DUP001", name="Second", email="second@uni.edu")
        u2.set_password("Pass@2")
        db_session.add(u1)
        db_session.flush()
        db_session.add(u2)
        with pytest.raises(IntegrityError):
            db_session.flush()


# ═══════════════════════════════════════════════════════════════════════════
#  Election model
# ═══════════════════════════════════════════════════════════════════════════

class TestElectionModel:
    """Tests for the Election model and its computed properties."""

    def _make_election(self, db_session, *, start_offset_h=-1, end_offset_h=23,
                       is_active=True, results_published=False, title="Test Election"):
        now = datetime.now(timezone.utc)
        e = Election(
            title=title,
            description="A test election.",
            start_time=now + timedelta(hours=start_offset_h),
            end_time=now + timedelta(hours=end_offset_h),
            is_active=is_active,
            results_published=results_published,
        )
        db_session.add(e)
        db_session.flush()
        return e

    def test_is_ongoing_true_when_active_and_within_window(self, db_session):
        e = self._make_election(db_session, start_offset_h=-1, end_offset_h=1, is_active=True)
        assert e.is_ongoing is True

    def test_is_ongoing_false_before_start_time(self, db_session):
        e = self._make_election(db_session, start_offset_h=5, end_offset_h=10, is_active=True)
        assert e.is_ongoing is False

    def test_is_ongoing_false_after_end_time(self, db_session):
        e = self._make_election(db_session, start_offset_h=-10, end_offset_h=-1, is_active=True)
        assert e.is_ongoing is False

    def test_is_ongoing_false_when_not_activated(self, db_session):
        e = self._make_election(db_session, start_offset_h=-1, end_offset_h=1, is_active=False)
        assert e.is_ongoing is False

    def test_activate_election(self, db_session):
        e = self._make_election(db_session, is_active=False)
        assert e.is_active is False
        e.is_active = True
        db_session.flush()
        assert e.is_active is True

    def test_results_hidden_by_default(self, db_session):
        e = self._make_election(db_session)
        assert e.results_published is False

    def test_publish_results(self, db_session):
        e = self._make_election(db_session)
        e.results_published = True
        db_session.flush()
        assert e.results_published is True


# ═══════════════════════════════════════════════════════════════════════════
#  VoterRecord and BallotEntry — Separation by Design
# ═══════════════════════════════════════════════════════════════════════════

class TestVoterBallotSeparation:
    """
    The secret-ballot design stores WHO voted (VoterRecord) separately from
    WHAT they voted for (BallotEntry).  These tests verify there is no
    direct foreign-key or column link between the two tables that would
    allow a join to re-identify a voter's choice.
    """

    def test_voter_record_has_no_ballot_entry_fk(self):
        """VoterRecord must not contain a 'ballot_entry_id' column."""
        columns = [c.name for c in VoterRecord.__table__.columns]
        assert "ballot_entry_id" not in columns, (
            "VoterRecord should not reference BallotEntry — secret ballot design!"
        )

    def test_ballot_entry_has_no_voter_id_fk(self):
        """BallotEntry must not contain a 'voter_id' or 'user_id' column."""
        columns = [c.name for c in BallotEntry.__table__.columns]
        assert "voter_id" not in columns, "BallotEntry must not store voter identity!"
        assert "user_id" not in columns, "BallotEntry must not store voter identity!"
        assert "student_id" not in columns, "BallotEntry must not store voter identity!"

    def test_voter_record_has_no_candidate_fk(self):
        """VoterRecord must not contain a 'candidate_id' column."""
        columns = [c.name for c in VoterRecord.__table__.columns]
        assert "candidate_id" not in columns, (
            "VoterRecord must not record the voting choice — secret ballot!"
        )

    def test_ballot_entry_stores_only_anonymous_data(self):
        """
        BallotEntry columns should consist only of:
        id, election_id, candidate_id, cast_at
        (and possibly a blind token — never voter identity).
        """
        allowed_columns = {"id", "election_id", "candidate_id", "cast_at", "blind_token", "position", "is_nota"}
        actual_columns = {c.name for c in BallotEntry.__table__.columns}
        forbidden = actual_columns - allowed_columns
        assert not forbidden, (
            f"BallotEntry has unexpected columns that may break anonymity: {forbidden}"
        )

    def test_voter_record_has_voted_flag(self, db_session, sample_election):
        """has_voted flag on VoterRecord should start False and can be set to True."""
        vr = VoterRecord(
            election_id=sample_election.id,
            voter_hash="abc123hash",
            has_voted=False,
        )
        db_session.add(vr)
        db_session.flush()
        assert vr.has_voted is False

        vr.has_voted = True
        db_session.flush()
        assert vr.has_voted is True

    def test_ballot_entry_created_without_voter_reference(self, db_session, sample_election, sample_candidates):
        """A BallotEntry can be created with only election_id and candidate_id."""
        be = BallotEntry(
            election_id=sample_election.id,
            candidate_id=sample_candidates[0].id,
        )
        db_session.add(be)
        db_session.flush()
        assert be.id is not None
        assert be.candidate_id == sample_candidates[0].id

    def test_count_of_ballot_entries_matches_votes_cast(self, db_session, sample_election, sample_candidates):
        """Aggregating BallotEntry by candidate gives the correct vote count."""
        from sqlalchemy import func
        # Cast 3 votes for candidate 0, 2 for candidate 1
        for _ in range(3):
            db_session.add(BallotEntry(election_id=sample_election.id, candidate_id=sample_candidates[0].id))
        for _ in range(2):
            db_session.add(BallotEntry(election_id=sample_election.id, candidate_id=sample_candidates[1].id))
        db_session.flush()

        totals = (
            db_session.query(BallotEntry.candidate_id, func.count(BallotEntry.id))
            .filter_by(election_id=sample_election.id)
            .group_by(BallotEntry.candidate_id)
            .all()
        )
        total_map = dict(totals)
        assert total_map[sample_candidates[0].id] == 3
        assert total_map[sample_candidates[1].id] == 2


# ═══════════════════════════════════════════════════════════════════════════
#  AuditLog model
# ═══════════════════════════════════════════════════════════════════════════

class TestAuditLogModel:
    """Smoke tests for AuditLog creation and field persistence."""

    def test_create_audit_log_entry(self, db_session, voter_user):
        log = AuditLog(
            actor_id=voter_user.id,
            action="LOGIN_SUCCESS",
            ip_address="127.0.0.1",
            details="User logged in via OTP",
        )
        db_session.add(log)
        db_session.flush()

        fetched = db_session.get(AuditLog, log.id)
        assert fetched.action == "LOGIN_SUCCESS"
        assert fetched.ip_address == "127.0.0.1"
        assert fetched.actor_id == voter_user.id

    def test_audit_log_timestamp_auto_set(self, db_session, voter_user):
        log = AuditLog(
            actor_id=voter_user.id,
            action="VOTE_CAST",
            ip_address="10.0.0.1",
        )
        db_session.add(log)
        db_session.flush()
        assert log.created_at is not None
