"""Installation wizard, student registration, lifecycle and access-control tests."""
import base64
import io
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
    for body in ({"level": "degree", "programme": "Bachelor of Science", "department": "Physics", "term_count": 8},
                 {"level": "degree", "programme": "Bachelor of Arts", "department": "English", "term_count": 6}):
        assert client.post("/api/admin/programmes", headers=H(tok), json=body).status_code == 201
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


def register(client, token, name="Ananya Sharma", programme_id=1, semester=3, **extra):
    return client.post("/api/desk/registrations", headers=H(token),
                       json={"name": name, "programme_id": programme_id, "semester": semester, **extra})


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


# ── registration ─────────────────────────────────────────────────────────────

def test_register_generates_unique_stable_slip_ids(client, desk_token):
    slips = set()
    for i in range(15):
        r = register(client, desk_token, name=f"Student Number{chr(65 + i)}", semester=1 + i % 8)
        assert r.status_code == 201, r.get_json()
        body = r.get_json()
        assert body["slip_id"].startswith("SUE30-E1-")        # prefix fixed when the election was created (its year)
        assert "id" not in body
        slips.add(body["slip_id"])
    assert len(slips) == 15
    fetched = client.get(f"/api/desk/registrations/{sorted(slips)[0].lower()}", headers=H(desk_token))
    assert fetched.status_code == 200 and fetched.get_json()["slip_id"] == sorted(slips)[0]


def test_slip_id_retries_on_collision(client, desk_token, monkeypatch):
    from app.routes import desk
    first = register(client, desk_token).get_json()["slip_id"]
    seq = iter([first, first, "SUE30-E1-000042"])
    monkeypatch.setattr(desk, "new_slip_id", lambda prefix=None: next(seq))
    r = register(client, desk_token, name="Brand New Student")
    assert r.status_code == 201 and r.get_json()["slip_id"] == "SUE30-E1-000042"


def test_registration_validation_and_duplicates(client, desk_token):
    assert register(client, desk_token, name="  ").status_code == 400
    assert register(client, desk_token, name="R2D2 <script>").status_code == 400
    assert register(client, desk_token, programme_id=999).status_code == 400
    assert register(client, desk_token, semester=9).status_code == 400   # B.Tech has 8
    assert register(client, desk_token, semester=0).status_code == 400
    assert register(client, desk_token, name="  Ananya   Sharma ").status_code == 201
    dup = register(client, desk_token, name="ananya sharma")
    assert dup.status_code == 409 and dup.get_json()["code"] == "possible_duplicate"
    assert register(client, desk_token, name="ananya sharma", confirm_duplicate=True).status_code == 201


def test_search_filter_edit_and_export(client, desk_token):
    register(client, desk_token, name="Ananya Sharma", programme_id=1, semester=3)
    s2 = register(client, desk_token, name="Rahul Verma", programme_id=2, semester=2).get_json()["slip_id"]
    q = lambda **p: client.get("/api/desk/registrations", headers=H(desk_token), query_string=p).get_json()
    assert q(q="rahul")["total"] == 1
    assert q(q=s2)["total"] == 1
    assert q(programme_id=1)["total"] == 1
    assert q(programme_id=2, semester=2)["total"] == 1
    assert q(semester=7)["total"] == 0
    r = client.patch(f"/api/desk/registrations/{s2}", headers=H(desk_token), json={"name": "Rahul V. Verma", "semester": 4})
    assert r.status_code == 200 and r.get_json()["semester"] == 4 and r.get_json()["slip_id"] == s2
    assert client.patch(f"/api/desk/registrations/{s2}", headers=H(desk_token), json={"semester": 99}).status_code == 400
    csv_body = client.get("/api/desk/registrations/export", headers=H(desk_token)).get_data(as_text=True)
    assert s2 in csv_body and csv_body.startswith("Voter Slip ID")


