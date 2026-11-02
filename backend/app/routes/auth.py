"""
app/routes/auth.py — Authentication routes.
"""

import io
import base64
import pyotp
import qrcode
from datetime import datetime, timedelta, timezone
from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt,
    get_jwt_identity,
    decode_token,
)

from app.extensions import db, limiter, token_blacklist, commit_or_flush
from app.models.user import User
from app.models.election import Election
from app.models.voter_record import VoterRecord
from app.models.audit_log import AuditLog
from app.models.voting_token import VotingToken
from app.models.kiosk_device import KioskDevice
from app.utils.validators import sanitize_input, validate_password

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
@limiter.limit("10 per minute")
def login():
    """
    Step 1 of 2FA:
    Authenticate student_id or email and password.
    Returns a temporary token for TOTP verification.
    """
    payload = request.get_json(silent=True) or {}
    identifier = sanitize_input(
        payload.get("email")
        or payload.get("student_id")
        or payload.get("identifier")
        or payload.get("username")
    )
    password = payload.get("password")

    if not identifier or not password:
        return (
            jsonify({
                "error": "Missing credentials.",
                "message": "Both student ID / email and password are required.",
            }),
            400,
        )

    # Search by email or student_id (case-insensitive)
    user = User.query.filter(
        (db.func.lower(User.email) == identifier.lower()) |
        (db.func.lower(User.student_id) == identifier.lower())
    ).first()

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

    if not user.otp_enabled:
        return _issue_session(user), 200

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
@limiter.limit("10 per minute")
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

    clean_code = str(otp_code).strip()
    demo = current_app.config.get("DEMO_OTP_CODE")
    if not (user.otp_secret and user.verify_otp(clean_code)) and not (demo and clean_code == demo):
        return (
            jsonify({
                "error": "Unauthorized",
                "message": "Invalid or expired Authenticator code. Please check your authenticator app time sync.",
            }),
            401,
        )

    return _issue_session(user), 200


def _issue_session(user):
    """Create access/refresh tokens and a LOGIN_SUCCESS audit entry; returns the response body."""
    role = "admin" if (user.is_admin or user.role == "admin") else user.role
    claims = {"role": role, "student_id": user.student_id, "name": user.name}
    body = {
        "access_token": create_access_token(identity=str(user.id), additional_claims=claims),
        "refresh_token": create_refresh_token(
            identity=str(user.id), additional_claims={"role": role, "student_id": user.student_id}
        ),
        "user": user.to_dict(),
    }
    db.session.add(AuditLog(
        user_id=user.id,
        action="LOGIN_SUCCESS",
        details="Signed in.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "client",
    ))
    commit_or_flush()
    return jsonify(body)


@auth_bp.get("/last-login")
@jwt_required()
def last_login():
    """When and from where this account last signed in (the sign-in before the current one, if any)."""
    from app.utils.timeutil import utc_iso

    rows = (
        AuditLog.query.filter_by(user_id=int(get_jwt_identity()), action="LOGIN_SUCCESS")
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(2).all()
    )
    row = rows[-1] if rows else None
    return jsonify({"at": utc_iso(row.created_at) if row else None, "ip": row.ip_address if row else None}), 200


@auth_bp.put("/photo")
@jwt_required()
def set_photo():
    """Staff set or remove their own profile picture (data URL, same limits as the institution logo)."""
    from app.routes.setup import LOGO_RE, MAX_LOGO_CHARS

    user = db.session.get(User, int(get_jwt_identity()))
    if not user or user.role not in ("admin", "polling_officer"):
        return jsonify({"error": "Forbidden"}), 403
    photo = (request.get_json(silent=True) or {}).get("photo") or ""
    if photo and (len(photo) > MAX_LOGO_CHARS or not LOGO_RE.match(photo)):
        return jsonify({"error": "Bad photo", "message": "Use a PNG, JPEG or WebP image under 300 KB."}), 400
    user.photo = photo or None
    commit_or_flush()
    return jsonify(user.to_dict()), 200


