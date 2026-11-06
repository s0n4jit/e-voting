"""
tests/unit/test_booth_slips.py
==============================
Unit tests for Pre-generated Booth Slips and PIN-Only Voting:
  - Multi-booth sequential ID generation (1001, 1002..., 2001, 2002...)
  - Cryptographically secure 4-digit PIN generation (0000-9999) with leading zeros
  - Salted bcrypt hash verification
  - Fernet encryption/decryption for PDF rendering
  - CRITICAL: No self-destruct or invalidation on incorrect PIN
  - Automatic sequential advancement upon vote completion
  - Anonymous multi-position vote submission with BoothSlip
  - PDF slip generation
"""

import pytest
from datetime import datetime, timedelta, timezone

from app.models.election import Election
from app.models.candidate import Candidate
from app.models.kiosk_device import KioskDevice
from app.models.booth_slip import BoothSlip
from app.models.ballot_entry import BallotEntry
from app.services.vote_service import VoteService, VotingError
from app.services.slip_pdf_service import SlipPdfService


@pytest.fixture
def test_election(db_session):
    now = datetime.now(timezone.utc)
    elec = Election(
        title="Campus Election 2026",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=8),
        is_active=True,
        status="voting_active",
    )
    db_session.add(elec)
    db_session.flush()

    c1 = Candidate(election_id=elec.id, name="Alice Sharma", position="General Secretary")
    c2 = Candidate(election_id=elec.id, name="Bob Ahmed", position="General Secretary")
    c3 = Candidate(election_id=elec.id, name="Carol Das", position="Cultural Secretary")
    db_session.add_all([c1, c2, c3])
    db_session.commit()
    return elec


class TestBoothSlipModel:
    def test_pin_generation_preserves_4_digits_and_leading_zeros(self, app):
        with app.app_context():
            for _ in range(50):
                pin = BoothSlip.generate_random_4digit_pin()
                assert len(pin) == 4
                assert pin.isdigit()
                assert 0 <= int(pin) <= 9999

    def test_sequential_id_generation_per_booth(self, app, db_session, test_election):
        with app.app_context():
            # Generate 4 slips for Booth 1
            b1_slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=4)
            assert [s.voting_id for s in b1_slips] == [f"SUE26-B1-{i}" for i in ["1001", "1002", "1003", "1004"]]

            # Generate 4 slips for Booth 2
            b2_slips = BoothSlip.generate_batch(test_election.id, booth_number=2, count=4)
            assert [s.voting_id for s in b2_slips] == [f"SUE26-B2-{i}" for i in ["2001", "2002", "2003", "2004"]]

            # Generate 2 slips for Booth 3
            b3_slips = BoothSlip.generate_batch(test_election.id, booth_number=3, count=2)
            assert [s.voting_id for s in b3_slips] == [f"SUE26-B3-{i}" for i in ["3001", "3002"]]

            # Append 2 more slips to Booth 1: should continue sequence from 1005
            b1_more = BoothSlip.generate_batch(test_election.id, booth_number=1, count=2)
            assert [s.voting_id for s in b1_more] == [f"SUE26-B1-{i}" for i in ["1005", "1006"]]

    def test_unassigned_pool_slips_generation(self, app, db_session, test_election):
        """Verify slips can be generated without booth pre-assignment."""
        with app.app_context():
            pool_slips = BoothSlip.generate_batch(test_election.id, booth_number=None, count=4)
            assert len(pool_slips) == 4
            for s in pool_slips:
                assert s.booth_number is None
                assert s.booth_id is None
            pfx = test_election.ensure_slip_prefix()
            assert [s.voting_id for s in pool_slips] == [f"{pfx}{i}" for i in ["1001", "1002", "1003", "1004"]]

    def test_pin_verification_and_fernet_reveal(self, app, db_session, test_election):
        with app.app_context():
            slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=1)
            slip = slips[0]
            raw_pin = slip.raw_pin
            assert len(raw_pin) == 4

            # Verify against correct PIN
            assert slip.verify_pin(raw_pin) is True

            # Verify against wrong PINs
            assert slip.verify_pin("0000" if raw_pin != "0000" else "9999") is False
            assert slip.verify_pin("123") is False
            assert slip.verify_pin("abcd") is False

            # Reveal decrypted PIN
            decrypted = slip.reveal_pin()
            assert decrypted == raw_pin

    def test_no_self_destruct_on_failed_pin_attempts(self, app, db_session, test_election):
        """CRITICAL: Failed PIN attempts must NEVER invalidate or destroy the slip."""
        with app.app_context():
            slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=1)
            slip = slips[0]

            # Simulate 10 consecutive failed attempts
            for _ in range(10):
                res = slip.verify_pin("9999")

            # Check that the slip is still completely unused and active
            assert slip.is_used is False
            assert slip.used_at is None

            # Correct PIN still works
            assert slip.verify_pin(slip.raw_pin) is True

    def test_current_slip_advances_only_when_used(self, app, db_session, test_election):
        with app.app_context():
            BoothSlip.generate_batch(test_election.id, booth_number=1, count=3)

            # Initially current slip is 1001
            current = BoothSlip.get_current_slip(test_election.id, booth_number=1)
            assert current.voting_id == "SUE26-B1-1001"

            # Mark 1001 as used
            current.is_used = True
            current.used_at = datetime.now(timezone.utc)
            db_session.commit()

            # Now current slip automatically advances to 1002
            next_slip = BoothSlip.get_current_slip(test_election.id, booth_number=1)
            assert next_slip.voting_id == "SUE26-B1-1002"

            # Booth 2 current slip is unaffected
            BoothSlip.generate_batch(test_election.id, booth_number=2, count=2)
            b2_curr = BoothSlip.get_current_slip(test_election.id, booth_number=2)
            assert b2_curr.voting_id == "SUE26-B2-2001"


