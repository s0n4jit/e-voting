# Changelog

## 2.0

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
