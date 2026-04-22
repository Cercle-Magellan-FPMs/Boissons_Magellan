#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ADMIN_DIR="$ROOT_DIR/admin"
KIOSK_DIR="$ROOT_DIR/kiosk"

APP_USER="$(stat -c '%U' "$ROOT_DIR")"
APP_GROUP="$(stat -c '%G' "$ROOT_DIR")"

DB_PATH="${DB_PATH:-/var/lib/boissons/app.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/boissons}"
WEB_ROOT="${WEB_ROOT:-/var/www/boissons}"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-/etc/nginx/sites-available/boissons-magellan.conf}"
ADMIN_ALLOW_IPS="${ADMIN_ALLOW_IPS:-172.16.0.111}"
KIOSK_API_ALLOW_IPS="${KIOSK_API_ALLOW_IPS:-172.20.0.4 172.16.0.111 172.19.0.9}"
INSTALL_NODE20="${INSTALL_NODE20:-1}"
STOP_DOCKER_STACK="${STOP_DOCKER_STACK:-1}"
INSTALL_BACKUP_TIMER="${INSTALL_BACKUP_TIMER:-1}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

run_as_app() {
  sudo -n -u "$APP_USER" bash -lc "$*"
}

require_sudo() {
  sudo -n true >/dev/null 2>&1 || {
    echo "This script needs passwordless sudo access." >&2
    exit 1
  }
}

ensure_package() {
  local package="$1"
  dpkg -s "$package" >/dev/null 2>&1 || MISSING_PACKAGES+=("$package")
}

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

install_node20_if_needed() {
  local current_major
  current_major="$(node_major_version)"
  if [ "$current_major" -ge 20 ]; then
    log "Node.js $(node -v) already available"
    return
  fi

  if [ "$INSTALL_NODE20" != "1" ]; then
    echo "Node.js >= 20 is required, but found $(node -v 2>/dev/null || echo missing)." >&2
    echo "Re-run with INSTALL_NODE20=1 or install Node.js 20 manually." >&2
    exit 1
  fi

  log "Installing Node.js 20 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -n bash -
  sudo -n apt-get install -y nodejs
  log "Node.js now at $(node -v)"
}

render_allow_lines() {
  local ips="$1"
  for ip in $ips; do
    printf '    allow %s;\n' "$ip"
  done
}