def test_export_neutralises_spreadsheet_formulas(client, desk_token):
    register(client, desk_token, name="Evil Name")
    u = User.query.filter_by(role="voter").first()
    u.name = "=HYPERLINK(1)"
    _db.session.commit()
    assert "'=HYPERLINK" in client.get("/api/desk/registrations/export", headers=H(desk_token)).get_data(as_text=True)


# ── access control ───────────────────────────────────────────────────────────

def test_desk_cannot_use_officer_endpoints(client, desk_token):
    for method, url in [("get", "/api/admin/overview"), ("get", "/api/admin/officers"),
                        ("post", "/api/admin/officers"), ("get", "/api/admin/audit-logs"),
                        ("post", "/api/admin/programmes"), ("put", "/api/admin/settings"),
                        ("post", "/api/admin/elections/1/status")]:
        assert getattr(client, method)(url, headers=H(desk_token), json={}).status_code == 403, url


def test_unauthenticated_and_voter_access(client, installed):
    assert client.get("/api/desk/registrations").status_code == 401
    assert client.get("/api/admin/overview").status_code == 401
    assert client.post("/api/desk/registrations", json={}).status_code == 401


def test_desk_and_officer_cannot_cast_ballots(client, desk_token, installed):
    for tok in (desk_token, installed):
        assert client.post("/api/voter/elections/1/cast-ballot", headers=H(tok), json={"selections": []}).status_code == 403


def test_officer_can_manage_programmes_and_settings(client, installed):
    hs = {"level": "hs", "department": "Arts"}
    r = client.post("/api/admin/programmes", headers=H(installed), json=hs)
    assert r.status_code == 201
    body = r.get_json()
    assert body["programme"] == "Higher Secondary" and body["term_count"] == 2
    assert [t["label"] for t in body["terms"]] == ["HS 1st Year", "HS 2nd Year"]
    assert client.post("/api/admin/programmes", headers=H(installed), json={**hs, "department": "arts"}).status_code == 400
    assert client.post("/api/admin/programmes", headers=H(installed), json={"level": "degree", "programme": "BA"}).status_code == 400
    assert client.put("/api/admin/settings", headers=H(installed), json={"institution_name": "Renamed"}).status_code == 200
    assert client.get("/api/setup/status").get_json()["branding"]["institution_name"] == "Renamed"
    ov = client.get("/api/admin/overview", headers=H(installed)).get_json()
    assert ov["stats"]["registered_voters"] == 0 and ov["election"]["status"] == "setup"


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


def test_full_voting_flow_and_duplicate_prevention(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for s in ("registration", "ready", "voting_active"):
        assert client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s}).status_code == 200

    slip = register(client, desk_token).get_json()["slip_id"]
    assert client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": "STU-NOT-REGISTERED"}).status_code == 404
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]

    wrong = client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": "000000" if pin != "000000" else "111111"})
    assert wrong.status_code == 401
    login = client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip.lower(), "voting_pin": pin})
    assert login.status_code == 200, login.get_json()
    vt = login.get_json()["access_token"]

    ballot = client.get(f"/api/voter/elections/{eid}/ballot", headers=HB(vt, booth)).get_json()
    assert [p["position"] for p in ballot["positions"]] == ["President", "Secretary"]
    sel = [{"position": p["position"], "candidate_id": p["candidates"][0]["id"], "is_nota": False} for p in ballot["positions"]]
    ok = client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=HB(vt, booth), json={"selections": sel})
    assert ok.status_code == 200, ok.get_json()
    again = client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=HB(vt, booth), json={"selections": sel})
    assert again.status_code == 400
    # desk status now shows voted, and a new slip cannot be issued
    row = client.get(f"/api/desk/registrations/{slip}", headers=H(desk_token)).get_json()
    assert row["status"] == "voted"
    assert client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).status_code == 400
    assert client.patch(f"/api/desk/registrations/{slip}", headers=H(desk_token), json={"name": "Changed Name"}).status_code == 409


def test_pin_locks_after_repeated_failures(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for s in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s})
    slip = register(client, desk_token).get_json()["slip_id"]
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]
    wrong = "000000" if pin != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": wrong}).status_code == 401
    assert client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": pin}).status_code == 401