class TestBoothSlipVotingFlow:
    def test_cast_booth_slip_vote_atomic_and_anonymous(self, app, db_session, test_election):
        with app.app_context():
            slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=2)
            slip1 = slips[0]
            slip2 = slips[1]

            # Get candidates
            cands = Candidate.query.filter_by(election_id=test_election.id).all()
            gs_cand = [c for c in cands if c.position == "General Secretary"][0]

            selections = [
                {"position": "General Secretary", "candidate_id": gs_cand.id, "is_nota": False},
                {"position": "Cultural Secretary", "is_nota": True},
            ]

            # Cast ballot
            res = VoteService.cast_booth_slip_vote(
                slip_id=slip1.id,
                election_id=test_election.id,
                selections=selections,
                kiosk_token=None,
                booth=None,
                db=db_session,
            )

            assert res["success"] is True
            assert res["data"]["voting_id"] == "SUE26-B1-1001"
            assert res["data"]["next_voting_id"] == "SUE26-B1-1002"

            # Verify slip1 is marked used
            refreshed_s1 = db_session.get(BoothSlip, slip1.id)
            assert refreshed_s1.is_used is True
            assert refreshed_s1.used_at is not None

            # Verify next current slip for Booth 1 is 1002
            current = BoothSlip.get_current_slip(test_election.id, booth_number=1)
            assert current.voting_id == "SUE26-B1-1002"

            # Verify ballot entries recorded anonymously under blind_token
            entries = BallotEntry.query.filter_by(election_id=test_election.id).all()
            assert len(entries) == 2
            blind_tokens = {e.blind_token for e in entries}
            assert len(blind_tokens) == 1  # Both positions share the same blind token

            # Double voting attempt with slip1 fails
            with pytest.raises(VotingError, match="already been used"):
                VoteService.cast_booth_slip_vote(
                    slip_id=slip1.id,
                    election_id=test_election.id,
                    selections=selections,
                    db=db_session,
                )


class TestSlipPdfService:
    def test_generates_valid_pdf_bytes(self, app, db_session, test_election):
        with app.app_context():
            slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=10)
            pdf_bytes = SlipPdfService.generate_slips_pdf(
                slips=slips,
                election=test_election,
                institution_name="Test College",
            )
            assert pdf_bytes.startswith(b"%PDF-")
            assert len(pdf_bytes) > 1000


