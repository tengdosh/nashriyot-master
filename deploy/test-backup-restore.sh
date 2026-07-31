#!/usr/bin/env bash
# Nashriyot-Master — Backup/Restore sinov skripti
# Maqsad: backup chiqar → bo'sh test bazaga tiklash → jadval/yozuv solishtir
# Ishlatish: DATABASE_URL=... bash deploy/test-backup-restore.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
TEST_DB="nashriyot_restore_test"
BACKUP_DIR="${BACKUP_DIR:-/tmp/nashriyot-test-backup}"
DOCKER_CONTAINER="nashriyot-postgres"

echo "════════════════════════════════════════════════════"
echo " Nashriyot-Master Backup/Restore sinovi"
echo "════════════════════════════════════════════════════"

# ── .env dan sozlamalar ───────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  source <(grep -E '^(DATABASE_URL|PGUSER|PGPASSWORD|PGHOST|PGPORT|PGDATABASE)=' "$ENV_FILE" 2>/dev/null || true)
fi

SRC_URL="${DATABASE_URL:-}"
if [ -n "$SRC_URL" ]; then
  eval "$(python3 - "$SRC_URL" << 'PYEOF'
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
  DB_PORT="${PGPORT:-5433}"
  DB_NAME="${PGDATABASE:-nashriyot}"
fi

echo "[test] Manba DB: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "[test] Test DB:  ${TEST_DB}"

# helpers — docker exec wrappers (no nested quoting issues)
docker_psql() {
  local db="$1"; shift
  docker exec -e "PGPASSWORD=${DB_PASS}" "$DOCKER_CONTAINER" \
    psql --username="$DB_USER" --dbname="$db" -t --no-align --quiet "$@"
}

# ── 1. Test bazasini yaratish (DDL must run outside transactions → separate -c) ─
echo ""
echo "[1/5] Test bazasini yaratish..."
docker_psql postgres -c "DROP DATABASE IF EXISTS \"${TEST_DB}\"" > /dev/null
docker_psql postgres -c "CREATE DATABASE \"${TEST_DB}\""          > /dev/null
echo "      ✓ ${TEST_DB} bazasi yaratildi"

# ── 2. Backup olish ───────────────────────────────────────────────────────────
echo ""
echo "[2/5] Manba DB dan backup olish..."
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/nashriyot_test_${TIMESTAMP}.sql.gz"

docker exec -e "PGPASSWORD=${DB_PASS}" "$DOCKER_CONTAINER" \
  pg_dump --username="$DB_USER" --dbname="$DB_NAME" \
  --format=plain --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

FILESIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")
if [ "${FILESIZE:-0}" -eq 0 ]; then
  echo "      ✗ ERROR: Backup fayli bo'sh!" >&2; exit 1
fi
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "      ✗ ERROR: gzip tekshiruvi muvaffaqiyatsiz!" >&2; exit 1
fi
echo "      ✓ Backup: $(basename "$BACKUP_FILE") ($(du -sh "$BACKUP_FILE" | cut -f1)), gzip OK"

# ── 3. Test bazaga restore ────────────────────────────────────────────────────
echo ""
echo "[3/5] Test bazaga restore..."
gunzip -c "$BACKUP_FILE" | \
  docker exec -i -e "PGPASSWORD=${DB_PASS}" "$DOCKER_CONTAINER" \
  psql --username="$DB_USER" --dbname="$TEST_DB" --quiet > /dev/null
echo "      ✓ Restore tugadi"

# ── 4. Jadval soni va yozuv solishtirish ─────────────────────────────────────
echo ""
echo "[4/5] Jadval soni va yozuv solishtirish..."

TABLE_QUERY="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
SRC_TABLES=$(docker_psql "$DB_NAME" -c "$TABLE_QUERY" | tr -d ' \n')
DST_TABLES=$(docker_psql "$TEST_DB"  -c "$TABLE_QUERY" | tr -d ' \n')

echo ""
printf "      ┌──────────────────────────────────────────────┐\n"
printf "      │ %-22s %8s %10s │\n" "Ko'rsatkich" "Manba" "Tiklangan"
printf "      ├──────────────────────────────────────────────┤\n"
printf "      │ %-22s %8s %10s │\n" "Jadvalar soni" "$SRC_TABLES" "$DST_TABLES"

FAIL=0
for TABLE in User Title Product SalesOrder Payment Notification RoyaltyRun; do
  SRC=$(docker_psql "$DB_NAME" -c "SELECT COUNT(*) FROM \"${TABLE}\"" 2>/dev/null | tr -d ' \n' || echo "?")
  DST=$(docker_psql "$TEST_DB"  -c "SELECT COUNT(*) FROM \"${TABLE}\"" 2>/dev/null | tr -d ' \n' || echo "?")
  MARK="✓"
  if [ "$SRC" != "$DST" ]; then MARK="✗"; FAIL=1; fi
  printf "      │ %-22s %8s %10s  %s │\n" "$TABLE" "$SRC" "$DST" "$MARK"
done
printf "      └──────────────────────────────────────────────┘\n"

if [ "$SRC_TABLES" != "$DST_TABLES" ] || [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "      ✗ ERROR: Yozuvlar mos kelmaydi!" >&2
  docker_psql postgres -c "DROP DATABASE IF EXISTS \"${TEST_DB}\"" > /dev/null 2>&1 || true
  exit 1
fi

# ── 5. Test bazasini tozalash ────────────────────────────────────────────────
echo ""
echo "[5/5] Test bazasini o'chirish..."
docker_psql postgres -c "DROP DATABASE IF EXISTS \"${TEST_DB}\"" > /dev/null
rm -f "$BACKUP_FILE"
echo "      ✓ ${TEST_DB} o'chirildi, test fayli o'chirildi"

echo ""
echo "════════════════════════════════════════════════════"
echo " ✓ Backup/Restore sinovi MUVAFFAQIYATLI yakunlandi"
echo "════════════════════════════════════════════════════"