def test_pause_resume_and_schedule_is_information_only(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for s in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s})
    slip = register(client, desk_token).get_json()["slip_id"]
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]
    vt = client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": pin}).get_json()["access_token"]
    ballot = client.get(f"/api/voter/elections/{eid}/ballot", headers=HB(vt, booth)).get_json()
    sel = [{"position": p["position"], "candidate_id": p["candidates"][0]["id"], "is_nota": False} for p in ballot["positions"]]

    # The schedule is information only: moving it never opens or closes voting.
    from app.models.election import Election
    e = _db.session.get(Election, eid)
    now = datetime.now(timezone.utc)
    e.start_time, e.end_time = now + timedelta(hours=1), now + timedelta(hours=2)
    _db.session.commit()

    # Only the officer's pause stops votes ...
    assert client.post(f"/api/admin/elections/{eid}/pause", headers=H(installed)).status_code == 200
    assert _db.session.get(Election, eid).to_dict()["status_label"] == "Voting Paused"
    r = client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=HB(vt, booth), json={"selections": sel})
    assert r.status_code == 400 and "paused" in r.get_data(as_text=True).lower()
    # ... and the same ballot goes through after resuming, although the scheduled time has not begun.
    assert client.post(f"/api/admin/elections/{eid}/resume", headers=H(installed)).status_code == 200
    assert client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=HB(vt, booth), json={"selections": sel}).status_code == 200


def test_pause_only_while_voting_is_open(client, installed):
    eid = _open_election(client, installed)
    assert client.post(f"/api/admin/elections/{eid}/pause", headers=H(installed)).status_code == 409
    assert client.post(f"/api/admin/elections/{eid}/resume", headers=H(installed)).status_code == 409


# ── security ────────────────────────────────────────────────────────────────

def _voter_token(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for s in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": s})
    slip = register(client, desk_token).get_json()["slip_id"]
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]
    tok = client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": pin}).get_json()["access_token"]
    return eid, slip, tok


def test_sql_injection_attempts_are_inert(client, desk_token):
    register(client, desk_token)
    for payload in ("' OR 1=1 --", "x'; DROP TABLE users; --", "%' UNION SELECT * FROM users --"):
        r = client.get("/api/desk/registrations", headers=H(desk_token), query_string={"q": payload})
        assert r.status_code == 200 and r.get_json()["total"] == 0
        assert client.get(f"/api/desk/registrations/{payload}", headers=H(desk_token)).status_code == 404
    assert client.get("/api/desk/registrations", headers=H(desk_token)).get_json()["total"] == 1


def test_stored_xss_is_blocked_or_stripped(client, installed, desk_token):
    assert register(client, desk_token, name="<script>alert(1)</script>").status_code == 400
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    r = cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                    json={"name": "Eve <script>alert(1)</script>", "position": "President", "department": DEPT, "bio": "<img src=x onerror=alert(1)>"})
    assert "<" not in r.get_json()["name"] and "<" not in r.get_json()["bio"]


def test_voter_token_cannot_reach_staff_endpoints(client, installed, desk_token, booth):
    eid, slip, vt = _voter_token(client, installed, desk_token, booth)
    for method, url in [("get", "/api/desk/registrations"), ("post", "/api/desk/registrations"),
                        ("get", f"/api/desk/registrations/{slip}"), ("get", "/api/admin/overview"),
                        ("get", "/api/admin/elections"), ("get", "/api/admin/audit-logs"),
                        ("post", "/api/admin/desk/issue-pin"), ("post", f"/api/admin/elections/{eid}/status")]:
        assert getattr(client, method)(url, headers=HB(vt, booth), json={}).status_code == 403, url


