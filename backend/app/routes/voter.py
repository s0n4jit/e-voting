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
from app.models.system_setting import SystemSetting
from app.services.vote_service import VoteService, VotingError
from flask_jwt_extended import get_jwt
from app.routes.booth import require_booth
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
    claims = get_jwt()
    _, denied = require_booth(claims, election_id)
    if denied:
        return denied
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404

    # Check whether this voting slip or voter has already been used to vote!
    slip_id = claims.get("slip_id")
    if slip_id:
        from app.models.booth_slip import BoothSlip
        slip = db.session.get(BoothSlip, slip_id)
        if not slip or slip.is_used:
            return jsonify({
                "error": "Already Voted",
                "message": "This voting slip has already been used to cast a ballot.",
                "already_voted": True,
            }), 403
    elif claims.get("student_id"):
        from app.models.voting_token import VotingToken
        token = VotingToken.query.filter_by(
            student_id=claims.get("student_id"), election_id=election.id, is_used=True
        ).first()
        if token:
            return jsonify({
                "error": "Already Voted",
                "message": "This voter has already cast their ballot.",
                "already_voted": True,
            }), 403

    candidates = Candidate.query.filter_by(election_id=election.id).order_by(Candidate.id.asc()).all()

    positions_map = {}
    for cand in candidates:
        positions_map.setdefault(cand.position or "General Secretary", []).append(cand.to_dict())

    # Officer-defined order first; positions without a configured order keep alphabetical order.
    order = {p.name: p.sort_order for p in election.positions}
    sorted_positions = sorted(positions_map, key=lambda p: (order.get(p, 10_000), p))

    positions_list = [
        {"position": pos, "candidates": positions_map[pos], "allow_nota": True}
        for pos in sorted_positions
    ]

    return (
        jsonify({
            "election_id": election.id,
            "title": election.title,
            "election": election.to_dict(),
            "positions": positions_list,
            "is_mock": bool(election.is_mock),
            "institution_name": SystemSetting.get("institution_name", ""),
            "logo": SystemSetting.get("logo", ""),
        }),
        200,
    )


@voter_bp.post("/elections/<int:election_id>/cast-ballot")
@voter_required
def cast_multi_position_ballot(election_id):
    """
    Cast an anonymous multi-position ballot with NOTA support and kiosk verification.
    """
    claims = get_jwt()
    booth, denied = require_booth(claims, election_id)
    if denied:
        return denied

    payload = request.get_json(silent=True) or {}
    selections = payload.get("selections")

    if selections is None:
        return jsonify({"error": "selections list is required."}), 400

    # If voting with pre-generated Booth Slip (PIN-only)
    if claims.get("voting_mode") == "booth_slip":
        slip_id = claims.get("slip_id")
        if not slip_id:
            return jsonify({"error": "Invalid session", "message": "Voting slip session missing."}), 400
        try:
            result = VoteService.cast_booth_slip_vote(
                slip_id=int(slip_id),
                election_id=election_id,
                selections=selections,
                booth=booth,
                ip_address=request.remote_addr or "127.0.0.1",
                user_agent=request.user_agent.string if request.user_agent else "client",
            )
            return jsonify(dict(result)), 200
        except VotingError as err:
            return jsonify({"error": "Voting failed", "message": str(err)}), 400
        except Exception as exc:
            return jsonify({"error": "Server error", "message": "Your ballot could not be processed. Please try again."}), 500

    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user:
        return jsonify({"error": "Voter account not found."}), 404

    try:
        result = VoteService.cast_multi_position_vote(
            user=user,
            election_id=election_id,
            selections=selections,
            booth=booth,
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        return jsonify(dict(result)), 200
    except VotingError as err:
        return jsonify({"error": "Voting failed", "message": str(err)}), 400
    except Exception as exc:
        return jsonify({"error": "Server error", "message": "Your ballot could not be processed. Please try again."}), 500


@voter_bp.post("/elections/<int:election_id>/vote")
@voter_required
def cast_ballot(election_id):
    """Cast an anonymous vote in an election."""
    booth, denied = require_booth(get_jwt(), election_id)
    if denied:
        return denied
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
            booth=booth,
            ip_address=request.remote_addr or "127.0.0.1",
            user_agent=request.user_agent.string if request.user_agent else "client",
        )
        return jsonify(dict(result)), 200
    except VotingError as err:
        return jsonify({"error": "Voting failed", "message": str(err)}), 400
    except Exception as exc:
        return jsonify({"error": "Server error", "message": "Your ballot could not be processed. Please try again."}), 500


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