@auth_bp.post("/forgot-password")
@limiter.limit("5 per minute")
def forgot_password():
    """
    Self-service reset for staff who turned on two-step verification: the account name, a current
    authenticator code and a new password. Accounts without it cannot be reset here (an Election
    Officer resets Desk Officers; the server operator uses `manage.py set-password`).
    """
    payload = request.get_json(silent=True) or {}
    identifier = sanitize_input(payload.get("identifier") or "")
    code, new = str(payload.get("code") or "").strip(), payload.get("new_password") or ""
    failure = (jsonify({"error": "Cannot reset", "message": "We could not verify those details. Check the account name and the current code from your authenticator app."}), 400)

    user = User.query.filter(
        (db.func.lower(User.email) == identifier.lower()) | (db.func.lower(User.student_id) == identifier.lower())
    ).first() if identifier else None
    if not user or user.role not in ("admin", "polling_officer") or not user.is_active or not user.otp_enabled or not user.verify_otp(code):
        return failure
    ok, message = validate_password(new)
    if not ok:
        return jsonify({"error": "Weak password", "message": message}), 400

    user.set_password(new)
    db.session.add(AuditLog(
        user_id=user.id,
        action="PASSWORD_RESET",
        details="Reset their password with an authenticator code.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "client",
    ))
    commit_or_flush()
    return jsonify({"message": "Your password has been reset. You can sign in now."}), 200


@auth_bp.post("/change-password")
@jwt_required()
@limiter.limit("5 per minute")
def change_password():
    """Signed-in staff change their own password, confirmed with the current password or an authenticator code."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or user.role not in ("admin", "polling_officer"):
        return jsonify({"error": "Forbidden", "message": "Only staff accounts have a password."}), 403

    payload = request.get_json(silent=True) or {}
    current, new = payload.get("current_password") or "", payload.get("new_password") or ""
    code = str(payload.get("code") or "").strip()
    if code:  # forgot the current password: an authenticator code proves it is really them
        if not (user.otp_enabled and user.verify_otp(code)):
            return jsonify({"error": "Wrong code", "message": "That authenticator code is not correct.", "field": "code"}), 400
    elif not user.check_password(current):
        return jsonify({"error": "Wrong password", "message": "The current password is not correct.", "field": "current_password"}), 400
    ok, message = validate_password(new)
    if not ok:
        return jsonify({"error": "Weak password", "message": message, "field": "new_password"}), 400
    if new == current:
        return jsonify({"error": "Same password", "message": "Choose a password different from the current one.", "field": "new_password"}), 400

    user.set_password(new)
    db.session.add(AuditLog(
        user_id=user.id,
        action="PASSWORD_CHANGED",
        details="Changed their own password.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "client",
    ))
    commit_or_flush()
    return jsonify({"message": "Your password has been changed."}), 200


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
    from flask_jwt_extended import decode_token
    from app.models.revoked_token import RevokedToken

    payload = get_jwt()
    jti = payload.get("jti")
    if jti:
        token_blacklist.add(jti)
        RevokedToken.revoke(payload)
    refresh = (request.get_json(silent=True) or {}).get("refresh_token")
    if refresh:  # the matching refresh token must not be usable either
        try:
            RevokedToken.revoke(decode_token(refresh))
        except Exception:
            pass
    RevokedToken.purge_expired()

    user_id = get_jwt_identity()
    if user_id and str(user_id).isdigit():
        audit = AuditLog(
            user_id=int(user_id),
            action="LOGOUT",
            details="Signed out.",
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        db.session.add(audit)
        commit_or_flush()

    return jsonify({"message": "Successfully logged out."}), 200


@auth_bp.get("/totp/setup")
@jwt_required()
def setup_totp():
    """
    Generate an RFC 6238 TOTP registration payload including:
    - Base32 secret
    - Standard otpauth:// provisioning URI
    - Base64 data-URL QR code for instant scanning with Google/Microsoft Authenticator
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    # Generate or reuse secret
    secret = user.otp_secret or pyotp.random_base32()
    user.otp_secret = secret
    db.session.commit()

    # Create standard RFC 6238 URI
    label = f"{user.student_id} ({user.name})"
    provisioning_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=label,
        issuer_name="Campus E-Voting System",
    )

    # Render PNG QR Code into in-memory buffer
    qr_img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    qr_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    qr_data_url = f"data:image/png;base64,{qr_base64}"

    return (
        jsonify({
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "qr_code": qr_data_url,
            "otp_enabled": bool(user.otp_enabled),
            "student_id": user.student_id,
            "issuer": "Campus E-Voting System",
            "message": "TOTP setup credentials generated. Scan QR code in Google Authenticator or Microsoft Authenticator.",
        }),
        200,
    )


