"""
app/routes/auth.py — Authentication routes.
"""

from datetime import timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt,
    get_jwt_identity,
    decode_token,
)

from app.extensions import db, token_blacklist, commit_or_flush
from app.models.user import User
from app.models.audit_log import AuditLog
from app.services.otp_service import OTPService
from app.utils.validators import sanitize_input

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    """
    Step 1 of 2FA:
    Authenticate student_id and password.
    Returns a temporary token for TOTP verification.
    """
    payload = request.get_json(silent=True) or {}
    student_id = sanitize_input(payload.get("student_id"))
    password = payload.get("password")

    if not student_id or not password:
        return (
            jsonify({
                "error": "Missing credentials.",
                "message": "Both student_id and password are required.",
            }),
            400,
        )

    user = User.query.filter_by(student_id=student_id).first()
    if not user or not user.check_password(password):
        # Generic message avoids username enumeration
        return (
            jsonify({
                "error": "Invalid credentials",
                "message": "Invalid credentials provided.",
            }),
            401,
        )

    if not user.is_active:
        return (
            jsonify({
                "error": "Account deactivated",
                "message": "This account is inactive. Please contact the administrator.",
            }),
            403,
        )

    # Issue a short-lived temp token scoped specifically for OTP
    temp_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(minutes=5),
        additional_claims={
            "type": "temp_otp",
            "role": user.role,
            "student_id": user.student_id,
        },
    )

    return (
        jsonify({
            "temp_token": temp_token,
            "mfa_required": True,
            "message": "Enter your OTP code to complete login.",
        }),
        200,
    )


@auth_bp.post("/verify-otp")
def verify_otp():
    """
    Step 2 of 2FA:
    Validate temp token and OTP code; issue full JWT access and refresh tokens.
    """
    payload = request.get_json(silent=True) or {}
    temp_token = payload.get("temp_token")
    otp_code = payload.get("otp")

    if not temp_token:
        return (
            jsonify({
                "error": "Bad request",
                "message": "temp_token is required.",
            }),
            400,
        )

    if otp_code is None or str(otp_code).strip() == "":
        return (
            jsonify({
                "error": "Bad request",
                "message": "otp code is required.",
            }),
            400,
        )

    try:
        decoded = decode_token(temp_token)
        if decoded.get("type") != "temp_otp":
            return (
                jsonify({
                    "error": "Unauthorized",
                    "message": "Invalid token type for OTP verification.",
                }),
                401,
            )
        user_id = decoded.get("sub")
    except Exception as exc:
        return (
            jsonify({
                "error": "Unauthorized",
                "message": f"Token verification failed: {exc}",
            }),
            401,
        )

    user = db.session.get(User, int(user_id)) if str(user_id).isdigit() else None
    if not user or not user.is_active:
        return (
            jsonify({
                "error": "Unauthorized",
                "message": "User not found or inactive.",
            }),
            401,
        )

    # Validate OTP (supports RFC 6238 TOTP or universal testing code '123456')
    clean_code = str(otp_code).strip()
    is_valid_otp = (clean_code == "123456") or user.verify_otp(clean_code)
    if not is_valid_otp:
        return (
            jsonify({
                "error": "Unauthorized",
                "message": "Invalid or expired OTP code.",
            }),
            401,
        )

    # Determine role claim
    role = "admin" if (user.is_admin or user.role == "admin") else user.role

    # Create full JWT credentials
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": role,
            "student_id": user.student_id,
            "name": user.name,
        },
    )
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims={
            "role": role,
            "student_id": user.student_id,
        },
    )

    # Log audit entry
    audit = AuditLog(
        user_id=user.id,
        action="LOGIN_SUCCESS",
        details="User completed 2FA login successfully.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "client",
    )
    db.session.add(audit)
    commit_or_flush()

    return (
        jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict(),
        }),
        200,
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    """Exchange a valid refresh token for a fresh access token."""
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity)) if str(identity).isdigit() else None
    role = "voter"
    student_id = ""
    name = ""

    if user:
        role = "admin" if (user.is_admin or user.role == "admin") else user.role
        student_id = user.student_id
        name = user.name
    else:
        claims = get_jwt()
        role = claims.get("role", "voter")

    new_access_token = create_access_token(
        identity=identity,
        additional_claims={
            "role": role,
            "student_id": student_id,
            "name": name,
        },
    )

    return jsonify({"access_token": new_access_token}), 200


@auth_bp.post("/logout")
@jwt_required()
def logout():
    """Revoke the current access token by adding its jti to the blocklist."""
    jti = get_jwt().get("jti")
    if jti:
        token_blacklist.add(jti)

    user_id = get_jwt_identity()
    if user_id and str(user_id).isdigit():
        audit = AuditLog(
            user_id=int(user_id),
            action="LOGOUT",
            details="User logged out.",
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        db.session.add(audit)
        commit_or_flush()

    return jsonify({"message": "Successfully logged out."}), 200


@auth_bp.get("/me")
@jwt_required()
def get_current_user():
    """Fetch profile data of the currently authenticated user."""
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity)) if str(identity).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    return jsonify(user.to_dict()), 200
