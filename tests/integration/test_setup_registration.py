"""Installation wizard, student registration, lifecycle and access-control tests."""
import base64
import io
import re
from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import db as _db
from app.models.system_setting import SystemSetting
from app.models.user import User

H = lambda t: {"Authorization": f"Bearer {t}"}
HB = lambda t, booth: {"Authorization": f"Bearer {t}", "X-Kiosk-Token": booth}   # a voter session at a booth
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def cpost(client, url, headers, json, photo=PNG):
    """Add a candidate the way the browser does: multipart form with a photo file."""
    data = dict(json)
    if photo is not None:
        data["photo"] = (io.BytesIO(photo), "photo.png")
    return client.post(url, headers=headers, data=data, content_type="multipart/form-data")
DEPT = "Bachelor of Science - Physics"


def wizard_payload(**over):
    d = {
        "system": {"institution_name": "Test College", "system_name": "Campus Votes",
                   "timezone": "Asia/Kolkata", "language": "en", "logo": ""},
        "officer": {"name": "Meera Krishnan", "email": "meera@test.edu", "username": "meera",
                    "password": "Strong@1234", "confirm_password": "Strong@1234"},
        "election": {"title": "Council 2026", "description": "", "date": "2030-01-10",
                     "start_time": "09:00", "end_time": "17:00",
                     "positions": ["President", "Secretary"],
                     "programmes": "B.Tech, 8\nBBA, 6"},
    }
    d.update(over)
    return d


@pytest.fixture()
def installed(client, db):
    r = client.post("/api/setup/complete", json=wizard_payload())
    assert r.status_code == 201, r.get_json()
    tok = r.get_json()["access_token"]
    import pyotp
    officer = User.query.filter_by(role="admin").first()      # two-step verification is mandatory for officers
    officer.otp_enabled, officer.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    return tok


def create_booth_token(client, admin_token):
    """What the Election Officer does in the panel (their account must have two-step verification on)."""
    import pyotp
    officer = User.query.filter_by(role="admin").first()
    if not officer.otp_enabled:
        officer.otp_enabled, officer.otp_secret = True, pyotp.random_base32()
        _db.session.commit()
    return client.post("/api/admin/booth-tokens", headers=H(admin_token))


def set_up_booth(client, admin_token, code=None, token=None):
    """What the kiosk machine does: the panel's booth token plus the officer's current authenticator code."""
    import pyotp
    token = token or create_booth_token(client, admin_token).get_json()["token"]
    officer = User.query.filter_by(role="admin").first()
    return client.post("/api/booth/activate", json={"create_token": token, "code": code or pyotp.TOTP(officer.otp_secret).now()})


@pytest.fixture()
def booth(client, installed):
    r = set_up_booth(client, installed)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["booth_token"]


@pytest.fixture()
def desk_token(client, installed):
    client.post("/api/admin/officers", headers=H(installed), json={
        "student_id": "desk1", "name": "Desk One", "email": "d1@test.edu", "password": "Desk@12345"})
    r = client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"})
    assert r.status_code == 200 and "access_token" in r.get_json()
    return r.get_json()["access_token"]


# ── wizard ────────────────────────────────────────────────────────────────────

def test_wizard_status_then_install_then_locked(client, db):
    assert client.get("/api/setup/status").get_json()["installed"] is False
    r = client.post("/api/setup/complete", json=wizard_payload())
    assert r.status_code == 201
    body = r.get_json()
    assert body["user"]["role"] == "admin"
    assert "password" not in str(body["user"]).lower()
    assert client.get("/api/setup/status").get_json()["installed"] is True
    # a second attempt can never create another initial officer
    again = client.post("/api/setup/complete", json=wizard_payload())
    assert again.status_code == 403
    assert client.post("/api/setup/validate", json={"step": "system", "data": {}}).status_code == 403
    assert User.query.filter_by(role="admin").count() == 1


def test_wizard_validation_errors(client, db):
    bad = wizard_payload(officer={"name": "X", "email": "nope", "username": "a",
                                  "password": "weak", "confirm_password": "other"})
    r = client.post("/api/setup/complete", json=bad)
    assert r.status_code == 400
    errs = r.get_json()["errors"]["officer"]
    assert {"name", "email", "username", "password"} <= set(errs)
    assert User.query.count() == 0 and not SystemSetting.is_installed()


def test_wizard_rejects_mismatched_passwords_and_bad_window(client, db):
    p = wizard_payload()
    p["officer"]["confirm_password"] = "Different@1234"
    p["election"]["end_time"] = "08:00"
    errs = client.post("/api/setup/complete", json=p).get_json()["errors"]
    assert "confirm_password" in errs["officer"] and "schedule" in errs["election"]


def test_wizard_logo_must_be_image(client, db):
    p = wizard_payload()
    p["system"]["logo"] = "data:text/html;base64,PHNjcmlwdD4="
    assert "logo" in client.post("/api/setup/complete", json=p).get_json()["errors"]["system"]


