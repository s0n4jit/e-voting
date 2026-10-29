"""
tests/integration/test_auth_routes.py
======================================
Integration tests for authentication HTTP endpoints:
  POST /api/auth/login
  POST /api/auth/verify-otp
  POST /api/auth/refresh
  POST /api/auth/logout
  GET  /api/auth/me

Covers:
  - Full login → OTP → JWT issuance flow
  - Protected route rejection without token
  - Admin-only route rejection with voter JWT
  - Invalid credentials / bad OTP handling
  - Token refresh and logout
"""
import pytest
import pyotp
from flask_jwt_extended import decode_token


AUTH = "/api/auth"


# ═══════════════════════════════════════════════════════════════════════════
#  Login endpoint  POST /api/auth/login
# ═══════════════════════════════════════════════════════════════════════════

class TestLoginEndpoint:
    """Tests for the first-factor (password) login step."""

    def test_login_with_valid_credentials_returns_temp_token(self, client, voter_user):
        """Correct student_id + password should return a temporary token for OTP."""
        resp = client.post(f"{AUTH}/login", json={
            "student_id": voter_user.student_id,
            "password": "TestPass@123",
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert "temp_token" in data
        assert data.get("mfa_required") is True

    def test_login_with_wrong_password_returns_401(self, client, voter_user):
        """An incorrect password must return HTTP 401."""
        resp = client.post(f"{AUTH}/login", json={
            "student_id": voter_user.student_id,
            "password": "WRONG_PASSWORD",
        })
        assert resp.status_code == 401
        assert "access_token" not in (resp.get_json() or {})

    def test_login_with_nonexistent_student_id_returns_401(self, client):
        """A student ID that does not exist must return 401 (not 404, to avoid enumeration)."""
        resp = client.post(f"{AUTH}/login", json={
            "student_id": "GHOST999",
            "password": "AnyPassword",
        })
        assert resp.status_code == 401

    def test_login_with_missing_fields_returns_400(self, client):
        """Missing required fields should return HTTP 400."""
        resp = client.post(f"{AUTH}/login", json={"student_id": "STU001"})
        assert resp.status_code == 400

    def test_login_returns_no_jwt_before_otp(self, client, voter_user):
        """The first login step must NOT return a full access_token — only a temp token."""
        resp = client.post(f"{AUTH}/login", json={
            "student_id": voter_user.student_id,
            "password": "TestPass@123",
        })
        data = resp.get_json()
        assert "access_token" not in data

    def test_login_error_message_does_not_reveal_field(self, client, voter_user):
        """
        Error messages should not reveal whether the student_id or the password
        was wrong (prevents user enumeration).
        """
        resp = client.post(f"{AUTH}/login", json={
            "student_id": voter_user.student_id,
            "password": "WRONG",
        })
        body = resp.get_json().get("message", "").lower()
        assert "password" not in body or "student_id" not in body


# ═══════════════════════════════════════════════════════════════════════════
#  OTP verification  POST /api/auth/verify-otp
# ═══════════════════════════════════════════════════════════════════════════

class TestOTPVerificationEndpoint:
    """Tests for the second-factor (TOTP) verification step."""

    def _get_temp_token(self, client, user):
        resp = client.post(f"{AUTH}/login", json={
            "student_id": user.student_id,
            "password": "TestPass@123",
        })
        assert resp.status_code == 200
        return resp.get_json()["temp_token"]

    def test_valid_otp_issues_jwt_access_token(self, client, voter_user):
        """A correct TOTP code should yield a full JWT access_token."""
        temp_token = self._get_temp_token(client, voter_user)
        code = pyotp.TOTP(voter_user.otp_secret).now()
        resp = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": temp_token,
            "otp": code,
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert "access_token" in data
        assert "refresh_token" in data

    def test_invalid_otp_returns_401(self, client, voter_user):
        """An incorrect TOTP code must return 401."""
        temp_token = self._get_temp_token(client, voter_user)
        resp = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": temp_token,
            "otp": "000000",
        })
        assert resp.status_code == 401
        assert "access_token" not in (resp.get_json() or {})

    def test_missing_temp_token_returns_400(self, client):
        """Request without temp_token must fail with 400."""
        resp = client.post(f"{AUTH}/verify-otp", json={"otp": "123456"})
        assert resp.status_code == 400

    def test_tampered_temp_token_returns_401(self, client, voter_user):
        """A tampered temp token must not be accepted."""
        temp_token = self._get_temp_token(client, voter_user)
        tampered = temp_token[:-5] + "XXXXX"
        code = pyotp.TOTP(voter_user.otp_secret).now()
        resp = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": tampered,
            "otp": code,
        })
        assert resp.status_code in (401, 422)

    def test_jwt_payload_contains_correct_role_voter(self, app, client, voter_user):
        """The issued JWT must carry the user's role claim."""
        temp_token = self._get_temp_token(client, voter_user)
        code = pyotp.TOTP(voter_user.otp_secret).now()
        resp = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": temp_token,
            "otp": code,
        })
        access_token = resp.get_json()["access_token"]
        with app.app_context():
            decoded = decode_token(access_token)
        assert decoded.get("role") == "voter"

    def test_jwt_payload_contains_correct_role_admin(self, app, client, admin_user):
        """Admin JWT must carry role='admin'."""
        resp = client.post(f"{AUTH}/login", json={
            "student_id": admin_user.student_id,
            "password": "TestPass@123",
        })
        temp_token = resp.get_json()["temp_token"]
        code = pyotp.TOTP(admin_user.otp_secret).now()
        resp2 = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": temp_token,
            "otp": code,
        })
        access_token = resp2.get_json()["access_token"]
        with app.app_context():
            decoded = decode_token(access_token)
        assert decoded.get("role") == "admin"


