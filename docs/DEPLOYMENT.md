# Production deployment (Render + Supabase + Vercel, or any equivalent)

> Step-by-step free setup (Render + Supabase, with keep-awake self-ping): [FREE_HOSTING.md](FREE_HOSTING.md).

The same code runs on a hosted stack or on your own server ([INSTALLATION.md](INSTALLATION.md)). Nothing in the code refers to a specific hosting account: every address and credential comes from environment variables.

## Backend (Render, Fly, a VM, …)

- Root directory `backend/`, Dockerfile build (or `pip install -r requirements.txt` and start with `gunicorn --bind 0.0.0.0:$PORT --workers 4 run:app`)
- Health check path: `/api/health`
- Environment variables:

| Variable | Value |
|---|---|
| `FLASK_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL URL, e.g. Supabase **connection string** (use the pooled/session URL, `?sslmode=require`) |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Long random values (the app will not start in production with the development defaults) |
| `CORS_ORIGINS` | Comma-separated frontend origins, e.g. `https://vote.example.edu` |
| `SETUP_TOKEN` | Optional, protects the first-run wizard |

On start the backend creates/upgrades its tables in the configured database (existing data is kept). A database that already contains an Election Officer is treated as installed.

## Frontend (Vercel, Netlify, Cloudflare Pages, nginx)

- Root directory `frontend/`, build command `npm run build`, output directory `dist`
- Set `VITE_API_URL` at **build time** to the backend's public URL (e.g. `https://api.example.edu`) when the frontend and API are on different origins. Leave it unset when a proxy serves both under one origin (`/api`).
- Single-page-app fallback: `frontend/vercel.json` already rewrites all paths to `index.html`.

## Supabase

Create a project, copy the Postgres connection string into `DATABASE_URL`. No Supabase client library or key is used; the backend talks plain PostgreSQL, so the database can later be moved anywhere with `pg_dump`/`pg_restore`.

## HTTPS

Always serve the portal over HTTPS. Hosted platforms do this for you; on your own server follow the reverse-proxy section of [INSTALLATION.md](INSTALLATION.md).

## Checklist before an election

1. `GET /api/health` is healthy
2. Wizard completed; Election Officer has re-enabled two-step verification
3. Programmes, positions, candidates entered; at least one Desk Officer account
4. A test registration and test vote performed on a separate **test installation**, not on production
5. Database backup taken ([OPERATIONS.md](OPERATIONS.md))
