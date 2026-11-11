"""
app/routes/results.py — Public and authorized election results endpoints.
"""

from flask import Blueprint, jsonify, request
from app.services.vote_service import (
    VoteService,
    VotingError,
    ResultsHiddenError,
)

results_bp = Blueprint("results", __name__)


def results_payload(election, force=False):
    """Results plus the facts a results page needs (title, institution, turnout)."""
    from app.models.system_setting import SystemSetting
    from app.utils.timeutil import utc_iso

    data = VoteService.get_results(election_id=election.id, force=force)
    data["turnout"] = VoteService.calculate_turnout(election_id=election.id)
    data["election"] = {
        "id": election.id,
        "title": election.title,
        "description": election.description,
        "status_label": ("Mock Results Published" if election.is_mock else election.STATUS_LABELS[election.effective_status]),
        "start_time": utc_iso(election.start_time),
        "end_time": utc_iso(election.end_time),
    }
    data["institution_name"] = SystemSetting.get("institution_name", "")
    return data


@results_bp.get("/public/<token>")
def get_public_results(token):
    """Results by share link. The link exists only while an Election Officer has created it."""
    from app.models.election import Election

    election = Election.query.filter_by(public_token=token).first() if len(token) >= 16 else None
    if not election or election.effective_status not in ("results_published", "archived"):
        return jsonify({"error": "Not found", "message": "These results are not available."}), 404
    return jsonify(results_payload(election, force=True)), 200


@results_bp.get("/<int:election_id>")
def get_election_results(election_id):
    """
    Retrieve results of an election.
    Returns 403 Forbidden if results have not yet been published by an admin.
    """
    try:
        results = VoteService.get_results(election_id=election_id)
        return jsonify(results), 200
    except ResultsHiddenError as rhe:
        return (
            jsonify({
                "error": "Results hidden",
                "message": str(rhe),
                "results_published": False,
            }),
            403,
        )
    except VotingError as ve:
        return jsonify({"error": "Not found", "message": str(ve)}), 404
    except Exception as exc:
        return jsonify({"error": "Server error", "message": str(exc)}), 500


@results_bp.get("/<int:election_id>/stats")
def get_election_statistics(election_id):
    """
    Retrieve voter turnout statistics for an election.
    Follows election visibility policy: live stats are hidden unless published,
    accessed with an election public token, or requested by an authenticated officer.
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    from app.extensions import db
    from app.models.election import Election

    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Not found", "message": "Election not found."}), 404

    # 1. Allow authenticated staff (admin or polling officer)
    is_staff = False
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims and claims.get("role") in ("admin", "polling_officer") and claims.get("type") != "temp_otp":
                is_staff = True
        except Exception:
            pass

    # 2. Allow if election results are published/archived or accessed via public token
    token = request.args.get("token")
    has_valid_token = bool(token and election.public_token and token == election.public_token)
    is_published = election.effective_status in ("results_published", "archived")

    if not (is_staff or is_published or has_valid_token):
        return (
            jsonify({
                "error": "Results hidden",
                "message": "Live turnout statistics are not publicly accessible while voting is ongoing.",
                "results_published": False,
            }),
            403,
        )

    try:
        stats = VoteService.calculate_turnout(election_id=election_id)
        return jsonify(stats), 200
    except VotingError as ve:
        return jsonify({"error": "Not found", "message": str(ve)}), 404
    except Exception as exc:
        return jsonify({"error": "Server error", "message": str(exc)}), 500
