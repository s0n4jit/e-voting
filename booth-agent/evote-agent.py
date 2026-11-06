#!/usr/bin/env python3
"""Campus E-Voting booth agent: prints the vote copy silently and keeps a copy of every receipt on this machine's disk.

Listens on 127.0.0.1 only. The booth page (the configured portal address, nothing else) posts the receipt here
after a vote is recorded; the agent writes it to the receipt folder first and then sends it to CUPS (`lp`).
Setup endpoints (network, printer, portal address) work only while setup mode is on (`evote setup`, or first boot).
Python 3 standard library only.
"""
import json
import os
import re
import shlex
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from shutil import which
from urllib.parse import urlparse

CONF = os.environ.get("EVOTE_CONF", "/etc/evote/booth.conf")
PORT = int(os.environ.get("EVOTE_AGENT_PORT", "9631"))
LP = os.environ.get("EVOTE_LP", "lp")
WIDTH = 42  # characters per line: fits 58 mm thermal paper and looks normal on A4
LOCK = threading.Lock()
SETUP_UNTIL = 0.0  # setup mode switch (monotonic seconds); the flag file in the config starts it at boot
KEYS = ("VOTING_URL", "PRINTER", "COPIES", "PRINT_ENABLED", "RECEIPT_DIR", "RECEIPT_OWNER")


def read_conf(path=None):
    conf = {"VOTING_URL": "", "PRINTER": "", "COPIES": "1", "PRINT_ENABLED": "1",
            "RECEIPT_DIR": os.environ.get("EVOTE_RECEIPTS", "/var/lib/evote/receipts"), "RECEIPT_OWNER": "",
            "SETUP_FLAG": os.environ.get("EVOTE_SETUP_FLAG", "/etc/evote/setup-pending")}
    try:
        with open(path or CONF, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^\s*([A-Z_]+)=(.*?)\s*$", line)
                if m:
                    conf[m.group(1)] = m.group(2).strip("\"'")
    except OSError:
        pass
    return conf


def write_conf(updates, path=None):
    path = path or CONF
    conf = read_conf(path)
    conf.update({k: str(v) for k, v in updates.items()})
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for k in KEYS:
            f.write(f'{k}="{conf[k]}"\n')
    os.replace(tmp, path)


def origin_of(url):
    u = urlparse(url)
    return f"{u.scheme}://{u.netloc}" if u.scheme and u.netloc else ""


def allowed_origins(conf):
    return {origin_of(conf["VOTING_URL"]), f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"} - {""}


def clean(text, limit=80):
    """Receipt text is plain single-line text: no control characters, bounded length."""
    return re.sub(r"[\x00-\x1f\x7f]", " ", str(text or ""))[:limit].strip()


def render(r):
    """The vote copy as plain text (works on every printer CUPS can drive, thermal or A4)."""
    bar = "-" * WIDTH
    is_mock = bool(r.get("is_mock"))
    header_title = clean(r.get("election"), WIDTH) + (" - PRACTICE VOTE (MOCK)" if is_mock else " - VOTE COPY")
    out = [clean(r.get("institution"), WIDTH), header_title]
    if is_mock:
        out.append("*** MOCK ELECTION - NOT AN OFFICIAL VOTE ***")
    ref = clean(r.get("receipt_ref") or r.get("slip") or r.get("slip_id"), 40)
    out += [bar, "Ballot Ref: " + ref, bar]
    for line in (r.get("lines") or [])[:40]:
        out.append(f"{clean(line.get('position'), 28)}\n    {clean(line.get('choice'), 40)}")
    out += [bar, f"Booth {clean(r.get('booth'), 20)}  {clean(r.get('time'), 30)}"]
    if is_mock:
        out += ["*** PRACTICE ONLY - DO NOT COUNT ***", "Drop this slip into the practice box."]
    else:
        out += ["Check your choices, then drop this", "slip into the box at the booth."]
    return "\n".join(out) + "\n"


def give_to_owner(paths, conf):
    """Receipts belong to the administrator named in RECEIPT_OWNER (their private folder), not to the kiosk user."""
    owner = conf.get("RECEIPT_OWNER")
    if not owner or not hasattr(os, "chown"):
        return
    try:
        import pwd
        info = pwd.getpwnam(owner)
        for p in paths:
            os.chown(p, info.pw_uid, info.pw_gid)
    except (KeyError, OSError):
        pass  # unknown user or not root: the files stay private to whoever runs the agent


def archive(r, text, conf):
    """Write the receipt to disk before printing: one text file per vote and a JSON line for later retrieval."""
    now = datetime.now()
    is_mock = bool(r.get("is_mock"))
    base_dir = os.path.join(os.path.dirname(conf["RECEIPT_DIR"]), "mockelection") if is_mock else conf["RECEIPT_DIR"]
    os.makedirs(base_dir, mode=0o700, exist_ok=True)
    folder = os.path.join(base_dir, now.strftime("%Y-%m-%d"))
    os.makedirs(folder, mode=0o700, exist_ok=True)
    ref = clean(r.get("receipt_ref") or r.get("slip") or r.get("slip_id"), 40)
    slip = re.sub(r"[^A-Za-z0-9_-]", "_", ref) or "unknown"
    base = f"{now.strftime('%H%M%S')}-{slip}"
    path = os.path.join(folder, base + ".txt")
    n = 1
    while os.path.exists(path):  # a second copy for the same voter (reprint) never overwrites the first
        n += 1
        path = os.path.join(folder, f"{base}-{n}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    record = {"saved_at": now.isoformat(timespec="seconds"), "file": path, "is_mock": is_mock,
              "receipt_ref": ref, "slip_id": ref, **{k: r.get(k) for k in ("election", "booth", "time", "lines")}}
    log_name = "mock-receipts.jsonl" if is_mock else "receipts.jsonl"
    with open(os.path.join(base_dir, log_name), "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
    give_to_owner([base_dir, folder, path, os.path.join(base_dir, log_name)], conf)
    return path


def send_to_printer(text, printer, copies):
    cmd = shlex.split(LP) + ["-n", str(copies)]
    if printer:
        cmd += ["-d", printer]
    p = subprocess.run(cmd, input=text.encode("utf-8"), capture_output=True, timeout=30)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).decode("utf-8", "replace").strip() or "the print command failed")


def run(cmd, timeout=20):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).strip()