@auth_bp.post("/totp/enable")
@jwt_required()
def enable_totp():
    """Verify initial 6-digit rolling code to permanently bind and activate TOTP."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code") or payload.get("otp", "")).strip()

    if not code:
        return jsonify({"error": "6-digit Authenticator code is required."}), 400

    if not user.otp_secret:
        return jsonify({"error": "Please initialize TOTP setup first."}), 400

    totp = pyotp.TOTP(user.otp_secret)
    if not totp.verify(code, valid_window=1):
        return (
            jsonify({
                "error": "Invalid Code",
                "message": "The 6-digit code entered does not match. Ensure your device time is synchronized.",
            }),
            400,
        )

    user.otp_enabled = True
    audit = AuditLog(
        user_id=user.id,
        action="TOTP_2FA_ENABLED",
        details="Turned on two-step verification.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "auth",
    )
    db.session.add(audit)
    commit_or_flush()

    return (
        jsonify({
            "success": True,
            "otp_enabled": True,
            "message": "Two-factor authentication successfully enabled! Future logins will require Google/Microsoft Authenticator.",
        }),
        200,
    )


@auth_bp.post("/totp/disable")
@jwt_required()
def disable_totp():
    """Disable TOTP 2FA (requires current account password confirmation)."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.role == "admin":
        return jsonify({"error": "Required", "message": "Two-step verification is required for election officers and cannot be turned off."}), 403

    payload = request.get_json(silent=True) or {}
    password = payload.get("password")

    if not password or not user.check_password(password):
        return jsonify({"error": "Account password required to disable 2FA."}), 401

    user.otp_enabled = False
    audit = AuditLog(
        user_id=user.id,
        action="TOTP_2FA_DISABLED",
        details="Turned off two-step verification.",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "auth",
    )
    db.session.add(audit)
    commit_or_flush()

    return (
        jsonify({
            "success": True,
            "otp_enabled": False,
            "message": "Two-factor authentication has been disabled.",
        }),
        200,
    )


@auth_bp.get("/me")
@jwt_required()
def get_current_user():
    """Fetch profile data of the currently authenticated user."""
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity)) if str(identity).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    return jsonify(user.to_dict()), 200


@auth_bp.get("/active-election")
def get_active_election():
    """
    Public/Kiosk discovery endpoint for the current campus election.
    Accessible without JWT so unauthenticated kiosk booths can discover election details.
    """
    active_elections = Election.query.filter_by(is_active=True).all()
    election = Election.current()

    if not election:
        return jsonify({"election": None, "elections": []}), 200

    return jsonify({
        "election": election.to_dict(),
        "election_id": election.id,
        "title": election.title,
        "elections": [e.to_dict() for e in active_elections],
    }), 200


@auth_bp.post("/voter-session-end")
@jwt_required()
def voter_session_end():
    """The voter left the booth without voting ("This is not me", idle reset): the student is no longer shown as active."""
    claims = get_jwt()
    if claims.get("role") == "voter" and claims.get("election_id"):
        VotingToken.query.filter_by(
            student_id=claims.get("student_id"), election_id=claims["election_id"], is_used=False
        ).update({"authenticated_at": None}, synchronize_session=False)
        db.session.commit()
    return jsonify({"ok": True}), 200