def test_setup_token_protects_wizard(client, db, monkeypatch):
    monkeypatch.setenv("SETUP_TOKEN", "s3cret")
    assert client.post("/api/setup/complete", json=wizard_payload()).status_code == 403
    ok = client.post("/api/setup/complete", json=wizard_payload(), headers={"X-Setup-Token": "s3cret"})
    assert ok.status_code == 201


def test_officer_login_without_2fa_and_no_universal_otp(client, installed):
    _off = User.query.filter_by(role="admin").first()
    _off.otp_enabled, _off.otp_secret = False, None
    _db.session.commit()
    r = client.post("/api/auth/login", json={"identifier": "meera@test.edu", "password": "Strong@1234"})
    assert r.status_code == 200 and "access_token" in r.get_json()
    # enabling 2FA with an unknown secret must not be bypassable with a fixed code
    u = User.query.filter_by(student_id="meera").first()
    u.otp_enabled, u.otp_secret = True, "JBSWY3DPEHPK3PXP"
    _db.session.commit()
    app_cfg = client.application.config
    app_cfg["DEMO_OTP_CODE"] = None
    step1 = client.post("/api/auth/login", json={"identifier": "meera", "password": "Strong@1234"}).get_json()
    assert step1["mfa_required"] is True
    bad = client.post("/api/auth/verify-otp", json={"temp_token": step1["temp_token"], "otp": "123456"})
    assert bad.status_code == 401
    app_cfg["DEMO_OTP_CODE"] = "123456"


# ── access control ───────────────────────────────────────────────────────────

def test_desk_cannot_use_officer_endpoints(client, desk_token):
    for method, url in [("get", "/api/admin/overview"), ("get", "/api/admin/officers"),
                        ("post", "/api/admin/officers"), ("get", "/api/admin/audit-logs"),
                        ("put", "/api/admin/settings"),
                        ("post", "/api/admin/elections/1/status")]:
        assert getattr(client, method)(url, headers=H(desk_token), json={}).status_code == 403, url


def test_unauthenticated_and_voter_access(client, installed):
    assert client.get("/api/desk/state").status_code == 401
    assert client.get("/api/admin/overview").status_code == 401


def test_desk_and_officer_cannot_cast_ballots(client, desk_token, installed):
    for tok in (desk_token, installed):
        assert client.post("/api/voter/elections/1/cast-ballot", headers=H(tok), json={"selections": []}).status_code == 403


def test_officer_can_manage_settings(client, installed):
    assert client.put("/api/admin/settings", headers=H(installed), json={"institution_name": "Renamed"}).status_code == 200
    assert client.get("/api/setup/status").get_json()["branding"]["institution_name"] == "Renamed"
    ov = client.get("/api/admin/overview", headers=H(installed)).get_json()
    assert ov["election"]["status"] == "setup"


# ── lifecycle + end-to-end voting ────────────────────────────────────────────

def _open_election(client, officer):
    e = client.get("/api/admin/elections", headers=H(officer)).get_json()[0]
    # voting window must contain "now" for the test
    now = datetime.now(timezone.utc)
    client.put(f"/api/admin/elections/{e['id']}", headers=H(officer), json={
        "start_time": (now - timedelta(hours=1)).isoformat(), "end_time": (now + timedelta(hours=5)).isoformat()})
    return e["id"]


def test_lifecycle_rules(client, installed):
    eid = _open_election(client, installed)
    st = lambda s: client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s})
    assert st("voting_active").status_code == 409          # cannot skip steps
    assert st("registration").status_code == 200
    assert st("ready").status_code == 200
    blocked = st("voting_active")                           # positions have no candidates yet
    assert blocked.status_code == 409 and "candidate" in blocked.get_json()["error"].lower()
    for pos in ("President", "Secretary"):
        assert cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                           json={"name": f"Cand {pos}", "position": pos, "department": DEPT}).status_code == 201
    assert cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                       json={"name": "X", "position": "Not A Position", "department": DEPT}).status_code == 400
    assert st("voting_active").status_code == 200
    assert cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                       json={"name": "Late", "position": "President", "department": DEPT}).status_code == 409
    assert st("registration").status_code == 409           # cannot step back once voting started
    assert st("voting_closed").status_code == 200
    assert st("results_published").status_code == 200
    assert client.get(f"/api/admin/elections/{eid}/report", headers=H(installed)).status_code == 200


def test_pause_only_while_voting_is_open(client, installed):
    eid = _open_election(client, installed)
    assert client.post(f"/api/admin/elections/{eid}/pause", headers=H(installed)).status_code == 409
    assert client.post(f"/api/admin/elections/{eid}/resume", headers=H(installed)).status_code == 409


