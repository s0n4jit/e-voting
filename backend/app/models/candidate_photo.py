"""
app/models/candidate_photo.py — Legacy shim. Candidate photos are stored on filesystem via app.services.photo_service.
"""


class _PhotoQueryShim:
    @staticmethod
    def count():
        return 0

    @staticmethod
    def filter_by(**kwargs):
        return _PhotoQueryShim()

    @staticmethod
    def first():
        return None

    @staticmethod
    def all():
        return []


class CandidatePhoto:
    """Deprecated legacy shim kept for backward compatibility with older tests/imports."""
    query = _PhotoQueryShim()
