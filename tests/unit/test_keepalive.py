from app import keepalive


def test_healthz_is_available_and_not_limited(client):
    for _ in range(3):
        assert client.get("/healthz").status_code == 200
    assert client.get("/api/health").get_json()["status"] == "healthy"


def test_self_ping_disabled_without_app_url(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    started = []
    monkeypatch.setattr(keepalive.threading, "Thread", lambda *a, **k: started.append(1))
    keepalive.start_self_ping(None)
    assert not started


def test_self_ping_targets_healthz(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://vote.example.com/")
    seen = {}

    class FakeThread:
        def __init__(self, target, args, **kw):
            seen["args"] = args

        def start(self):
            seen["started"] = True

    monkeypatch.setattr(keepalive.threading, "Thread", FakeThread)
    keepalive.start_self_ping(None)
    assert seen == {"args": (None, "https://vote.example.com/healthz"), "started": True}


def test_db_ping_runs_a_query(app):
    keepalive._ping_db(app)  # must not raise


def test_only_allowed_hosts_and_no_browser_navigation(app, client):
    app.config["ALLOWED_HOSTS"] = ["api.example.edu"]
    assert client.get("/api/setup/status", headers={"Host": "x.onrender.com"}).status_code == 404
    assert client.get("/healthz", headers={"Host": "x.onrender.com"}).status_code == 200   # health checks always work
    assert client.get("/api/setup/status", headers={"Host": "api.example.edu"}).status_code == 200
    assert client.get("/api/setup/status", headers={"Host": "api.example.edu", "Sec-Fetch-Mode": "navigate"}).status_code == 404
    assert client.get("/api/photos/1", headers={"Host": "api.example.edu", "Sec-Fetch-Mode": "navigate"}).status_code == 200
    assert client.get("/api/setup/status", headers={"Host": "api.example.edu", "Sec-Fetch-Mode": "cors"}).status_code == 200
    app.config["ALLOWED_HOSTS"] = []


def test_setup_token_is_generated_in_production_when_missing(monkeypatch, db):
    import os
    from app.routes.setup import ensure_setup_token

    class FakeApp:
        config = {}

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("SETUP_TOKEN", "")
    ensure_setup_token(FakeApp)
    assert len(os.environ["SETUP_TOKEN"]) >= 20
    keep = os.environ["SETUP_TOKEN"]
    ensure_setup_token(FakeApp)                     # an existing token is never replaced
    assert os.environ["SETUP_TOKEN"] == keep
    monkeypatch.setenv("SETUP_TOKEN", "")
    FakeApp.config = {"TESTING": True}
    ensure_setup_token(FakeApp)                     # tests and development stay open
    assert os.environ["SETUP_TOKEN"] == ""
