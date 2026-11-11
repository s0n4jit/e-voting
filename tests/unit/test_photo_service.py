import os
from unittest.mock import patch
from app.services.photo_service import save_photo, find_photo, delete_photo, photo_exists


def test_save_and_find_photo():
    cand_id = 99991
    delete_photo(cand_id)
    try:
        url = save_photo(cand_id, "image/jpeg", b"\xff\xd8\xff\xe0testjpegdata")
        assert url == f"/api/photos/{cand_id}"
        assert photo_exists(cand_id)
        path = find_photo(cand_id)
        assert path is not None
        assert os.path.isfile(path)
        with open(path, "rb") as f:
            assert f.read() == b"\xff\xd8\xff\xe0testjpegdata"
    finally:
        delete_photo(cand_id)
        assert not photo_exists(cand_id)


def test_save_photo_permission_fallback():
    cand_id = 99992
    delete_photo(cand_id)
    try:
        # Simulate PermissionError on the primary photo directory
        with patch("app.services.photo_service.get_photo_dir", return_value="/nonexistent/root/only/photos"):
            url = save_photo(cand_id, "image/png", b"\x89PNGtestpngdata")
            assert url == f"/api/photos/{cand_id}"
            assert photo_exists(cand_id)
            path = find_photo(cand_id)
            assert path is not None
            assert os.path.isfile(path)
    finally:
        delete_photo(cand_id)
