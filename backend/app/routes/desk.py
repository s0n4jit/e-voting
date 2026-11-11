"""
app/routes/desk.py — Desk Officer status endpoint.
"""

from flask import Blueprint, jsonify
from app.models.election import Election
from app.utils.decorators import desk_required

desk_bp = Blueprint("desk", __name__)


@desk_bp.get("/state")
@desk_required
def desk_state():
    """Polled by the desk screens and AppShell header: reflects both real election and mock status."""
    election = Election.current()
    active_mock = Election.query.filter_by(is_mock=True).filter(Election.status != "archived").first()
    has_mock = bool(active_mock)
    return jsonify({
        "open": bool(election.desk_open) if election else True,
        "paused": bool(election and election.voting_paused),
        "mock": has_mock or bool(election and election.is_mock),
        "is_mock": has_mock or bool(election and election.is_mock),
        "is_active": bool(election and election.is_active),
        "title": election.title if election else (active_mock.title if active_mock else None),
        "status": election.effective_status if election else (active_mock.effective_status if active_mock else None),
        "mock_info": {
            "id": active_mock.id,
            "title": active_mock.title,
        } if active_mock else None,
    }), 200
