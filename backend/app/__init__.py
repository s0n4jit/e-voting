"""
app/__init__.py — Flask application factory.

Creates and configures the Flask app, initialises all extensions,
registers blueprints and global error handlers.
"""

import logging
import os
from http import HTTPStatus
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from flask_sqlalchemy import SQLAlchemy

from config import get_config

from app.extensions import db, jwt, bcrypt, mail, limiter, token_blacklist

_token_blacklist = token_blacklist


def create_app(config_object=None) -> Flask:
    """
    Application factory.

    Args:
        config_object: A Config class (or None to auto-detect from FLASK_ENV).

    Returns:
        A fully configured Flask application instance.
    """
    app = Flask(__name__, instance_relative_config=False)

    # ── Configuration ────────────────────────────────────────────────────────
    if isinstance(config_object, dict):
        base_cfg = get_config()
        app.config.from_object(base_cfg)
        app.config.from_mapping(config_object)
    else:
        cfg = config_object or get_config()
        app.config.from_object(cfg)

    if app.config.get("TESTING") and "sqlite" in str(app.config.get("SQLALCHEMY_DATABASE_URI", "")):
        from sqlalchemy.pool import StaticPool
        engine_opts = dict(app.config.get("SQLALCHEMY_ENGINE_OPTIONS") or {})
        engine_opts["poolclass"] = StaticPool
        engine_opts["connect_args"] = {"check_same_thread": False}
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_opts

    # ── Logging ──────────────────────────────────────────────────────────────
    _configure_logging(app)

    # ── Extensions ───────────────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", ["http://localhost:3000"])}},
        supports_credentials=True,
    )

    # ── JWT callbacks ─────────────────────────────────────────────────────────
    _register_jwt_callbacks(app)

    # ── Blueprints ────────────────────────────────────────────────────────────
    _register_blueprints(app)

    # ── Error handlers ────────────────────────────────────────────────────────
    _register_error_handlers(app)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/health")
    @app.route("/health")
    @limiter.exempt
    def health():
        return jsonify({"status": "healthy", "service": "campus-evoting-api"}), 200

    # ── Database tables ───────────────────────────────────────────────────────
    with app.app_context():
        # Import models so SQLAlchemy knows about them before create_all()
        from app.models import (  # noqa: F401
            user,
            election,
            candidate,
            voter_record,
            ballot_entry,
            audit_log,
            voting_token,
            kiosk_device,
        )

        db.create_all()
        app.logger.info("Database tables created/verified.")

    return app


# ─────────────────────────────────────────────────────────────────────────────
#  Private helpers
# ─────────────────────────────────────────────────────────────────────────────

def _configure_logging(app: Flask) -> None:
    """Set up rotating-file + console logging."""
    log_level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)

    # File handler (skip in testing to keep output clean)
    if not app.config.get("TESTING"):
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
        os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, "evoting.log"),
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        app.logger.addHandler(file_handler)

    app.logger.addHandler(console_handler)
    app.logger.setLevel(log_level)


def _register_jwt_callbacks(app: Flask) -> None:
    """Register JWT event callbacks."""

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload.get("jti")
        return jti in _token_blacklist

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked. Please log in again."}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired. Please log in again."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "Invalid token.", "details": str(error)}), 422

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "Authentication required.", "details": str(error)}), 401

    # Expose the blacklist to routes (e.g. logout)
    app.extensions["jwt_blacklist"] = _token_blacklist


def _register_blueprints(app: Flask) -> None:
    """Import and register all route blueprints."""
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp
    from app.routes.voter import voter_bp
    from app.routes.results import results_bp
    from app.routes.maintenance import maintenance_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(voter_bp, url_prefix="/api/voter")
    app.register_blueprint(results_bp, url_prefix="/api/results")
    app.register_blueprint(maintenance_bp, url_prefix="/api/maintenance")


def _register_error_handlers(app: Flask) -> None:
    """Register global HTTP error handlers."""

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request.", "details": str(e)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized.", "details": str(e)}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden.", "details": str(e)}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found.", "details": str(e)}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed.", "details": str(e)}), 405

    @app.errorhandler(429)
    def ratelimit_exceeded(e):
        return (
            jsonify({"error": "Too many requests. Please slow down.", "details": str(e)}),
            429,
        )

    @app.errorhandler(500)
    def internal_error(e):
        app.logger.exception("Unhandled server error: %s", e)
        db.session.rollback()
        return jsonify({"error": "Internal server error. Please try again later."}), 500

    @app.errorhandler(Exception)
    def unhandled_exception(e):
        app.logger.exception("Unhandled exception: %s", e)
        db.session.rollback()
        if app.config.get("DEBUG"):
            raise e
        return jsonify({"error": "An unexpected error occurred."}), 500
