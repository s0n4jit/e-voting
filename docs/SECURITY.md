# Security

This page describes what the system protects, how, and what is left to the operator.

## Principles

1. **Secret ballot.** A voter's identity and their choices are stored in different tables with no key between them.
2. **One voter, one ballot.** Enforced on the server, inside a database transaction.
3. **The server decides.** Roles, election stage and booth authorisation are checked on every request; the browser is never trusted.
4. **Nothing sensitive in the interface.** No hashes, internal ids or implementation details are shown to users.

## How the ballot stays secret

- `voter_records` says *who* has voted in an election (a SHA-256 hash derived from the voter slip ID, and a flag). It never references a candidate.
- `ballot_entries` says *what* was chosen, under a random blind token, with no user id.
- The ballot is written and the voter marked as having voted in **one transaction** with a row lock on the voter record, so two simultaneous submissions result in exactly one ballot (verified on PostgreSQL).
- The audit log records that a ballot was cast, at which booth and session, never what was chosen.

Known limitation: a ballot row carries the time the ballot was cast, and the voter's record carries the same time. Someone with direct database access could correlate them. Restrict database access and backups accordingly.

## Authentication and sessions

- Staff sign in with email or username and a password (bcrypt). **Two-step verification (TOTP) is mandatory for Election Officers** and optional for Desk Officers.
- Sessions are short-lived signed tokens. Deactivating or deleting an account ends its sessions on the next request.
- Rate limits: sign-in 10/min, voter PIN login 30/min, booth set-up 5/min, password change 5/min, per address. A voter's PIN is cancelled after 5 wrong entries.
- Passwords can be changed in the profile with the current password, or reset with an authenticator code. If an account has no two-step verification, an Election Officer resets a Desk Officer's password, and the operator can run `python backend/manage.py set-password <username>`. A lost authenticator is reset by the operator with `python backend/manage.py reset-2fa <username>`.

## Who can do what

| Action | Election Officer | Desk Officer | Voter |
|---|---|---|---|
| Install, configure, lifecycle, candidates, programmes, booths, results, audit | yes | no | no |
| Register students, check in, issue PIN slips | yes | yes | no |
| Cast a ballot | no | no | yes, only at an authorised booth |

## Voting booths

- A booth is set up with a one-time token from the officer panel **and** the officer's authenticator code. Only a hash of the booth token is stored.
- PIN login, loading the ballot and casting it all require a valid booth token; the voting session must have started at that same booth; the booth must belong to the election.
- Deleting a booth revokes it immediately. A booth stops working when its election is archived.
- The booth browser is locked by an enterprise policy that allows only `/kiosk/vote…`.

## Results

Counts, candidate votes and winners are **not sent to any browser** until the Election Officer publishes the results (not during voting, not after closing). The CSV report is locked the same way. A public link exists only while the officer has created it, uses an unguessable address and can be deleted at any time.

## Installation wizard

The wizard works only until the installation completes; a database row with a unique key makes a second installation impossible. Set `SETUP_TOKEN` on a server that is reachable before you have finished the wizard.

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
