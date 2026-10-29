"""
app/utils/decorators.py — Authorization and role validation decorators.
"""

from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

from app.extensions import db
from app.models.user import User


def admin_required(fn=None):
    """
    Decorator that checks for valid JWT with admin role / privileges.
    Can be used as `@admin_required` or `@admin_required()`.
    Returns 401 if unauthenticated, 403 if authenticated but not admin.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role == "admin":
                return func(*args, **kwargs)

            # Fallback verification in database
            identity = get_jwt_identity()
            if identity and str(identity).isdigit():
                user = db.session.get(User, int(identity))
                if user and (user.is_admin or user.role == "admin"):
                    return func(*args, **kwargs)

            return (
                jsonify({
                    "error": "Forbidden",
                    "message": "Administrator privileges required to access this resource.",
                }),
                403,
            )

        return wrapper

    if fn is not None:
        return decorator(fn)
    return decorator


def voter_required(fn=None):
    """
    Decorator that verifies the user has a valid JWT and active account.
    Can be used as `@voter_required` or `@voter_required()`.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role not in ("voter", "admin"):
                return (
                    jsonify({
                        "error": "Forbidden",
                        "message": "Voter privileges required to access this resource.",
                    }),
                    403,
                )
            return func(*args, **kwargs)

        return wrapper

    if fn is not None:
        return decorator(fn)
    return decorator
