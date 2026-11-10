"""
app/services/photo_service.py — File-system storage for candidate headshot photos.
Avoids loading binary byte blobs into PostgreSQL, keeping database backups fast and lean.
"""

import os
import tempfile
from typing import Optional

PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def get_photo_dir() -> str:
    """Return absolute path to candidate photo storage directory."""
    # 1. Environment variable
    env_dir = os.environ.get("PHOTOS_DIR")
    if env_dir:
        os.makedirs(env_dir, exist_ok=True)
        return env_dir

    # 2. Docker / container persistent path (Linux)
    if os.name != "nt" and (os.path.isdir("/app/data") or os.path.exists("/app")):
        docker_dir = "/app/data/photos"
        try:
            os.makedirs(docker_dir, exist_ok=True)
            return docker_dir
        except (OSError, PermissionError):
            pass

    # 3. Local workspace path: <project_root>/data/photos
    project_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "photos")
    )
    try:
        os.makedirs(project_dir, exist_ok=True)
        return project_dir
    except (OSError, PermissionError):
        pass

    # 4. System temp directory fallback
    temp_dir = os.path.join(tempfile.gettempdir(), "evote_candidate_photos")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir


def find_photo(candidate_id: int) -> Optional[str]:
    """Return path to candidate's photo file if it exists, else None."""
    photo_dir = get_photo_dir()
    for ext in PHOTO_EXTENSIONS:
        p = os.path.join(photo_dir, f"{candidate_id}{ext}")
        if os.path.isfile(p):
            return p
    return None


def photo_exists(candidate_id: int) -> bool:
    """Return True if candidate photo file exists on disk."""
    return find_photo(candidate_id) is not None


def delete_photo(candidate_id: int) -> None:
    """Remove candidate photo files from disk."""
    photo_dir = get_photo_dir()
    for ext in PHOTO_EXTENSIONS:
        p = os.path.join(photo_dir, f"{candidate_id}{ext}")
        if os.path.isfile(p):
            try:
                os.remove(p)
            except OSError:
                pass


def save_photo(candidate_id: int, content_type: str, data: bytes) -> str:
    """Save photo bytes to filesystem; returns the public photo URL."""
    delete_photo(candidate_id)
    ct = (content_type or "").lower()
    ext = ".png" if "png" in ct else (".webp" if "webp" in ct else ".jpg")
    filepath = os.path.join(get_photo_dir(), f"{candidate_id}{ext}")
    with open(filepath, "wb") as f:
        f.write(data)
    return f"/api/photos/{candidate_id}"
