# Operations: backup, restore, upgrade

Commands assume the self-hosted stack from [INSTALLATION.md](INSTALLATION.md), run from the repository root. For a managed database (Supabase, RDS, …) use that provider's backups and `pg_dump` against its connection string instead.

## Backup

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > evoting-$(date +%F).dump
```

Back up before every upgrade, before voting opens, and again after it closes. Store dumps off the server. A dump contains voter records and ballots: protect it like the database.

## Restore

Restoring replaces the current data.

```bash
docker compose stop backend frontend
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < evoting-2026-01-01.dump
docker compose start backend frontend
```

## Upgrade

```bash
# 1. back up (see above)
git pull                     # or copy in the new release
docker compose up -d --build
docker compose logs backend --tail 50
curl -fsS http://localhost:${WEB_PORT:-80}/api/health
```

Schema upgrades run automatically at start-up and are recorded in the `schema_migrations` table, so they are safe to repeat. To run them explicitly: `docker compose exec backend python manage.py migrate`. Existing data is preserved: upgrades only add tables/columns and fill derived values.

Roll back by restoring the pre-upgrade dump and checking out the previous release.

### Notes for the release that introduces the installation wizard

- A deployment that already has an Election Officer is treated as installed; the wizard stays locked.
- Elections get a lifecycle status derived from their previous state (active, published, ended).
- Staff accounts (Election Officers and Desk Officers) have two-step verification switched off once. Earlier versions accepted a fixed demo code for every account, so staff must re-enable two-step verification under **Account security**.
- Voters are now registered by Desk Officers and identified by a generated Voter Slip ID. Existing voter accounts keep working with their original IDs for PIN check-in.
- The admin voter import / manual voter creation endpoints are retired (HTTP 410) in favour of desk registration.

## Resetting a test instance

`python manage.py reset` drops all tables. It refuses to run when `FLASK_ENV=production` unless `ALLOW_DB_RESET=true` is set — only the local test environment sets it.

## Monitoring

- Liveness/readiness: `GET /api/health`
- Application log: `backend_logs` volume (`/app/logs/evoting.log`), also on `docker compose logs backend`
- Administrative actions: Audit log page
