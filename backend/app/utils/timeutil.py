"""Datetime helpers."""

from datetime import timezone


def utc_iso(dt):
    """ISO-8601 string with an explicit UTC offset (SQLite hands back naive datetimes)."""
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()
