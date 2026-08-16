#!/usr/bin/env bash
#
# firebuild.sh -- build & harden a self-hosted hardiopub instance
#
# Idempotent-ish deploy script for the hardiopub fork
# (https://github.com/averlice/hardiopub).
#
# What it does:
#   1. installs Node 22 (if missing) + MariaDB + Icecast2 + firejail
#   2. creates unprivileged users: audiopub (app) + icecast-ap (streaming)
#   3. writes /home/audiopub/.env (secrets from env vars -- never hardcoded)
#   4. installs firejail profiles + loopback netfilters
#   5. installs the dedicated loopback-only Icecast (port 8001) config
#   6. installs hardened systemd units (audiopub + icecast-ap)
#   7. builds the app and applies the /audio prod-serving patch if needed
#
# Run as root. Secrets are read from the environment (see CONFIG below);
# nothing sensitive is written into this script.
#
# Usage:
#   sudo -E ./firebuild.sh            # use env vars below
#   sudo ./firebuild.sh --dry-run     # print what it WOULD do, change nothing
#
set -euo pipefail

# ---------------------------------------------------------------------------
# CONFIG  -- override any of these via environment before running
# ---------------------------------------------------------------------------
APP_USER="${APP_USER:-audiopub}"
APP_HOME="${APP_HOME:-/home/${APP_USER}}"
ICECAST_USER="${ICECAST_USER:-icecast-ap}"

ICECAST_PORT="${ICECAST_PORT:-8001}"
ICECAST_BIND="${ICECAST_BIND:-127.0.0.1}"

# DB (MariaDB on loopback)
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-audiopub}"
DB_USER="${DB_USER:-audiopub}"
DB_PASS="${DB_PASS:-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 32)}"

# JWT
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"

# Icecast admin + source creds (loopback only; safe to auto-generate)
ICECAST_ADMIN_PASS="${ICECAST_ADMIN_PASS:-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 24)}"
ICECAST_SOURCE_PASS="${ICECAST_SOURCE_PASS:-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 24)}"

# OneSignal (push) -- leave empty; hardiopub runs with NO_PUSH_NOTIFICATIONS
ONESIGNAL_APP_ID="${ONESIGNAL_APP_ID:-}"

# Optional Mailgun (leave empty -> NO_EMAIL=true)
MAILGUN_KEY="${MAILGUN_KEY:-}"
MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-}"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

