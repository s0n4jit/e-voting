"""
conftest.py — pytest shared fixtures for the Campus e-Voting System
=====================================================================
Provides:
  - app / client / db              : Flask test application and DB
  - admin_token / voter_token      : pre-issued JWTs
  - sample_election                : an active Election row
  - sample_candidates              : two Candidate rows
  - sample_voters                  : two Voter (User) rows
"""
import pytest
import pyotp
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Lazily import the application factory so models are not imported at module
# level (avoids circular imports when the test suite is collected).
# ---------------------------------------------------------------------------
from app import create_app
from app.extensions import db as _db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog


# ── App / DB fixtures ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """Create a Flask application configured for the test session."""
    _app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "JWT_SECRET_KEY": "test-jwt-secret-key-do-not-use-in-production",
        "SECRET_KEY": "test-secret-key",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,          # disable rate-limiting in unit tests
        "MAIL_SUPPRESS_SEND": True,
        "BCRYPT_LOG_ROUNDS": 4,             # faster hashing during tests
    })
    yield _app


@pytest.fixture(scope="function")
def db(app):
    """Create all tables before each test and drop them after."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope="function")
def db_session(app, db):
    """Provide a clean scoped session for each test."""
    with app.app_context():
        yield _db.session


@pytest.fixture()
def client(app):
    """Flask test client."""
    with app.test_client() as c:
        yield c


# ── Helper: create or fetch a user ─────────────────────────────────────────

def _make_user(db_session, student_id, name, email, role="voter", password="TestPass@123"):
    user = User(
        student_id=student_id,
        name=name,
        email=email,
        role=role,
    )
    user.set_password(password)
    otp_secret = pyotp.random_base32()
    user.otp_secret = otp_secret
    user.otp_enabled = True
    db_session.add(user)
    db_session.flush()
    return user


# ── User / token fixtures ───────────────────────────────────────────────────

@pytest.fixture()
def admin_user(db_session):
    return _make_user(db_session, "ADM001", "Admin User", "admin@uni.edu", role="admin")


@pytest.fixture()
def voter_user(db_session):
    return _make_user(db_session, "STU001", "Alice Voter", "alice@uni.edu", role="voter")


@pytest.fixture()
def voter_user_2(db_session):
    return _make_user(db_session, "STU002", "Bob Voter", "bob@uni.edu", role="voter")


@pytest.fixture()
def admin_token(client, admin_user):
    """Return a valid JWT access token for the admin user."""
    resp = client.post("/api/auth/login", json={
        "student_id": admin_user.student_id,
        "password": "TestPass@123",
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.get_json()}"
    # Provide a valid TOTP code so the server issues a full JWT
    otp_code = pyotp.TOTP(admin_user.otp_secret).now()
    resp2 = client.post("/api/auth/verify-otp", json={
        "temp_token": resp.get_json()["temp_token"],
        "otp": otp_code,
    })
    assert resp2.status_code == 200, f"Admin OTP failed: {resp2.get_json()}"
    return resp2.get_json()["access_token"]


@pytest.fixture()
def voter_token(client, voter_user):
    """Return a valid JWT access token for a regular voter."""
    resp = client.post("/api/auth/login", json={
        "student_id": voter_user.student_id,
        "password": "TestPass@123",
    })
    assert resp.status_code == 200, f"Voter login failed: {resp.get_json()}"
    otp_code = pyotp.TOTP(voter_user.otp_secret).now()
    resp2 = client.post("/api/auth/verify-otp", json={
        "temp_token": resp.get_json()["temp_token"],
        "otp": otp_code,
    })
    assert resp2.status_code == 200, f"Voter OTP failed: {resp2.get_json()}"
    return resp2.get_json()["access_token"]


# ── Election / candidate fixtures ───────────────────────────────────────────

@pytest.fixture()
def sample_election(db_session):
    """An election that is currently ACTIVE."""
    now = datetime.now(timezone.utc)
    election = Election(
        title="Student Council Election 2025",
        description="Annual student council election.",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=23),
        is_active=True,
        results_published=False,
    )
    db_session.add(election)
    db_session.flush()
    return election


@pytest.fixture()
def closed_election(db_session):
    """An election whose window has already passed and results are published."""
    now = datetime.now(timezone.utc)
    election = Election(
        title="Closed Test Election 2024",
        description="A past election.",
        start_time=now - timedelta(days=2),
        end_time=now - timedelta(days=1),
        is_active=True,
        results_published=True,
    )
    db_session.add(election)
    db_session.flush()
    return election


@pytest.fixture()
def inactive_election(db_session):
    """An election that has NOT been activated yet by the admin."""
    now = datetime.now(timezone.utc)
    election = Election(
        title="Future Election 2026",
        description="Not yet started.",
        start_time=now + timedelta(days=5),
        end_time=now + timedelta(days=6),
        is_active=False,
        results_published=False,
    )
    db_session.add(election)
    db_session.flush()
    return election


@pytest.fixture()
def sample_candidates(db_session, sample_election):
    """Two candidates in the sample election."""
    c1 = Candidate(
        election_id=sample_election.id,
        name="Carol Smith",
        party="Student First Party",
        bio="A dedicated student leader.",
        position="President",
    )
    c2 = Candidate(
        election_id=sample_election.id,
        name="Dave Jones",
        party="Unity Party",
        bio="Committed to campus improvement.",
        position="President",
    )
    db_session.add_all([c1, c2])
    db_session.flush()
    return [c1, c2]


@pytest.fixture()
def sample_voters(db_session, sample_election):
    """
    Two voters whose student IDs are registered (whitelisted) for the
    sample election.
    """
    v1 = _make_user(db_session, "V001", "Voter One", "v1@uni.edu")
    v2 = _make_user(db_session, "V002", "Voter Two", "v2@uni.edu")
    # Register them as eligible for this election
    vr1 = VoterRecord(election_id=sample_election.id, voter_hash=User.hash_student_id("V001"), has_voted=False)
    vr2 = VoterRecord(election_id=sample_election.id, voter_hash=User.hash_student_id("V002"), has_voted=False)
    db_session.add_all([vr1, vr2])
    db_session.flush()
    return [v1, v2]


# ── Auth helper ─────────────────────────────────────────────────────────────

def auth_headers(token: str) -> dict:
    """Return Authorization header dict for a Bearer token."""
    return {"Authorization": f"Bearer {token}"}
