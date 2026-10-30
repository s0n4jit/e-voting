"""
app/routes/results.py — Public and authorized election results endpoints.
"""

from flask import Blueprint, jsonify
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
        "status_label": election.STATUS_LABELS[election.effective_status],
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
    """Retrieve voter turnout statistics for an election."""
    try:
        stats = VoteService.calculate_turnout(election_id=election_id)
        return jsonify(stats), 200
    except VotingError as ve:
        return jsonify({"error": "Not found", "message": str(ve)}), 404
    except Exception as exc:
        return jsonify({"error": "Server error", "message": str(exc)}), 500