def test_election_isolation(client, installed, desk_token, booth):
    eid, slip, vt = _voter_token(client, installed, desk_token, booth)
    from app.models.election import Election
    from app.models.election_position import ElectionPosition
    now = datetime.now(timezone.utc)
    second = Election(title="Other Election", start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=3))
    second.set_status("voting_active")
    _db.session.add(second)
    _db.session.flush()
    _db.session.add(ElectionPosition(election_id=second.id, name="Chair", sort_order=0))
    _db.session.commit()
    other = second.id
    from app.models.candidate import Candidate
    _db.session.add(Candidate(election_id=other, name="Z", position="Chair", department=DEPT))
    _db.session.commit()
    cand = client.get(f"/api/admin/elections/{other}", headers=H(installed)).get_json()["candidates"][0]["id"]
    r = client.post(f"/api/voter/elections/{other}/cast-ballot", headers=HB(vt, booth),
                    json={"selections": [{"position": "Chair", "candidate_id": cand, "is_nota": False}]})
    assert r.status_code in (400, 403)     # the booth belongs to the first election, and the voter is registered only there


def test_tampered_selections_rejected(client, installed, desk_token, booth):
    eid, slip, vt = _voter_token(client, installed, desk_token, booth)
    ballot = client.get(f"/api/voter/elections/{eid}/ballot", headers=HB(vt, booth)).get_json()
    good = [{"position": p["position"], "candidate_id": p["candidates"][0]["id"], "is_nota": False} for p in ballot["positions"]]
    post = lambda sel: client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=HB(vt, booth), json={"selections": sel}).status_code
    assert post(good[:1]) == 400                                                     # missing position
    assert post(good + [good[0]]) == 400                                             # duplicate position
    assert post([{**good[0], "candidate_id": 99999}, good[1]]) == 400                # unknown candidate
    assert post([{**good[0], "position": "Nonexistent"}, good[1]]) == 400            # unknown position
    assert post(good) == 200


# ── programme CSV import and candidate department ──────────────────────────

def test_programme_csv_import(client, installed):
    import io
    csv_text = chr(10).join(['level,programme,department,terms', 'hs,Higher Secondary,Arts,', 'hs,Higher Secondary,Science,2', 'degree,Bachelor of Science,Chemistry,6', 'degree,Bachelor of Science,Physics,8', 'degree,Bachelor of Arts,,6', 'college,Bachelor of Arts,History,6'])
    r = client.post("/api/admin/programmes/import", headers=H(installed),
                    data={"file": (io.BytesIO(csv_text.encode()), "p.csv")}, content_type="multipart/form-data")
    body = r.get_json()
    assert r.status_code == 200 and body["created"] == 3 and body["skipped"] == 1 and len(body["errors"]) == 2
    assert client.post("/api/admin/programmes/import", headers=H(installed)).status_code == 400


def test_candidate_needs_department_from_programmes(client, installed):
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    url = f"/api/admin/elections/{eid}/candidates"
    assert cpost(client, url, headers=H(installed), json={"name": "A", "position": "President"}).status_code == 400
    assert cpost(client, url, headers=H(installed), json={"name": "A", "position": "President", "department": "Nowhere"}).status_code == 400
    ok = cpost(client, url, headers=H(installed), json={"name": "A", "position": "President", "department": DEPT, "party": "X"})
    assert ok.status_code == 201 and ok.get_json()["department"] == DEPT and "party" not in ok.get_json()


def test_wizard_imports_programme_template(client, db):
    tpl = client.get("/api/setup/programme-template").get_data(as_text=True)
    assert "Bachelor of Science,Physics" in tpl and "Bachelor of Arts,History" in tpl and "hs,Higher Secondary,Science" in tpl
    p = wizard_payload()
    p["election"]["programmes_csv"] = tpl
    assert client.post("/api/setup/validate", json={"step": "election", "data": p}).get_json()["errors"] == {}
    bad = wizard_payload()
    bad["election"]["programmes_csv"] = "level,programme,department" + chr(10) + "college,X,Y"
    assert "programmes_csv" in client.post("/api/setup/validate", json={"step": "election", "data": bad}).get_json()["errors"]["election"]
    r = client.post("/api/setup/complete", json=p)
    assert r.status_code == 201
    from app.models.programme import Programme
    assert Programme.query.count() == 15 and Programme.query.filter_by(level="hs").count() == 2


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
    bad_dept = cpost(client, url, H(installed), {**body, "department": "Nowhere"})
    assert bad_dept.status_code == 400 and CandidatePhoto.query.count() == 0
    ok = cpost(client, url, H(installed), body)
    cand = ok.get_json()
    assert ok.status_code == 201 and cand["photo_url"] == f"/api/photos/{cand['id']}"
    img = client.get(cand["photo_url"])                            # public: <img> cannot send a token
    assert img.status_code == 200 and img.mimetype == "image/png" and img.data == PNG
    assert client.delete(f"{url}/{cand['id']}", headers=H(installed)).status_code == 200
    assert CandidatePhoto.query.count() == 0 and client.get(cand["photo_url"]).status_code == 404


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


