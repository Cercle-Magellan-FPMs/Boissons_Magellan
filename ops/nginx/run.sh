#!/usr/bin/env sh
set -eu

# Run once at container start
/opt/boissons/boissons-backup.sh

# Then run every 24h (simple scheduler)
while true; do
  sleep 86400
  /opt/boissons/boissons-backup.sh
done