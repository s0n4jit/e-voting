# Free hosting: Render + Supabase

Run the whole portal without paying for a server:

| Part | Service | Free tier note |
|---|---|---|
| Database | **Supabase** (PostgreSQL) | Pauses after 1 week without activity |
| API | **Render** web service (Docker) | Sleeps after ~15 min without requests |
| Web app | **Render** static site (or Vercel/Netlify) | Always on |

Free tiers are fine for trying the system and small class elections. For a real campus election use your own server ([INSTALLATION.md](INSTALLATION.md)) or a paid plan, and take a backup first.

## 1. Database on Supabase

1. Create a project at [supabase.com](https://supabase.com) and choose a strong database password (letters and digits are easiest).
2. Open **Connect** in the project and copy the **Session pooler** connection string. It looks like:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   - Use the **session pooler** (port **5432**). Render's free tier has no IPv6, so the "direct connection" host does not work, and the *transaction* pooler (port 6543) is not compatible with the migration lock.
   - The address must start with `postgresql://` (not `postgres://`).
3. Nothing else is needed: the API creates and upgrades its own tables on start. You do not use any Supabase key or client library.

## 2. API on Render

### Option A: Blueprint (fastest)

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, choose the repository. `render.yaml` creates both services.
3. Fill in the values it asks for (see the table below). Deploy the API first, copy its URL, then set the web app's `VITE_API_URL`.

### Option B: manually

1. **New → Web Service**, connect the repository, set **Root directory** `backend`, **Runtime** Docker, **Instance type** Free.
2. **Health check path**: `/healthz`
3. Add the environment variables below.

Create the Render service in the **same region as your Supabase project** (for example Frankfurt for `eu-central-1`). The API makes many small database calls, and a service on another continent makes installation and every page slower; the default Render region is Oregon.

### API environment variables

| Variable | Value |
|---|---|
| `FLASK_ENV` | `production` |
| `PORT` | `5000` (the container listens on 5000) |
| `DATABASE_URL` | The Supabase **session pooler** string from step 1 |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Two different long random values (Render can generate them; or `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `CORS_ORIGINS` | The web app's URL, e.g. `https://evoting-web.onrender.com` (no trailing slash) |
| `APP_URL` | **This API's own** URL, e.g. `https://evoting-api.onrender.com`. Turns on the self-ping, see below |
| `PROXY_HOPS` | `1` |
| `ALLOWED_HOSTS` | Optional: your API's custom domain, e.g. `api.evoting.example.edu`. See "Hiding the onrender.com addresses" below |
| `SETUP_TOKEN` | Optional but recommended: protects the installation wizard until you finish it |

## 3. Web app

On Render: **New → Static Site**, **Root directory** `frontend`, **Build command** `npm ci && npm run build`, **Publish directory** `dist`. Add the rewrite rule `/*` → `/index.html`, and the build variable:

| Variable | Value |
|---|---|
| `VITE_API_URL` | The API's URL, e.g. `https://evoting-api.onrender.com` (the `/api` part is added automatically) |

`VITE_API_URL` is read when the site is **built**; change it and redeploy. Vercel and Netlify work the same way (`frontend/vercel.json` already contains the rewrite).

## 4. First run

1. Open the web app URL; the installation wizard starts. Enter the setup token if you set one.
2. Finish the wizard and set up two-step verification.
3. Check `https://<api>/healthz` returns `{"status":"healthy"}`.

## Keeping the free API awake (self-ping)

Free Render services stop after about 15 minutes without a request, and the next visitor waits about a minute for a cold start. When `APP_URL` is set, the API sends a request to its own `/healthz` every 4 minutes (`backend/app/keepalive.py`), so it stays awake. In the same cycle it also runs `SELECT 1` directly on the database (your `DATABASE_URL`, i.e. the Supabase connection). That counts as activity and keeps the free Supabase project from pausing. Failures are only logged.

- `/healthz` is never rate limited.
- If `APP_URL` is empty (your own server), nothing is started.
- Render's free plan has a monthly hour allowance (about 750 hours, enough for one always-on service). Staying awake uses it; if you also need other free services, keep that in mind.
- The ping is for convenience, not a guarantee. Open the portal a few minutes before the election starts and check `/healthz`.

## Hiding the onrender.com addresses

The browser must be able to reach the API, so it can't be made private, but you can make the default `*.onrender.com` address dead and stop people opening API addresses in a browser:

1. Give the API a custom domain (**evoting-api → Settings → Custom Domains**, for example `api.evoting.example.edu`, with the CNAME record Render shows).
2. On the API set `ALLOWED_HOSTS=api.evoting.example.edu`, `APP_URL=https://api.evoting.example.edu` and `CORS_ORIGINS=https://evoting.example.edu`. Requests to any other hostname, including the `onrender.com` one, now get an empty 404. `/healthz` stays open for Render's health check.
3. On the web app set `VITE_API_URL=https://api.evoting.example.edu` and redeploy it.
4. The API also returns an empty 404 when someone types an API address into a browser address bar (requests from the web app are unaffected).

These checks keep casual visitors out. They do not replace the real protection: sign-in, two-step verification, booth tokens and rate limits.

## Voting booths

Booths are ordinary computers opening `https://<web-app>/kiosk/vote`. Use that address as `VOTING_URL` in [KIOSK_SETUP.md](KIOSK_SETUP.md).

## Photos and the free tier

Candidate and profile photos are stored in the database, so they survive Render restarts (a free Render disk would not).

## Backups

Supabase free projects have no scheduled backups you can rely on. Before the election and after the results, run from any computer with PostgreSQL tools:

```bash
pg_dump "<session pooler string>" > evoting-backup.sql
```

## Troubleshooting

| Problem | Fix |
|---|---|
| API deploy fails with "network is unreachable" for the database | You used the direct connection; use the **session pooler** string |
| "Set SECRET_KEY…" on start | `SECRET_KEY` or `JWT_SECRET_KEY` is missing |
| The web page loads but sign-in fails | `VITE_API_URL` is wrong (redeploy after changing) or `CORS_ORIGINS` does not match the web app URL exactly |
| First page load takes a minute | The API was asleep: check `APP_URL` is set to the API's own URL |
| Everyone is rate limited | `PROXY_HOPS` must be `1` on Render |
| Supabase project paused | Restore it in the Supabase dashboard, then restart the API |
