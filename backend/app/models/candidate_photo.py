"""
app/models/candidate_photo.py — Candidate photos, stored in the database so they survive redeploys,
are included in backups and are removed together with the candidate.
"""

from app.extensions import db


class CandidatePhoto(db.Model):
    __tablename__ = "candidate_photos"

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(
        db.Integer, db.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    content_type = db.Column(db.String(20), nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)
