"""
app/utils/validators.py — Input validation and sanitization utilities.
"""

import re
import bleach


def sanitize_input(value):
    """
    Sanitize text input using bleach to remove malicious HTML and script tags.
    Handles strings, lists, and dicts recursively.
    """
    if isinstance(value, str):
        cleaned = bleach.clean(value.strip(), tags=[], strip=True)
        return cleaned
    if isinstance(value, list):
        return [sanitize_input(item) for item in value]
    if isinstance(value, dict):
        return {k: sanitize_input(v) for k, v in value.items()}
    return value


def validate_student_id(student_id: str) -> bool:
    """Validate student ID format: alphanumeric, dashes, 3-32 chars."""
    if not student_id or not isinstance(student_id, str):
        return False
    trimmed = student_id.strip()
    return bool(re.match(r"^[A-Za-z0-9\-_]{3,32}$", trimmed))


def validate_email(email: str) -> bool:
    """Validate email address format."""
    if not email or not isinstance(email, str) or len(email) > 120:
        return False
    email_regex = r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$"
    return bool(re.match(email_regex, email.strip()))


def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password complexity:
      - At least 8 characters
      - Contains both letters and digits
    """
    if not password or not isinstance(password, str):
        return False, "Password cannot be empty."
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isalpha() for c in password):
        return False, "Password must contain at least one letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit."
    return True, ""
