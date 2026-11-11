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


def test_finding_a_temp_token_cannot_access_protected_endpoints(client, test_election, app):
    """Temporary OTP JWTs must be strictly rejected on admin and desk routes (401 Unauthorized)."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        admin = User(student_id="temp-admin", name="Temp Admin", email="tadmin@x.edu", role="admin", is_admin=True, otp_enabled=True)
        admin.set_password("pass123")
        _db.session.add(admin)
        _db.session.commit()

        temp_jwt = create_access_token(
            identity=str(admin.id),
            additional_claims={"type": "temp_otp", "role": "admin", "student_id": "temp-admin"}
        )

        res = client.get("/api/admin/elections", headers=auth_header(temp_jwt))
        assert res.status_code == 401

        res_desk = client.get("/api/desk/state", headers=auth_header(temp_jwt))
        assert res_desk.status_code == 401


def test_finding_c_totp_setup_reexposure_prevented(client, app):
    """GET /api/auth/totp/setup must reject temp tokens (401) and active TOTP users (403)."""
    with app.app_context():
        import pyotp
        from flask_jwt_extended import create_access_token
        user = User(student_id="totp-user", name="TOTP User", email="totp@x.edu", role="admin", is_admin=True, otp_enabled=True, otp_secret=pyotp.random_base32())
        user.set_password("pass123")
        _db.session.add(user)
        _db.session.commit()

        # Temp token rejected
        temp_jwt = create_access_token(
            identity=str(user.id),
            additional_claims={"type": "temp_otp", "role": "admin"}
        )
        res_temp = client.get("/api/auth/totp/setup", headers=auth_header(temp_jwt))
        assert res_temp.status_code == 401

        # Full token on already-enabled account returns 403
        full_jwt = create_access_token(
            identity=str(user.id),
            additional_claims={"role": "admin"}
        )
        res_full = client.get("/api/auth/totp/setup", headers=auth_header(full_jwt))
        assert res_full.status_code == 403
        assert "already active" in res_full.get_json()["message"]


def test_finding_f_live_election_statistics_guarded(client, test_election, app):
    """GET /api/results/<id>/stats requires authentication, published results, or a public token."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        el = _db.session.get(Election, test_election.id)
        pub_token = el.ensure_public_token()
        _db.session.commit()
        eid = el.id

        # 1. Unauthenticated request without token while voting is active returns 403
        res_unauth = client.get(f"/api/results/{eid}/stats")
        assert res_unauth.status_code == 403
        assert res_unauth.get_json()["error"] == "Results hidden"

        # 2. Public token allows access
        res_token = client.get(f"/api/results/{eid}/stats?token={pub_token}")
        assert res_token.status_code == 200
        assert "turnout_percentage" in res_token.get_json()

        # 3. Authenticated officer allows access during voting
        admin = User(student_id="stats-admin", name="Stats Admin", email="sadmin@x.edu", role="admin", is_admin=True, otp_enabled=True)
        admin.set_password("pass123")
        _db.session.add(admin)
        _db.session.commit()
        admin_jwt = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

        res_admin = client.get(f"/api/results/{eid}/stats", headers=auth_header(admin_jwt))
        assert res_admin.status_code == 200

        # 4. Once results are published, public unauthenticated access succeeds
        el = _db.session.get(Election, eid)
        el.set_status("results_published")
        _db.session.commit()
        res_pub = client.get(f"/api/results/{eid}/stats")
        assert res_pub.status_code == 200