def test_clear_winner_nota_and_candidate_nota_draw(client, installed):
    eid = _election_with_votes(client, installed, [0, 0, 1])
    assert _president(client, installed, eid)["outcome"] == {"type": "winner", "label": "Ann", "names": ["Ann"]}
    from app.models.ballot_entry import BallotEntry
    BallotEntry.query.delete()
    _db.session.add_all([BallotEntry(election_id=eid, position="President", blind_token="a", is_nota=True),
                         BallotEntry(election_id=eid, position="President", blind_token="b", is_nota=True),
                         BallotEntry(election_id=eid, position="President", blind_token="c", candidate_id=1)])
    _db.session.commit()
    assert _president(client, installed, eid)["outcome"]["type"] == "nota"
    _db.session.add(BallotEntry(election_id=eid, position="President", blind_token="d", candidate_id=1))
    _db.session.commit()
    assert "None of the Above" in _president(client, installed, eid)["outcome"]["label"]
    assert _president(client, installed, eid)["outcome"]["type"] == "draw"


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
    assert client.get("/api/auth/last-login").status_code == 401
    assert client.get("/api/auth/last-login", headers=H(installed)).get_json()["at"] is None     # wizard sign-in is not logged
    first = client.post("/api/auth/login", json={"identifier": "meera", "password": "Strong@1234"},
                        environ_overrides={"REMOTE_ADDR": "10.1.2.3"}).get_json()["access_token"]
    second = client.post("/api/auth/login", json={"identifier": "meera", "password": "Strong@1234"},
                         environ_overrides={"REMOTE_ADDR": "10.9.9.9"}).get_json()["access_token"]
    assert client.get("/api/auth/last-login", headers=H(first)).get_json()["ip"] == "10.1.2.3"   # previous one, not the current
    assert client.get("/api/auth/last-login", headers=H(second)).get_json()["at"] is not None


def test_deactivating_an_officer_ends_their_session_immediately(client, installed, desk_token):
    assert client.get("/api/desk/registrations", headers=H(desk_token)).status_code == 200
    oid = client.get("/api/admin/officers", headers=H(installed)).get_json()[0]["id"]
    assert client.patch(f"/api/admin/officers/{oid}", headers=H(installed), json={"is_active": False}).status_code == 200
    r = client.get("/api/desk/registrations", headers=H(desk_token))          # the token they already hold
    assert r.status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"}).status_code == 403
    client.patch(f"/api/admin/officers/{oid}", headers=H(installed), json={"is_active": True})
    assert client.post("/api/auth/login", json={"identifier": "desk1", "password": "Desk@12345"}).status_code == 200
    client.delete(f"/api/admin/officers/{oid}", headers=H(installed))
    assert client.get("/api/desk/registrations", headers=H(desk_token)).status_code == 401   # removed accounts too


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
    assert client.post("/api/admin/booth-tokens", headers=H(installed)).status_code == 409        # officer has no two-step verification yet
    token = create_booth_token(client, installed).get_json()["token"]
    desk = User.query.filter_by(student_id="desk1").first()
    desk.otp_enabled, desk.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    wrong = client.post("/api/booth/activate", json={"create_token": token, "code": pyotp.TOTP(desk.otp_secret).now()})
    assert wrong.status_code == 403                                                              # only the creating officer's code works


