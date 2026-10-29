"""
app/services/otp_service.py — One-Time Password (TOTP) service.

Handles:
  - Base-32 secret key generation
  - TOTP URI generation for QR codes (Google Authenticator / Authy)
  - OTP verification against a user or raw secret
  - Email dispatch of OTP codes via Flask-Mail
"""

import logging
import pyotp
from flask import current_app
from flask_mail import Message

logger = logging.getLogger(__name__)


class OTPService:
    @staticmethod
    def generate_secret(length: int = 32) -> str:
        """Generate a random base-32 secret key."""
        return pyotp.random_base32(length=length)

    @staticmethod
    def provisioning_uri(secret: str, account_name: str, issuer_name: str = None) -> str:
        """Generate a standard otpauth:// URI for authenticator apps."""
        if issuer_name is None:
            try:
                issuer_name = current_app.config.get("OTP_ISSUER", "CampusEVoting")
            except Exception:
                issuer_name = "CampusEVoting"
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=account_name, issuer_name=issuer_name)

    @staticmethod
    def verify_otp(secret: str, code: str, valid_window: int = 1) -> bool:
        """Verify code against base-32 secret key."""
        if not secret or not code:
            return False
        cleaned_code = str(code).strip()
        if not cleaned_code:
            return False
        totp = pyotp.TOTP(secret)
        return bool(totp.verify(cleaned_code, valid_window=valid_window))

    @classmethod
    def verify_user_otp(cls, user, code: str, valid_window: int = 1) -> bool:
        """Verify code for a User instance."""
        if not user or not getattr(user, "otp_secret", None):
            return False
        return cls.verify_otp(user.otp_secret, code, valid_window=valid_window)

    @classmethod
    def get_totp_uri(cls, user) -> str:
        """Generate TOTP provisioning URI for user."""
        account_name = getattr(user, "email", None) or getattr(user, "student_id", "voter")
        secret = getattr(user, "otp_secret", "")
        return cls.provisioning_uri(secret, account_name=account_name)

    @classmethod
    def send_otp_email(cls, user, code: str) -> bool:
        """
        Send an OTP code to the user's email address.
        Falls back to logging if mail server is unconfigured or send fails.
        """
        recipient = getattr(user, "email", None)
        if not recipient:
            logger.warning("send_otp_email: No recipient email for user %s", getattr(user, "id", None))
            return False

        subject = "Campus e-Voting Verification Code"
        body = (
            f"Hello {getattr(user, 'name', 'Voter')},\n\n"
            f"Your one-time verification code is:\n\n"
            f"    {code}\n\n"
            f"This code expires shortly. If you did not request this, please contact support.\n"
        )

        try:
            from app.extensions import mail
            if current_app and current_app.config.get("MAIL_SUPPRESS_SEND"):
                logger.info("[MOCK MAIL] Sent OTP %s to %s", code, recipient)
                return True

            msg = Message(
                subject=subject,
                recipients=[recipient],
                body=body,
            )
            mail.send(msg)
            logger.info("OTP email successfully sent to %s", recipient)
            return True
        except Exception as exc:
            logger.warning("Could not dispatch OTP email to %s: %s (Logging OTP: %s)", recipient, exc, code)
            return False


# Module-level alias functions for convenience
generate_otp_secret = OTPService.generate_secret
get_totp_uri = OTPService.get_totp_uri
verify_user_otp = OTPService.verify_user_otp
send_otp_email = OTPService.send_otp_email
verify_otp = OTPService.verify_otp
provisioning_uri = OTPService.provisioning_uri
