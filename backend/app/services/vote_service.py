"""
app/services/vote_service.py — Core voting business-logic layer.

Enforces:
  - Atomic transactions
  - Multi-position voting with NOTA support
  - Single-use desk Voting PIN invalidation upon cast
  - Kiosk terminal validation
  - Double-vote prevention
  - Election active & ongoing time window checks
  - Strict separation of WHO voted (VoterRecord) from WHAT was voted (BallotEntry)
"""

from datetime import datetime, timezone
import hashlib
import hmac
import logging
import uuid
from typing import List, Dict, Any, Optional

from flask import current_app
from sqlalchemy import func

from app.extensions import db as default_db
from app.models.user import User
from app.models.election import Election
from app.models.candidate import Candidate
from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog
from app.models.voting_token import VotingToken
from app.models.kiosk_device import KioskDevice
from app.models.booth_slip import BoothSlip

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


def _at_booth(booth) -> str:
    """Audit wording for where a ballot was cast: the booth and its token session."""
    return f" at booth {booth.booth_id} (session {booth.ref})" if booth else ""


class VoteService:
    @classmethod
    def cast_multi_position_vote(
        cls,
        user=None,
        election_id: Optional[int] = None,
        selections: Optional[List[Dict[str, Any]]] = None,
        kiosk_token: Optional[str] = None,
        booth=None,
        voter_id: Optional[int] = None,
        db=None,
        ip_address: str = "127.0.0.1",
        user_agent: str = "internal",
    ) -> VoteResult:
        """
        Atomically cast a multi-position ballot with NOTA support:
          1. Validates election status and active time window.
          2. Validates optional kiosk terminal token.
          3. Validates voter eligibility via VoterRecord (student_id hash).
          4. Verifies voter has not already voted.
          5. Verifies EVERY position in the election has exactly one valid choice:
             either an official candidate belonging to that position OR is_nota=True.
          6. Updates VoterRecord.has_voted = True.
          7. Marks any active VotingToken for that voter as used.
          8. Inserts an anonymous BallotEntry for each position under a unified blind token.
          9. Creates AuditLog entry (without revealing candidate selections).
        """
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        # 1. Resolve voter user
        if voter_id is None and user is not None:
            voter_id = getattr(user, "id", None)
            voter_user = user
        elif voter_id is not None:
            voter_user = session.get(User, voter_id)
        else:
            raise VotingError("Voter user not identified.")

        if not voter_user:
            raise VotingError("Voter user not found.")

        # 2. Resolve and validate election
        if not election_id:
            raise VotingError("Election ID is required.")
        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        if not election.is_active:
            raise VotingError("Voting is not open.")
        if election.voting_paused:
            raise VotingError("Voting is paused. Please wait for the officer to resume it.")

        now = datetime.now(timezone.utc)

        # 3. Optional kiosk device verification
        if kiosk_token:
            valid, booth = KioskDevice.verify_token(kiosk_token)
            if not valid:
                raise VotingError("Invalid or unauthorized kiosk terminal.")

        # 4. Check voter registration & double-vote prevention
        voter_hash = User.hash_student_id(voter_user.student_id)
        voter_record = (
            session.query(VoterRecord)
            .filter_by(election_id=election.id, voter_hash=voter_hash)
            .with_for_update()  # serialises concurrent submissions for the same voter on PostgreSQL
            .first()
        )
        if not voter_record:
            raise VotingError("Voter is not eligible for this election.")

        if voter_record.has_voted:
            raise VotingError("Voter has already voted in this election.")

        # 5. Validate selections across all positions configured in the election
        if not selections or not isinstance(selections, list):
            raise VotingError("Ballot selections are required.")

        candidates = session.query(Candidate).filter_by(election_id=election.id).all()
        if not candidates:
            raise VotingError("No candidates configured for this election.")

        cands_by_id = {c.id: c for c in candidates}
        # Gather all distinct positions from candidates in this election
        distinct_positions = sorted(list({c.position for c in candidates if c.position}))
        if not distinct_positions:
            distinct_positions = ["General Secretary"]

        required_positions = set(distinct_positions)
        selected_positions = set()
        validated_entries = []

        for item in selections:
            if not isinstance(item, dict):
                raise VotingError("Invalid ballot selection item format.")

            pos = str(item.get("position", "")).strip()
            if not pos:
                raise VotingError("Position name is required for each ballot choice.")

            if pos not in required_positions:
                raise VotingError(f"Position '{pos}' is not valid for this election.")

            if pos in selected_positions:
                raise VotingError(f"Duplicate selection submitted for position '{pos}'.")

            selected_positions.add(pos)
            is_nota = bool(item.get("is_nota", False))
            candidate_id = item.get("candidate_id")

            if is_nota:
                # Valid NOTA selection
                validated_entries.append({
                    "position": pos,
                    "candidate_id": None,
                    "is_nota": True,
                })
            else:
                if not candidate_id:
                    raise VotingError(f"Candidate choice or NOTA is required for position '{pos}'.")

                cand = cands_by_id.get(int(candidate_id)) if str(candidate_id).isdigit() else None
                if not cand:
                    raise VotingError(f"Selected candidate not found for position '{pos}'.")

                if cand.position != pos:
                    raise VotingError(f"Candidate '{cand.name}' does not run for position '{pos}'.")

                validated_entries.append({
                    "position": pos,
                    "candidate_id": cand.id,
                    "is_nota": False,
                })

        # Ensure every single position in the election has been voted on
        missing_positions = required_positions - selected_positions
        if missing_positions:
            raise VotingError(
                f"Incomplete ballot: missing selection for position(s): {', '.join(sorted(missing_positions))}."
            )

        # 6. Execute atomic ballot separation
        voter_record.has_voted = True
        voter_record.voted_at = now

        # Invalidate any active, unused desk VotingToken for this student & election
        session.query(VotingToken).filter(
            VotingToken.election_id == election.id,
            (VotingToken.student_id == voter_user.student_id) | (VotingToken.user_id == voter_user.id),
            VotingToken.is_used == False,
        ).update({"is_used": True}, synchronize_session=False)

        # Cryptographically strong unified blind token for this voter's submission
        blind_seed = uuid.uuid4().hex.encode("utf-8")
        blind_token = hmac.new(
            blind_seed,
            f"election-{election.id}:{uuid.uuid4().hex}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Insert a BallotEntry for each position under the same blind token
        for entry in validated_entries:
            ballot_entry = BallotEntry(
                election_id=election.id,
                candidate_id=entry["candidate_id"],
                position=entry["position"],
                is_nota=entry["is_nota"],
                blind_token=blind_token,
                cast_at=now,
            )
            session.add(ballot_entry)

        audit_entry = AuditLog(
            user_id=voter_user.id,
            action="VOTE_CAST",
            details=f"Cast a ballot in \u201c{election.title}\u201d ({len(validated_entries)} positions){_at_booth(booth)}.",
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
        )
        session.add(audit_entry)

        # Record server-side receipt for central officer archiving and auditing
        try:
            from app.services.receipt_service import ReceiptService
            from app.models.system_setting import SystemSetting
            branding = SystemSetting.branding()
            choices_list = [
                {
                    "position": entry["position"],
                    "choice": "NOTA" if entry["is_nota"] else (cands_by_id[entry["candidate_id"]].name if entry["candidate_id"] in cands_by_id else "NOTA")
                }
                for entry in validated_entries
            ]
            booth_name = getattr(booth, "booth_id", None) or getattr(booth, "device_name", None) or getattr(booth, "name", None) or "BOOTH-01"
            ReceiptService.record_receipt(
                election_id=election.id,
                slip_id=voter_user.student_id,
                choices=choices_list,
                booth_name=booth_name,
                is_mock=bool(election.is_mock),
                institution_name=branding.get("institution_name"),
                logo_b64=branding.get("logo"),
                election_title=election.title,
            )
        except Exception as e:
            logger.error(f"Failed to record server-side receipt: {e}", exc_info=True)

        session.flush()
        session.commit()

        return VoteResult(
            success=True,
            message="Multi-position ballot successfully cast and recorded anonymously.",
            blind_token=blind_token,
            election_id=election.id,
            positions_voted=len(validated_entries),
        )

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
        booth=None,
    ) -> VoteResult:
        """
        Atomically cast a single candidate vote (supports backwards compatibility).
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
            raise VotingError("Voting is not open.")
        if election.voting_paused:
            raise VotingError("Voting is paused. Please wait for the officer to resume it.")

        now = datetime.now(timezone.utc)

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
            .with_for_update()
            .first()
        )
        if not voter_record:
            raise VotingError("Voter is not eligible for this election.")

        if voter_record.has_voted:
            raise VotingError("Voter has already voted in this election.")

        # Execute atomic ballot separation
        voter_record.has_voted = True
        voter_record.voted_at = now

        # Invalidate any active desk VotingToken
        session.query(VotingToken).filter(
            VotingToken.election_id == election.id,
            (VotingToken.student_id == voter_user.student_id) | (VotingToken.user_id == voter_user.id),
            VotingToken.is_used == False,
        ).update({"is_used": True}, synchronize_session=False)

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
            position=candidate.position or "General Secretary",
            is_nota=False,
            blind_token=blind_token,
            cast_at=now,
        )
        session.add(ballot_entry)

        audit_entry = AuditLog(
            user_id=voter_user.id,
            action="VOTE_CAST",
            details=f"Cast a ballot in \u201c{election.title}\u201d{_at_booth(booth)}.",
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
        )
        session.add(audit_entry)

        session.flush()
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
        Aggregate votes for an election grouped by position, including NOTA votes,
        percentages, and declared winners.
        Raises ResultsHiddenError unless results_published=True or force=True.
        """
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        if not force and not election.results_published:
            raise ResultsHiddenError("Election results are not yet published.")

        # Total unique voters who participated
        total_voters = (
            session.query(func.count(VoterRecord.id))
            .filter_by(election_id=election.id, has_voted=True)
            .scalar()
            or 0
        )

        # Total ballot entries cast
        total_ballot_entries = (
            session.query(func.count(BallotEntry.id))
            .filter_by(election_id=election.id)
            .scalar()
            or 0
        )

        display_total_votes = total_voters if total_voters > 0 else total_ballot_entries

        # Discover all positions from candidates and ballot entries
        cand_positions = [
            r[0]
            for r in session.query(Candidate.position)
            .filter_by(election_id=election.id)
            .distinct()
            .all()
            if r[0]
        ]
        ballot_positions = [
            r[0]
            for r in session.query(BallotEntry.position)
            .filter_by(election_id=election.id)
            .distinct()
            .all()
            if r[0]
        ]
        # Officer-defined order first (senior positions first); anything else alphabetically after.
        order = {pos.name: pos.sort_order for pos in election.positions}
        all_positions = sorted(set(cand_positions + ballot_positions), key=lambda n: (order.get(n, 10_000), n))
        if not all_positions:
            all_positions = ["General Secretary"]

        by_position = []
        positions_map = {}
        all_flat_candidates = []

        for pos in all_positions:
            # Count total votes for this position
            pos_total = (
                session.query(func.count(BallotEntry.id))
                .filter_by(election_id=election.id, position=pos)
                .scalar()
                or 0
            )

            # Count NOTA votes for this position
            nota_votes = (
                session.query(func.count(BallotEntry.id))
                .filter_by(election_id=election.id, position=pos, is_nota=True)
                .scalar()
                or 0
            )

            # Count votes per candidate for this position
            counts = (
                session.query(
                    Candidate.id,
                    Candidate.name,
                    Candidate.party,
                    Candidate.position,
                    Candidate.photo_url,
                    func.count(BallotEntry.id).label("votes"),
                )
                .outerjoin(
                    BallotEntry,
                    (BallotEntry.candidate_id == Candidate.id)
                    & (BallotEntry.election_id == election.id)
                    & (BallotEntry.position == pos)
                    & (BallotEntry.is_nota == False),
                )
                .filter(Candidate.election_id == election.id, Candidate.position == pos)
                .group_by(
                    Candidate.id,
                    Candidate.name,
                    Candidate.party,
                    Candidate.position,
                    Candidate.photo_url,
                )
                .order_by(func.count(BallotEntry.id).desc(), Candidate.name.asc())
                .all()
            )

            max_cand_votes = 0
            candidates_for_pos = []
            for row in counts:
                votes = row.votes
                pct = round((votes / pos_total * 100), 2) if pos_total > 0 else 0.0
                if votes > max_cand_votes:
                    max_cand_votes = votes

                c_dict = {
                    "candidate_id": row.id,
                    "name": row.name,
                    "party": row.party,
                    "position": row.position,
                    "photo_url": row.photo_url,
                    "votes": votes,
                    "percentage": pct,
                    "is_winner": False,
                    "is_tied": False,
                }
                candidates_for_pos.append(c_dict)

            nota_pct = round((nota_votes / pos_total * 100), 2) if pos_total > 0 else 0.0
            # The result of a position depends only on the candidates' vote counts: the highest wins and an
            # equal highest count is a draw. "None of the Above" is a count shown beside the result, not a
            # person, so it never wins and never ties.
            winner_details = None
            if max_cand_votes == 0:
                label = "No candidate received a vote" if nota_votes else "No votes cast"
                outcome = {"type": "none", "label": label, "names": []}
            else:
                leaders = [c for c in candidates_for_pos if c["votes"] == max_cand_votes]
                names = [c["name"] for c in leaders]
                if len(names) > 1:
                    outcome = {
                        "type": "draw",
                        "label": f"Draw between {', '.join(names[:-1])} and {names[-1]}",
                        "names": names,
                    }
                    for c in leaders:
                        c["is_tied"] = True
                else:
                    leaders[0]["is_winner"] = True
                    winner_details = leaders[0]
                    outcome = {"type": "winner", "label": leaders[0]["name"], "names": names}
            winner_name = outcome["label"]

            pos_data = {
                "position": pos,
                "total_votes": pos_total,
                "nota_count": nota_votes,
                "nota_percentage": nota_pct,
                "winner": winner_name,
                "outcome": outcome,
                "winner_details": winner_details,
                "candidates": candidates_for_pos,
            }
            by_position.append(pos_data)
            positions_map[pos] = pos_data
            all_flat_candidates.extend(candidates_for_pos)

        return {
            "election_id": election.id,
            "title": election.title,
            "total_votes": display_total_votes,
            "total_ballot_entries": total_ballot_entries,
            "results_published": election.results_published,
            "by_position": by_position,
            "positions": positions_map,
            "candidates": all_flat_candidates,
        }


    @classmethod
    def cast_booth_slip_vote(
        cls,
        slip_id: int,
        election_id: int,
        selections: List[Dict[str, Any]],
        kiosk_token: Optional[str] = None,
        booth=None,
        ip_address: str = "127.0.0.1",
        user_agent: str = "internal",
        db=None,
    ) -> VoteResult:
        """
        Atomically casts an anonymous vote using a pre-generated BoothSlip:
          1. Validates election status (is_active, not voting_paused).
          2. Validates kiosk terminal.
          3. Locks BoothSlip with with_for_update() and verifies it is unused.
          4. Validates all position selections (candidates / NOTA).
          5. Atomically marks BoothSlip as USED.
          6. Inserts anonymous BallotEntry rows under a unified blind token.
          7. Logs an anonymous audit event (no voter identity).
          8. Generates server-side receipt without identity.
          9. Returns success with next sequential voting ID.
        """
        session = db.session if hasattr(db, "session") else (db or default_db.session)

        # 1. Resolve and validate election
        if not election_id:
            raise VotingError("Election ID is required.")
        election = session.get(Election, election_id)
        if not election:
            raise VotingError("Election not found.")

        if not election.is_active:
            raise VotingError("Voting is not open.")
        if election.voting_paused:
            raise VotingError("Voting is paused. Please wait for the officer to resume it.")

        # 2. Validate kiosk device
        if kiosk_token:
            valid, kiosk_dev = KioskDevice.verify_token(kiosk_token)
            if not valid:
                raise VotingError("Invalid or unauthorized kiosk terminal.")
            booth = kiosk_dev

        # 3. Lock BoothSlip with with_for_update()
        booth_slip = (
            session.query(BoothSlip)
            .filter_by(id=slip_id, election_id=election.id)
            .with_for_update()
            .first()
        )
        if not booth_slip:
            raise VotingError("Voting slip credential not found.")
        if booth_slip.is_used:
            raise VotingError("This voting slip has already been used.")
        if booth and booth.number != booth_slip.booth_number:
            raise VotingError(f"Voting slip belongs to Booth {booth_slip.booth_number}, not Booth {booth.number}.")

        # 4. Validate selections across all positions configured in the election
        if not selections or not isinstance(selections, list):
            raise VotingError("Ballot selections are required.")

        candidates = session.query(Candidate).filter_by(election_id=election.id).all()
        if not candidates:
            raise VotingError("No candidates configured for this election.")

        cands_by_id = {c.id: c for c in candidates}
        distinct_positions = sorted(list({c.position for c in candidates if c.position}))
        if not distinct_positions:
            distinct_positions = ["General Secretary"]

        required_positions = set(distinct_positions)
        selected_positions = set()
        validated_entries = []

        for item in selections:
            if not isinstance(item, dict):
                raise VotingError("Invalid ballot selection item format.")

            pos = str(item.get("position", "")).strip()
            if not pos:
                raise VotingError("Position name is required for each ballot choice.")

            if pos not in required_positions:
                raise VotingError(f"Position '{pos}' is not valid for this election.")

            if pos in selected_positions:
                raise VotingError(f"Duplicate selection submitted for position '{pos}'.")

            selected_positions.add(pos)
            is_nota = bool(item.get("is_nota", False))
            candidate_id = item.get("candidate_id")

            if is_nota:
                validated_entries.append({
                    "position": pos,
                    "candidate_id": None,
                    "is_nota": True,
                })
            else:
                if not candidate_id:
                    raise VotingError(f"Candidate choice or NOTA is required for position '{pos}'.")

                cand = cands_by_id.get(int(candidate_id)) if str(candidate_id).isdigit() else None
                if not cand:
                    raise VotingError(f"Selected candidate not found for position '{pos}'.")

                if cand.position != pos:
                    raise VotingError(f"Candidate '{cand.name}' does not run for position '{pos}'.")

                validated_entries.append({
                    "position": pos,
                    "candidate_id": cand.id,
                    "is_nota": False,
                })

        missing_positions = required_positions - selected_positions
        if missing_positions:
            raise VotingError(
                f"Incomplete ballot: missing selection for position(s): {', '.join(sorted(missing_positions))}."
            )

        now = datetime.now(timezone.utc)

        # 5. Atomically mark BoothSlip as USED
        booth_slip.is_used = True
        booth_slip.used_at = now

        # 6. Blind token for anonymous ballot entries
        blind_seed = uuid.uuid4().hex.encode("utf-8")
        blind_token = hmac.new(
            blind_seed,
            f"election-{election.id}:booth-{booth_slip.booth_number}:{uuid.uuid4().hex}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        for entry in validated_entries:
            ballot_entry = BallotEntry(
                election_id=election.id,
                candidate_id=entry["candidate_id"],
                position=entry["position"],
                is_nota=entry["is_nota"],
                blind_token=blind_token,
                cast_at=now,
            )
            session.add(ballot_entry)

        # 7. Anonymous audit log
        audit_entry = AuditLog(
            user_id=None,
            action="VOTE_CAST_BOOTH",
            details=f"Anonymous ballot cast with Voting ID {booth_slip.voting_id} ({len(validated_entries)} positions){_at_booth(booth)}.",
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
        )
        session.add(audit_entry)

        # 8. Server-side receipt
        slip_record_id = str(booth_slip.voting_id)
        try:
            from app.services.receipt_service import ReceiptService
            from app.models.system_setting import SystemSetting
            branding = SystemSetting.branding()
            choices_list = [
                {
                    "position": e["position"],
                    "candidate_name": "None of the Above (NOTA)" if e["is_nota"] else cands_by_id[e["candidate_id"]].name,
                    "is_nota": e["is_nota"],
                }
                for e in validated_entries
            ]
            ReceiptService.create_receipt(
                slip_id=slip_record_id,
                booth_name=booth.booth_id if booth else f"BOOTH-{booth_slip.booth_number:02d}",
                election_id=election.id,
                election_title=election.title,
                institution_name=branding.get("institution_name", "Campus Voting"),
                choices=choices_list,
                is_mock=bool(election.is_mock),
                db_session=session,
            )
        except Exception as ex:
            logger.warning(f"Could not generate server-side receipt: {ex}")

        session.commit()

        # Query next sequential slip for this booth
        next_slip = BoothSlip.get_current_slip(election.id, booth_slip.booth_number)
        next_voting_id = next_slip.voting_id if next_slip else None

        return VoteResult(
            success=True,
            message="Your ballot has been cast successfully.",
            data={
                "blind_token": blind_token,
                "voting_id": booth_slip.voting_id,
                "next_voting_id": next_voting_id,
                "positions_count": len(validated_entries),
                "cast_at": now.isoformat(),
            }
        )

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
cast_multi_position_vote = VoteService.cast_multi_position_vote
get_results = VoteService.get_results
calculate_turnout = VoteService.calculate_turnout

cast_booth_slip_vote = VoteService.cast_booth_slip_vote
