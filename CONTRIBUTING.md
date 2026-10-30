# Contributing

Thanks for helping improve Campus E-Voting. This guide covers how to propose a change, what we expect in a pull request, and how versions and releases work.

## Ways to help

- **Report a bug or idea:** open an [issue](https://github.com/s0n4jit/e-voting/issues) with what you did, what you expected and what happened (screenshots help).
- **Report a security problem:** do **not** open a public issue. Use *Security → Report a vulnerability* on GitHub, or contact the maintainer directly (see [docs/SECURITY.md](docs/SECURITY.md)).
- **Improve documentation:** the guides in `docs/` are shown on the website, so fixes there help everyone.
- **Send code:** follow the steps below.

## Set up your computer

You need Python 3.12, Node.js 20 and Git (Docker is optional).

```bash
git clone https://github.com/<your-username>/e-voting.git
cd e-voting

# backend tests
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest ../tests -q

# frontend build
cd ../frontend
npm ci && npm run build
```

To run the whole system, copy `.env.example` to `.env` and use `docker compose up -d --build` ([docs/INSTALLATION.md](docs/INSTALLATION.md)). Use a **separate test database**, never a real election's.

## Making a pull request (PR)

1. **Fork** the repository on GitHub and clone your fork.
2. **Create a branch** from `main`, named for what you do:
   `feat/booth-clock`, `fix/slip-print-layout`, `docs/free-hosting`.
3. **Make the change.** Keep it small and focused: one topic per PR.
4. **Test it.** Add or update tests for new behaviour. Both commands above must pass.
5. **Update docs.** If behaviour, settings or commands change, update the guide in `docs/` and add a line under "Unreleased" in [docs/CHANGELOG.md](docs/CHANGELOG.md).
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org):

   | Prefix | Use for |
   |---|---|
   | `feat:` | a new feature (bumps the MINOR version) |
   | `fix:` | a bug fix (bumps the PATCH version) |
   | `docs:` | documentation only |
   | `refactor:` / `test:` / `ci:` / `chore:` | no change in behaviour |
   | `feat!:` or a `BREAKING CHANGE:` note | incompatible change (bumps the MAJOR version) |

   Example: `fix(desk): keep the slip ID when the programme changes`
7. **Push** your branch to your fork and **open a pull request** against `main`. Fill in the template: what changed, why, how you tested it.
8. **Respond to review.** Push more commits to the same branch; they update the PR. A maintainer merges it once the checks (CI) are green and it is approved.

### Rules that protect the election

These are never changed without a clear discussion in an issue first:

- A voter's identity and choices stay in separate tables with no link between them.
- One voter, one ballot, enforced in the database transaction.
- The server decides roles, election stage and booth approval; never trust the browser.
- Results stay hidden until the Election Officer publishes them.
- No secrets, real names, passwords or databases in commits.

## Releases and versions

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change | Example |
|---|---|
| **PATCH** — bug fixes, no new behaviour | `1.0.0` → `1.0.1` |
| **MINOR** — new features that keep existing installs working | `1.0.1` → `1.1.0` |
| **MAJOR** — changes that need action from operators (database, settings, API) | `1.1.0` → `2.0.0` |

A version is one git tag, `vMAJOR.MINOR.PATCH`. Pushing the tag automatically creates the GitHub Release (generated notes) and publishes the Docker images `ghcr.io/s0n4jit/e-voting-backend` and `…-frontend` tagged `1.2.3`, `1.2` and `latest`.

**Maintainer steps for a release:**

1. Make sure `main` is green (Actions tab) and tests pass locally.
2. In [docs/CHANGELOG.md](docs/CHANGELOG.md) rename "Unreleased" to the new version and date, and summarise the changes in plain language.
3. Commit: `docs: changelog for 1.2.0`, and push to `main`.
4. Tag and push the tag:

   ```bash
   git tag -a v1.2.0 -m "v1.2.0: short summary"
   git push origin v1.2.0
   ```
5. Check the Actions tab: the Release and the images appear. Make new packages **public** the first time (Packages → package settings).

Fixing a mistake: never move a published tag. Publish the next patch version instead.

## Code style

- **Python:** readable, small functions, type hints where helpful, validate input on the server. Tests live in `tests/`.
- **React:** function components and hooks; reuse components from `frontend/src/components/ui`; support light and dark themes and keyboard use.
- **Text:** plain language that a polling officer can understand; no internal ids or technical wording in the interface.

## Licence

By contributing you agree that your work is released under the project's [MIT License](LICENSE).
