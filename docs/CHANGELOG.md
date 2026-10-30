# Changelog

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`. Each version is a git tag (`v1.0.0`),
a GitHub Release and a Docker image tag (`1.0.0`). See [CONTRIBUTING.md](../CONTRIBUTING.md#releases-and-versions).

## Unreleased

- Voting is now controlled only by the Election Officer: **Open voting**, **Pause voting** / **Resume voting** (for a break) and **Close voting**. The scheduled date and time is shown for information only and no longer opens or closes voting.
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
