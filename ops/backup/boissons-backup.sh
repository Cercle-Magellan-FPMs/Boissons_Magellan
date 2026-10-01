#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DB_PATH="${DB_PATH:-/data/app.db}"

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"

LOCK="/tmp/boissons-backup.lock"

DATE_TS="$(date '+%F_%H-%M')"
DOW="$(date '+%u')"     # 1..7 (7=Sunday)
DOM="$(date '+%d')"     # 01..31

log() { echo "[$(date '+%F %T')] $*"; }

exec 9>"$LOCK"
flock -n 9 || { log "Another backup is running. Exiting."; exit 0; }

log "=== BACKUP START ==="

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

if [ ! -f "$DB_PATH" ]; then
  log "ERROR: Database not found: $DB_PATH"
  exit 1
fi

# --- DAILY ---
DAILY_FILE="$DAILY_DIR/app_${DATE_TS}.db"
TMP_FILE="${DAILY_FILE}.tmp"
trap 'rm -f "$TMP_FILE"' EXIT
sqlite3 "$DB_PATH" ".backup \"$TMP_FILE\""
test "$(sqlite3 "$TMP_FILE" 'PRAGMA quick_check;')" = ok
mv "$TMP_FILE" "$DAILY_FILE"
log "Daily backup created: $DAILY_FILE"

# --- WEEKLY (Sunday) ---
if [ "$DOW" = "7" ]; then
  WEEKLY_FILE="$WEEKLY_DIR/app_${DATE_TS}.db"
  cp "$DAILY_FILE" "$WEEKLY_FILE"
  log "Weekly backup created: $WEEKLY_FILE"
fi

# --- MONTHLY (1st day) ---
if [ "$DOM" = "01" ]; then
  MONTHLY_FILE="$MONTHLY_DIR/app_${DATE_TS}.db"
  cp "$DAILY_FILE" "$MONTHLY_FILE"
  log "Monthly backup created: $MONTHLY_FILE"
fi

# Keep backup files for 30 days, including older files at the backup root.
find "$BACKUP_ROOT" -type f -name "app_*.db" -mmin +43200 -delete

log "Rotation done"
log "=== BACKUP END ==="
