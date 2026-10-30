#!/bin/bash
set -e

echo "[Kiosk Lab Backend] Waiting for PostgreSQL database at ${TEST_DB_HOST:-kiosk_test_db}:${TEST_DB_PORT:-5432}..."

until python -c "
import psycopg2, os
url = os.environ.get('DATABASE_URL', '')
try:
    conn = psycopg2.connect(url)
    conn.close()
    exit(0)
except Exception as e:
    exit(1)
"; do
  echo "  Database is starting up... retrying in 2 seconds."
  sleep 2
done

echo "[Kiosk Lab Backend] Database is healthy and accessible."

# Run test seed data
echo "[Kiosk Lab Backend] Seeding isolated test database with campus election, 9 portfolios, desk officers, and STU001-STU020..."
python migrations/seed_data.py || echo "[WARN] Seed script encountered an issue or was already run."

echo "[Kiosk Lab Backend] Starting Flask API server on port 5000..."
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 run:app
