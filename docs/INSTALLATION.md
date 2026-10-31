# Installing the election portal (self-hosted)

This guide installs the portal on any server with Docker. It does not depend on any particular hosting account: you bring a machine (or VM) and, optionally, your own PostgreSQL database.

## Requirements

- Docker Engine 24+ with the Compose plugin (Docker Desktop on Windows/macOS also works)
- A DNS name and HTTPS in front of the portal for real elections (see [Reverse proxy](#reverse-proxy-with-https))
- About 1 GB RAM and 2 GB disk

## 1. Get the code and configure

```bash
git clone <your-fork-or-copy-of-this-repository> evoting
cd evoting
cp .env.example .env
```

Edit `.env` and set at least:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password (letters and digits only) |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Two different long random values: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `WEB_PORT` | Port the portal is published on (default 80) |
| `CORS_ORIGINS` | Only needed if the frontend is served from a different origin than the API |
| `SETUP_TOKEN` | Optional. If set, the person running first-time setup must enter it |

The backend refuses to start in production while `SECRET_KEY` or `JWT_SECRET_KEY` still have their development defaults.

## 2. Start

```bash
docker compose up -d --build
docker compose ps
```

The database schema is created and upgraded automatically on every start. To run the upgrade step by hand: `docker compose exec backend python manage.py migrate`.

## 3. Run the installation wizard

Open `http://<server>:<WEB_PORT>/`. While the portal is not installed you are taken to the wizard:

1. **Welcome**
2. **System** – institution name, portal name, logo, timezone, default language
3. **Officer account** – the first Election Officer (name, email, username, password)
4. **Election** – title, description, the scheduled date and hours (shown for information only), positions, and (optionally) programmes
5. **Review and install** – you are signed in and taken to the Election Officer dashboard

The wizard is available only until the first install completes. The "installed" flag lives in the database, so a second request cannot create another initial officer. If you set `SETUP_TOKEN`, complete setup immediately after deployment anyway, because it is the only protection before that point.

### The setup token

The wizard is protected by a setup token. Set `SETUP_TOKEN` in `.env` to choose it. If you leave it empty, the server makes a random one every time it starts without an installation, and prints it in the log:

```bash
docker compose logs backend | grep "SETUP TOKEN"
```

Enter it on the wizard's first step. After a reset (Backup and reset) the wizard asks for it again.

## 4. After installing

1. **Programmes** – add the programmes/classes students belong to (Programmes page).
2. **Positions and candidates** – Elections → Candidates.
3. **Desk Officers** – create an account for each person staffing a registration desk.
4. Move the election through its stages on the Elections page: Registration → Ready → Voting active → Voting closed → Results published → Archived.

## Health check

`GET /api/health` returns `{"status":"healthy"}` (HTTP 200) when the API and database are reachable, and HTTP 503 otherwise. The backend container uses it for its Docker health check. Use it for load balancer or uptime checks.

## Using your own PostgreSQL

Remove the `db` service from `docker-compose.yml` and set the backend's `DATABASE_URL` (for example `postgresql://user:pass@db.example.org:5432/evoting`) in `.env`/the compose file. The role needs permission to create tables.

## Reverse proxy with HTTPS

The `frontend` container serves the web app and proxies `/api/` to the backend. Terminate TLS in front of it. With Caddy (automatic certificates):

```
vote.example.edu {
    reverse_proxy localhost:8080
}
```

Set `WEB_PORT=8080` in `.env`. With nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name vote.example.edu;
    ssl_certificate     /etc/letsencrypt/live/vote.example.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vote.example.edu/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Voting booths

Booths use one address: `https://<portal>/kiosk/vote` (`/kiosk` and `/vote` redirect to it). Booth lock-down scripts are in `kiosk/ubuntu/`; the browser policy there lets the locked-down browser open only `/kiosk/vote…`, so nothing else can be typed in.

To set a booth up: in the officer panel open **Voting booths** and press **Generate booth token** (valid once, 15 minutes). On the booth computer enter that token and the Election Officer's current authenticator code at `/kiosk/vote`. The booth gets an automatic ID for the election (BOOTH-01, BOOTH-02, …) and takes votes only while the election is "Voting active". Deleting a booth in the panel signs it out within seconds.

## Persistent data

PostgreSQL data lives in the `db_data` Docker volume and application logs in `backend_logs`. See [OPERATIONS.md](OPERATIONS.md) for backups, restores and upgrades.

## Using the prebuilt images (no build)

Every push to `main` publishes the backend and frontend images to GitHub Container Registry (`ghcr.io/s0n4jit/e-voting-backend` and `…-frontend`, tags `latest`, the commit, and release versions such as `1.0.0`). To run them instead of building:

```bash
docker compose -f docker-compose.ghcr.yml up -d
docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d   # update
```

Set `IMAGE_TAG=1.0.0` in `.env` to pin a release. Images are published for `amd64` and `arm64` (including Raspberry Pi).
