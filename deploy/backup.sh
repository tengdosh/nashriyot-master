#!/usr/bin/env bash
# Nashriyot-Master — PostgreSQL backup
# Ishlatish: ./backup.sh [KEEP_DAYS]
# Default: 30 kun saqlash (KEEP_DAYS=30)
#
# Talablar: pg_dump (Docker container yoki host), gzip, python3
# Prod DB: localhost:5533  (dev: 5433)

set -euo pipefail

KEEP_DAYS="${1:-30}"
BACKUP_DIR="${BACKUP_DIR:-/home/user/nashriyot-backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="nashriyot_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

# ── .env fayldan sozlamalar ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL|PGUSER|PGPASSWORD|PGHOST|PGPORT|PGDATABASE)=' "$ENV_FILE" || true)
fi

# ── DATABASE_URL → PG* variables (python3 bilan, @ va : xavfsiz) ─────────────
if [ -n "${DATABASE_URL:-}" ]; then
  eval "$(python3 - "$DATABASE_URL" << 'PYEOF'
import sys, urllib.parse as p
u = p.urlparse(sys.argv[1])
print(f"DB_USER={p.unquote(u.username or '')}")
print(f"DB_PASS={p.unquote(u.password or '')}")
print(f"DB_HOST={u.hostname or 'localhost'}")
print(f"DB_PORT={u.port or 5432}")
print(f"DB_NAME={u.path.lstrip('/').split('?')[0]}")
PYEOF
  )"
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

# ── pg_dump: Docker container ishlatilsa versiya farqi muammosi yo'q ──────────
DOCKER_CONTAINER="nashriyot-postgres"
if command -v docker &>/dev/null && docker inspect "$DOCKER_CONTAINER" &>/dev/null 2>&1; then
  echo "[backup] Using Docker container pg_dump (postgres:16)"
  docker exec -e PGPASSWORD="$DB_PASS" "$DOCKER_CONTAINER" pg_dump \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$FILEPATH"
else
  echo "[backup] Using host pg_dump"
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

# ── Fayl tekshiruvi ───────────────────────────────────────────────────────────
FILESIZE=$(stat -c%s "$FILEPATH" 2>/dev/null || stat -f%z "$FILEPATH" 2>/dev/null)
if [ "${FILESIZE:-0}" -eq 0 ]; then
  echo "[backup] ERROR: Backup fayli bo'sh (0 bayt)!" >&2
  rm -f "$FILEPATH"
  exit 1
fi

if ! gzip -t "$FILEPATH" 2>/dev/null; then
  echo "[backup] ERROR: Backup fayli buzilgan (gzip -t muvaffaqiyatsiz)!" >&2
  rm -f "$FILEPATH"
  exit 1
fi

SIZE=$(du -sh "$FILEPATH" | cut -f1)
echo "[backup] OK — ${FILENAME} (${SIZE})"

# ── lastBackupAt sozlamasini DB ga yozish ────────────────────────────────────
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UPSERT_SQL="INSERT INTO \"Setting\" (id, key, value, \"createdAt\", \"updatedAt\")
VALUES ('sys-lastBackupAt', 'lastBackupAt', to_jsonb('${NOW_ISO}'::text), now(), now())
ON CONFLICT (key) DO UPDATE SET value = to_jsonb('${NOW_ISO}'::text), \"updatedAt\" = now();"

if command -v docker &>/dev/null && docker inspect "$DOCKER_CONTAINER" &>/dev/null 2>&1; then
  docker exec -e PGPASSWORD="$DB_PASS" "$DOCKER_CONTAINER" psql \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet -c "$UPSERT_SQL" && \
    echo "[backup] lastBackupAt yozildi: ${NOW_ISO}"
else
  PGPASSWORD="$DB_PASS" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet -c "$UPSERT_SQL" && \
    echo "[backup] lastBackupAt yozildi: ${NOW_ISO}"
fi

# ── Eski backuplarni o'chirish ────────────────────────────────────────────────
echo "[backup] Removing backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "nashriyat_*.sql.gz" -o -name "nashriyot_*.sql.gz" \
  | while read -r f; do
    age_days=$(( ( $(date +%s) - $(stat -c%Y "$f" 2>/dev/null || stat -f%m "$f") ) / 86400 ))
    if [ "$age_days" -gt "$KEEP_DAYS" ]; then
      echo "[backup] Deleted (${age_days}d old): $(basename "$f")"
      rm -f "$f"
    fi
  done

REMAINING=$(find "$BACKUP_DIR" -name "nashriyot_*.sql.gz" | wc -l)
echo "[backup] Remaining backups: ${REMAINING}"
echo "[backup] DONE"
