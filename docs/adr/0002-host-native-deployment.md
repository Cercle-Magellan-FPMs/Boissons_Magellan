# ADR 0002 - Host-Native Deployment (systemd + nginx)

## Context
Project runs on a VM with simple ops requirements and low service count.

## Decision
Deploy directly on host:
- backend as `boissons-backend.service`
- static `admin`/`kiosk` under `/var/www/boissons`
- `nginx` as reverse proxy and static server
- SQLite at `/var/lib/boissons/app.db`

## Consequences
- Fast, low-overhead deployment path.
- Straightforward troubleshooting with systemd/journal/nginx logs.
- Less isolation than containerized deployment.
