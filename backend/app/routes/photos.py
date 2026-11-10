"""
app/routes/photos.py — Serves candidate photos from filesystem (public: <img> tags cannot send a bearer token,
and the photos are shown on the ballot anyway).
"""

import os
from flask import Blueprint, Response, jsonify
from app.extensions import limiter
from app.services.photo_service import find_photo

photos_bp = Blueprint("photos", __name__)


@photos_bp.get("/<int:candidate_id>")
@photos_bp.get("/<int:candidate_id>.<ext>")
@limiter.exempt
def get_photo(candidate_id, ext=None):
    path = find_photo(candidate_id)
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