run() {
  if (( DRY_RUN )); then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

echo "==> hardiopub firebuild"
echo "    app user : $APP_USER  (home $APP_HOME)"
echo "    icecast  : $ICECAST_USER on ${ICECAST_BIND}:${ICECAST_PORT}"
echo "    db       : ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
(( DRY_RUN )) && echo "    *** DRY RUN -- no changes will be made ***"
echo

# ---------------------------------------------------------------------------
# 1. system packages
# ---------------------------------------------------------------------------
echo "==> [1/7] packages"
run "apt-get update -qq"
run "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates gnupg openssl mariadb-server icecast2 firejail"

# Node 22 (NodeSource) if /usr/bin/node < 22
if ! /usr/bin/node --version 2>/dev/null | grep -qE '^v(22|2[3-9])'; then
  echo "    installing Node 22"
  run "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
  run "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs"
fi
echo "    node: $(/usr/bin/node --version 2>/dev/null || echo MISSING)"

# ---------------------------------------------------------------------------
# 2. users
# ---------------------------------------------------------------------------
echo "==> [2/7] users"
if ! id "$APP_USER" &>/dev/null; then run "useradd -r -m -s /usr/sbin/nologin -d $APP_HOME $APP_USER"; fi
if ! id "$ICECAST_USER" &>/dev/null; then run "useradd -r -s /usr/sbin/nologin -d /nonexistent $ICECAST_USER"; fi

# ---------------------------------------------------------------------------
# 3. database
# ---------------------------------------------------------------------------
echo "==> [3/7] database"
run "systemctl enable --now mariadb"
run "mysql -e \"CREATE DATABASE IF NOT EXISTS \\\`$DB_NAME\\\` CHARACTER SET utf8mb4;\""
run "mysql -e \"CREATE USER IF NOT EXISTS '$DB_USER'@'$DB_HOST' IDENTIFIED BY '$DB_PASS';\""
run "mysql -e \"GRANT ALL PRIVILEGES ON \\\`$DB_NAME\\\`.* TO '$DB_USER'@'$DB_HOST';\""
run "mysql -e \"FLUSH PRIVILEGES;\""

# ---------------------------------------------------------------------------
# 4. app code + .env
# ---------------------------------------------------------------------------
echo "==> [4/7] app + .env"
run "git clone --depth 1 https://github.com/averlice/hardiopub.git $APP_HOME"
run "chown -R $APP_USER:$APP_USER $APP_HOME"
run "sudo -u $APP_USER bash -c 'cd $APP_HOME && npm install'"

mkdir -p "$APP_HOME/audio" "$APP_HOME/images" "$APP_HOME/backups"
run "chown -R $APP_USER:$APP_USER $APP_HOME/audio $APP_HOME/images $APP_HOME/backups"

ENV_FILE="$APP_HOME/.env"
{
  echo "DATABASE_HOST=$DB_HOST"
  echo "DATABASE_PORT=$DB_PORT"
  echo "DATABASE_NAME=$DB_NAME"
  echo "DATABASE_USER=$DB_USER"
  echo "DATABASE_PASSWORD=$DB_PASS"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "ICECAST_HOST=${ICECAST_BIND}:${ICECAST_PORT}"
  echo "ICECAST_ADMIN_USER=admin"
  echo "ICECAST_ADMIN_PASSWORD=$ICECAST_ADMIN_PASS"
  if [[ -n "$MAILGUN_KEY" && -n "$MAILGUN_DOMAIN" ]]; then
    echo "MAILGUN_API_KEY=$MAILGUN_KEY"
    echo "MAILGUN_DOMAIN=$MAILGUN_DOMAIN"
    echo "FROM_EMAIL=no-reply@$MAILGUN_DOMAIN"
  else
    echo "NO_EMAIL=true"
  fi
  echo "NO_PUSH_NOTIFICATIONS=true"
  echo "PUBLIC_ONE_SIGNAL_APP_ID=$ONESIGNAL_APP_ID"
} | if (( DRY_RUN )); then cat; else install -o "$APP_USER" -g "$APP_USER" -m 600 /dev/stdin "$ENV_FILE"; fi

# ---------------------------------------------------------------------------
# 5. firejail profiles + netfilters
# ---------------------------------------------------------------------------
echo "==> [5/7] firejail"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for f in audiopub.profile audiopub.netfilter icecast-ap.profile icecast-ap.netfilter; do
  if [[ -f "$SCRIPT_DIR/deploy/$f" ]]; then
    run "install -o root -g root -m 644 $SCRIPT_DIR/deploy/$f /etc/firejail/$f"
  fi
done

# ---------------------------------------------------------------------------
# 6. dedicated icecast
# ---------------------------------------------------------------------------
echo "==> [6/7] icecast config"
run "mkdir -p /etc/icecast-ap /var/log/icecast-ap /var/lib/icecast-ap/.firejail-run"
run "chown -R $ICECAST_USER:$ICECAST_USER /var/log/icecast-ap /var/lib/icecast-ap"
run "chmod 700 /var/lib/icecast-ap/.firejail-run"
if [[ -f "$SCRIPT_DIR/deploy/icecast-ap.xml" ]]; then
  run "sed -e 's/CHANGE_ME_ADMIN_PASSWORD/$ICECAST_ADMIN_PASS/' \
            -e 's/CHANGE_ME_SOURCE_PASSWORD/$ICECAST_SOURCE_PASS/' \
            -e 's/change-me.example.com/localhost/' \
            -e 's/admin@example.com/root@localhost/' \
            $SCRIPT_DIR/deploy/icecast-ap.xml > /etc/icecast-ap/icecast-ap.xml"
  run "chown root:root /etc/icecast-ap/icecast-ap.xml"
  run "chmod 640 /etc/icecast-ap/icecast-ap.xml"
fi

# ---------------------------------------------------------------------------
# 7. systemd units + build
# ---------------------------------------------------------------------------
echo "==> [7/7] systemd + build"
if [[ -f "$SCRIPT_DIR/deploy/audiopub.service" ]]; then
  run "install -o root -g root -m 644 $SCRIPT_DIR/deploy/audiopub.service /etc/systemd/system/audiopub.service"
fi
if [[ -f "$SCRIPT_DIR/deploy/icecast-ap.service" ]]; then
  run "install -o root -g root -m 644 $SCRIPT_DIR/deploy/icecast-ap.service /etc/systemd/system/icecast-ap.service"
fi

run "systemctl daemon-reload"
run "sudo -u $APP_USER bash -c 'cd $APP_HOME && npm run build'"
run "sudo -u $APP_USER bash -c 'cd $APP_HOME && npm run db:migrate'"

# apply audio route prod patch if not already present (defensive)
if ! sudo -u "$APP_USER" grep -q "Accept-Ranges" "$APP_HOME/src/routes/audio/[id]/+server.ts" 2>/dev/null; then
  echo "    (route patch not detected in source -- ensure you pulled the hardiopub fork, not upstream)"
fi

echo
echo "==> done. enable + start:"
echo "    systemctl enable --now icecast-ap audiopub"
echo
echo "    Icecast (loopback) : http://${ICECAST_BIND}:${ICECAST_PORT}"
echo "    App (loopback)     : http://127.0.0.1:3000"
echo "    Point your Cloudflare Tunnel / reverse proxy at http://127.0.0.1:3000"