def printers():
    if not which("lpstat"):
        return []
    code, out = run(["lpstat", "-e"])
    return [x for x in out.splitlines() if x] if code == 0 else []


def setup_on(conf):
    return time.monotonic() < SETUP_UNTIL or os.path.exists(conf["SETUP_FLAG"])


class Handler(BaseHTTPRequestHandler):
    server_version = "evote-agent"

    def log_message(self, fmt, *args):  # journal-friendly
        sys.stderr.write("agent: " + fmt % args + "\n")

    def _send(self, code, body, ctype="application/json", conf=None):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if conf and origin in allowed_origins(conf):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        conf = read_conf()
        self.send_response(204)
        origin = self.headers.get("Origin", "")
        if origin in allowed_origins(conf):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Evote-Booth")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 64_000:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        conf = read_conf()
        path = urlparse(self.path).path
        if path == "/health":
            return self._send(200, {"ok": True, "printers": printers(), "printer": conf["PRINTER"], "setup": setup_on(conf)}, conf=conf)
        if path == "/setup":
            if not setup_on(conf):
                return self._send(403, "Setup mode is off. Run: sudo evote setup", "text/plain")
            here = os.path.dirname(os.path.abspath(__file__))
            for cand in (os.path.join(here, "setup.html"),):
                if os.path.exists(cand):
                    with open(cand, "rb") as f:
                        return self._send(200, f.read(), "text/html")
            return self._send(404, "setup page missing", "text/plain")
        if path == "/api/config" and setup_on(conf):
            return self._send(200, {**{k: conf[k] for k in KEYS[:4]}, "printers": printers()}, conf=conf)
        if path == "/api/wifi" and setup_on(conf):
            code, out = run(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list"], 30)
            nets = [dict(zip(("ssid", "signal", "security"), re.split(r"(?<!\\):", ln, maxsplit=2)))
                    for ln in out.splitlines() if ln and code == 0]
            return self._send(200, {"networks": nets}, conf=conf)
        if path == "/api/printers/detect" and setup_on(conf):
            code, out = run(["lpinfo", "-v"], 40) if which("lpinfo") else (1, "")
            found = [ln.split(None, 1)[1] for ln in out.splitlines() if ln.startswith("direct ") and "://" in ln] if code == 0 else []
            return self._send(200, {"devices": found}, conf=conf)
        self._send(404, {"error": "not found"}, conf=conf)

    def do_POST(self):
        global SETUP_UNTIL
        conf = read_conf()
        path = urlparse(self.path).path
        if self.headers.get("Origin", "") not in allowed_origins(conf) or self.headers.get("X-Evote-Booth") != "1":
            return self._send(403, {"error": "origin not allowed"}, conf=conf)
        try:
            body = self._body()
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "bad request"}, conf=conf)
        if path == "/print":
            with LOCK:
                text = render(body)
                try:
                    saved = archive(body, text, conf)
                except OSError as e:
                    return self._send(500, {"archived": False, "printed": False, "error": f"could not save the copy: {e}"}, conf=conf)
                if conf["PRINT_ENABLED"] == "0":
                    return self._send(200, {"archived": True, "printed": False, "error": "printing is switched off"}, conf=conf)
                printer = clean(body.get("printer"), 100) or conf["PRINTER"]
                try:
                    copies = min(max(int(body.get("copies") or conf["COPIES"]), 1), 3)
                    send_to_printer(text, printer, copies)
                except Exception as e:  # the saved copy exists; the booth tells the voter to ask the desk
                    return self._send(200, {"archived": True, "printed": False, "error": str(e)}, conf=conf)
            return self._send(200, {"archived": True, "printed": True, "file": os.path.basename(saved)}, conf=conf)
        if not setup_on(conf):
            return self._send(403, {"error": "setup mode is off"}, conf=conf)
        if path == "/api/config":
            upd = {}
            url = clean(body.get("VOTING_URL"), 200)
            if url:
                if not re.match(r"^https?://[^/\s]+/kiosk/vote$", url):
                    return self._send(400, {"error": "The address must look like https://your-site.example/kiosk/vote"}, conf=conf)
                upd["VOTING_URL"] = url
            if "PRINTER" in body:
                p = clean(body["PRINTER"], 100)
                if not re.match(r"^[A-Za-z0-9_. -]*$", p):
                    return self._send(400, {"error": "Invalid printer name"}, conf=conf)
                upd["PRINTER"] = p
            if "PRINT_ENABLED" in body:
                upd["PRINT_ENABLED"] = "0" if str(body["PRINT_ENABLED"]).lower() in ("0", "false") else "1"
            write_conf(upd)
            return self._send(200, {"ok": True}, conf=conf)
        if path == "/api/wifi":
            ssid, pw = clean(body.get("ssid"), 64), str(body.get("password") or "")[:128]
            code, out = run(["nmcli", "dev", "wifi", "connect", ssid] + (["password", pw] if pw else []), 60)
            return self._send(200 if code == 0 else 400, {"ok": code == 0, "message": out}, conf=conf)
        if path == "/api/printer/test":
            try:
                send_to_printer("TEST PAGE\nCampus E-Voting booth printer\n" + datetime.now().isoformat(timespec="seconds") + "\n",
                                clean(body.get("printer"), 100) or conf["PRINTER"], 1)
                return self._send(200, {"ok": True}, conf=conf)
            except Exception as e:
                return self._send(400, {"ok": False, "message": str(e)}, conf=conf)
        if path == "/api/printer/add":
            uri, name = clean(body.get("uri"), 300), clean(body.get("name") or "EVote-Printer", 60)
            if not re.match(r"^[a-z0-9+.-]+://\S+$", uri) or not re.match(r"^[A-Za-z0-9_-]+$", name):
                return self._send(400, {"ok": False, "message": "Invalid printer address or name"}, conf=conf)
            code, out = run(["lpadmin", "-p", name, "-E", "-v", uri, "-m", "everywhere"], 90)
            if code != 0:  # no driverless support: fall back to the raw text queue so receipts still print
                code, out = run(["lpadmin", "-p", name, "-E", "-v", uri, "-m", "raw"], 60)
            if code == 0:
                run(["lpadmin", "-d", name])
                write_conf({"PRINTER": name})
            return self._send(200 if code == 0 else 400, {"ok": code == 0, "message": out}, conf=conf)
        if path == "/api/finish":
            try:
                os.remove(conf["SETUP_FLAG"])
            except OSError:
                pass
            SETUP_UNTIL = 0.0
            return self._send(200, {"ok": True}, conf=conf)
        self._send(404, {"error": "not found"}, conf=conf)


def main():
    global SETUP_UNTIL
    if "--setup-minutes" in sys.argv:  # `evote setup` and the tests start setup mode this way
        SETUP_UNTIL = time.monotonic() + 60 * int(sys.argv[sys.argv.index("--setup-minutes") + 1])
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"evote-agent listening on 127.0.0.1:{PORT}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
