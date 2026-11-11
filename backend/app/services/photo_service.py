"""
app/services/photo_service.py — File-system storage for candidate headshot photos.
Avoids loading binary byte blobs into PostgreSQL, keeping database backups fast and lean.
"""

import logging
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def _is_writable(path: str) -> bool:
    if not path:
        return False
    try:
        os.makedirs(path, exist_ok=True)
        test_file = os.path.join(path, f".write_test_{os.getpid()}")
        with open(test_file, "wb") as f:
            f.write(b"1")
        try:
            os.unlink(test_file)
        except OSError:
            pass
        return True
    except (OSError, PermissionError):
        return False


def get_photo_dir() -> str:
    """Return absolute path to candidate photo storage directory."""
    # 1. Environment variable
    env_dir = os.environ.get("PHOTOS_DIR")
    if env_dir and _is_writable(env_dir):
        return env_dir

    # 2. Docker / container persistent path (Linux)
    if os.name != "nt" and (os.path.isdir("/app/data") or os.path.exists("/app")):
        docker_dir = "/app/data/photos"
        if _is_writable(docker_dir):
            return docker_dir

    # 3. Local workspace path: <project_root>/data/photos
    project_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "photos")
    )
    if _is_writable(project_dir):
        return project_dir

    # 4. System temp directory fallback (always writable)
    temp_dir = os.path.join(tempfile.gettempdir(), "evote_candidate_photos")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir


def _all_search_dirs() -> list:
    dirs = [get_photo_dir()]
    temp_dir = os.path.join(tempfile.gettempdir(), "evote_candidate_photos")
    if temp_dir not in dirs:
        dirs.append(temp_dir)
    docker_dir = "/app/data/photos"
    if docker_dir not in dirs and os.path.isdir(docker_dir):
        dirs.append(docker_dir)
    return [d for d in dirs if d and os.path.isdir(d)]


def find_photo(candidate_id: int) -> Optional[str]:
    """Return path to candidate's photo file if it exists, else None."""
    for photo_dir in _all_search_dirs():
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
    for photo_dir in _all_search_dirs():
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
    photo_dir = get_photo_dir()
    filepath = os.path.join(photo_dir, f"{candidate_id}{ext}")
    try:
        with open(filepath, "wb") as f:
            f.write(data)
    except (OSError, PermissionError) as exc:
        logger.warning("Could not write photo to %s (%s). Falling back to temp directory.", photo_dir, exc)
        fallback_dir = os.path.join(tempfile.gettempdir(), "evote_candidate_photos")
        os.makedirs(fallback_dir, exist_ok=True)
        filepath = os.path.join(fallback_dir, f"{candidate_id}{ext}")
        with open(filepath, "wb") as f:
            f.write(data)
    return f"/api/photos/{candidate_id}"