install_host_nginx_config() {
  local tmp_file
  tmp_file="$(mktemp)"

  cat >"$tmp_file" <<EOF
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;

  root $WEB_ROOT;

  location = / {
    return 302 /kiosk/;
  }

  location = /kiosk {
    return 302 /kiosk/;
  }

  location /kiosk/ {
    try_files \$uri \$uri/ /kiosk/index.html;
  }

  location /products/ {
    alias $WEB_ROOT/kiosk/products/;
    try_files \$uri =404;
  }

  location = /admin {
    return 302 /admin/;
  }

  location /admin/ {
$(render_allow_lines "$ADMIN_ALLOW_IPS")    deny all;
    try_files \$uri \$uri/ /admin/index.html;
  }

  location /api/kiosk/ {
$(render_allow_lines "$KIOSK_API_ALLOW_IPS")    deny all;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /api/admin/ {
$(render_allow_lines "$ADMIN_ALLOW_IPS")    deny all;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

  sudo -n install -D -m 644 "$tmp_file" "$NGINX_SITE_PATH"
  rm -f "$tmp_file"

  sudo -n mkdir -p /etc/nginx/sites-enabled
  sudo -n ln -sf "$NGINX_SITE_PATH" /etc/nginx/sites-enabled/boissons-magellan.conf
  if [ -e /etc/nginx/sites-enabled/default ]; then
    sudo -n rm -f /etc/nginx/sites-enabled/default
  fi

  sudo -n nginx -t
  sudo -n systemctl enable --now nginx
  sudo -n systemctl reload nginx
}

install_backend_service() {
  local service_file
  service_file="$(mktemp)"

  cat >"$service_file" <<EOF
[Unit]
Description=Boissons Magellan backend
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$BACKEND_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DB_PATH=$DB_PATH
EnvironmentFile=-$BACKEND_DIR/.env
ExecStart=/usr/bin/node $BACKEND_DIR/dist/index.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

  sudo -n install -D -m 644 "$service_file" /etc/systemd/system/boissons-backend.service
  rm -f "$service_file"

  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now boissons-backend.service
  sudo -n systemctl restart boissons-backend.service
}

install_backup_timer() {
  local service_file timer_file
  service_file="$(mktemp)"
  timer_file="$(mktemp)"

  cat >"$service_file" <<EOF
[Unit]
Description=Boissons Magellan SQLite backup

[Service]
Type=oneshot
Environment=DB_PATH=$DB_PATH
Environment=BACKUP_ROOT=$BACKUP_ROOT
ExecStart=$ROOT_DIR/ops/backup/boissons-backup.sh
EOF

  cat >"$timer_file" <<'EOF'
[Unit]
Description=Run Boissons Magellan backup daily

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

  sudo -n install -D -m 644 "$service_file" /etc/systemd/system/boissons-backup.service
  sudo -n install -D -m 644 "$timer_file" /etc/systemd/system/boissons-backup.timer
  rm -f "$service_file" "$timer_file"

  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now boissons-backup.timer
}

stop_docker_stack_if_requested() {
  if [ "$STOP_DOCKER_STACK" != "1" ]; then
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return
  fi

  if ! sudo -n docker info >/dev/null 2>&1; then
    return
  fi

  if [ -f "$ROOT_DIR/docker-compose.yml" ]; then
    log "Stopping Docker stack"
    sudo -n docker compose -f "$ROOT_DIR/docker-compose.yml" down || true
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0")

Environment overrides:
  DB_PATH=/var/lib/boissons/app.db
  BACKUP_ROOT=/var/backups/boissons
  WEB_ROOT=/var/www/boissons
  ADMIN_ALLOW_IPS="172.16.0.111"
  KIOSK_API_ALLOW_IPS="172.20.0.4 172.16.0.111 172.19.0.9"
  INSTALL_NODE20=1
  STOP_DOCKER_STACK=1
  INSTALL_BACKUP_TIMER=1

This script:
  1. Installs required host packages
  2. Ensures Node.js 20 is available
  3. Builds backend/admin/kiosk on the VM
  4. Publishes static files under $WEB_ROOT
  5. Installs a systemd backend service
  6. Installs a host nginx config
  7. Optionally installs the backup timer
  8. Optionally stops the Docker stack
EOF
}

if [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

require_sudo

MISSING_PACKAGES=()
ensure_package ca-certificates
ensure_package curl
ensure_package rsync
ensure_package sqlite3
ensure_package build-essential
ensure_package python3
ensure_package nginx

if [ "${#MISSING_PACKAGES[@]}" -gt 0 ]; then
  log "Installing packages: ${MISSING_PACKAGES[*]}"
  sudo -n apt-get update
  sudo -n apt-get install -y "${MISSING_PACKAGES[@]}"
fi

install_node20_if_needed

log "Ensuring directories exist"
sudo -n install -d -m 755 /var/lib/boissons "$BACKUP_ROOT" "$WEB_ROOT/admin" "$WEB_ROOT/kiosk"
sudo -n chown -R "$APP_USER:$APP_GROUP" /var/lib/boissons "$BACKUP_ROOT"

log "Installing npm dependencies"
run_as_app "cd '$BACKEND_DIR' && npm ci"
run_as_app "cd '$ADMIN_DIR' && npm ci"
run_as_app "cd '$KIOSK_DIR' && npm ci"

log "Building backend"
run_as_app "cd '$BACKEND_DIR' && npm run build"

log "Running database migrations"
run_as_app "cd '$BACKEND_DIR' && DB_PATH='$DB_PATH' npm run migrate"

log "Building admin frontend"
run_as_app "cd '$ADMIN_DIR' && npm run build"

log "Building kiosk frontend"
run_as_app "cd '$KIOSK_DIR' && npm run build"

log "Publishing static files"
sudo -n rsync -a --delete "$ADMIN_DIR/dist/" "$WEB_ROOT/admin/"
sudo -n rsync -a --delete "$KIOSK_DIR/dist/" "$WEB_ROOT/kiosk/"

log "Installing backend service"
install_backend_service

if [ "$INSTALL_BACKUP_TIMER" = "1" ]; then
  log "Installing backup timer"
  install_backup_timer
fi

log "Installing host nginx config"
install_host_nginx_config

log "Stopping Docker stack"
stop_docker_stack_if_requested

log "Deployment complete"
echo
echo "Useful checks:"
echo "  systemctl status boissons-backend.service"
echo "  systemctl status nginx"
echo "  systemctl list-timers | grep boissons-backup"
echo "  curl -I http://127.0.0.1/kiosk/"
