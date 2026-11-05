# Security

This page describes what the system protects, how, and what is left to the operator.

## Principles

1. **Secret ballot.** A voter's identity and their choices are stored in different tables with no key between them.
2. **One voter, one ballot.** Enforced on the server, inside a database transaction.
3. **The server decides.** Roles, election stage and booth authorisation are checked on every request; the browser is never trusted.
4. **Nothing sensitive in the interface.** No hashes, internal ids or implementation details are shown to users.

## How the ballot stays secret

- `booth_slips` manages the physical voter slip credential (`voting_id`, salted hash of 4-digit PIN, booth association, status). It never references candidate choices.
- `ballot_entries` stores the actual choices under a random blind token, with no voter identity or student name.
- When a vote is submitted at a booth, the slip is marked as used and the ballot entries are written in **one locked database transaction**.
- The audit log records that a ballot was cast at the designated booth and session, never what was chosen.
- A physical paper **VVPAT** (Voter Verifiable Paper Audit Trail) slip is printed and dropped into a locked ballot box for auditability and manual recount verification.

## Authentication, Tamper & Attack Detection

- Staff sign in with email or username and password (bcrypt). **Two-step verification (TOTP) is mandatory for Election Officers**.
- Staff sessions: 15-minute access token silently renewed, **15-minute idle sign-out** with warning, and a **12-hour hard cap**.
- **Real-Time Attack Logging**:
  - `UNAUTHORIZED_BOOTH_ATTEMPT`: Triggered when an unauthenticated device attempts to call booth endpoints without an authorized token.
  - `PIN_BRUTE_FORCE`: Recorded when an incorrect 4-digit PIN is entered at a booth terminal (logged with terminal name and source IP).
  - `BOOTH_SETUP_FAILED`: Flagged when an invalid setup token or wrong officer TOTP code is entered during terminal configuration.
  - `TAMPER_DETECTED` & `TAMPERED_BALLOT_REJECTED`: Detects altered ballot signatures, mismatching terminal session tokens, or replay attempts.
- **Audit Categorization**: Audit logs are grouped into `Security & Tamper Attacks`, `Ballots Cast`, `Voter Slips & Credentials`, `Booths & Terminals`, `Election Lifecycle`, `Sign-ins & 2FA`, and `Admin & Settings`.

## Who can do what

| Action | Election Officer | Desk Officer | Voter |
|---|---|---|---|
| Install, configure lifecycle, candidates, booths, slips, audit, security alerts, results | yes | no | no |
| Issue pre-printed slips, verify physical voter roll | yes | yes | no |
| Cast a ballot | no | no | yes, only at an authorized booth terminal |

## Voting booths

- A booth is set up with a one-time setup code generated from the officer panel **and** the officer's live TOTP authenticator code.
- Booth Manager provides a single merged action: displays **Setup Code** when disconnected, and **Revoke** when connected (which revokes active credentials and immediately generates fresh pairing tokens).
- The booth terminal operates in full-screen lockdown mode with on-screen virtual numpad and sequential slip progression.

## Results

Counts, candidate votes and winners are **not sent to any browser** until the Election Officer publishes the results (not during voting, not after closing). The CSV report is locked the same way. A public link exists only while the officer has created it, uses an unguessable address and can be deleted at any time.

## Installation wizard

The wizard works only until the installation completes; a database row with a unique key makes a second installation impossible. Set `SETUP_TOKEN` on a server that is reachable before you have finished the wizard.

## Backup, reset and import

Only the Election Officer can download a backup, reset the system or import a backup. Reset and import need the officer's current authenticator code and a typed confirmation; reset also needs a backup downloaded in the last 30 minutes and refuses while voting is open. An import is checked completely before anything changes and is applied in one transaction, so a damaged file changes nothing. The backup ZIP contains password hashes, authenticator secrets and all ballots: store it encrypted and offline.

## Other protections

- Input is sanitised on the server; the interface escapes output; candidate photos are validated as real PNG/JPEG/WebP images and served with `nosniff`.
- CSV exports neutralise spreadsheet formulas.
- Configuration (database URL, secrets) comes from environment variables. In production the application refuses to start with the development secrets.
- All important actions are written to the audit log (Election Officer only).

## Operator checklist

- Serve the portal over **HTTPS** only; set `PROXY_HOPS` to the number of proxies in front of it so rate limits and the audit log see real addresses.
- Use long random `SECRET_KEY` and `JWT_SECRET_KEY`; keep `.env` out of version control.
- Restrict database access; back up before and after the election.
- Secure booth hardware (BIOS password, Secure Boot, port blockers) — see [KIOSK_SETUP.md](KIOSK_SETUP.md).
- Rate limits are counted in memory by one process; to run several API processes set `RATELIMIT_STORAGE_URL` to a shared Redis.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or contact the maintainer directly. Please do not file public issues for vulnerabilities.
