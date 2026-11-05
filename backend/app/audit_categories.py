"""
app/audit_categories.py — Groups of audit actions shown as filters on the Audit log page.
"""

# (id, filter label, actions). An action may be listed in more than one group.
CATEGORIES = [
    ("security", "Security & Tamper Attacks", [
        "SECURITY_ALERT", "TAMPER_DETECTED", "UNAUTHORIZED_BOOTH_ATTEMPT",
        "TAMPERED_BALLOT_REJECTED", "PIN_BRUTE_FORCE", "TAMPERED_SESSION_REJECTED",
        "INVALID_TOKEN_ATTEMPT", "SUSPICIOUS_PAYLOAD", "RATE_LIMIT_EXCEEDED", "LOGIN_FAILED",
    ]),
    ("ballot", "Ballots Cast", [
        "VOTE_CAST", "VOTE_CAST_BOOTH", "BALLOT_CAST", "RECEIPT_ARCHIVED",
    ]),
    ("slips", "Voter Slips & Credentials", [
        "SLIPS_GENERATED", "SLIP_CANCELLED", "SLIPS_EXPORTED_PDF", "BOOTH_PIN_LOGIN",
        "PIN_ISSUED", "PINS_ISSUED_BULK", "PIN_VIEWED", "PIN_LOGIN_SUCCESS", "PIN_LOCKED",
    ]),
    ("booth", "Booths & Terminals", [
        "BOOTH_TOKEN_GENERATED", "BOOTH_TOKEN_CREATED", "BOOTH_ACTIVATED", "BOOTH_SESSION_REVOKED",
        "BOOTH_REMOVED", "STAFF_MAINTENANCE_AUTH", "STAFF_MAINTENANCE_ACTION", "RECEIPT_ARCHIVED",
        "BOOTH_SESSION_ENDED", "MOCK_RECEIPTS_CLEARED",
    ]),
    ("election", "Election Lifecycle", [
        "ELECTION_CREATED", "ELECTION_UPDATED", "ELECTION_DELETED", "ELECTION_STATUS_CHANGED",
        "VOTING_PAUSED", "VOTING_RESUMED", "MOCK_STARTED", "MOCK_RESET", "POSITIONS_UPDATED",
        "CANDIDATE_ADDED", "CANDIDATE_REMOVED", "CANDIDATE_RESTORED", "REPORT_GENERATED",
        "PUBLIC_LINK_CREATED", "PUBLIC_LINK_DELETED", "MOCK_RECEIPTS_CLEARED",
    ]),
    ("auth", "Sign-ins & 2FA", [
        "LOGIN_SUCCESS", "LOGOUT", "TOTP_2FA_ENABLED", "TOTP_2FA_DISABLED", "PASSWORD_CHANGED", "PASSWORD_RESET",
    ]),
    ("admin", "Admin & Settings", [
        "DESK_OFFICER_CREATED", "DESK_OFFICER_UPDATED", "DESK_OFFICER_REMOVED",
        "SETTINGS_UPDATED", "SYSTEM_INSTALLED", "SYSTEM_BACKUP_DOWNLOADED",
    ]),
]
ACTIONS = {cid: actions for cid, _, actions in CATEGORIES}
ALIASES = {
    "kiosk": "booth",
    "enroll": "slips",
    "pin": "slips",
    "desk": "slips",
    "tamper": "security",
    "attack": "security",
    "attacks": "security",
}  # older and friendly filter ids


def category_of(action: str) -> str:
    """The first group an action belongs to (used for the colour/icon of a row)."""
    return next((cid for cid, _, actions in CATEGORIES if action in actions), "other")


def action_label(action: str) -> str:
    labels = {
        "UNAUTHORIZED_BOOTH_ATTEMPT": "Unauthorized Booth Access Attempt",
        "TAMPER_DETECTED": "Tampering Attempt Detected",
        "TAMPERED_BALLOT_REJECTED": "Tampered Ballot Rejected",
        "PIN_BRUTE_FORCE": "PIN Guessing / Brute Force",
        "SECURITY_ALERT": "Security Alert",
        "RATE_LIMIT_EXCEEDED": "Rate Limit Exceeded",
        "LOGIN_FAILED": "Failed Sign-in Attempt",
        "SLIPS_GENERATED": "Voter Slips Generated",
        "SLIP_CANCELLED": "Voter Slip Voided / Cancelled",
        "BOOTH_PIN_LOGIN": "Booth PIN Verified",
        "BOOTH_TOKEN_GENERATED": "Booth Setup Code Generated",
        "CANDIDATE_RESTORED": "Candidate Restored",
    }
    if action in labels:
        return labels[action]
    return str(action or "").replace("_", " ").capitalize()