# ═══════════════════════════════════════════════════════════════════════════
#  Protected route access  GET /api/auth/me
# ═══════════════════════════════════════════════════════════════════════════

class TestProtectedRoutes:
    """Ensure endpoints that require authentication reject unauthenticated requests."""

    def test_me_endpoint_rejects_no_token(self, client):
        """GET /api/auth/me without Authorization header → 401."""
        resp = client.get(f"{AUTH}/me")
        assert resp.status_code == 401

    def test_me_endpoint_accepts_valid_voter_token(self, client, voter_token):
        """GET /api/auth/me with valid token → 200 with user data."""
        resp = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {voter_token}"})
        data = resp.get_json()
        assert resp.status_code == 200
        assert "student_id" in data

    def test_me_endpoint_rejects_malformed_token(self, client):
        """A syntactically wrong token should yield 422 (Unprocessable Entity)."""
        resp = client.get(f"{AUTH}/me", headers={"Authorization": "Bearer not.a.real.token"})
        assert resp.status_code in (401, 422)

    def test_me_endpoint_rejects_expired_token(self, app, client, voter_user):
        """An expired JWT must be rejected."""
        from flask_jwt_extended import create_access_token
        from datetime import timedelta
        with app.app_context():
            expired_token = create_access_token(
                identity=str(voter_user.id),
                expires_delta=timedelta(seconds=-1),
                additional_claims={"role": "voter"},
            )
        resp = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
#  Admin-only routes
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminOnlyRoutes:
    """Verify that admin endpoints reject voter-role JWTs."""

    ADMIN_ENDPOINTS = [
        ("GET",  "/api/admin/elections"),
        ("POST", "/api/admin/elections"),
        ("GET",  "/api/admin/voters"),
        ("POST", "/api/admin/voters/import"),
        ("GET",  "/api/admin/audit-logs"),
    ]

    @pytest.mark.parametrize("method,endpoint", [
        ("GET",  "/api/admin/elections"),
        ("GET",  "/api/admin/audit-logs"),
    ])
    def test_admin_route_rejects_unauthenticated(self, client, method, endpoint):
        """Admin routes without any token → 401."""
        resp = getattr(client, method.lower())(endpoint)
        assert resp.status_code == 401

    @pytest.mark.parametrize("method,endpoint", [
        ("GET",  "/api/admin/elections"),
        ("GET",  "/api/admin/audit-logs"),
    ])
    def test_admin_route_rejects_voter_token(self, client, voter_token, method, endpoint):
        """Admin routes called with a voter JWT → 403 Forbidden."""
        resp = getattr(client, method.lower())(
            endpoint,
            headers={"Authorization": f"Bearer {voter_token}"},
        )
        assert resp.status_code == 403

    def test_admin_route_accepts_admin_token(self, client, admin_token):
        """Admin routes with a valid admin JWT → not 401/403."""
        resp = client.get(
            "/api/admin/elections",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code not in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════
#  Token refresh  POST /api/auth/refresh
# ═══════════════════════════════════════════════════════════════════════════

class TestTokenRefresh:
    """Verify the refresh token flow."""

    def _full_login(self, client, user):
        resp = client.post(f"{AUTH}/login", json={
            "student_id": user.student_id,
            "password": "TestPass@123",
        })
        temp_token = resp.get_json()["temp_token"]
        code = pyotp.TOTP(user.otp_secret).now()
        resp2 = client.post(f"{AUTH}/verify-otp", json={
            "temp_token": temp_token,
            "otp": code,
        })
        return resp2.get_json()

    def test_refresh_with_valid_refresh_token(self, client, voter_user):
        """A valid refresh token should yield a new access token."""
        tokens = self._full_login(client, voter_user)
        resp = client.post(
            f"{AUTH}/refresh",
            headers={"Authorization": f"Bearer {tokens['refresh_token']}"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.get_json()

    def test_refresh_rejects_access_token(self, client, voter_user):
        """
        The refresh endpoint should reject a regular access token
        (not a refresh token).
        """
        tokens = self._full_login(client, voter_user)
        resp = client.post(
            f"{AUTH}/refresh",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert resp.status_code in (401, 422)


# ═══════════════════════════════════════════════════════════════════════════
#  Logout  POST /api/auth/logout
# ═══════════════════════════════════════════════════════════════════════════

class TestLogout:
    def test_logout_invalidates_token(self, client, voter_token):
        """After logout the same access token should be rejected."""
        # Logout
        resp = client.post(
            f"{AUTH}/logout",
            headers={"Authorization": f"Bearer {voter_token}"},
        )
        assert resp.status_code == 200

        # Try to use the token again
        resp2 = client.get(
            f"{AUTH}/me",
            headers={"Authorization": f"Bearer {voter_token}"},
        )
        assert resp2.status_code == 401