def test_stored_xss_is_blocked_or_stripped(client, installed):
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    r = cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
              json={"name": "Eve <script>alert(1)</script>", "position": "President", "department": DEPT, "bio": "<img src=x onerror=alert(1)>"})
    assert "<" not in r.get_json()["name"] and "<" not in r.get_json()["bio"]


def test_candidate_department_free_text_optional(client, installed):
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    url = f"/api/admin/elections/{eid}/candidates"
    # Empty department succeeds and is stored as None
    ok_empty = cpost(client, url, headers=H(installed), json={"name": "Candidate A", "position": "President"})
    assert ok_empty.status_code == 201 and ok_empty.get_json()["department"] is None
    # Free-text department succeeds
    ok_text = cpost(client, url, headers=H(installed), json={"name": "Candidate B", "position": "Secretary", "department": "Political Science", "party": "X"})
    assert ok_text.status_code == 201 and ok_text.get_json()["department"] == "Political Science" and "party" not in ok_text.get_json()


# ── candidate photos and single election ───────────────────────────────────

def test_candidate_photo_is_required_validated_served_and_deleted(client, installed):
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    url = f"/api/admin/elections/{eid}/candidates"
    body = {"name": "A", "position": "President", "department": DEPT}
    assert cpost(client, url, H(installed), body, photo=None).status_code == 400
    assert cpost(client, url, H(installed), body, photo=b"<svg onload=alert(1)>").status_code == 400
    assert cpost(client, url, H(installed), body, photo=PNG + b"0" * (2 * 1024 * 1024)).status_code == 400
    from app.models.candidate_photo import CandidatePhoto
    assert CandidatePhoto.query.count() == 0                       # nothing stored for rejected uploads
    bad_name = cpost(client, url, H(installed), {**body, "name": ""})
    assert bad_name.status_code == 400 and CandidatePhoto.query.count() == 0
    ok = cpost(client, url, H(installed), body)
    cand = ok.get_json()
    assert ok.status_code == 201 and cand["photo_url"] == f"/api/photos/{cand['id']}"
    from app.services.photo_service import photo_exists
    assert photo_exists(cand["id"])
    img = client.get(cand["photo_url"])                            # public: <img> cannot send a token
    assert img.status_code == 200 and img.mimetype == "image/png" and img.data == PNG
    img.close()
    assert client.delete(f"{url}/{cand['id']}", headers=H(installed)).status_code == 200
    assert not photo_exists(cand["id"]) and client.get(cand["photo_url"]).status_code == 404


