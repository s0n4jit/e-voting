"""
app/extensions.py — Shared Flask extensions.
"""

from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
jwt = JWTManager()
bcrypt = Bcrypt()
mail = Mail()
limiter = Limiter(key_func=get_remote_address)
token_blacklist = set()


def commit_or_flush(session=None):
    """
    Commit the session in production/dev, but only flush when running in TESTING mode
    so test rollback transactions remain uncommitted.
    """
    from flask import current_app
    sess = session or db.session
    try:
        if current_app and current_app.config.get("TESTING"):
            sess.flush()
            return
    except Exception:
        pass
    sess.commit()

