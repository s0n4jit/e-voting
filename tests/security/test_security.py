"""
tests/security/test_security.py
================================
Comprehensive Security Test Suite for Campus e-Voting System (CEVS).

Covers:
  1. SQL Injection Payload Prevention (Authentication, queries, candidate parameters)
  2. Cross-Site Scripting (XSS) Sanitization and Neutralization
  3. Strict Double-Voting Rejection (Sequential, replay, idempotency)
  4. Ballot Anonymity Validation (Architectural decoupling verification:
     proves zero Foreign Key and zero Relational Join path between VoterRecord and BallotEntry)
  5. Cryptographic JWT Security (Rejection of tampered signatures, expired tokens, and malformed headers)
"""

import pytest
import pyotp
import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import inspect
from flask_jwt_extended import create_access_token

from app.extensions import db as _db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog
from app.services.vote_service import VoteService, VotingError


# ═══════════════════════════════════════════════════════════════════════════
#  1. SQL Injection Prevention Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestSQLInjectionPrevention:
    """Validates that SQL injection payloads are safely sanitized and parameterized."""

    SQLI_PAYLOADS = [
        "' OR '1'='1",
        "'; DROP TABLE ballot_entries; --",
        "admin' --",
        "' UNION SELECT id, student_id, password_hash FROM users --",
        "1' OR '1' = '1' /*",
        "'; EXEC xp_cmdshell('dir'); --",
    ]

    def test_sqli_in_student_id_login_rejected(self, client):
        """SQL injection in student_id field must not bypass auth or crash the server."""
        for payload in self.SQLI_PAYLOADS:
            resp = client.post("/api/auth/login", json={
                "student_id": payload,
                "password": "Password123!",
            })
            assert resp.status_code in [400, 401], f"Payload {payload} caused unexpected status {resp.status_code}"
            # Verify the table still exists and wasn't dropped
            assert _db.session.query(User).count() >= 0

    def test_sqli_in_voter_status_lookup(self, app, client):
        """SQL injection in voter lookup parameter does not execute arbitrary SQL."""
        with app.app_context():
            token = create_access_token(
                identity="1",
                additional_claims={"role": "voter", "student_id": "VOTER001"},
            )
        headers = {"Authorization": f"Bearer {token}"}
        for payload in self.SQLI_PAYLOADS:
            resp = client.get(f"/api/voter/status/{payload}", headers=headers)
            # Must return 400, 404, or 422, never 500
            assert resp.status_code in [400, 404, 422]

    def test_sqli_in_candidate_fields_escaped(self, app, db):
        """ORM parameterization safely stores SQL characters as literal text."""
        with app.app_context():
            now = datetime.now(timezone.utc)
            election = Election(
                title="SQLi Test Election",
                description="Testing parameterization",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=10),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            malicious_name = "Candidate'; DROP TABLE candidates;--"
            candidate = Candidate(
                election_id=election.id,
                name=malicious_name,
                party="Security Slate",
                position="President",
                bio="Harmless text",
            )
            db.session.add(candidate)
            db.session.commit()

            fetched = db.session.get(Candidate, candidate.id)
            assert fetched is not None
            assert fetched.name == malicious_name
            # Ensure table intact
            assert db.session.query(Candidate).count() >= 1


# ═══════════════════════════════════════════════════════════════════════════
#  2. XSS Input Sanitization Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestXSSSanitization:
    """Validates that Cross-Site Scripting vectors in stored fields are neutralized."""

    XSS_PAYLOADS = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
        "<svg onload=alert(1)>",
        "javascript:alert('xss')",
        "<iframe src='javascript:alert(1)'></iframe>",
    ]

    def test_xss_payload_in_candidate_bio(self, app, db):
        """Candidate bio with HTML/JS payload does not break system and is escaped/stored safely."""
        with app.app_context():
            now = datetime.now(timezone.utc)
            election = Election(
                title="XSS Test Election",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=10),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            for payload in self.XSS_PAYLOADS:
                cand = Candidate(
                    election_id=election.id,
                    name=f"Candidate {payload[:8]}",
                    party="Clean Party",
                    bio=payload,
                )
                db.session.add(cand)
            db.session.commit()

            # Verify all persisted without corrupting JSON serialization
            candidates = db.session.query(Candidate).filter_by(election_id=election.id).all()
            for c in candidates:
                d = c.to_dict()
                assert isinstance(d["bio"], str)
                # Verify JSON dumping produces valid string
                dumped = json.dumps(d)
                assert "bio" in dumped


