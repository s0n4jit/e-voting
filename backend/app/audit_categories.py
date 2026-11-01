"""
app/audit_categories.py — Groups of audit actions shown as filters on the Audit log page.
"""

# (id, filter label, actions). An action may be listed in more than one group.
CATEGORIES = [
    ("ballot", "Ballots cast", ["VOTE_CAST"]),
    ("pin", "PIN slips", ["PIN_ISSUED", "PIN_LOGIN_SUCCESS", "PIN_LOCKED"]),
    ("desk", "Desk check-ins", ["DESK_CHECKIN", "STUDENT_REGISTERED", "STUDENTS_IMPORTED", "STUDENT_UPDATED", "REGISTRATIONS_EXPORTED", "PIN_ISSUED"]),
    ("auth", "Sign-ins and security", ["LOGIN_SUCCESS", "LOGOUT", "TOTP_2FA_ENABLED", "TOTP_2FA_DISABLED", "PASSWORD_CHANGED", "PASSWORD_RESET"]),
    ("election", "Election", [
        "ELECTION_CREATED", "ELECTION_UPDATED", "ELECTION_DELETED", "ELECTION_STATUS_CHANGED", "VOTING_PAUSED", "VOTING_RESUMED", "POSITIONS_UPDATED",
        "CANDIDATE_ADDED", "CANDIDATE_REMOVED", "REPORT_GENERATED", "PUBLIC_LINK_CREATED", "PUBLIC_LINK_DELETED",
    ]),
    ("booth", "Booths", ["BOOTH_TOKEN_CREATED", "BOOTH_ACTIVATED", "BOOTH_REMOVED", "STAFF_MAINTENANCE_AUTH", "STAFF_MAINTENANCE_ACTION"]),
    ("admin", "Accounts and settings", [
        "DESK_OFFICER_CREATED", "DESK_OFFICER_UPDATED", "DESK_OFFICER_REMOVED", "PROGRAMME_CREATED", "PROGRAMME_UPDATED",
        "PROGRAMME_DELETED", "PROGRAMMES_IMPORTED", "SETTINGS_UPDATED", "SYSTEM_INSTALLED", "SYSTEM_BACKUP_DOWNLOADED",
    ]),
]
ACTIONS = {cid: actions for cid, _, actions in CATEGORIES}
ALIASES = {"kiosk": "booth", "enroll": "desk"}  # older filter ids


def category_of(action: str) -> str:
    """The first group an action belongs to (used for the colour/icon of a row)."""
    return next((cid for cid, _, actions in CATEGORIES if action in actions), "other")


def action_label(action: str) -> str:
    return str(action or "").replace("_", " ").capitalize()
