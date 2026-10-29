"""
app/models/vote.py — Re-export VoterRecord, BallotEntry, AuditLog for backward compatibility.
"""

from app.models.voter_record import VoterRecord
from app.models.ballot_entry import BallotEntry
from app.models.audit_log import AuditLog

__all__ = ["VoterRecord", "BallotEntry", "AuditLog"]