def test_finding_d_receipt_upload_ownership_and_deferral(client, test_election, app, tmp_path):
    """Receipt upload must validate election/booth ownership and reject cross-booth tampering."""
    with app.app_context():
        _, booth1_tok = KioskDevice.activate("BOOTH-01", "127.0.0.1", test_election.id)
        _, booth2_tok = KioskDevice.activate("BOOTH-02", "127.0.0.1", test_election.id)
        _db.session.commit()

        # Initial receipt creation for Booth 1
        slip = BoothSlip(
            election_id=test_election.id,
            voting_id="VOTE-TEST01",
            pin_hash="dummy",
            pin_enc="dummy",
            booth_id=1,
            booth_number=1,
            sequence_number=1001,
            is_used=True,
        )
        _db.session.add(slip)
        _db.session.commit()

        # Upload receipt from Booth 1
        res1 = client.post(
            "/api/booth/receipt-upload",
            headers={"X-Kiosk-Token": booth1_tok},
            data={"slip_id": "VOTE-TEST01", "election_id": test_election.id, "is_printed": "true"},
        )
        assert res1.status_code == 200

        # Attempt to tamper/overwrite status from Booth 2 must be rejected with 403
        res2 = client.post(
            "/api/booth/receipt-upload",
            headers={"X-Kiosk-Token": booth2_tok},
            data={"slip_id": "VOTE-TEST01", "election_id": test_election.id, "is_printed": "false"},
        )
        assert res2.status_code == 403
        assert "belongs to another booth" in res2.get_json()["message"]


def test_finding_b_legacy_vote_blocked_on_booth_slip_election(client, test_election, app):
    """POST /api/voter/elections/<id>/vote is blocked (403) when an election uses booth slips."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        slip = BoothSlip(
            election_id=test_election.id,
            voting_id="SUE26-E1-9999",
            pin_hash="dummy",
            pin_enc="dummy",
            booth_number=1,
            sequence_number=1002,
            is_used=False,
        )
        _db.session.add(slip)
        _db.session.commit()

        voter = User(student_id="leg-voter", name="Leg Voter", email="lv@x.edu", role="voter")
        voter.set_password("pass123")
        _db.session.add(voter)
        _db.session.commit()

        voter_jwt = create_access_token(identity=str(voter.id), additional_claims={"role": "voter"})
        res = client.post(
            f"/api/voter/elections/{test_election.id}/vote",
            headers=auth_header(voter_jwt),
            json={"candidate_id": 1},
        )
        assert res.status_code == 403
        assert "booth-slip" in res.get_json()["message"]


def test_finding_g_maintenance_diagnostics_sanitized_for_kiosk(client, test_election, app):
    """Kiosk device tokens receive sanitized diagnostics (no server OS/interface topography)."""
    with app.app_context():
        from flask_jwt_extended import create_access_token
        _, kiosk_tok = KioskDevice.activate("BOOTH-DIAG", "127.0.0.1", test_election.id)
        _db.session.commit()

        # Kiosk token gets sanitized response
        res_kiosk = client.get("/api/maintenance/diagnostics", headers={"X-Kiosk-Token": kiosk_tok})
        assert res_kiosk.status_code == 200
        data_kiosk = res_kiosk.get_json()
        assert data_kiosk["os_info"] == "Protected"
        assert data_kiosk["interfaces"] == []
        assert data_kiosk["gateway"]["ip"] == "Protected"

        # Staff maintenance JWT gets full diagnostics
        staff_jwt = create_access_token(identity="maint-staff", additional_claims={"role": "staff_maintenance"})
        res_staff = client.get("/api/maintenance/diagnostics", headers=auth_header(staff_jwt))
        assert res_staff.status_code == 200
        data_staff = res_staff.get_json()
        assert data_staff["os_info"] != "Protected"


def test_finding_j_election_current_prioritizes_official(client, app):
    """Election.current() must strictly prioritize official ongoing elections over mock elections."""
    with app.app_context():
        now = datetime.now(timezone.utc)
        official = Election(
            title="Official Active Election",
            status="voting_active",
            is_active=True,
            is_mock=False,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=8),
            created_at=now - timedelta(hours=2),
        )
        mock = Election(
            title="Mock Active Election",
            status="setup",
            mock_status="voting_active",
            is_active=False,
            is_mock=True,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=8),
            created_at=now,  # newer than official
        )
        _db.session.add_all([official, mock])
        _db.session.commit()

        current_el = Election.current()
        assert current_el.id == official.id
        assert current_el.is_mock is False
