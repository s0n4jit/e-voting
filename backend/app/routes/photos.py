"""
app/routes/photos.py — Serves candidate photos from filesystem (public: <img> tags cannot send a bearer token,
and the photos are shown on the ballot anyway).
"""

import os
from flask import Blueprint, Response, jsonify
from app.extensions import db, limiter
from app.services.photo_service import find_photo, save_photo

photos_bp = Blueprint("photos", __name__)


@photos_bp.get("/<int:candidate_id>")
@photos_bp.get("/<int:candidate_id>.<ext>")
@limiter.exempt
def get_photo(candidate_id, ext=None):
    path = find_photo(candidate_id)
    if not path:
        # Self-healing fallback: restore mock dummy photo from roster asset if disk file is missing
        try:
            from app.models.candidate import Candidate
            from app.mock_seed import load_dummy_roster
            import base64

            cand = db.session.get(Candidate, candidate_id)
            if cand:
                roster = load_dummy_roster() or []
                cand_info = next((c for c in roster if c.get("name") == cand.name), None)
                if cand_info and cand_info.get("photo_base64"):
                    p_bytes = base64.b64decode(cand_info["photo_base64"])
                    c_type = cand_info.get("photo_content_type") or "image/jpeg"
                    save_photo(candidate_id, c_type, p_bytes)
                    path = find_photo(candidate_id)
        except Exception:
            pass

    if not path:
        return jsonify({"error": "Photo not found."}), 404

    file_ext = os.path.splitext(path)[1].lower()
    mimetype = "image/png" if file_ext == ".png" else ("image/webp" if file_ext == ".webp" else "image/jpeg")

    with open(path, "rb") as f:
        data = f.read()

    return Response(
        data,
        mimetype=mimetype,
        headers={
            "Content-Type": mimetype,
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )
