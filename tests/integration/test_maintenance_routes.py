"""
tests/integration/test_maintenance_routes.py
============================================
Integration tests for the Staff Maintenance and Diagnostics API.
"""

import pytest
from app.models.audit_log import AuditLog
from app.routes.maintenance import _pin_attempts


@pytest.fixture(autouse=True)
def clear_attempts():
    """Clear in-memory lockout table between test runs."""
    _pin_attempts.clear()
    yield
    _pin_attempts.clear()


def test_maintenance_auth_success(client):
    """Staff auth succeeds with the correct PIN and returns short-lived JWT."""
    res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["authenticated"] is True
    assert "access_token" in data
    assert data["booth_id"] == "BOOTH-LAB-01"
    assert data["expires_in_seconds"] == 900


def test_maintenance_auth_missing_pin(client):
    """Empty or missing PIN yields 400 Bad Request."""
    res = client.post("/api/maintenance/auth", json={})
    assert res.status_code == 400
    data = res.get_json()
    assert data["error"] == "PIN is required."


def test_maintenance_auth_wrong_pin(client):
    """Wrong PIN yields 401 and reports remaining attempts."""
    res = client.post("/api/maintenance/auth", json={"pin": "000000"})
    assert res.status_code == 401
    data = res.get_json()
    assert "Invalid Staff PIN" in data["message"]
    assert "remaining_attempts" in data
    assert data["remaining_attempts"] == 4


def test_maintenance_auth_lockout(client):
    """Repeated failures trigger rate-limit lockout (HTTP 429)."""
    for _ in range(5):
        res = client.post("/api/maintenance/auth", json={"pin": "111111"})

    # 6th attempt should be locked out even with correct PIN
    res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    assert res.status_code == 429
    data = res.get_json()
    assert data["error"] == "Terminal Locked"
    assert "lockout_remaining" in data


def test_maintenance_auth_success_resets_attempts(client):
    """A successful login after failed attempts resets the attempt counter."""
    client.post("/api/maintenance/auth", json={"pin": "wrong"})
    client.post("/api/maintenance/auth", json={"pin": "wrong"})

    # Successful login
    res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    assert res.status_code == 200

    # Next wrong attempt should have full attempts - 1
    res2 = client.post("/api/maintenance/auth", json={"pin": "wrong"})
    assert res2.status_code == 401
    assert res2.get_json()["remaining_attempts"] == 4


def test_maintenance_diagnostics_unauthorized(client):
    """Diagnostics endpoint rejects requests without staff token or kiosk header."""
    res = client.get("/api/maintenance/diagnostics")
    assert res.status_code == 401
    data = res.get_json()
    assert data["error"] == "Unauthorized"


def test_maintenance_diagnostics_structure_with_staff_token(client):
    """Diagnostics endpoint returns multi-tier diagnostic metadata with staff token."""
    auth_res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    token = auth_res.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/maintenance/diagnostics", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "booth_id" in data
    assert data["booth_id"] == "BOOTH-LAB-01"
    assert "os_info" in data
    assert "uptime_seconds" in data
    assert "interfaces" in data
    assert isinstance(data["interfaces"], list)
    assert "gateway" in data
    assert "status" in data["gateway"]
    assert "ip" in data["gateway"]
    assert "dns" in data
    assert "status" in data["dns"]
    assert "resolved_ips" in data["dns"]
    assert "internet" in data
    assert "status" in data["internet"]
    assert "api_status" in data
    assert data["api_status"] == "HEALTHY"
    assert "last_check" in data


def test_maintenance_diagnostics_with_kiosk_header(client):
    """Diagnostics endpoint accepts valid kiosk token header."""
    headers = {"X-Kiosk-Token": "booth-standalone-token"}
    res = client.get("/api/maintenance/diagnostics", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data["booth_id"] == "BOOTH-LAB-01"
    assert data["api_status"] == "HEALTHY"


def test_maintenance_action_forbidden_unauthenticated(client):
    """Maintenance actions require staff maintenance JWT."""
    res = client.post("/api/maintenance/action", json={"action": "restart_browser"})
    assert res.status_code in [401, 403]


def test_maintenance_action_forbidden_wrong_role(client, voter_token):
    """Maintenance actions reject non-staff maintenance JWT (e.g. voter)."""
    headers = {"Authorization": f"Bearer {voter_token}"}
    res = client.post(
        "/api/maintenance/action",
        json={"action": "restart_browser"},
        headers=headers,
    )
    assert res.status_code == 403
    assert res.get_json()["error"] == "Forbidden"


def test_maintenance_action_disallowed_action(client):
    """Arbitrary shell commands or unrecognized actions are rejected (HTTP 400)."""
    auth_res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    token = auth_res.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt unauthorized action / command injection
    res = client.post(
        "/api/maintenance/action",
        json={"action": "rm -rf /; cat /etc/passwd"},
        headers=headers,
    )
    assert res.status_code == 400
    assert res.get_json()["error"] == "Invalid Action"
    assert "not permitted" in res.get_json()["message"]


@pytest.mark.parametrize("action", ["test_network", "restart_browser", "restart_kiosk", "restart_system"])
def test_maintenance_action_permitted(client, db_session, action):
    """Permitted actions execute safely and record immutable audit logs."""
    auth_res = client.post("/api/maintenance/auth", json={"pin": "948201"})
    token = auth_res.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        "/api/maintenance/action",
        json={"action": action},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["success"] is True

    audit = (
        db_session.query(AuditLog)
        .filter_by(action="STAFF_MAINTENANCE_ACTION")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit is not None
    assert action in audit.details