def test_only_one_election_at_a_time(client, installed):
    times = {"start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
             "end_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()}
    blocked = client.post("/api/admin/elections", headers=H(installed), json={"title": "Second", **times})
    assert blocked.status_code == 409
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    for st in ("registration", "ready"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": st})
    assert client.post("/api/admin/elections", headers=H(installed), json={"title": "Second", **times}).status_code == 409
    from app.models.election import Election
    Election.query.get(eid).set_status("archived")                 # as if the first election was finished and archived
    _db.session.commit()
    assert client.post("/api/admin/elections", headers=H(installed), json={"title": "Second", **times}).status_code == 201


# ── results: draws and public link ─────────────────────────────────────────

def _election_with_votes(client, installed, votes):
    """votes: list of candidate indexes (or 'nota') cast for President, one ballot each."""
    from app.models.ballot_entry import BallotEntry
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    ids = []
    for name in ("Ann", "Ben"):
        ids.append(cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                         json={"name": name, "position": "President", "department": DEPT}).get_json()["id"])
    cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": "Cy", "position": "Secretary", "department": DEPT})
    for i, v in enumerate(votes):
        _db.session.add(BallotEntry(election_id=eid, position="President", blind_token=f"t{i}",
                                    candidate_id=None if v == "nota" else ids[v], is_nota=v == "nota"))
    _db.session.commit()
    return eid


def _president(client, installed, eid):
    from app.models.election import Election
    _db.session.get(Election, eid).set_status("results_published")      # counts are visible only once published
    _db.session.commit()
    data = client.get(f"/api/admin/elections/{eid}/results", headers=H(installed)).get_json()
    return next(p for p in data["by_position"] if p["position"] == "President")


def test_equal_votes_are_a_draw_not_a_winner(client, installed):
    eid = _election_with_votes(client, installed, [0, 1])
    pos = _president(client, installed, eid)
    assert pos["outcome"]["type"] == "draw" and pos["outcome"]["label"] == "Draw between Ann and Ben"
    assert not any(c["is_winner"] for c in pos["candidates"]) and all(c["is_tied"] for c in pos["candidates"])


def test_nota_is_a_count_never_a_winner_or_a_tie(client, installed):
    eid = _election_with_votes(client, installed, [0, 0, 1])
    assert _president(client, installed, eid)["outcome"] == {"type": "winner", "label": "Ann", "names": ["Ann"]}
    from app.models.ballot_entry import BallotEntry
    BallotEntry.query.delete()
    # NOTA has the most votes (2), but a candidate with 1 vote still wins: NOTA is not a person
    _db.session.add_all([BallotEntry(election_id=eid, position="President", blind_token="a", is_nota=True),
                         BallotEntry(election_id=eid, position="President", blind_token="b", is_nota=True),
                         BallotEntry(election_id=eid, position="President", blind_token="c", candidate_id=1)])
    _db.session.commit()
    pos = _president(client, installed, eid)
    assert pos["outcome"]["type"] == "winner" and pos["nota_count"] == 2
    # a tie between NOTA and a candidate is not a draw either
    _db.session.add(BallotEntry(election_id=eid, position="President", blind_token="d", candidate_id=1))
    _db.session.commit()
    pos = _president(client, installed, eid)
    assert pos["outcome"]["type"] == "winner" and pos["outcome"]["names"] == ["Ann"]
    # only NOTA votes: nobody wins
    BallotEntry.query.delete()
    _db.session.add(BallotEntry(election_id=eid, position="President", blind_token="e", is_nota=True))
    _db.session.commit()
    assert _president(client, installed, eid)["outcome"] == {"type": "none", "label": "No candidate received a vote", "names": []}


def test_results_stay_hidden_until_published_and_public_link_follows(client, installed):
    eid = _election_with_votes(client, installed, [0, 1])
    results = lambda: client.get(f"/api/admin/elections/{eid}/results", headers=H(installed)).get_json()
    link = f"/api/admin/elections/{eid}/public-link"
    from app.models.election import Election

    def counts_visible(data):
        return any("candidates" in p or "outcome" in p for p in data["by_position"])

    for st in ("setup", "voting_active", "voting_closed"):                    # not during voting, not after it either
        _db.session.get(Election, eid).set_status(st)
        _db.session.commit()
        data = results()
        assert data["locked"] is True and not counts_visible(data) and data["published"] is False
        assert "Ann" not in str(data) and "votes" not in str(data["by_position"])
        assert client.post(link, headers=H(installed)).status_code == 409      # no link before publishing
        assert client.get(f"/api/admin/elections/{eid}/report", headers=H(installed)).status_code == 409
    assert client.post(link).status_code == 401                                 # officers only
    assert client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": "results_published"}).status_code == 200
    assert counts_visible(results()) and results()["public_path"] is None       # publishing alone makes nothing public
    path = client.post(link, headers=H(installed)).get_json()["public_path"]
    token = path.rsplit("/", 1)[1]
    r = client.get(f"/api/results/public/{token}")                              # no login needed
    assert r.status_code == 200 and r.get_json()["election"]["title"] == "Council 2026"
    assert "public_token" not in str(client.get("/api/auth/active-election").get_json())
    assert client.delete(link, headers=H(installed)).status_code == 200
    assert client.get(f"/api/results/public/{token}").status_code == 404
    assert client.get("/api/results/public/" + "x" * 24).status_code == 404



def test_staff_can_change_their_own_password(client, installed, desk_token):
    url = "/api/auth/change-password"
    body = lambda cur, new: {"current_password": cur, "new_password": new}
    assert client.post(url, json=body("Desk@12345", "NewPass@2026")).status_code == 401           # needs a session
    assert client.post(url, headers=H(desk_token), json=body("wrong", "NewPass@2026")).get_json()["field"] == "current_password"
    assert client.post(url, headers=H(desk_token), json=body("Desk@12345", "short")).status_code == 400
    assert client.post(url, headers=H(desk_token), json=body("Desk@12345", "Desk@12345")).status_code == 400
    assert client.post(url, headers=H(desk_token), json=body("Desk@12345", "NewPass@2026")).status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"}).status_code == 401
    assert "access_token" in client.post("/api/auth/login", json={"identifier": "desk1", "password": "NewPass@2026"}).get_json()


def test_forgot_password_needs_a_current_authenticator_code(client, installed):
    import pyotp
    url = "/api/auth/forgot-password"
    body = lambda ident, code, pw="Fresh@2026pw": {"identifier": ident, "code": code, "new_password": pw}
    # no two-step verification on the account: nothing can be done here
    assert client.post(url, json=body("meera", "123456")).status_code == 400
    u = User.query.filter_by(student_id="meera").first()
    u.otp_enabled, u.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    totp = pyotp.TOTP(u.otp_secret)
    assert client.post(url, json=body("meera", "000000")).status_code == 400            # wrong code
    assert client.post(url, json=body("nobody", totp.now())).status_code == 400         # same answer for unknown accounts
    assert client.post(url, json=body("meera", totp.now(), "weak")).status_code == 400
    assert client.post(url, json=body("meera@test.edu", totp.now())).status_code == 200
    step1 = client.post("/api/auth/login", json={"identifier": "meera", "password": "Fresh@2026pw"})
    assert step1.status_code == 200 and step1.get_json()["mfa_required"] is True


def test_staff_profile_photo_and_wizard_photo(client, db):
    p = wizard_payload()
    p["officer"]["photo"] = "data:image/png;base64," + base64.b64encode(PNG).decode()
    r = client.post("/api/setup/complete", json=p)
    assert r.status_code == 201 and r.get_json()["user"]["photo"].startswith("data:image/png")
    tok = r.get_json()["access_token"]
    assert client.put("/api/auth/photo", headers=H(tok), json={"photo": "data:text/html;base64,AAAA"}).status_code == 400
    assert client.put("/api/auth/photo", headers=H(tok), json={"photo": ""}).get_json()["photo"] is None


def test_password_can_be_changed_with_an_authenticator_code_instead_of_the_old_password(client, installed):
    import pyotp
    url = "/api/auth/change-password"
    body = {"code": "000000", "new_password": "Another@2026pw"}
    assert client.post(url, headers=H(installed), json=body).get_json()["field"] == "code"      # 2FA is off: code is useless
    u = User.query.filter_by(student_id="meera").first()
    u.otp_enabled, u.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    assert client.post(url, headers=H(installed), json=body).status_code == 400                  # wrong code
    ok = client.post(url, headers=H(installed), json={**body, "code": pyotp.TOTP(u.otp_secret).now()})
    assert ok.status_code == 200
    step1 = client.post("/api/auth/login", json={"identifier": "meera", "password": "Another@2026pw"})
    assert step1.status_code == 200 and step1.get_json()["mfa_required"] is True


def test_last_login_shows_the_previous_sign_in_and_its_address(client, installed):
    _off = User.query.filter_by(role="admin").first()
    _off.otp_enabled, _off.otp_secret = False, None
    _db.session.commit()
    assert client.get("/api/auth/last-login").status_code == 401
    assert client.get("/api/auth/last-login", headers=H(installed)).get_json()["at"] is None     # wizard sign-in is not logged
    first = client.post("/api/auth/login", json={"identifier": "meera", "password": "Strong@1234"},
                        environ_overrides={"REMOTE_ADDR": "10.1.2.3"}).get_json()["access_token"]
    second = client.post("/api/auth/login", json={"identifier": "meera", "password": "Strong@1234"},
                         environ_overrides={"REMOTE_ADDR": "10.9.9.9"}).get_json()["access_token"]
    assert client.get("/api/auth/last-login", headers=H(first)).get_json()["ip"] == "10.1.2.3"   # previous one, not the current
    assert client.get("/api/auth/last-login", headers=H(second)).get_json()["at"] is not None


def test_deactivating_an_officer_ends_their_session_immediately(client, installed, desk_token):
    assert client.get("/api/desk/state", headers=H(desk_token)).status_code == 200
    oid = client.get("/api/admin/officers", headers=H(installed)).get_json()[0]["id"]
    assert client.patch(f"/api/admin/officers/{oid}", headers=H(installed), json={"is_active": False}).status_code == 200
    r = client.get("/api/desk/state", headers=H(desk_token))          # the token they already hold
    assert r.status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"}).status_code == 403
    client.patch(f"/api/admin/officers/{oid}", headers=H(installed), json={"is_active": True})
    assert client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"}).status_code == 200
    client.delete(f"/api/admin/officers/{oid}", headers=H(installed))
    assert client.get("/api/desk/state", headers=H(desk_token)).status_code == 401   # removed accounts too


# ── voting booths ──────────────────────────────────────────────────────────

def test_booth_ids_are_generated_per_election_from_a_panel_token_and_the_officer_code(client, installed):
    import pyotp
    from app.models.booth_create_token import BoothCreateToken
    from app.models.kiosk_device import KioskDevice
    assert client.post("/api/admin/booth-tokens").status_code == 401                            # panel only
    created = create_booth_token(client, installed).get_json()
    assert len(created["token"]) == 9 and created["token"][4] == "-"
    officer = User.query.filter_by(role="admin").first()
    code = pyotp.TOTP(officer.otp_secret).now()
    act = lambda tok, c: client.post("/api/booth/activate", json={"create_token": tok, "code": c})
    assert act(created["token"], "000000").status_code == 403                                   # wrong code
    assert act("AAAA-AAAA", code).status_code == 403                                            # unknown token
    first = act(created["token"].lower().replace("-", " "), code)                               # forgiving about case and spacing
    assert first.status_code == 201 and first.get_json()["booth_id"] == "BOOTH-01" and first.get_json()["booth_token"].startswith("booth_")
    assert act(created["token"], code).status_code == 403                                       # a token works once
    second = set_up_booth(client, installed)
    assert second.get_json()["booth_id"] == "BOOTH-02"
    assert KioskDevice.query.filter_by(device_name="BOOTH-01").one().kiosk_token != first.get_json()["booth_token"]   # hash only
    row = BoothCreateToken.query.first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    _db.session.commit()
    fresh = create_booth_token(client, installed).get_json()["token"]
    BoothCreateToken.query.filter_by(used_at=None).update({"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
    _db.session.commit()
    assert set_up_booth(client, installed, token=fresh).status_code == 403                      # expired token


def test_booth_setup_rules_for_who_may_approve(client, installed, desk_token):
    import pyotp
    assert client.post("/api/admin/booth-tokens", headers=H(desk_token)).status_code == 403       # desk officers cannot
    _off = User.query.filter_by(role="admin").first()
    _off.otp_enabled, _off.otp_secret = False, None
    _db.session.commit()
    r = client.post("/api/admin/booth-tokens", headers=H(installed))                              # officer has no two-step verification
    assert r.status_code == 403 and r.get_json()["error"] == "two_step_required"
    token = create_booth_token(client, installed).get_json()["token"]
    desk = User.query.filter_by(student_id="desk1").first()
    desk.otp_enabled, desk.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    wrong = client.post("/api/booth/activate", json={"create_token": token, "code": pyotp.TOTP(desk.otp_secret).now()})
    assert wrong.status_code == 403                                                              # only the creating officer's code works


def test_deleting_a_booth_revokes_it_immediately_and_it_can_be_set_up_again(client, installed, booth):
    status = lambda tok: client.get("/api/booth/status", headers={"X-Kiosk-Token": tok}).get_json()
    assert status(booth)["valid"] is True and status(booth)["voting_open"] is False
    bid = client.get("/api/admin/kiosk/list", headers=H(installed)).get_json()[0]["id"]
    assert "kiosk_token" not in str(client.get("/api/admin/kiosk/list", headers=H(installed)).get_json())
    assert client.delete(f"/api/admin/kiosk/{bid}", headers=H(installed)).status_code == 200
    assert status(booth) == {"valid": False}                                               # the kiosk notices on its next check
    again = set_up_booth(client, installed)
    assert again.status_code == 201 and again.get_json()["booth_id"] == "BOOTH-01"            # the freed number is reused
    assert status(booth)["valid"] is False                                                  # but the old token stays dead
    from app.models.audit_log import AuditLog
    assert {"BOOTH_ACTIVATED", "BOOTH_REMOVED"} <= {a.action for a in AuditLog.query.all()}


def test_two_step_verification_cannot_be_turned_off_by_an_election_officer(client, installed):
    import pyotp
    u = User.query.filter_by(role="admin").first()
    u.otp_enabled, u.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    r = client.post("/api/auth/totp/disable", headers=H(installed), json={"password": "Strong@1234"})
    assert r.status_code == 403


def test_booth_status_gives_the_slip_prefix(client, installed, booth):
    st = client.get("/api/booth/status", headers={"X-Kiosk-Token": booth}).get_json()
    assert st["slip_prefix"] == "SUE30-E1-"


def test_slip_letters_come_from_the_wizard_and_default_to_sue(client, db):
    p = wizard_payload()
    p["system"]["slip_code"] = "x"
    assert "slip_code" in client.post("/api/setup/complete", json=p).get_json()["errors"]["system"]
    p["system"]["slip_code"] = "pdu"
    tok = client.post("/api/setup/complete", json=p).get_json()["access_token"]
    from app.models.election import Election
    assert _db.session.get(Election, 1).slip_prefix == "PDU30-E1-"
    _officer_code()                                  # two-step verification is mandatory for officer endpoints
    assert client.put("/api/admin/settings", headers=H(tok), json={"slip_code": "abc"}).get_json()["slip_code"] == "ABC"


# ── backup and reset ─────────────────────────────────────────────────────────

def _officer_code():
    import pyotp
    officer = User.query.filter_by(role="admin").first()
    if not officer.otp_enabled:
        officer.otp_enabled, officer.otp_secret = True, pyotp.random_base32()
        _db.session.commit()
    return pyotp.TOTP(officer.otp_secret).now()


def test_backup_zip_has_every_table_and_is_officer_only(client, installed, desk_token):
    import io, json, zipfile
    assert client.post("/api/admin/system/export", headers=H(desk_token)).status_code == 403
    assert client.post("/api/admin/system/export").status_code == 401
    r = client.post("/api/admin/system/export", headers=H(installed))
    assert r.status_code == 200 and r.mimetype == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.data))
    names = z.namelist()
    assert {"manifest.json", "README.txt", "db/users.json", "db/elections.json", "db/system_settings.json"} <= set(names)
    assert json.loads(z.read("manifest.json"))["rows"]["users"] >= 1


def test_reset_needs_backup_code_and_confirmation_then_wizard_returns(client, installed):
    body = lambda **k: {"confirm": "RESET", "code": _officer_code(), **k}
    # no backup yet
    r = client.post("/api/admin/system/reset", headers=H(installed), json=body())
    assert r.status_code == 409 and "backup" in r.get_json()["error"].lower()
    client.post("/api/admin/system/export", headers=H(installed))
    # missing confirmation word / wrong authenticator code
    assert client.post("/api/admin/system/reset", headers=H(installed), json=body(confirm="no")).status_code == 400
    assert client.post("/api/admin/system/reset", headers=H(installed), json=body(code="000000")).status_code == 403
    assert User.query.count() >= 1
    # everything correct
    assert client.post("/api/admin/system/reset", headers=H(installed), json=body()).status_code == 200
    assert client.get("/api/setup/status").get_json()["installed"] is False
    assert User.query.count() == 0
    r = client.post("/api/setup/complete", json=wizard_payload())      # a fresh installation works again
    assert r.status_code == 201


def test_reset_refused_while_voting_is_open(client, installed, desk_token):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for s in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s})
    client.post("/api/admin/system/export", headers=H(installed))
    r = client.post("/api/admin/system/reset", headers=H(installed), json={"confirm": "RESET", "code": _officer_code()})
    assert r.status_code == 409 and "voting is open" in r.get_json()["error"].lower()


