"""
app/routes/photos.py — Serves candidate photos (public: <img> tags cannot send a bearer token,
and the photos are shown on the ballot anyway).
"""

from flask import Blueprint, Response, jsonify

from app.extensions import db, limiter
from app.models.candidate_photo import CandidatePhoto

photos_bp = Blueprint("photos", __name__)


@photos_bp.get("/<int:candidate_id>")
@limiter.exempt
def get_photo(candidate_id):
    photo = CandidatePhoto.query.filter_by(candidate_id=candidate_id).first()
    if not photo:
        return jsonify({"error": "Photo not found."}), 404
    return Response(
        photo.data,
        mimetype=photo.content_type,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
