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
