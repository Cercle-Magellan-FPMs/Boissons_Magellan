# SQLite Backups

Production uses `/var/lib/boissons/app.db`. The `boissons-backup.timer` runs the `boissons-backup.service` daily at 03:15 in the VM's time zone. The timer is persistent, so systemd runs a missed backup after the VM starts.

The service runs `ops/backup/boissons-backup.sh` with `DB_PATH=/var/lib/boissons/app.db` and `BACKUP_ROOT=/var/backups/boissons`. The script uses SQLite `.backup`, checks the snapshot with `PRAGMA quick_check`, then publishes it as a `.db` file. It creates a daily copy, plus a weekly copy on Sunday and a monthly copy on the first day of the month. Every backup named `app_*.db` under the backup root, including legacy files at its top level, is removed after 30 days.

The snapshot contains the whole SQLite schema and data, including `stock_current.qty_200`, `qty_500`, and migration `013_stock_locations`. It does not include `backend/.env` or uploaded product images. The backup directory is on the same VM disk as the database; it does not protect against loss of that disk or VM.

## Check a backup

```bash
sudo systemctl start boissons-backup.service
systemctl status boissons-backup.service --no-pager
systemctl list-timers boissons-backup.timer --no-pager

# Replace the filename with a file from /var/backups/boissons/daily/.
BACKUP_FILE=/var/backups/boissons/daily/app_YYYY-MM-DD_HH-MM.db
sudo test -f "$BACKUP_FILE"
sudo sqlite3 -readonly "$BACKUP_FILE" 'PRAGMA quick_check;'
sudo sqlite3 -readonly "$BACKUP_FILE" \
  "SELECT COUNT(*) FROM stock_current WHERE qty != qty_200 + qty_500;"
```

The last two commands should print `ok` and `0`. To test an actual restore without changing production:

```bash
RESTORE_DIR=$(mktemp -d /tmp/boissons-restore.XXXXXX)
RESTORE_TEST="$RESTORE_DIR/app.db"
sudo sqlite3 "$RESTORE_TEST" ".restore $BACKUP_FILE"
sudo sqlite3 -readonly "$RESTORE_TEST" 'PRAGMA quick_check;'
sudo sqlite3 -readonly "$RESTORE_TEST" \
  "SELECT COUNT(*) FROM stock_current WHERE qty != qty_200 + qty_500;"
sudo rm -r "$RESTORE_DIR"
```
