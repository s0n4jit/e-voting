"""Self-ping: keeps the service and its database awake on free hosting tiers.

Free web services sleep after ~15 minutes without requests and free Supabase projects pause after a week
without activity, so every cycle pings our own /healthz and also runs a query on the database directly.
"""

import logging
import os
import threading
import time
from urllib import error, request

log = logging.getLogger(__name__)

INTERVAL_SECONDS = 4 * 60


def _ping_url(url: str) -> None:
    log.info("Pinging self at %s", url)
    try:
        with request.urlopen(url, timeout=15) as resp:
            if resp.status != 200:
                log.warning("Self-ping returned non-200 status: %s", resp.status)
    except (error.URLError, OSError) as exc:
        log.warning("Self-ping failed: %s", exc)


def _ping_db(app) -> None:
    from app.extensions import db

    try:
        with app.app_context():
            db.session.execute(db.text("SELECT 1"))
            db.session.remove()
        log.info("Database ping ok")
    except Exception as exc:  # keep the loop alive whatever the driver raises
        log.warning("Database ping failed: %s", exc)


def _loop(app, url: str) -> None:
    while True:
        time.sleep(INTERVAL_SECONDS)
        _ping_url(url)
        _ping_db(app)


def start_self_ping(app) -> None:
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    if not app_url:
        log.info("APP_URL not set, self-pinging disabled.")
        return
    threading.Thread(target=_loop, args=(app, app_url + "/healthz"), daemon=True, name="self-ping").start()
