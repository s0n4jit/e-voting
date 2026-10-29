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