class TestBoothTokenAllotment:
    def test_slips_unlinked_at_generation_and_allotted_at_token_generation(self, app, db_session, test_election):
        """Verify slips start unlinked (booth_id=None) and become allotted at booth token creation time."""
        from app.models.booth_create_token import BoothCreateToken
        from app.routes.booth import _hash, new_create_token
        from app.models.user import User

        with app.app_context():
            # 1. Slips generated by officer start completely unallotted
            slips = BoothSlip.generate_batch(test_election.id, booth_number=1, count=10, booth_id=None)
            assert len(slips) == 10
            for s in slips:
                assert s.booth_id is None

            # Create test admin officer
            officer = User(student_id="OFFICER-01", name="Officer Test", email="officer_test@test.com", role="admin")
            officer.set_password("pass1234")
            db_session.add(officer)
            db_session.commit()

            # 2. Booth Token generated for Booth 1 with slips_count=5
            kiosk = KioskDevice(
                device_name="BOOTH-01",
                booth_number=1,
                kiosk_token="temp_hash_123",
                election_id=test_election.id,
                is_active=False,
            )
            db_session.add(kiosk)
            db_session.flush()

            # Allot 5 slips to this booth
            to_allot = BoothSlip.query.filter_by(
                election_id=test_election.id, booth_number=1, booth_id=None
            ).order_by(BoothSlip.sequence_number.asc()).limit(5).all()

            for s in to_allot:
                s.booth_id = kiosk.id

            token = new_create_token()
            bct = BoothCreateToken(
                token_hash=_hash(token.replace("-", "")),
                election_id=test_election.id,
                created_by=officer.id,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
                booth_number=1,
                kiosk_id=kiosk.id,
                from_slip_id=to_allot[0].voting_id,
                to_slip_id=to_allot[-1].voting_id,
                slips_count=5,
            )
            db_session.add(bct)
            db_session.commit()

            # 3. Verify exactly 5 slips are allotted to this kiosk and 5 remain unallotted
            allotted = BoothSlip.query.filter_by(election_id=test_election.id, booth_id=kiosk.id).all()
            assert len(allotted) == 5
            assert [s.voting_id for s in allotted] == [f"SUE26-B1-{i}" for i in ["1001", "1002", "1003", "1004", "1005"]]

            unallotted = BoothSlip.query.filter_by(election_id=test_election.id, booth_id=None).all()
            assert len(unallotted) == 5
            assert [s.voting_id for s in unallotted] == [f"SUE26-B1-{i}" for i in ["1006", "1007", "1008", "1009", "1010"]]


class TestMockElectionIsolation:
    def test_mock_election_does_not_destroy_real_slips(self, app, db_session, test_election):
        with app.app_context():
            # 1. Real election has 10 slips
            real_slips = BoothSlip.generate_batch(election_id=test_election.id, booth_number=1, count=10)
            assert len(real_slips) == 10
            assert BoothSlip.query.filter_by(election_id=test_election.id).count() == 10

            # 2. Setup Kiosks: Booth 1 and Booth 2
            k1 = KioskDevice(device_name="BOOTH-01", booth_number=1, kiosk_token="tok1", election_id=test_election.id, is_active=True)
            k2 = KioskDevice(device_name="BOOTH-02", booth_number=2, kiosk_token="tok2", election_id=test_election.id, is_active=True)
            db_session.add_all([k1, k2])
            db_session.commit()

            # 3. Simulate calling separate mock election on Booth 1 with 5 mock slips
            from app.routes.manage import start_mock, end_mock
            from app.models.user import User
            from flask_jwt_extended import create_access_token
            admin = User(name="Admin Officer", student_id="admin_officer", email="admin@example.com", password_hash="dummy_hash", role="admin", is_admin=True, otp_enabled=True, is_active=True)
            db_session.add(admin)
            db_session.commit()
            admin_tok = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})
            headers = {"Authorization": f"Bearer {admin_tok}"}

            with app.test_request_context(
                "/api/admin/mock/start",
                method="POST",
                headers=headers,
                json={"election_id": test_election.id, "booth_numbers": [1], "slip_count": 5, "candidate_mode": "demo"}
            ):
                res, code = start_mock()
                assert code == 200
                data = res.get_json()
                mock_id = data["id"]
                assert data["is_mock"] is True
                assert data["parent_election_id"] == test_election.id

            # Verify mock slips exist with MOCK- prefix and real slips remain
            mock_slips = BoothSlip.query.filter_by(election_id=mock_id).all()
            assert len(mock_slips) == 5
            for s in mock_slips:
                assert s.voting_id.startswith("MOCK-B01-")
                assert s.is_mock is True

            # Real slips still 10!
            assert BoothSlip.query.filter_by(election_id=test_election.id).count() == 10
            # Kiosk 1 points to mock, Kiosk 2 points to real
            assert db_session.get(KioskDevice, k1.id).election_id == mock_id
            assert db_session.get(KioskDevice, k2.id).election_id == test_election.id

            # 4. End mock election
            with app.test_request_context(
                "/api/admin/mock/end",
                method="POST",
                headers=headers,
                json={"confirm": "RESET"}
            ):
                res2, code2 = end_mock()
                assert code2 == 200

            # 5. Verify real slips are STILL 10 and mock slips are gone!
            assert BoothSlip.query.filter_by(election_id=test_election.id).count() == 10
            assert BoothSlip.query.filter_by(election_id=mock_id).count() == 0
            # Kiosk 1 restored to real election
            assert db_session.get(KioskDevice, k1.id).election_id == test_election.id
            assert db_session.get(KioskDevice, k2.id).election_id == test_election.id
            # Mock election record removed
            assert db_session.get(Election, mock_id) is None


