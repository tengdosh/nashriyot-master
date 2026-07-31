#!/usr/bin/env bash
# Nashriyot-Master — PostgreSQL restore
# Ishlatish: ./restore.sh <backup-file.sql.gz> [TARGET_DB_URL]
#
# TARGET_DB_URL berilmasa, .env dagi DATABASE_URL ishlatiladi.
# DIQQAT: Bu barcha mavjud ma'lumotlarni o'chirib, zaxiradan tikleydi!

set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Ishlatish: ./restore.sh <backup-file.sql.gz> [postgresql://user:pass@host:port/db]"
  echo ""
  BACKUP_DIR="${BACKUP_DIR:-/home/user/nashriyot-backups}"
  echo "Mavjud backuplar:"
  ls -lth "$BACKUP_DIR"/nashriyot_*.sql.gz 2>/dev/null | head -10 || echo "  (yo'q)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Fayl topilmadi: $BACKUP_FILE"
  exit 1
fi

# ── gzip tekshiruvi ──────────────────────────────────────────────────────────
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "ERROR: Backup fayli buzilgan (gzip -t muvaffaqiyatsiz)!" >&2
  exit 1
fi

# ── .env yoki argument dan URL ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL|PGUSER|PGPASSWORD|PGHOST|PGPORT|PGDATABASE)=' "$ENV_FILE" || true)
fi

TARGET_URL="${2:-${DATABASE_URL:-}}"

if [ -n "$TARGET_URL" ]; then
  eval "$(python3 - "$TARGET_URL" << 'PYEOF'
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

echo ""
echo "  DIQQAT: Bu amaliyot barcha mavjud ma'lumotlarni o'chirib,"
echo "  $(basename "$BACKUP_FILE") faylidan tiklaydi!"
echo "  Manzil: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""
read -rp "  Davom etish uchun 'yes' yozing: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Bekor qilindi."
  exit 0
fi

DOCKER_CONTAINER="nashriyot-postgres"
USE_DOCKER=false
if command -v docker &>/dev/null && docker inspect "$DOCKER_CONTAINER" &>/dev/null 2>&1; then
  USE_DOCKER=true
fi

echo "[restore] Dropping public schema on ${DB_NAME}..."
if $USE_DOCKER && [ "$DB_HOST" = "localhost" ]; then
  docker exec -e PGPASSWORD="$DB_PASS" "$DOCKER_CONTAINER" psql \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
else
  PGPASSWORD="$DB_PASS" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fi

echo "[restore] Restoring from $(basename "$BACKUP_FILE")..."
if $USE_DOCKER && [ "$DB_HOST" = "localhost" ]; then
  gunzip -c "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="$DB_PASS" "$DOCKER_CONTAINER" psql \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet
else
  gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASS" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname="$DB_NAME" --quiet
fi

echo "[restore] Restore complete from $(basename "$BACKUP_FILE")."
echo "[restore] Run migrations if needed: npx prisma migrate deploy"
