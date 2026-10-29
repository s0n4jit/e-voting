"""
app/services/vote_service.py — Core voting business-logic layer.

Enforces:
  - Atomic transactions
  - Double-vote prevention
  - Election active & ongoing time window checks
  - Strict separation of WHO voted (VoterRecord) from WHAT was voted (BallotEntry)
"""

from datetime import datetime, timezone
import hashlib
import hmac
import logging
import uuid

from flask import current_app
from sqlalchemy import func

from app.extensions import db as default_db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class VotingError(Exception):
    """Raised when a vote attempt fails validation or eligibility checks."""
    pass


class ResultsHiddenError(Exception):
    """Raised when election results are queried before being published."""
    pass


class VoteResult(dict):
    """Dictionary subclass supporting tuple unpacking: (success, message, data)."""

    def __iter__(self):
        yield self.get("success", False)
        yield self.get("message", "")
        yield self


class VoteService:
    @classmethod
    def cast_vote(
        cls,
        user=None,
        election_id=None,
        candidate_id=None,
        voter_id=None,
        db=None,
        ip_address="127.0.0.1",
        user_agent="internal",
    ) -> VoteResult:
        """
        Atomically cast a vote:
          1. Validates election status and time window.
          2. Validates candidate belongs to the election.
          3. Validates voter eligibility via VoterRecord (student_id hash).
          4. Verifies voter has not already voted.
          5. Updates VoterRecord.has_voted = True.
          6. Creates anonymous BallotEntry with a blind token.
          7. Creates AuditLog entry.
        """
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        # Resolve voter user
        if voter_id is None and user is not None:
            voter_id = getattr(user, "id", None)
            voter_user = user
        elif voter_id is not None:
            voter_user = session.get(User, voter_id)
        else:
            raise VotingError("Voter user not identified.")

        if not voter_user:
            raise VotingError("Voter user not found.")

        # Resolve election
        if not election_id:
            raise VotingError("Election ID is required.")
        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        if not election.is_active:
            raise VotingError("Election is not active.")

        now = datetime.now(timezone.utc)
        start_time = election.start_time
        end_time = election.end_time
        if start_time and start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time and end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        if start_time and now < start_time:
            raise VotingError("Election has not started yet.")
        if end_time and now > end_time:
            raise VotingError("Election is closed.")

        # Resolve and validate candidate
        if not candidate_id:
            raise VotingError("Candidate selection is required.")
        candidate = session.get(Candidate, candidate_id)
        if not candidate or candidate.election_id != election.id:
            raise VotingError("Invalid candidate for this election.")

        # Check voter registration in this election
        voter_hash = User.hash_student_id(voter_user.student_id)
        voter_record = (
            session.query(VoterRecord)
            .filter_by(election_id=election.id, voter_hash=voter_hash)
            .first()
        )
        if not voter_record:
            # All enrolled, active campus voters are eligible
            if getattr(voter_user, "is_active", True) and getattr(voter_user, "role", "voter") == "voter":
                voter_record = VoterRecord(
                    election_id=election.id,
                    voter_hash=voter_hash,
                    has_voted=False,
                )
                session.add(voter_record)
                session.flush()
            else:
                raise VotingError("Voter is not eligible for this election.")

        if voter_record.has_voted:
            raise VotingError("Voter has already voted in this election.")

        # Execute atomic ballot separation
        voter_record.has_voted = True
        voter_record.voted_at = now

        # Cryptographically strong blind token (no voter identifier)
        blind_seed = uuid.uuid4().hex.encode("utf-8")
        blind_token = hmac.new(
            blind_seed,
            f"election-{election.id}:{uuid.uuid4().hex}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        ballot_entry = BallotEntry(
            election_id=election.id,
            candidate_id=candidate.id,
            blind_token=blind_token,
            cast_at=now,
        )
        session.add(ballot_entry)

        audit_entry = AuditLog(
            user_id=voter_user.id,
            action="VOTE_CAST",
            details=f"Ballot submitted for election {election.id}",
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
        )
        session.add(audit_entry)

        session.flush()

        # If running outside test savepoints, commit to persist
        try:
            is_testing = current_app and current_app.config.get("TESTING", False)
        except Exception:
            is_testing = False

        if not is_testing:
            session.commit()

        return VoteResult(
            success=True,
            message="Vote successfully cast and recorded anonymously.",
            blind_token=blind_token,
            election_id=election.id,
        )

    @classmethod
    def get_results(cls, election_id: int, db=None, force: bool = False) -> dict:
        """
        Aggregate votes for an election by candidate.
        Raises ResultsHiddenError unless results_published=True or force=True.
        """
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        if not force and not election.results_published:
            raise ResultsHiddenError("Election results are not yet published.")

        # Total votes in election
        total_votes = (
            session.query(func.count(BallotEntry.id))
            .filter_by(election_id=election.id)
            .scalar()
            or 0
        )

        # Count per candidate
        counts = (
            session.query(
                Candidate.id,
                Candidate.name,
                Candidate.party,
                Candidate.position,
                func.count(BallotEntry.id).label("votes"),
            )
            .outerjoin(
                BallotEntry,
                (BallotEntry.candidate_id == Candidate.id)
                & (BallotEntry.election_id == election.id),
            )
            .filter(Candidate.election_id == election.id)
            .group_by(Candidate.id, Candidate.name, Candidate.party, Candidate.position)
            .order_by(func.count(BallotEntry.id).desc())
            .all()
        )

        max_votes = -1
        for row in counts:
            if row.votes > max_votes:
                max_votes = row.votes

        candidate_results = []
        for row in counts:
            votes = row.votes
            pct = round((votes / total_votes * 100), 2) if total_votes > 0 else 0.0
            candidate_results.append({
                "candidate_id": row.id,
                "name": row.name,
                "party": row.party,
                "position": row.position,
                "votes": votes,
                "percentage": pct,
                "is_winner": (votes == max_votes and max_votes > 0),
            })

        return {
            "election_id": election.id,
            "title": election.title,
            "total_votes": total_votes,
            "results_published": election.results_published,
            "candidates": candidate_results,
        }

    @classmethod
    def calculate_turnout(cls, election_id: int, db=None) -> dict:
        """Calculate voter turnout statistics for an election."""
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        total_registered = (
            session.query(func.count(VoterRecord.id))
            .filter_by(election_id=election.id)
            .scalar()
            or 0
        )
        ballots_cast = (
            session.query(func.count(VoterRecord.id))
            .filter_by(election_id=election.id, has_voted=True)
            .scalar()
            or 0
        )

        turnout_pct = (
            round((ballots_cast / total_registered * 100), 2)
            if total_registered > 0
            else 0.0
        )

        return {
            "election_id": election.id,
            "title": election.title,
            "total_registered": total_registered,
            "ballots_cast": ballots_cast,
            "turnout_percentage": turnout_pct,
            "is_ongoing": election.is_ongoing,
        }


# Module-level aliases
cast_vote = VoteService.cast_vote
get_results = VoteService.get_results
calculate_turnout = VoteService.calculate_turnout