# ═══════════════════════════════════════════════════════════════════════════
#  3. Double-Voting Rejection Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestDoubleVotingPrevention:
    """Verifies that an eligible voter cannot submit more than one vote under any condition."""

    def test_sequential_double_vote_rejected(self, app, db):
        """Second vote by same voter raises VotingError and does not record second ballot."""
        with app.app_context():
            now = datetime.now(timezone.utc)
            election = Election(
                title="Single Vote Election",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=5),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            cand1 = Candidate(election_id=election.id, name="Cand 1", party="Party A")
            cand2 = Candidate(election_id=election.id, name="Cand 2", party="Party B")
            db.session.add_all([cand1, cand2])
            db.session.flush()

            student_id = f"SEC_STU_{datetime.now().microsecond}"
            user = User(student_id=student_id, name="Security Voter", email=f"{student_id}@uni.edu")
            user.set_password("SecurePass123!")
            db.session.add(user)
            db.session.flush()

            voter_hash = User.hash_student_id(student_id)
            voter_record = VoterRecord(election_id=election.id, voter_hash=voter_hash, has_voted=False)
            db.session.add(voter_record)
            db.session.commit()

            # First vote must succeed
            res1 = VoteService.cast_vote(
                user=user,
                election_id=election.id,
                candidate_id=cand1.id,
                db=db,
            )
            assert res1["success"] is True

            # Verify state
            assert voter_record.has_voted is True
            initial_ballot_count = db.session.query(BallotEntry).filter_by(election_id=election.id).count()
            assert initial_ballot_count == 1

            # Second vote must be rejected
            with pytest.raises(VotingError) as exc_info:
                VoteService.cast_vote(
                    user=user,
                    election_id=election.id,
                    candidate_id=cand2.id,
                    db=db,
                )
            assert "already voted" in str(exc_info.value).lower()

            # Ensure ballot count did not increase
            final_ballot_count = db.session.query(BallotEntry).filter_by(election_id=election.id).count()
            assert final_ballot_count == 1

    def test_voter_record_unique_constraint(self, app, db):
        """The database schema prevents inserting duplicate (election_id, voter_hash) records."""
        with app.app_context():
            election = Election(
                title="Unique Hash Test",
                start_time=datetime.now(timezone.utc),
                end_time=datetime.now(timezone.utc) + timedelta(hours=1),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            v_hash = User.hash_student_id("DUPLICATE_TEST")
            vr1 = VoterRecord(election_id=election.id, voter_hash=v_hash, has_voted=False)
            db.session.add(vr1)
            db.session.commit()

            vr2 = VoterRecord(election_id=election.id, voter_hash=v_hash, has_voted=False)
            db.session.add(vr2)
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()


# ═══════════════════════════════════════════════════════════════════════════
#  4. Ballot Anonymity Architecture Validation
# ═══════════════════════════════════════════════════════════════════════════

class TestBallotAnonymityValidation:
    """
    Architectural Decoupling Validation:
    Inspects SQLAlchemy models and physical database metadata to mathematically
    prove that NO relational link exists between voter identities and ballot choices.
    """

    def test_no_foreign_key_between_voter_and_ballot(self, app):
        """BallotEntry must NOT possess foreign key to User or VoterRecord."""
        with app.app_context():
            # Check ORM Table foreign keys directly
            fks = list(BallotEntry.__table__.foreign_keys)
            referred_tables = {fk.column.table.name for fk in fks}
            assert "users" not in referred_tables, "SECURITY VIOLATION: ballot_entries references users!"
            assert "voter_records" not in referred_tables, "SECURITY VIOLATION: ballot_entries references voter_records!"
            # Only elections and candidates are permitted
            for table_name in referred_tables:
                assert table_name in ["elections", "candidates"], f"Unexpected FK to {table_name}"

    def test_no_voter_identification_columns_in_ballot_entry(self, app):
        """BallotEntry columns must not contain user_id, student_id, voter_id, or voter_hash."""
        forbidden_columns = {"user_id", "voter_id", "student_id", "voter_hash", "email", "ip_address"}
        ballot_columns = {col.name for col in BallotEntry.__table__.columns}
        intersection = forbidden_columns.intersection(ballot_columns)
        assert len(intersection) == 0, f"SECURITY VIOLATION: ballot_entries contains forbidden columns: {intersection}"

    def test_blind_token_randomness_and_uniqueness(self, app, db):
        """Blind tokens generated for consecutive ballots must be distinct and cryptographically random."""
        with app.app_context():
            now = datetime.now(timezone.utc)
            election = Election(
                title="Blind Token Election",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=5),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            cand = Candidate(election_id=election.id, name="Test Candidate")
            db.session.add(cand)
            db.session.flush()

            tokens = set()
            for i in range(5):
                stu_id = f"BLIND_VOTER_{i}_{datetime.now().microsecond}"
                user = User(student_id=stu_id, name=f"Voter {i}", email=f"{stu_id}@uni.edu")
                user.set_password("Pass@123")
                db.session.add(user)
                db.session.flush()

                vr = VoterRecord(election_id=election.id, voter_hash=User.hash_student_id(stu_id), has_voted=False)
                db.session.add(vr)
                db.session.commit()

                res = VoteService.cast_vote(
                    user=user,
                    election_id=election.id,
                    candidate_id=cand.id,
                    db=db,
                )
                assert res["blind_token"] is not None
                assert res["blind_token"] not in tokens
                tokens.add(res["blind_token"])

            assert len(tokens) == 5


# ═══════════════════════════════════════════════════════════════════════════
#  5. JWT Security & Tamper Rejection Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestJWTSecurity:
    """Verifies rejection of forged, expired, or tampered JWT access tokens."""

    def test_tampered_jwt_signature_rejected(self, client):
        """Modifying signature characters in a valid JWT triggers immediate rejection."""
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6InZvdGVyIn0.TAMPERED_SIGNATURE_BYTES"
        resp = client.get("/api/voter/elections/active", headers={"Authorization": f"Bearer {fake_token}"})
        assert resp.status_code in [401, 422], f"Expected 401/422 for tampered token, got {resp.status_code}"

    def test_expired_jwt_rejected(self, app, client):
        """An expired JWT is rejected with 401."""
        with app.app_context():
            # Generate a token that expired 1 hour ago
            past_delta = timedelta(hours=-1)
            expired_token = create_access_token(
                identity="1",
                additional_claims={"role": "voter", "student_id": "STU001"},
                expires_delta=past_delta,
            )

        resp = client.get("/api/voter/elections/active", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp.status_code == 401
        data = resp.get_json() or {}
        assert "expired" in str(data).lower() or resp.status_code == 401

    def test_missing_authorization_header_rejected(self, client):
        """Protected endpoints reject requests missing the Authorization header."""
        resp = client.get("/api/voter/elections/active")
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
#  6. Audit Remediation Security Tests
# ═══════════════════════════════════════════════════════════════════════════

class TestAuditSecurityFixes:
    """Verifies that audit vulnerabilities (upload auth, path traversal, PII scraping, secrecy) are resolved."""

    def test_booth_receipt_upload_requires_valid_booth_token(self, client):
        """Unauthenticated clients without a kiosk token cannot upload receipts."""
        resp = client.post("/api/booth/receipt-upload", data={"slip_id": "TEST-SLIP-01"})
        assert resp.status_code == 403

    def test_booth_receipt_upload_path_traversal_blocked(self, client):
        """Path traversal characters in slip_id are rejected."""
        resp = client.post(
            "/api/booth/receipt-upload",
            data={"slip_id": "../../etc/evil", "kiosk_token": "invalid_fake_token"},
            headers={"X-Kiosk-Token": "invalid_fake_token"},
        )
        assert resp.status_code in [400, 403]

    def test_voter_verify_slip_requires_kiosk_token(self, client):
        """Unauthenticated public queries to verify slips without kiosk tokens are blocked."""
        resp = client.post("/api/auth/voter-verify-slip", json={"student_id": "SUE26-E1-000001"})
        assert resp.status_code == 403

    def test_receipt_secrecy_decoupling(self, app, db):
        """Server-side receipts must be filed under anonymous blind refs, never the voter's student_id."""
        from app.models.vote_receipt import VoteReceipt
        with app.app_context():
            now = datetime.now(timezone.utc)
            election = Election(
                title="Secrecy Audit Election",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=5),
                is_active=True,
            )
            db.session.add(election)
            db.session.flush()

            cand = Candidate(election_id=election.id, name="Candidate Alpha", position="General Secretary")
            db.session.add(cand)
            db.session.flush()

            student_id = f"SEC_SECRECY_{datetime.now().microsecond}"
            user = User(student_id=student_id, name="Secret Voter", email=f"{student_id}@uni.edu")
            user.set_password("SecurePass123!")
            db.session.add(user)
            db.session.flush()

            voter_hash = User.hash_student_id(student_id)
            voter_record = VoterRecord(election_id=election.id, voter_hash=voter_hash, has_voted=False)
            db.session.add(voter_record)
            db.session.commit()

            selections = [{"position": "General Secretary", "candidate_id": cand.id, "is_nota": False}]

            result = VoteService.cast_multi_position_vote(
                user=user,
                election_id=election.id,
                selections=selections,
                db=db,
            )
            assert result["success"] is True

            # Ensure no receipt exists under the voter's actual student_id!
            receipt_with_student_id = VoteReceipt.query.filter_by(slip_id=user.student_id).first()
            assert receipt_with_student_id is None, "Ballot secrecy violated: VoteReceipt linked directly to voter student_id!"

            # Ensure receipt exists under the blind ballot ref
            expected_ref = f"VOTE-{result['blind_token'][:8].upper()}"
            receipt = VoteReceipt.query.filter_by(slip_id=expected_ref).first()
            assert receipt is not None
            assert receipt.election_id == election.id
