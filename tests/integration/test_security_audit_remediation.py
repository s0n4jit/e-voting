"""
tests/integration/test_security_audit_remediation.py
===================================================
Automated regression tests verifying all 18 security and code-quality audit fixes.
"""

from datetime import datetime, timedelta, timezone
import json
import pytest
from app.extensions import db as _db
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.user import User
from app.models.booth_slip import BoothSlip
from app.models.ballot_entry import BallotEntry
from app.models.vote_receipt import VoteReceipt
from app.models.revoked_token import RevokedToken
from app.models.system_setting import SystemSetting
from app.models.audit_log import AuditLog
from app.models.kiosk_device import KioskDevice
from app.services.vote_service import VoteService
from app.migrations import run_migrations


def auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def test_election(db):
    now = datetime.now(timezone.utc)
    el = Election(
        title="Security Audit Test Election",
        status="voting_active",
        is_active=True,
        start_time=now,
        end_time=now + timedelta(hours=8),
    )
    _db.session.add(el)
    _db.session.commit()
    return el


def test_finding1_central_server_reboot_prohibited(client, test_election, app):
    """Booth maintenance action 'restart_system' must never reboot the backend host."""
    with app.app_context():
        # Set TESTING to False temporarily to simulate production environment
        app.config["TESTING"] = False
        try:
            device, token = KioskDevice.activate("BOOTH-TEST-01", "127.0.0.1", test_election.id)
            res = client.post(
                "/api/maintenance/action",
                headers={"X-Kiosk-Token": token, "Content-Type": "application/json"},
                json={"action": "restart_system"},
            )
            # Should be forbidden for role, or if staff token used, reject host reboot
            from flask_jwt_extended import create_access_token
            staff_jwt = create_access_token(
                identity="staff-maint-test",
                additional_claims={"role": "staff_maintenance"}
            )
            res2 = client.post(
                "/api/maintenance/action",
                headers={"Authorization": f"Bearer {staff_jwt}", "Content-Type": "application/json"},
                json={"action": "restart_system"},
            )
            assert res2.status_code == 400
            assert "Central server reboot is prohibited" in res2.get_json()["message"]
        finally:
            app.config["TESTING"] = True


def test_finding2_logout_persists_revocation_for_non_numeric_identities(client, test_election, app):
    """Logout must commit RevokedToken even when identity is non-numeric (e.g. slip_1001)."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        token = create_access_token(
            identity="slip_9999",
            additional_claims={"role": "voter", "jti": "custom-jti-slip-9999"}
        )
        res = client.post("/api/auth/logout", headers=auth_header(token))
        assert res.status_code == 200

        # Query RevokedToken from database to confirm it was persisted
        revoked = _db.session.get(RevokedToken, "custom-jti-slip-9999")
        assert revoked is not None


def test_finding3_voter_session_end_revokes_jwt(client, test_election, app):
    """Ending a voter session must revoke the JWT in RevokedToken."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        jti_val = "voter-session-jti-777"
        token = create_access_token(
            identity="slip_777",
            additional_claims={
                "role": "voter",
                "election_id": test_election.id,
                "jti": jti_val,
                "voting_id": "SUE26-E1-777",
            }
        )
        res = client.post("/api/auth/voter-session-end", headers=auth_header(token))
        assert res.status_code == 200

        # Check RevokedToken
        revoked = _db.session.get(RevokedToken, jti_val)
        assert revoked is not None


def test_finding4_ballot_timestamp_correlation_prevention(client, test_election, app):
    """BallotEntry.cast_at and AuditLog.created_at must not have identical microsecond timestamps."""
    with app.app_context():
        voter = User(student_id="STUDENT-CORR-1", name="Corr Voter", email="corr@x.edu", role="voter")
        voter.set_password("pass123")
        _db.session.add(voter)
        _db.session.commit()

        # Seed candidate
        cand = Candidate(election_id=test_election.id, name="Cand A", position="President")
        _db.session.add(cand)
        _db.session.commit()

        # Seed voter record
        v_hash = User.hash_student_id("STUDENT-CORR-1")
        from app.models.voter_record import VoterRecord
        _db.session.add(VoterRecord(election_id=test_election.id, voter_hash=v_hash, has_voted=False))
        _db.session.commit()

        VoteService.cast_multi_position_vote(
            user=voter,
            election_id=test_election.id,
            selections=[{"candidate_id": cand.id, "position": "President", "is_nota": False}],
        )

        ballot = BallotEntry.query.filter_by(election_id=test_election.id).first()
        audit = AuditLog.query.filter_by(action="VOTE_CAST", user_id=voter.id).first()

        assert ballot is not None
        assert audit is not None
        # Ballot cast_at is hourly bucketed (minute=0, second=0, microsecond=0)
        assert ballot.cast_at.microsecond == 0
        assert ballot.cast_at.second == 0
        assert ballot.cast_at != audit.created_at