def test_votes_are_only_possible_through_an_authorized_booth(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for st in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": st})
    slip = register(client, desk_token).get_json()["slip_id"]
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]
    login = lambda hdr: client.post("/api/auth/voter-pin-login", headers=hdr, json={"student_id": slip, "voting_pin": pin})
    assert login({}).status_code == 403                                                   # not from a booth
    assert login({"X-Kiosk-Token": "booth-standalone-token"}).status_code == 403          # no built-in tokens
    assert login({"X-Kiosk-Token": "booth_" + "x" * 40}).status_code == 403
    vt = login({"X-Kiosk-Token": booth}).get_json()["access_token"]
    ballot = client.get(f"/api/voter/elections/{eid}/ballot", headers=HB(vt, booth)).get_json()
    sel = [{"position": p["position"], "candidate_id": p["candidates"][0]["id"], "is_nota": False} for p in ballot["positions"]]
    cast = lambda hdr: client.post(f"/api/voter/elections/{eid}/cast-ballot", headers=hdr, json={"selections": sel})
    assert cast(H(vt)).status_code == 403                                                 # a browser outside any booth
    other = set_up_booth(client, installed).get_json()["booth_token"]
    assert cast(HB(vt, other)).status_code == 403                                         # session began at a different booth
    assert cast(HB(vt, booth)).status_code == 200
    # the audit log says where the ballot was cast: booth id and session, never the token itself
    from app.models.audit_log import AuditLog
    entry = AuditLog.query.filter_by(action="VOTE_CAST").one()
    assert "at booth BOOTH-01 (session " in entry.details and booth not in entry.details
    assert "at booth BOOTH-01" in AuditLog.query.filter_by(action="PIN_LOGIN_SUCCESS").one().details


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


def test_booth_does_not_accept_votes_when_voting_is_not_open(client, installed, desk_token, booth):
    eid = _open_election(client, installed)
    for pos in ("President", "Secretary"):
        cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed), json={"name": f"C {pos}", "position": pos, "department": DEPT})
    for st in ("registration", "ready", "voting_active"):
        client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": st})
    assert client.get("/api/booth/status", headers={"X-Kiosk-Token": booth}).get_json()["voting_open"] is True
    slip = register(client, desk_token).get_json()["slip_id"]
    pin = client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).get_json()["pin"]  # handed out, not yet used

    client.post(f"/api/admin/elections/{eid}/status", headers=H(installed), json={"status": "voting_closed"})
    st = client.get("/api/booth/status", headers={"X-Kiosk-Token": booth}).get_json()
    assert st["voting_open"] is False and st["voting_ended"] is True
    # The desk is closed too: no new students, no new PINs, and an unused PIN no longer works.
    assert client.get("/api/desk/state", headers=H(desk_token)).get_json()["open"] is False
    r = register(client, desk_token)
    assert r.status_code == 409 and r.get_json()["code"] == "voting_ended"
    assert client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip}).status_code == 409
    r = client.post("/api/auth/voter-pin-login", headers={"X-Kiosk-Token": booth}, json={"student_id": slip, "voting_pin": pin})
    assert r.status_code in (400, 401, 404)


def test_two_step_verification_cannot_be_turned_off_by_an_election_officer(client, installed):
    import pyotp
    u = User.query.filter_by(role="admin").first()
    u.otp_enabled, u.otp_secret = True, pyotp.random_base32()
    _db.session.commit()
    r = client.post("/api/auth/totp/disable", headers=H(installed), json={"password": "Strong@1234"})
    assert r.status_code == 403


def test_booth_status_gives_the_slip_prefix_so_only_the_digits_are_typed(client, installed, desk_token, booth):
    st = client.get("/api/booth/status", headers={"X-Kiosk-Token": booth}).get_json()
    assert st["slip_prefix"] == "SUE30-E1-"
    slip = register(client, desk_token).get_json()["slip_id"]
    assert slip == st["slip_prefix"] + slip[len(st["slip_prefix"]):] and slip[len(st["slip_prefix"]):].isdigit() and len(slip) == len(st["slip_prefix"]) + 6


