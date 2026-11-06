"""
app/audit_categories.py — Groups of audit actions shown as filters on the Audit log page.
"""

# (id, filter label, actions). An action may be listed in more than one group.
CATEGORIES = [
    ("ballot", "Ballots Cast", [
        "VOTE_CAST", "VOTE_CAST_BOOTH", "BALLOT_CAST", "RECEIPT_ARCHIVED",
    ]),
    ("pin", "Voter Slips & Credentials", [
        "SLIPS_GENERATED", "SLIP_CANCELLED", "SLIPS_EXPORTED_PDF", "BOOTH_PIN_LOGIN",
        "PIN_ISSUED", "PINS_ISSUED_BULK", "PIN_VIEWED", "PIN_LOGIN_SUCCESS", "PIN_LOCKED",
    ]),
    ("desk", "Desk & Registration", [
        "DESK_CHECKIN", "STUDENT_REGISTERED", "STUDENTS_IMPORTED", "STUDENTS_REMOVED",
        "STUDENT_UPDATED", "REGISTRATIONS_EXPORTED", "PIN_ISSUED",
    ]),
    ("security", "Security & Tamper Attacks", [
        "SECURITY_ALERT", "TAMPER_DETECTED", "UNAUTHORIZED_BOOTH_ATTEMPT",
        "TAMPERED_BALLOT_REJECTED", "PIN_BRUTE_FORCE", "BOOTH_SETUP_FAILED",
        "TAMPERED_SESSION_REJECTED", "INVALID_TOKEN_ATTEMPT", "SUSPICIOUS_PAYLOAD",
        "RATE_LIMIT_EXCEEDED", "LOGIN_FAILED",
    ]),
    ("booth", "Booths & Terminals", [
        "BOOTH_TOKEN_GENERATED", "BOOTH_TOKEN_CREATED", "BOOTH_ACTIVATED", "BOOTH_SESSION_REVOKED",
        "BOOTH_REMOVED", "STAFF_MAINTENANCE_AUTH", "STAFF_MAINTENANCE_ACTION", "RECEIPT_ARCHIVED",
        "BOOTH_SESSION_ENDED", "MOCK_RECEIPTS_CLEARED",
    ]),
    ("election", "Election Lifecycle", [
        "ELECTION_CREATED", "ELECTION_UPDATED", "ELECTION_DELETED", "ELECTION_STATUS_CHANGED",
        "VOTING_PAUSED", "VOTING_RESUMED", "MOCK_STARTED", "MOCK_RESET", "POSITIONS_UPDATED",
        "CANDIDATE_ADDED", "CANDIDATE_UPDATED", "CANDIDATE_REMOVED", "CANDIDATE_RESTORED", "REPORT_GENERATED",
        "PUBLIC_LINK_CREATED", "PUBLIC_LINK_DELETED", "MOCK_RECEIPTS_CLEARED",
    ]),
    ("auth", "Sign-ins & 2FA", [
        "LOGIN_SUCCESS", "LOGOUT", "TOTP_2FA_ENABLED", "TOTP_2FA_DISABLED", "PASSWORD_CHANGED", "PASSWORD_RESET",
    ]),
    ("admin", "Admin & Settings", [
        "DESK_OFFICER_CREATED", "DESK_OFFICER_UPDATED", "DESK_OFFICER_REMOVED", "PROGRAMME_CREATED", "PROGRAMME_UPDATED",
        "PROGRAMME_DELETED", "PROGRAMMES_IMPORTED", "SETTINGS_UPDATED", "SYSTEM_INSTALLED", "SYSTEM_BACKUP_DOWNLOADED",
    ]),
]
ACTIONS = {cid: actions for cid, _, actions in CATEGORIES}
ALIASES = {
    "kiosk": "booth",
    "enroll": "desk",
    "slips": "pin",
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
        "PIN_BRUTE_FORCE": "Wrong Voting PIN Entered at Booth",
        "SECURITY_ALERT": "Security Alert / Wrong Credentials",
        "BOOTH_SETUP_FAILED": "Wrong PIN / Code in Booth Setup",
        "RATE_LIMIT_EXCEEDED": "Rate Limit Exceeded",
        "LOGIN_FAILED": "Failed Sign-in Attempt",
        "SLIPS_GENERATED": "Voter Slips Generated",
        "SLIP_CANCELLED": "Voter Slip Voided / Cancelled",
        "BOOTH_PIN_LOGIN": "Booth PIN Verified",
        "BOOTH_TOKEN_GENERATED": "Booth Setup Code Generated",
        "CANDIDATE_UPDATED": "Candidate Details Updated",
        "CANDIDATE_RESTORED": "Candidate Restored",
    }
    if action in labels:
        return labels[action]
    return str(action or "").replace("_", " ").capitalize()
