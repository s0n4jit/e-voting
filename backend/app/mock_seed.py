"""
app/mock_seed.py — Provides the permanent 10-position, 20-candidate dummy roster with photos
for mock elections. This ensures dry runs can be conducted with a complete campus election
slate even before or after official student candidates are added/removed.
"""

import base64
import json
import logging
from pathlib import Path

from app.extensions import db
from app.models.candidate import Candidate
from app.services.photo_service import save_photo
from app.models.election_position import ElectionPosition

logger = logging.getLogger(__name__)

ORDERED_POSITIONS = [
    "President",
    "Vice President",
    "General Secretary",
    "Assistant General Secretary",
    "Cultural Secretary",
    "Magazine Secretary",
    "Major Games Secretary",
    "Minor Games Secretary",
    "Boys' Common Room Secretary",
    "Girls' Common Room Secretary",
]


def load_dummy_roster():
    assets_path = Path(__file__).parent / "mock_assets" / "dummy_roster.json"
    if assets_path.exists():
        try:
            with open(assets_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load dummy roster from {assets_path}: {e}")
    return None


def populate_mock_dummy_roster(mock_election_id):
    """
    Populates the mock election with the permanent 10-position, 20-candidate dummy slate
    and creates CandidatePhoto records for all candidates.
    """
    roster = load_dummy_roster()
    if not roster:
        return False

    # Create positions in specified order
    pos_map = {}
    for idx, pos_name in enumerate(ORDERED_POSITIONS, 1):
        pos = ElectionPosition(
            election_id=mock_election_id,
            name=pos_name,
            sort_order=idx,
        )
        db.session.add(pos)
        pos_map[pos_name] = pos

    db.session.flush()

    # Sort roster by position order
    def sort_key(c):
        p = c.get("position", "")
        return (ORDERED_POSITIONS.index(p) if p in ORDERED_POSITIONS else 999, c.get("name", ""))

    sorted_roster = sorted(roster, key=sort_key)

    for cand_info in sorted_roster:
        cand = Candidate(
            election_id=mock_election_id,
            name=cand_info.get("name"),
            position=cand_info.get("position"),
            party=cand_info.get("party") or None,
            department=cand_info.get("department") or None,
            semester=cand_info.get("semester") or None,
            bio=cand_info.get("bio") or None,
        )
        db.session.add(cand)
        db.session.flush()

        b64_photo = cand_info.get("photo_base64")
        if b64_photo:
            try:
                photo_bytes = base64.b64decode(b64_photo)
                content_type = cand_info.get("photo_content_type") or "image/jpeg"
                save_photo(cand.id, content_type, photo_bytes)
                cand.photo_url = f"/api/photos/{cand.id}"
            except Exception as ex:
                logger.warning(f"Failed to decode photo for {cand.name}: {ex}")

    db.session.flush()
    return True