def test_backup_can_be_imported_after_a_reset(client, installed):
    import io
    # something worth keeping
    assert client.put("/api/admin/settings", headers=H(installed), json={"institution_name": "Exported University"}).status_code == 200
    zip_bytes = client.post("/api/admin/system/export", headers=H(installed)).data
    assert client.post("/api/admin/system/reset", headers=H(installed), json={"confirm": "RESET", "code": _officer_code()}).status_code == 200

    # set up again with temporary details, as an operator would
    temp = wizard_payload(officer={"name": "Temp Officer", "email": "temp@test.edu", "username": "temp",
                                   "password": "Strong@1234", "confirm_password": "Strong@1234"})
    tok = client.post("/api/setup/complete", json=temp).get_json()["access_token"]
    code = _officer_code()

    def upload(**form):
        return client.post("/api/admin/system/import", headers=H(tok), data={"file": (io.BytesIO(zip_bytes), "b.zip"), **form},
                           content_type="multipart/form-data")

    assert upload(confirm="no", code=code).status_code == 400
    assert upload(confirm="IMPORT", code="000000").status_code == 403
    bad = client.post("/api/admin/system/import", headers=H(tok), data={"file": (io.BytesIO(b"not a zip"), "b.zip"), "confirm": "IMPORT", "code": code},
                      content_type="multipart/form-data")
    assert bad.status_code == 400 and User.query.filter_by(email="temp@test.edu").count() == 1   # a bad file changes nothing
    assert upload(confirm="IMPORT", code=code).status_code == 200

    emails = {u.email for u in User.query.all()}
    assert "meera@test.edu" in emails and "temp@test.edu" not in emails        # the old accounts are back
    assert all(not u.otp_enabled and u.otp_secret is None for u in User.query.all())   # authenticators are set up again
    assert client.get("/api/setup/status").get_json()["installed"] is True
    assert client.get("/api/setup/status").get_json()["branding"]["institution_name"] == "Exported University"


