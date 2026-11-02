"""The booth agent: receipts are saved to disk first, then printed; foreign origins and setup calls are refused."""
import importlib.util
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
URL = "https://vote.example.edu/kiosk/vote"
ORIGIN = "https://vote.example.edu"
RECEIPT = {"institution": "Test College", "election": "Union 2026", "slip_id": "SUE26-E1-123456", "booth": "BOOTH-01",
           "time": "11/2/2026", "lines": [{"position": "President", "choice": "Anita Das"}, {"position": "Secretary", "choice": "NOTA"}]}


@pytest.fixture()
def agent(tmp_path, monkeypatch):
    conf = tmp_path / "booth.conf"
    conf.write_text(f'VOTING_URL="{URL}"\nPRINTER="HP-1"\nCOPIES="1"\nPRINT_ENABLED="1"\n')
    monkeypatch.setenv("EVOTE_CONF", str(conf))
    monkeypatch.setenv("EVOTE_RECEIPTS", str(tmp_path / "receipts"))
    monkeypatch.setenv("EVOTE_SETUP_FLAG", str(tmp_path / "no-flag"))
    spec = importlib.util.spec_from_file_location("evote_agent", ROOT / "booth-agent" / "evote-agent.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    printed = tmp_path / "printed.txt"
    fake = tmp_path / "fake_lp.py"
    fake.write_text(
        "import sys\n"
        f"open({str(printed)!r}, 'ab').write(sys.stdin.buffer.read() + b'|' + ' '.join(sys.argv[1:]).encode() + b'\\n')\n"
    )
    mod.LP = f"{Path(sys.executable).as_posix()} {fake.as_posix()}"
    srv = ThreadingHTTPServer(("127.0.0.1", 0), mod.Handler)
    mod.PORT = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield mod, f"http://127.0.0.1:{mod.PORT}", tmp_path, printed
    srv.shutdown()


def post(base, path, data, origin=ORIGIN, header=True):
    req = urllib.request.Request(base + path, json.dumps(data).encode(), {"Content-Type": "application/json", "Origin": origin, **({"X-Evote-Booth": "1"} if header else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def test_receipt_is_saved_then_printed(agent):
    mod, base, tmp, printed = agent
    status, body = post(base, "/print", RECEIPT)
    assert status == 200 and body["archived"] and body["printed"], body
    files = list((tmp / "receipts").rglob("*.txt"))
    assert len(files) == 1 and "Anita Das" in files[0].read_text() and "SUE26-E1-123456" in files[0].read_text()
    lines = (tmp / "receipts" / "receipts.jsonl").read_text().splitlines()
    assert json.loads(lines[0])["slip_id"] == "SUE26-E1-123456"
    out = printed.read_text()
    assert "Anita Das" in out and "-d HP-1" in out


def test_a_second_copy_never_overwrites_the_first(agent):
    _, base, tmp, _ = agent
    post(base, "/print", RECEIPT)
    post(base, "/print", RECEIPT)
    assert len(list((tmp / "receipts").rglob("*.txt"))) == 2


def test_printer_failure_still_keeps_the_copy(agent):
    mod, base, tmp, _ = agent
    mod.LP = "definitely-not-a-printer-command"
    status, body = post(base, "/print", RECEIPT)
    assert status == 200 and body["archived"] is True and body["printed"] is False and body["error"]
    assert len(list((tmp / "receipts").rglob("*.txt"))) == 1


def test_other_origins_and_missing_header_are_refused(agent):
    _, base, tmp, _ = agent
    assert post(base, "/print", RECEIPT, origin="https://evil.example")[0] == 403
    assert post(base, "/print", RECEIPT, header=False)[0] == 403
    assert not (tmp / "receipts").exists()


def test_setup_calls_need_setup_mode(agent):
    mod, base, tmp, _ = agent
    assert post(base, "/api/config", {"PRINTER": "X"})[0] == 403
    (tmp / "no-flag").write_text("1")
    assert post(base, "/api/config", {"VOTING_URL": "javascript:alert(1)"})[0] == 400
    assert post(base, "/api/config", {"PRINTER": "Lab-Printer", "VOTING_URL": "https://new.example.edu/kiosk/vote"})[0] == 200
    assert 'PRINTER="Lab-Printer"' in Path(mod.CONF).read_text()
    assert post(base, "/api/finish", {}, origin="https://new.example.edu")[0] == 200 and not (tmp / "no-flag").exists()


def test_cli_lists_checks_and_exports_receipts(agent, tmp_path, monkeypatch):
    import subprocess
    mod, base, tmp, _ = agent
    post(base, "/print", RECEIPT)
    env = {**__import__("os").environ, "EVOTE_NO_SUDO": "1", "EVOTE_CONF": mod.CONF, "EVOTE_RECEIPTS": str(tmp / "receipts")}
    run = lambda *a: subprocess.run([sys.executable, str(ROOT / "booth-agent" / "evote"), *a], env=env, capture_output=True, text=True)
    assert run("receipts", "count").stdout.strip() == "1"
    assert "Anita Das" in run("receipts", "show", "SUE26-E1-123456").stdout
    assert run("receipts", "check").returncode == 0
    out = tmp_path / "usb"
    out.mkdir()
    assert run("receipts", "export", str(out)).returncode == 0 and list((out / "evote-receipts").rglob("*.txt"))
    next((tmp / "receipts").rglob("*.txt")).unlink()
    assert run("receipts", "check").returncode == 1                                   # a lost file is reported
    assert run("url", "set", "http://bad").returncode != 0


def test_cli_autologin_toggle(tmp_path):
    import os
    import subprocess
    gdm = tmp_path / "custom.conf"
    gdm.write_text("[daemon]\nWaylandEnable=true\nAutomaticLoginEnable=True\nAutomaticLogin=evote\n")
    env = {**os.environ, "EVOTE_NO_SUDO": "1", "EVOTE_GDM": str(gdm)}
    run = lambda *a: subprocess.run([sys.executable, str(ROOT / "booth-agent" / "evote"), *a], env=env, capture_output=True, text=True)
    assert run("autologin", "off").returncode == 0 and "AutomaticLogin" not in gdm.read_text() and "WaylandEnable=true" in gdm.read_text()
    assert run("autologin", "on").returncode == 0 and "AutomaticLogin=evote" in gdm.read_text()
    assert run("autologin", "maybe").returncode != 0


def test_unknown_receipt_owner_does_not_break_saving(agent):
    mod, base, tmp, _ = agent
    mod.write_conf({"RECEIPT_OWNER": "no-such-admin"})
    assert 'RECEIPT_OWNER="no-such-admin"' in Path(mod.CONF).read_text()
    status, body = post(base, "/print", RECEIPT)
    assert status == 200 and body["archived"] and body["printed"]
