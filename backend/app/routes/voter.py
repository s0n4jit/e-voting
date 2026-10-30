"""
app/routes/voter.py — Voter interactions routes.
"""

from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.services.vote_service import VoteService, VotingError
from app.utils.decorators import voter_required

voter_bp = Blueprint("voter", __name__)


@voter_bp.get("/elections/active")
@voter_required
def get_active_elections():
    """List elections that are currently ongoing and open for voting."""
    elections = Election.query.filter_by(is_active=True).all()
    ongoing = [e.to_dict(include_candidates=True) for e in elections if e.is_ongoing]
    return jsonify(ongoing), 200


@voter_bp.get("/elections/<int:election_id>/candidates")
@voter_required
def get_election_candidates(election_id):
    """Retrieve the candidate list for a given election."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    candidates = Candidate.query.filter_by(election_id=election.id).all()
    return jsonify([c.to_dict() for c in candidates]), 200


@voter_bp.get("/elections/<int:election_id>/ballot")
@voter_required
def get_election_ballot(election_id):
    """
    Retrieve structured multi-position ballot with candidate lists and NOTA indicators.
    """
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    candidates = Candidate.query.filter_by(election_id=election.id).order_by(Candidate.id.asc()).all()

    # Group candidates by office / position
    positions_map = {}
    for cand in candidates:
        pos = cand.position or "President"
        if pos not in positions_map:
            positions_map[pos] = []
        positions_map[pos].append(cand.to_dict())

    positions_list = [
        {
            "position": pos,
            "candidates": cand_list,
            "allow_nota": True,
        }
        for pos, cand_list in positions_map.items()
    ]

    return (
        jsonify({
            "election_id": election.id,
            "title": election.title,
            "election": election.to_dict(),
            "positions": positions_list,
        }),
        200,
    )


@voter_bp.post("/elections/<int:election_id>/cast-ballot")
@voter_required
def cast_multi_position_ballot(election_id):
    """
    Cast an anonymous multi-position ballot with NOTA support and kiosk verification.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "Voter account not found."}), 404

    payload = request.get_json(silent=True) or {}
    selections = payload.get("selections")
    kiosk_token = payload.get("kiosk_token") or request.headers.get("X-Kiosk-Token")

    if selections is None:
        return jsonify({"error": "selections list is required."}), 400

    try:
        result = VoteService.cast_multi_position_vote(
            user=user,
            election_id=election_id,
            selections=selections,
            kiosk_token=kiosk_token,
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        return jsonify(dict(result)), 200
    except VotingError as err:
        return jsonify({"error": "Voting failed", "message": str(err)}), 400
    except Exception as exc:
        return jsonify({"error": "Server error", "message": str(exc)}), 500


@voter_bp.post("/elections/<int:election_id>/vote")
@voter_required
def cast_ballot(election_id):
    """Cast an anonymous vote in an election."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "Voter account not found."}), 404

    payload = request.get_json(silent=True) or {}
    candidate_id = payload.get("candidate_id")

    if not candidate_id:
        return jsonify({"error": "candidate_id is required."}), 400

    try:
        result = VoteService.cast_vote(
            user=user,
            election_id=election_id,
            candidate_id=candidate_id,
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        return jsonify(dict(result)), 200
    except VotingError as err:
        return jsonify({"error": "Voting failed", "message": str(err)}), 400
    except Exception as exc:
        return jsonify({"error": "Server error", "message": str(exc)}), 500


@voter_bp.get("/status/<int:election_id>")
@voter_required
def check_voting_status(election_id):
    """Check if the authenticated voter has already cast their ballot."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "User not found."}), 404

    voter_hash = User.hash_student_id(user.student_id)
    record = VoterRecord.query.filter_by(
        election_id=election_id, voter_hash=voter_hash
    ).first()

    if not record:
        return (
            jsonify({
                "eligible": False,
                "has_voted": False,
                "message": "You are not registered to vote in this election.",
            }),
            200,
        )

    return (
        jsonify({
            "eligible": True,
            "has_voted": record.has_voted,
            "voted_at": record.voted_at.isoformat() if record.voted_at else None,
        }),
        200,
    )


@voter_bp.get("/status")
@voter_required
def check_status_query():
    """Alternative status lookup accepting ?election_id= query param."""
    election_id = request.args.get("election_id", type=int)
    if not election_id:
        return jsonify({"error": "election_id query parameter is required."}), 400
    return check_voting_status(election_id)
