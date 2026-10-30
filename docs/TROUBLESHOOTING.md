# Troubleshooting

## Installation and server

| Problem | Likely cause and fix |
|---|---|
| Backend exits with "Set SECRET_KEY…" | `SECRET_KEY` / `JWT_SECRET_KEY` are missing or still the development defaults. Set long random values in `.env`. |
| `docker compose up` says a variable is required | Fill `POSTGRES_PASSWORD`, `SECRET_KEY`, `JWT_SECRET_KEY` in `.env` (copy `.env.example`). |
| The web page loads but API calls fail | Check `docker compose logs backend`. If the frontend is on another origin, set `CORS_ORIGINS` and build the frontend with `VITE_API_URL`. |
| `/api/health` returns 503 | The API cannot reach PostgreSQL. Check `DATABASE_URL` and that the database is healthy. |
| Everyone gets "too many requests" | All users share one address. Set `PROXY_HOPS` so the real client address is used. |
| The installation wizard does not appear | The instance is already installed (an Election Officer exists). `python backend/manage.py status` shows the state. |
| Wizard asks for a setup token | `SETUP_TOKEN` is set on the server; enter it on the first step. |

## Accounts

| Problem | Fix |
|---|---|
| Forgot password, two-step verification is on | Sign-in page → **Forgot password?**: account name, authenticator code, new password. |
| Lost phone / authenticator | On the server run `python backend/manage.py reset-2fa <username>`; the officer signs in with the password and sets two-step verification up again (mandatory for Election Officers). |
| Forgot password, no two-step verification | Election Officer resets a Desk Officer (Desk Officers page). For an Election Officer, run `python backend/manage.py set-password <username>` on the server. |
| An officer was deactivated and is signed out | Expected: sessions end on the next request. Activate the account again. |

## Desk

| Problem | Fix |
|---|---|
| "No programmes configured" | Election Officer: Programmes → add or import a CSV. |
| Duplicate student warning | The same name, programme and semester already exists. Confirm only if it is a different student. |
| PIN cannot be issued | The student has already voted, or the slip ID is wrong (check the prefix, e.g. `SUE26-E1-`). |
| PIN stopped working | It expires after 20 minutes, works once, and is cancelled after 5 wrong entries. Issue a new one. |

## Booths

| Problem | Fix |
|---|---|
| "Token or code is not correct" | The token was already used, expired (15 minutes) or mistyped, or the code belongs to another officer. Generate a new token; use the code of the officer who generated it. |
| Booth keeps returning to set-up | It was deleted in the panel, or its election was archived. Generate a new token. |
| Booth shows "Voting is not open" | The election is not in *Voting active* or outside its start/end time. |
| Booth is Offline in the panel | Check the booth's network (`ip addr`, `ping`), then restart `evote-kiosk.service`. |
| The page does not open on the booth | Wrong address in `/etc/default/evote-kiosk`. It must end with `/kiosk/vote`. |
| Maintenance screen rejects the code | Use the current 6-digit code of an Election Officer; after 5 wrong codes it locks for 15 minutes. |

## Results

| Problem | Fix |
|---|---|
| Results page says "locked" | Close voting, then press **Publish results** on the Elections page. |
| "Present on projector" is disabled | Same: results must be published first. |
| Cannot create a public link | Results must be published. The link is created on the Results page. |
| Draw instead of a winner | Intended: equal top votes for a position are a draw. |

## Getting logs

```bash
docker compose logs -f backend      # API
docker compose logs -f frontend     # web server
sudo journalctl --user -M evote@ -u evote-kiosk.service -f   # a booth
```
