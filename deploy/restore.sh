#!/usr/bin/env bash
# Nashriyot-Master — PostgreSQL restore
# Ishlatish: ./restore.sh <backup-file.sql.gz>
# DIQQAT: Bu barcha mavjud ma'lumotlarni o'chirib, zaxiradan tikleydi!

set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Ishlatish: ./restore.sh <backup-file.sql.gz>"
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

# .env fayldan sozlamalar
if [ -f "$(dirname "$0")/.env" ]; then
  # shellcheck disable=SC1091
  source <(grep -E '^(DATABASE_URL|PGPASSWORD)=' "$(dirname "$0")/.env" || true)
fi

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

echo ""
echo "  DIQQAT: Bu amaliyot barcha mavjud ma'lumotlarni o'chirib,"
echo "  ${BACKUP_FILE} faylidan tiklaydi!"
echo "  DB: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""
read -rp "  Davom etish uchun 'yes' yozing: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Bekor qilindi."
  exit 0
fi

echo "[restore] Dropping public schema..."
PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1

echo "[restore] Restoring from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --quiet

echo "[restore] Restore complete from $(basename "$BACKUP_FILE")."
echo "[restore] Run migrations if needed: npx prisma migrate deploy"