def test_old_slip_ids_are_renamed_by_the_migration(client, installed, desk_token):
    from app.migrations import _m010_short_year_slip_format
    from app.models.election import Election
    from app.models.voter_record import VoterRecord
    new = register(client, desk_token).get_json()["slip_id"]
    voter = User.query.filter_by(student_id=new).one()
    old = "SUE2030-E1-123456"                    # the previous format, four-digit year
    voter.student_id = old
    VoterRecord.query.filter_by(voter_hash=User.hash_student_id(new)).update({"voter_hash": User.hash_student_id(old)})
    _db.session.get(Election, 1).slip_prefix = "SUE2030-E1-"
    _db.session.commit()
    _m010_short_year_slip_format()
    _db.session.commit()
    assert _db.session.get(Election, 1).slip_prefix == "SUE30-E1-"
    assert voter.student_id == "SUE30-E1-123456"
    assert VoterRecord.query.filter_by(voter_hash=User.hash_student_id("SUE30-E1-123456")).count() == 1   # still eligible


def test_slip_letters_come_from_the_wizard_and_default_to_sue(client, db):
    p = wizard_payload()
    p["system"]["slip_code"] = "x"
    assert "slip_code" in client.post("/api/setup/complete", json=p).get_json()["errors"]["system"]
    p["system"]["slip_code"] = "pdu"
    tok = client.post("/api/setup/complete", json=p).get_json()["access_token"]
    from app.models.election import Election
    assert _db.session.get(Election, 1).slip_prefix == "PDU30-E1-"
    assert client.put("/api/admin/settings", headers=H(tok), json={"slip_code": "abc"}).get_json()["slip_code"] == "ABC"


def test_audit_log_groups_and_new_events(client, installed, desk_token, booth):
    from app.models.audit_log import AuditLog
    slip = register(client, desk_token).get_json()["slip_id"]
    client.get(f"/api/desk/registrations/{slip}", headers=H(desk_token))                       # background refresh: not logged
    client.get(f"/api/desk/registrations/{slip}?checkin=1", headers=H(desk_token))             # the Verify button: logged
    client.post("/api/admin/desk/issue-pin", headers=H(desk_token), json={"student_id": slip})
    eid = client.get("/api/admin/elections", headers=H(installed)).get_json()[0]["id"]
    cid = cpost(client, f"/api/admin/elections/{eid}/candidates", headers=H(installed),
                json={"name": "Ann", "position": "President", "department": DEPT}).get_json()["id"]
    client.delete(f"/api/admin/elections/{eid}/candidates/{cid}", headers=H(installed))
    client.put(f"/api/admin/elections/{eid}", headers=H(installed), json={"title": "Renamed"})
    assert AuditLog.query.filter_by(action="DESK_CHECKIN").count() == 1
    logs = lambda cat: client.get("/api/admin/audit-logs", headers=H(installed), query_string={"category": cat}).get_json()
    desk = logs("desk")
    assert {l["action"] for l in desk["logs"]} >= {"STUDENT_REGISTERED", "DESK_CHECKIN", "PIN_ISSUED"}
    assert logs("enroll")["total"] == desk["total"]                                              # older filter id still works
    assert {l["action"] for l in logs("election")["logs"]} >= {"CANDIDATE_ADDED", "CANDIDATE_REMOVED", "ELECTION_UPDATED"}
    assert any(l["action"] == "BOOTH_ACTIVATED" for l in logs("booth")["logs"])
    data = logs("all")
    assert [c["id"] for c in data["categories"]][:3] == ["ballot", "pin", "desk"]
    assert data["stats"]["desk_enrollments"] >= 2 and data["stats"]["kiosk_actions"] >= 1
    row = next(l for l in data["logs"] if l["action"] == "DESK_CHECKIN")
    assert row["category"] == "desk" and row["action_label"] == "Desk checkin" and "no PIN yet" in row["details"]
