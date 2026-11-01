# Changelog

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`. Each version is a git tag (`v1.0.0`),
a GitHub Release and a Docker image tag (`1.0.0`). See [CONTRIBUTING.md](../CONTRIBUTING.md#releases-and-versions).

## Unreleased

_Nothing yet._

## 1.2.0 — 2026-10-31

- **Booth OS**: a bootable Debian-based image (Cage + Firefox kiosk, nothing installed or saved) built by a GitHub Actions workflow. The portal address is embedded into the downloaded ISO with `booth-os/embed-url.py`. See `docs/BOOTH_OS.md`.
- The booth installer detects the distribution (Ubuntu, Debian, Fedora/RHEL family, Arch with GNOME/GDM) and installs Firefox and its policy the way each one ships it; `--detect` prints the result. Only Ubuntu has been tried on real hardware.
- Booth installer (`kiosk/ubuntu/setup-kiosk.sh`): the `VOTING_URL` you pass is now really used (it was ignored and the example `localhost:3000` kept) and is added to the browser policy, so a booth works against any site, not only the example address.
- Staff sessions: 15-minute idle sign-out with a warning, silent renewal while active, 12-hour hard cap, and signed-out tokens stored in the database (they stay revoked after a restart). Settings: `JWT_ACCESS_TOKEN_EXPIRES_MINUTES` (15), `JWT_REFRESH_TOKEN_EXPIRES_HOURS` (12).
- `docker compose up` now starts the app (8080), the landing page and guides (8081) and exposes the API on localhost (5000), all on fixed, configurable ports; `python scripts/make_env.py` creates `.env` with random secrets for a fresh clone.
- Website: mobile layout fixed (no sideways scrolling or zooming out) and a hamburger menu on small screens.

## 1.1.0 — 2026-10-31

- Voting is now controlled only by the Election Officer: **Open voting**, **Pause voting** / **Resume voting** (for a break) and **Close voting**. The scheduled date and time is shown for information only and no longer opens or closes voting.
- A browser that is set up as a voting booth is locked to the booth screens: typing another address, refreshing or pressing Back always returns to `/kiosk/vote` (the sign-in page can no longer be reached). Deleting the booth in the officer panel releases the browser.
- Importing a backup clears every account's two-step verification, so each officer sets it up again on the next sign-in; a stale secret from the backup can no longer lock the officer out.
- Two-step verification is now enforced by the server for Election Officers: until it is on, every officer and desk endpoint answers 403 `two_step_required` (only the set-up endpoints work). The wizard explains this and its last screen is the authenticator set-up.
- Setup wizard: the programmes and departments step is now a ticked list built from the standard college template (untick, edit terms, add your own) with a plain explanation, instead of a CSV box. The Programmes page offers "Add the standard list" when empty.
- Setup on slow hosting: the wizard waits longer for the server and recovers if the answer is lost; the Render blueprint no longer sets a region.
- The setup wizard is always protected in production: without a `SETUP_TOKEN`, a random one is generated and printed in the server log.
- **Backup, reset and import** (Election Officer, sidebar "Backup and reset"): download everything as a ZIP, reset the system back to the setup screen (needs a fresh backup, the officer's authenticator code and typing RESET), and import a backup after setting up again.
- When the officer closes voting, every booth resets at once (even mid-ballot) and shows "Voting has ended"; students can no longer be registered, PINs can no longer be issued and unused PINs are cancelled.

## 1.0.0 — 2026-10-30 (first public release)

**Distribution and site**
- Landing page and in-site documentation (GitHub Pages); free-hosting guide for Render + Supabase with a self-ping that keeps the API and database awake.
- Live clock and date on the voting booth screens.
- MIT licence; GitHub Actions for tests, Pages and Docker images published to GitHub Container Registry; a LaTeX project report.

**Installation and configuration**
- First-run installation wizard with institution branding; the uploaded logo is used as the favicon, otherwise the default Campus E-Voting mark.
- Mandatory two-step verification for Election Officers.
- Configurable programmes, departments and streams (including CSV import); slip ID letters configurable at install.

**Election management**
- Server-enforced lifecycle: Setup → Registration → Ready → Voting active → Voting closed → Results published → Archived; one election at a time.
- Positions per election; candidates with photos stored in the database.

**Registration and voting**
- Desk registration with automatically generated Voter Slip IDs (`<letters><yy>-E<n>-<6 digits>`), live statuses, printing, export.
- New animated voting flow; only the 6 digits of the slip ID are typed at a booth.
- Votes are accepted only from authorised booths (one-time token + officer's authenticator code, hashed tokens, instant revocation, per-election booth IDs, audit of booth and session).

**Results**
- Results hidden until published; projector reveal; optional public link; draws instead of arbitrary winners.

**Interface**
- New design system with light and dark themes, floating collapsible sidebar, profile page, audit log filters.

**Security fixes**
- Removed a universal two-step code that worked for every account, built-in booth tokens and a fixed maintenance PIN.
- Brute-force limits, PIN cancellation, row-locked ballot submission, production refuses default secrets.

**Operations**
- Docker Compose self-hosting, idempotent database migrations (`python backend/manage.py migrate`), health endpoint, backup and upgrade guides.

**Removed**
- Admin voter import and manual voter creation (replaced by desk registration), the voter web dashboard and password login for voters, Flask-Mail, unused dependencies and legacy scripts.

## Earlier prototypes (before the public release)

- **0.4.0** — Secure booth mode with a staff maintenance screen, desk enrolment on the spot, sidebar app shell, readable audit ledger, authenticator-based (TOTP) staff sign-in.
- **0.3.0** — Guided multi-position ballot with review step, desk-officer role, live polling on the desk, audit log and dashboard.
- **0.2.0** — Physical registration desk with PIN slips, lab booth mode, multi-position ballots with "None of the above", first formal documents.
- **0.1.0** — Initial campus e-voting system: secret ballot, academic deliverables and test suite.
