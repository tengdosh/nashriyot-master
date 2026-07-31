#!/usr/bin/env bash
# Nashriyot-Master — PostgreSQL backup
# Ishlatish: ./backup.sh [KEEP_DAYS]
# Default: 30 kun saqlash (KEEP_DAYS=30)
#
# Talablar: pg_dump, gzip
# Prod DB: localhost:5533 (dev: 5433)

set -euo pipefail

KEEP_DAYS="${1:-30}"
BACKUP_DIR="${BACKUP_DIR:-/home/user/nashriyot-backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="nashriyot_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

# .env fayldan sozlamalar (agar mavjud bo'lsa)
if [ -f "$(dirname "$0")/.env" ]; then
  # shellcheck disable=SC1091
  source <(grep -E '^(DATABASE_URL|PGPASSWORD)=' "$(dirname "$0")/.env" || true)
fi

# DATABASE_URL dan parse qilish (agar berilgan bo'lsa)
if [ -n "${DATABASE_URL:-}" ]; then
  DB_USER=$(echo "$DATABASE_URL" | sed 's|.*//\([^:]*\):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
  DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@\([^:]*\):.*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*:\([0-9]*\)/.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed 's|.*/\([^?]*\).*|\1|')
else
  DB_USER="${PGUSER:-nashriyot}"
  DB_PASS="${PGPASSWORD:-nashriyot}"
  DB_HOST="${PGHOST:-localhost}"
  DB_PORT="${PGPORT:-5533}"
  DB_NAME="${PGDATABASE:-nashriyot}"
fi

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup → ${FILEPATH}"
echo "[backup] DB: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Use pg_dump from Docker postgres:16 container if available (avoids version mismatch)
DOCKER_CONTAINER="nashriyot-postgres"
if command -v docker &>/dev/null && docker inspect "$DOCKER_CONTAINER" &>/dev/null; then
  echo "[backup] Using Docker container pg_dump (postgres:16)"
  docker exec "$DOCKER_CONTAINER" pg_dump \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$FILEPATH"
else
  PGPASSWORD="$DB_PASS" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$FILEPATH"
fi

SIZE=$(du -sh "$FILEPATH" | cut -f1)
echo "[backup] Done — ${FILENAME} (${SIZE})"

# N kundan eski backuplarni o'chirish
echo "[backup] Removing backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "nashriyot_*.sql.gz" -mtime "+${KEEP_DAYS}" -delete -print \
  | sed 's|^|[backup] Deleted: |'

REMAINING=$(find "$BACKUP_DIR" -name "nashriyot_*.sql.gz" | wc -l)
echo "[backup] Remaining backups: ${REMAINING}"