@auth_bp.post("/voter-pin-login")
@limiter.limit("30 per minute")
def voter_pin_login():
    """
    Lab Kiosk / Desk PIN Authentication:
    Authenticates a voter using their Student ID and single-use 6-digit Voting PIN.
    Optionally validates authorized kiosk terminal token.
    Issues JWT session token authorized for casting a ballot.
    """
    payload = request.get_json(silent=True) or {}
    student_id = sanitize_input(payload.get("student_id"))
    voting_pin = sanitize_input(payload.get("voting_pin") or payload.get("pin"))
    election_id = payload.get("election_id")
    kiosk_token = sanitize_input(payload.get("kiosk_token") or request.headers.get("X-Kiosk-Token"))

    if not student_id or not voting_pin:
        return (
            jsonify({
                "error": "Missing required fields.",
                "message": "student_id and voting_pin are required.",
            }),
            400,
        )

    # Voting is only possible from an authorized booth (see routes/booth.py), and a booth serves its own election
    is_kiosk_valid, kiosk_device = KioskDevice.verify_token(kiosk_token)
    if not is_kiosk_valid:
        return (
            jsonify({
                "error": "Unauthorized Kiosk",
                "message": "This computer is not set up as a voting booth. Ask the election officer for a booth token.",
            }),
            403,
        )
    if kiosk_device.election_id:
        election_id = kiosk_device.election_id

    if election_id:
        try:
            election_id = int(election_id)
            election = db.session.get(Election, election_id)
        except (ValueError, TypeError):
            return jsonify({"error": "election_id must be an integer."}), 400
    else:
        active_elections = Election.query.filter_by(is_active=True).all()
        ongoing = [e for e in active_elections if e.is_ongoing]
        election = ongoing[0] if ongoing else (
            active_elections[0] if active_elections else None
        )

    if not election:
        return (
            jsonify({
                "error": "Election not found.",
                "message": "No active election available for voting.",
            }),
            404,
        )

    if not election.is_ongoing:
        return (
            jsonify({
                "error": "Election inactive.",
                "message": "Voting is paused for a short while." if election.is_active
                else "This election is not currently open for voting.",
            }),
            400,
        )


    # Resolve student user
    user = User.query.filter(
        db.func.upper(User.student_id) == student_id.strip().upper(), User.role == "voter"
    ).first()
    if not user:
        return (
            jsonify({
                "error": "Invalid credentials",
                "message": "Invalid voter slip ID or Voting PIN.",
            }),
            401,
        )

    # Check if voter has already voted
    voter_hash = User.hash_student_id(user.student_id)
    voter_record = VoterRecord.query.filter_by(
        election_id=election.id, voter_hash=voter_hash
    ).first()
    if voter_record and voter_record.has_voted:
        return (
            jsonify({
                "error": "Already voted",
                "message": "You have already cast your ballot in this election.",
            }),
            403,
        )

    # Verify 6-digit Voting PIN
    is_valid_pin, token_obj = VotingToken.verify_pin(
        student_id=user.student_id,
        election_id=election.id,
        raw_pin=voting_pin,
    )
    if not is_valid_pin:
        # Lock the slip's PIN after 5 wrong guesses so a 6-digit PIN cannot be brute-forced.
        latest = (
            VotingToken.query.filter_by(student_id=user.student_id, election_id=election.id, is_used=False)
            .order_by(VotingToken.created_at.desc()).first()
        )
        if latest:
            latest.failed_attempts = (latest.failed_attempts or 0) + 1
            if latest.failed_attempts >= 5:
                latest.is_used = True
                db.session.add(AuditLog(
                    user_id=user.id, action="PIN_LOCKED",
                    details=f"The voting PIN of {user.student_id} was cancelled after 5 wrong entries. A new PIN must be issued at the desk.",
                    ip_address=request.remote_addr or "127.0.0.1",
                ))
            db.session.commit()
        return (
            jsonify({
                "error": "Invalid PIN",
                "message": "That PIN is incorrect, expired or already used. Please ask the desk for a new slip.",
            }),
            401,
        )

    token_obj.authenticated_at = datetime.now(timezone.utc)

    # Issue voter JWT token scoped for ballot casting
    access_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(minutes=30),
        additional_claims={
            "role": "voter",
            "student_id": user.student_id,
            "name": user.name,
            "election_id": election.id,
            "voting_authorized": True,
            "is_kiosk": True,
            "booth_id": kiosk_device.booth_id,
            "booth_ref": kiosk_device.ref,
        },
    )

    audit = AuditLog(
        user_id=user.id,
        action="PIN_LOGIN_SUCCESS",
        details=f"Entered a valid PIN and started voting in \u201c{election.title}\u201d at booth {kiosk_device.booth_id} (session {kiosk_device.ref}).",
        ip_address=request.remote_addr or "127.0.0.1",
        user_agent=request.user_agent.string if request.user_agent else "kiosk",
    )
    db.session.add(audit)
    commit_or_flush()

    return (
        jsonify({
            "access_token": access_token,
            "user": user.to_dict(),
            "election_id": election.id,
            "voting_authorized": True,
            "message": "Voter successfully authenticated via Voting PIN.",
        }),
        200,
    )