def test_officer_without_two_step_verification_is_locked_out_server_side(client, installed, desk_token):
    off = User.query.filter_by(role="admin").first()
    off.otp_enabled, off.otp_secret = False, None
    _db.session.commit()
    for method, url in (("get", "/api/admin/officers"), ("get", "/api/admin/settings"), ("post", "/api/admin/system/export"),
                        ("get", "/api/desk/state"), ("post", "/api/admin/elections")):
        r = getattr(client, method)(url, headers=H(installed))
        assert r.status_code == 403 and r.get_json()["error"] == "two_step_required", url
    assert client.get("/api/auth/totp/setup", headers=H(installed)).status_code == 200      # the way out stays open
    assert client.get("/api/desk/state", headers=H(desk_token)).status_code == 200  # desk officers are not affected


def test_signed_out_tokens_stay_dead_after_a_restart(client, db):
    from app.extensions import token_blacklist
    r = client.post("/api/setup/complete", json=wizard_payload()).get_json()
    access, refresh = r["access_token"], r["refresh_token"]
    assert client.get("/api/auth/me", headers=H(access)).status_code == 200
    assert client.post("/api/auth/refresh", headers=H(refresh)).status_code == 200      # silent renewal works
    assert client.post("/api/auth/logout", headers=H(access), json={"refresh_token": refresh}).status_code == 200
    token_blacklist.clear()                                                             # what a server restart does to the in-memory set
    assert client.get("/api/auth/me", headers=H(access)).status_code == 401
    assert client.post("/api/auth/refresh", headers=H(refresh)).status_code == 401


