<p align="center">
  <img src="docs/assets/logo.svg" width="96" alt="Campus E-Voting logo">
</p>

<h1 align="center">Campus E-Voting</h1>

<p align="center">
  A secure, self-hostable election platform for colleges and universities:
  desk registration, locked-down voting booths, a secret ballot and a projector-ready results reveal.
</p>

---

## What it is

Campus E-Voting runs a complete student-union election on campus hardware:

1. An **Election Officer** installs the portal with a first-run wizard, configures the election, positions, programmes and candidates, and controls the election lifecycle.
2. **Desk Officers** register students. Each student gets an automatically generated **Voter Slip ID** (for example `SUE26-E1-483920`) and, when they come to vote, a single-use **voting PIN**.
3. Students vote on **locked-down Ubuntu booths** that can only open one page. Votes are accepted only from booths approved by the Election Officer.
4. Results stay hidden for everyone until the Election Officer publishes them, can be revealed one position at a time on a projector, and can optionally be shared through a public link.

| Role | Does |
|---|---|
| Election Officer | Installs, configures, runs and closes the election, approves booths, publishes results |
| Desk Officer | Registers students, checks voters in, issues PINs |
| Voter | Enters slip ID and PIN at a booth, chooses candidates, reviews and submits |

## Highlights

- **First-run installation wizard** (like CTFd): institution, logo (also used as the favicon), first officer, mandatory two-step verification, first election.
- **Secret ballot**: who voted and what was chosen live in separate tables with no link between them. Duplicate votes are blocked in a locked database transaction.
- **Booth security**: booth set-up needs a one-time token from the officer panel *and* the officer's authenticator code. Booth tokens are stored hashed, can be revoked instantly, and a booth serves only its own election.
- **Election lifecycle enforced by the server**: Setup → Registration → Ready → Voting active → Voting closed → Results published → Archived. One election at a time.
- **Results kept secret** until published; projector reveal with confetti; public link created and deleted by the officer.
- **Audit log** of every important action, including the booth and session of each ballot.
- Light and dark themes, responsive, keyboard accessible, `prefers-reduced-motion` respected.
- Runs with **Docker Compose** on your own server and your own PostgreSQL. No dependency on any hosting account.

## Quick start (self-hosting)

```bash
git clone https://github.com/s0n4jit/e-voting.git
cd e-voting
cp .env.example .env        # set POSTGRES_PASSWORD, SECRET_KEY, JWT_SECRET_KEY
docker compose up -d --build
```

Open `http://localhost/` and complete the installation wizard. See the [installation guide](docs/INSTALLATION.md) for HTTPS, reverse proxies and your own PostgreSQL, and the [deployment guide](docs/DEPLOYMENT.md) for Render + Supabase + Vercel.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | Flask API, models, migrations, `manage.py` |
| `frontend/` | React + Vite + Tailwind web app |
| `kiosk/ubuntu/` | Lock-down scripts and policies for Ubuntu voting booths |
| `tests/` | Backend test suite (pytest) |
| `docs/` | Guides, security notes, landing page and the LaTeX report |
| `docker-compose.yml` | Self-hosted stack: PostgreSQL, API, web |

## Documentation

- [Installation (self-hosting)](docs/INSTALLATION.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup, restore, upgrade](docs/OPERATIONS.md)
- [Voting booth setup on Ubuntu](docs/KIOSK_SETUP.md) · [Booth maintenance](docs/KIOSK_MAINTENANCE.md)
- [User guide](docs/USER_GUIDE.md) · [Security](docs/SECURITY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Changelog](docs/CHANGELOG.md)
- [Project report (LaTeX, for Overleaf)](docs/report/README.md)
- Landing page: `docs/` (GitHub Pages, deployed by `.github/workflows/pages.yml`). Preview locally with `python scripts/serve-site.py` (clean URLs like `/self-hosting`)

## Development

```bash
# backend tests
pip install -r backend/requirements-dev.txt
python -m pytest tests -q            # run from the repository root

# frontend
cd frontend && npm install && npm run dev
```

Set `DATABASE_URL` to a PostgreSQL URL, or leave it unset to use a local SQLite file for development. `python backend/manage.py migrate | seed | reset | status | programmes | set-password` are the operational commands.

## License

Released under the [MIT License](LICENSE). Free to use, modify and self-host; keep the copyright notice.
