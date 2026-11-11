"""
tests/integration/test_officer_receipts.py
==========================================
Integration tests for election officer centralized receipt & audit endpoints:
  - GET    /api/officer/receipts
  - GET    /api/officer/receipts/<slip_id>/html
  - GET    /api/officer/receipts/<slip_id>/pdf
  - GET    /api/officer/receipts/export-zip
  - DELETE /api/officer/receipts/mock
  - POST   /api/officer/receipts/<slip_id>/mark-printed
"""

import io
import json
import zipfile
import pytest

from app.models.vote_receipt import VoteReceipt
from app.models.audit_log import AuditLog


@pytest.fixture()
def sample_receipts(db_session, sample_election):
    """Create live and mock receipts for testing."""
    r1 = VoteReceipt(
        slip_id="VOTE-LIVE0001",
        election_id=sample_election.id,
        booth_name="BOOTH-01",
        is_mock=False,
        choices_json=json.dumps([{"position": "President", "candidate": "Alice"}]),
        is_printed=True,
    )
    r2 = VoteReceipt(
        slip_id="VOTE-LIVE0002",
        election_id=sample_election.id,
        booth_name="BOOTH-02",
        is_mock=False,
        choices_json=json.dumps([{"position": "President", "candidate": "Bob"}]),
        is_printed=False,
        print_error="Printer paper out",
    )
    r_mock = VoteReceipt(
        slip_id="MOCK-SLIP0001",
        election_id=sample_election.id,
        booth_name="BOOTH-01",
        is_mock=True,
        choices_json=json.dumps([{"position": "President", "candidate": "Mock Candidate"}]),
        is_printed=True,
    )
    db_session.add_all([r1, r2, r_mock])
    db_session.commit()
    return [r1, r2, r_mock]


class TestOfficerReceiptsAuth:
    """Verify endpoint authentication and role enforcement."""

    def test_unauthenticated_request_rejected(self, client):
        resp = client.get("/api/officer/receipts")
        assert resp.status_code == 401

    def test_voter_forbidden(self, client, voter_token):
        resp = client.get(
            "/api/officer/receipts",
            headers={"Authorization": f"Bearer {voter_token}"},
        )
        assert resp.status_code == 403

    def test_admin_authorized(self, client, admin_token, sample_receipts):
        resp = client.get(
            "/api/officer/receipts",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "items" in data
        assert data["total"] >= 3


class TestOfficerReceiptsListing:
    """Verify receipts querying, filtering, and counts."""

    def test_filter_by_mock(self, client, admin_token, sample_receipts):
        headers = {"Authorization": f"Bearer {admin_token}"}

        resp_mock = client.get("/api/officer/receipts?is_mock=true", headers=headers)
        assert resp_mock.status_code == 200
        mock_items = resp_mock.get_json()["items"]
        assert all(item["is_mock"] for item in mock_items)
        assert any(item["slip_id"] == "MOCK-SLIP0001" for item in mock_items)

        resp_live = client.get("/api/officer/receipts?is_mock=false", headers=headers)
        assert resp_live.status_code == 200
        live_items = resp_live.get_json()["items"]
        assert all(not item["is_mock"] for item in live_items)
        assert any(item["slip_id"] == "VOTE-LIVE0001" for item in live_items)

    def test_search_by_slip_id(self, client, admin_token, sample_receipts):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts?search=LIVE0001", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["items"]) == 1
        assert data["items"][0]["slip_id"] == "VOTE-LIVE0001"


class TestOfficerReceiptContent:
    """Verify HTML preview and vector PDF retrieval."""

    def test_get_receipt_html(self, client, admin_token, sample_receipts):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts/VOTE-LIVE0001/html", headers=headers)
        assert resp.status_code == 200
        assert "text/html" in resp.content_type
        assert b"VOTE-LIVE0001" in resp.data

    def test_get_receipt_html_not_found(self, client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts/NONEXISTENT/html", headers=headers)
        assert resp.status_code == 404

    def test_get_receipt_pdf(self, client, admin_token, sample_receipts):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts/VOTE-LIVE0001/pdf", headers=headers)
        assert resp.status_code == 200
        assert "application/pdf" in resp.content_type
        assert resp.data.startswith(b"%PDF")

    def test_get_receipt_pdf_not_found(self, client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts/NONEXISTENT/pdf", headers=headers)
        assert resp.status_code == 404


class TestOfficerReceiptExportsAndActions:
    """Verify ZIP exports, remote reprint marking, and mock cleanup."""

    def test_export_zip(self, client, admin_token, sample_receipts):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.get("/api/officer/receipts/export-zip", headers=headers)
        assert resp.status_code == 200
        assert "application/zip" in resp.content_type

        with zipfile.ZipFile(io.BytesIO(resp.data), "r") as zf:
            namelist = zf.namelist()
            assert "manifest.csv" in namelist
            assert any(f.endswith(".pdf") for f in namelist)

    def test_mark_receipt_printed(self, client, admin_token, sample_receipts, db_session):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.post("/api/officer/receipts/VOTE-LIVE0002/mark-printed", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["is_printed"] is True
        assert data["print_error"] is None
        assert data["reprinted_at"] is not None

        # Verify audit log recorded
        audit = AuditLog.query.filter_by(action="RECEIPT_REPRINTED").first()
        assert audit is not None
        assert "VOTE-LIVE0002" in audit.details

    def test_mark_receipt_printed_not_found(self, client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.post("/api/officer/receipts/NONEXISTENT/mark-printed", headers=headers)
        assert resp.status_code == 404

    def test_clear_mock_receipts(self, client, admin_token, sample_receipts, sample_election, db_session):
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = client.delete(
            f"/api/officer/receipts/mock?election_id={sample_election.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["cleared"] >= 1

        # Check DB state
        assert VoteReceipt.query.filter_by(slip_id="MOCK-SLIP0001").first() is None
        assert VoteReceipt.query.filter_by(slip_id="VOTE-LIVE0001").first() is not None
        assert VoteReceipt.query.filter_by(slip_id="VOTE-LIVE0002").first() is not None