def test_staff_session_defaults_are_short(app):
    assert app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds() in (15 * 60, 5 * 60)   # 15 minutes (tests use 5)
    assert app.config["JWT_REFRESH_TOKEN_EXPIRES"].total_seconds() == 12 * 3600


def test_positions_follow_the_election_notice_order_in_ballot_and_results(client, installed):
    from app.services.vote_service import VoteService
    notice = ["President", "Vice President", "General Secretary", "Assistant General Secretary", "Cultural Secretary",
              "Magazine Secretary", "Major Games Secretary", "Minor Games Secretary", "Boys’ Common Room Secretary",
              "Girls’ Common Room Secretary"]
    eid = _open_election(client, installed)
    assert client.put(f"/api/admin/elections/{eid}/positions", headers=H(installed), json={"positions": notice}).status_code == 200
    for pos in reversed(notice):                                # candidates added in the opposite order
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    assert [p["position"] for p in VoteService.get_results(election_id=eid, force=True)["by_position"]] == notice
    moved = notice[1:2] + notice[:1] + notice[2:]               # the officer moves President below Vice President
    client.put(f"/api/admin/elections/{eid}/positions", headers=H(installed), json={"positions": moved})
    assert [p["position"] for p in VoteService.get_results(election_id=eid, force=True)["by_position"]] == moved


