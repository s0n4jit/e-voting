import io
import pytest
from PIL import Image
from tests.integration.test_setup_registration import H, DEPT, PNG, installed, wizard_payload
from app.services.photo_service import photo_exists


def _make_image_bytes(fmt="JPEG", color="blue"):
    img = Image.new("RGB", (20, 20), color=color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_update_candidate_details_and_photo(client, installed):
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    url = f"/api/admin/elections/{eid}/candidates"
    body = {"name": "Candidate Initial", "position": "President", "department": DEPT}

    # 1. Add candidate with initial PNG photo
    data = dict(body)
    data["photo"] = (io.BytesIO(PNG), "initial.png")
    add_res = client.post(url, headers=H(installed), data=data, content_type="multipart/form-data")
    assert add_res.status_code == 201
    cand = add_res.get_json()
    cid = cand["id"]
    initial_photo_url = cand["photo_url"]
    assert initial_photo_url == f"/api/photos/{cid}"

    # Verify initial photo is served
    img_resp = client.get(initial_photo_url)
    assert img_resp.status_code == 200
    assert img_resp.mimetype == "image/png"
    assert img_resp.data == PNG
    initial_etag = img_resp.headers.get("ETag")
    assert initial_etag is not None

    # Verify 304 on matching ETag
    etag_resp = client.get(initial_photo_url, headers={"If-None-Match": initial_etag})
    assert etag_resp.status_code == 304

    # 2. Update candidate WITHOUT changing photo (e.g. changing name and bio)
    update_without_photo = {
        "name": "Candidate Renamed",
        "position": "President",
        "department": DEPT,
        "bio": "New candidate bio",
    }
    put_res1 = client.put(f"{url}/{cid}", headers=H(installed), data=update_without_photo, content_type="multipart/form-data")
    assert put_res1.status_code == 200
    cand_after_text_update = put_res1.get_json()
    assert cand_after_text_update["name"] == "Candidate Renamed"
    assert cand_after_text_update["bio"] == "New candidate bio"
    assert cand_after_text_update["photo_url"] == initial_photo_url  # Unchanged

    # Existing photo is still valid on disk
    assert photo_exists(cid)
    img_resp_same = client.get(initial_photo_url)
    assert img_resp_same.status_code == 200
    assert img_resp_same.data == PNG

    # 3. Update candidate WITH a new JPEG photo
    jpeg_bytes = _make_image_bytes(fmt="JPEG", color="green")
    update_with_photo = {
        "name": "Candidate Renamed",
        "position": "President",
        "department": DEPT,
        "photo": (io.BytesIO(jpeg_bytes), "new_headshot.jpg"),
    }
    put_res2 = client.put(f"{url}/{cid}", headers=H(installed), data=update_with_photo, content_type="multipart/form-data")
    assert put_res2.status_code == 200
    cand_after_photo_update = put_res2.get_json()
    new_photo_url = cand_after_photo_update["photo_url"]

    # Verify that photo_url was updated with cache-busting query parameter
    assert new_photo_url.startswith(f"/api/photos/{cid}?v=")
    assert new_photo_url != initial_photo_url

    # 4. Fetch photo using the new URL
    new_img_resp = client.get(new_photo_url)
    assert new_img_resp.status_code == 200
    assert new_img_resp.mimetype == "image/jpeg"
    assert new_img_resp.data == jpeg_bytes
    assert "public, max-age=86400" in new_img_resp.headers.get("Cache-Control", "")

    new_etag = new_img_resp.headers.get("ETag")
    assert new_etag is not None
    assert new_etag != initial_etag

    # 5. Fetch photo without ?v= parameter
    unversioned_resp = client.get(f"/api/photos/{cid}")
    assert unversioned_resp.status_code == 200
    assert unversioned_resp.data == jpeg_bytes
    assert "no-cache" in unversioned_resp.headers.get("Cache-Control", "")
