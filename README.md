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

1. **Election Officer** installs the portal with a first-run wizard, configures the election, positions, and candidates (with 1:1 square photo cropping and full detail editing), and controls the election lifecycle.
2. **Polling & Desk Workflow**:
   - Polling Officer 1 verifies the physical Student ID Card.
   - Polling Officer 2 records the student's physical signature on the official voter roll.
   - Polling Officer 3 / Desk Officer hands the pre-printed voter slip containing the **Voter Slip ID** (e.g. `SUE26-E3-1001`) and **4-digit Voting PIN** (printed in high-density 6-per-A4 sheets with cut guides).
3. **Voting Booth Terminal**:
   - The student voter walks to the designated booth machine where the sequential Slip ID is already prefilled.
   - The voter enters the 4-digit PIN using the on-screen virtual numpad with mouse.
   - The system verifies the credentials, opens the ballot, prompts for a final review of choices, and casts the vote.
   - The booth prints the **VVPAT** slip (timestamp, booth no, slip ID, candidate choices) which the student drops into the sealed physical ballot box before walking out.
4. **Results & Audit**:
   - Results stay strictly hidden until the Election Officer publishes them.
   - Projector reveal with confetti presentation and downloadable verified PDF sheets.
   - Real-time audit log with dedicated **Security & Attacks** monitoring (wrong PIN attempts, tamper detection, brute-force alerts).

| Role | Does |
|---|---|
| Election Officer | Installs, configures lifecycle, manages candidates & booths, generates printable slips, monitors audit & security attacks, publishes results |
| Desk Officer | Verifies physical voter rolls, issues pre-printed 6-per-A4 voter slips with 4-digit PINs |
| Voter | Confirms prefilled slip ID, enters 4-digit PIN via virtual numpad, selects candidates, reviews, submits, drops VVPAT into ballot box |

## Highlights

- **First-run installation wizard**: institution, logo branding, first officer account, mandatory two-step verification (TOTP), initial election.
- **Physical Roll & Pre-issued Slips**: printable A4 sheets with 6 slips per page, featuring college header branding, voting date, booth number, voter slip ID, 4-digit PIN, and cutting guides.
- **Secret ballot with VVPAT**: who authenticated and what was chosen live in separate decoupled tables. The booth prints a physical paper verification audit trail.
- **Booth security & unified lifecycle**: single contextual action (*Setup Code* when inactive, *Revoke* when connected). Booth setup requires officer TOTP authentication.
- **Real-time attack detection**: logs and flags unauthorized booth access, wrong booth PIN attempts, token tampering, and rate-limit violations.
- **Election lifecycle enforced by server**: Setup → Review / Registration → Ready → Voting active (with Pause/Resume) → Voting closed → Results published → Archived.
- **Projector Results Reveal**: one position at a time on projector with winner declarations and printable certified result sheets.
- **Runs with Docker Compose**: fully self-hosted PostgreSQL, Python Flask API, and React frontend. Zero cloud dependencies.

## Quick start (self-hosting)

```bash
git clone https://github.com/s0n4jit/e-voting.git
cd e-voting
python scripts/make_env.py  # writes .env with random secrets (or: cp .env.example .env and fill it in)
docker compose up -d --build
```

One command starts everything on fixed ports:

| What | Address | Setting |
|---|---|---|
| **App** (voters, desk, officer panel; also serves `/api`) | http://localhost:8080 | `WEB_PORT` |
| **Landing page and guides** (same site as GitHub Pages) | http://localhost:8081 | `SITE_PORT` |
| **API** directly (health: `/healthz`) | http://localhost:5000 | `API_PORT` (this machine only) |
| Voting booth screen | http://localhost:8080/kiosk/vote | |

Open the app and complete the installation wizard; it asks for the setup token printed by `docker compose logs backend | grep "SETUP TOKEN"` (or the `SETUP_TOKEN` you put in `.env`). See the [installation guide](docs/INSTALLATION.md) for HTTPS, reverse proxies and your own PostgreSQL, and the [deployment guide](docs/DEPLOYMENT.md) for Render + Supabase + Vercel.

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | Flask API, models, migrations, `manage.py` |
| `frontend/` | React + Vite + Tailwind web app |
| `booth-app/` | Desktop kiosk application for Windows and Linux |
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

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) (pull requests, versions and releases).