def test_printing_settings_reach_the_booth(client, installed, booth):
    assert client.get("/api/admin/settings/printing", headers=H(installed)).get_json() == {"enabled": True, "printer": "", "copies": 1}
    r = client.put("/api/admin/settings/printing", headers=H(installed), json={"enabled": True, "printer": "HP LaserJet-1", "copies": 2})
    assert r.status_code == 200
    assert client.put("/api/admin/settings/printing", headers=H(installed), json={"printer": "a;rm -rf /", "copies": 1}).status_code == 400
    assert client.put("/api/admin/settings/printing", headers=H(installed), json={"copies": 9}).status_code == 400
    st = client.get("/api/booth/status", headers={"X-Kiosk-Token": booth}).get_json()
    assert st["print"] == {"enabled": True, "printer": "HP LaserJet-1", "copies": 2}


def test_separate_mock_election_workflow(client, installed, desk_token, booth):
    from app.models.audit_log import AuditLog
    from app.models.election import Election

    eid = _open_election(client, installed)
    cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": "Alice Real", "position": "President", "department": DEPT})

    # Start separate mock election using real candidates
    start_res = client.post("/api/admin/mock/start", headers=H(installed), json={
        "election_id": eid,
        "booth_numbers": [1],
        "slip_count": 5,
        "candidate_mode": "real",
    })
    assert start_res.status_code == 200
    mock_data = start_res.get_json()
    mock_id = mock_data["id"]
    assert mock_data["is_mock"] is True

    # Check desk state returns mock info and mock is true
    st = client.get("/api/desk/state", headers=H(installed)).get_json()
    assert st["is_mock"] is True
    assert st["mock_info"]["id"] == mock_id

    # Verify real election cannot transition stages while mock runs
    trans_err = client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": "registration"})
    assert trans_err.status_code == 409
    assert "mock election is currently active" in trans_err.get_json()["error"].lower()

    # Verify real election details cannot be updated while mock runs
    update_err = client.put(f"/api/admin/elections/{eid}", headers=H(installed), json={"title": "New Title"})
    assert update_err.status_code == 409

    # Verify official slips cannot be generated while mock runs
    slip_err = client.post("/api/admin/booths/1/generate-slips", headers=H(installed), json={"count": 5})
    assert slip_err.status_code == 409

    # Verify mock candidates were copied from real election
    from app.extensions import db
    mock_election = db.session.get(Election, mock_id)
    assert any(c.name == "Alice Real" for c in mock_election.candidates)

    # Verify mock results can be viewed
    results_res = client.get(f"/api/admin/elections/{mock_id}/results", headers=H(installed))
    assert results_res.status_code == 200
    assert results_res.get_json()["mock"] is True

    # Create a mock vote receipt during the mock run
    from app.models.vote_receipt import VoteReceipt
    mock_receipt = VoteReceipt(
        slip_id="MOCK-TEST-9999",
        election_id=mock_id,
        booth_name="BOOTH-01",
        is_mock=True,
        choices_json="[]",
    )
    db.session.add(mock_receipt)
    db.session.commit()

    # End mock election
    end_res = client.post("/api/admin/mock/end", headers=H(installed), json={"confirm": "RESET"})
    assert end_res.status_code == 200

    # Verify mock election ended and real election remains in ready stage
    real_e = db.session.get(Election, eid)
    assert real_e is not None
    assert real_e.is_mock is False
    assert real_e.status in ("setup", "ready")

    # Verify mock vote receipts are cleared up to 0 upon mock election reset!
    assert VoteReceipt.query.filter_by(slip_id="MOCK-TEST-9999").first() is None
    assert VoteReceipt.query.filter(VoteReceipt.election_id.in_([mock_id, eid])).count() == 0

    # Verify mock start and end audit logs are preserved
    mock_logs = AuditLog.query.filter(AuditLog.action.in_(["MOCK_STARTED", "MOCK_RESET"])).all()
    assert len(mock_logs) >= 2