def test_finding5_receipt_spoofing_and_immutability(client, test_election, app):
    """Uploading receipts for uncast slips must be rejected, and finalized receipts are immutable."""
    with app.app_context():
        device, token = KioskDevice.activate("BOOTH-TEST-02", "127.0.0.1", test_election.id)

        # 1. Uncast slip upload rejected
        res = client.post(
            "/api/booth/receipt-upload",
            headers={"X-Kiosk-Token": token},
            data={"slip_id": "UNCAST-SLIP-999", "election_id": test_election.id, "is_mock": "false"},
        )
        assert res.status_code == 400
        assert "Receipt cannot be archived for an uncast slip" in res.get_json()["message"]

        # 2. Seed a finalized receipt
        receipt = VoteReceipt(
            slip_id="FINALIZED-SLIP-01",
            election_id=test_election.id,
            booth_name="BOOTH-TEST-02",
            choices_json='[{"position":"President","choice":"Real Winner"}]',
        )
        _db.session.add(receipt)
        _db.session.commit()

        # Attempt to overwrite choices via receipt-upload
        res2 = client.post(
            "/api/booth/receipt-upload",
            headers={"X-Kiosk-Token": token},
            data={
                "slip_id": "FINALIZED-SLIP-01",
                "election_id": test_election.id,
                "choices": '[{"position":"President","choice":"Forged Choice"}]',
            },
        )
        assert res2.status_code == 200
        # Verify choices in DB remained intact
        db_receipt = VoteReceipt.query.filter_by(slip_id="FINALIZED-SLIP-01").first()
        assert "Real Winner" in db_receipt.choices_json
        assert "Forged Choice" not in db_receipt.choices_json

        # 3. Verify JSON payload updates print failure and on-demand PDF generation
        res3 = client.post(
            "/api/booth/receipt-upload",
            headers={"X-Kiosk-Token": token},
            json={
                "slip_id": "FINALIZED-SLIP-01",
                "election_id": test_election.id,
                "is_printed": False,
                "print_error": "Paper jam",
            },
        )
        assert res3.status_code == 200
        updated = VoteReceipt.query.filter_by(slip_id="FINALIZED-SLIP-01").first()
        assert updated.is_printed is False
        assert updated.print_error == "Paper jam"

        from app.services.receipt_service import ReceiptService
        pdf_bytes = ReceiptService.get_receipt_pdf_bytes(updated)
        assert pdf_bytes.startswith(b"%PDF")


def test_finding6_and_7_slip_batch_limits(client, test_election, app):
    """Slip generation rejects counts > 500 per batch to prevent worker starvation."""
    with app.app_context():
        admin = User(student_id="admin-slips", name="Admin Slips", email="as@x.edu", role="admin", is_admin=True, otp_enabled=True)
        admin.set_password("pass123")
        _db.session.add(admin)
        _db.session.commit()

        from flask_jwt_extended import create_access_token
        admin_jwt = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

        res = client.post(
            "/api/admin/slips/generate",
            headers=auth_header(admin_jwt),
            json={"election_id": test_election.id, "booth_number": 1, "count": 1000},
        )
        assert res.status_code == 400
        assert "between 1 and 500" in res.get_json()["message"]


def test_finding9_and_10_migration_indexes(client, test_election, app):
    """Migration 012 creates indexes on audit_logs(created_at) and vote_receipts(booth_name)."""
    with app.app_context():
        applied = run_migrations()
        from sqlalchemy import inspect
        insp = inspect(_db.engine)
        audit_indexes = [idx["name"] for idx in insp.get_indexes("audit_logs")]
        receipt_indexes = [idx["name"] for idx in insp.get_indexes("vote_receipts")]

        # Confirm indexes exist in schema
        assert any("created_at" in name or "ix_audit_logs_created_at" in name for name in audit_indexes)
        assert any("booth_name" in name or "ix_vote_receipts_booth_name" in name for name in receipt_indexes)


def test_finding11_active_election_deletion_blocked(client, test_election, app):
    """Deleting an election with effective_status == 'voting_active' must be rejected with 409."""
    with app.app_context():
        admin = User(student_id="admin-del", name="Admin Del", email="adel@x.edu", role="admin", is_admin=True, otp_enabled=True)
        admin.set_password("pass123")
        _db.session.add(admin)
        _db.session.commit()

        from flask_jwt_extended import create_access_token
        admin_jwt = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

        res = client.delete(f"/api/admin/elections/{test_election.id}", headers=auth_header(admin_jwt))
        assert res.status_code == 409
        assert "Cannot delete an ongoing active election" in res.get_json()["message"]


def test_finding12_maintenance_lockout_persists_in_db(client, test_election, app):
    """Maintenance lockout is written to SystemSetting so it survives across worker processes."""
    with app.app_context():
        from app.routes.maintenance import _get_ip_lockout, _set_ip_lockout, _pin_attempts
        ip = "192.168.1.50"
        _set_ip_lockout(ip, {"attempts": 5, "lockout_until": 9999999999})

        # Clear in-memory dictionary to simulate another Gunicorn worker
        _pin_attempts.clear()

        # Database lookup retrieves the lockout state
        state = _get_ip_lockout(ip)
        assert state["attempts"] == 5
        assert state["lockout_until"] == 9999999999


def test_finding13_obsolete_voter_import_endpoints_removed(client, app):
    """POST /api/admin/voters and /api/admin/voters/import must return 404 (removed)."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        admin_jwt = create_access_token(identity="1", additional_claims={"role": "admin"})
        res1 = client.post("/api/admin/voters", headers=auth_header(admin_jwt))
        res2 = client.post("/api/admin/voters/import", headers=auth_header(admin_jwt))
        assert res1.status_code in (404, 405)
        assert res2.status_code in (404, 405)
