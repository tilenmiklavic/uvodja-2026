#!/usr/bin/env bash
# One-time setup of the netcup server (Debian/Ubuntu) for https://vodja.miklavic.si. Run as root:
#   sudo bash deploy/server-setup.sh [deploy-user]
# Safe to run again. DNS (A/AAAA record vodja.miklavic.si → the server) must already point here for certbot to work.
set -euo pipefail

DOMAIN="vodja.miklavic.si"
DEPLOY_USER="${1:-deploy}"
WEBROOT="/var/www/$DOMAIN"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx rsync

# Unprivileged user the deploy script / GitHub Action logs in as (no password, key-only)
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"

# Release folders: releases/<timestamp>, `current` → newest
install -d -o "$DEPLOY_USER" -g www-data -m 755 "$WEBROOT" "$WEBROOT/releases"
install -d -m 755 /var/www/letsencrypt
if [ ! -e "$WEBROOT/current" ]; then
  install -d -o "$DEPLOY_USER" -g www-data -m 755 "$WEBROOT/releases/empty"
  echo "<h1>vodja.miklavic.si</h1><p>Waiting for the first deploy.</p>" > "$WEBROOT/releases/empty/index.html"
  ln -sfn "$WEBROOT/releases/empty" "$WEBROOT/current"
  chown -h "$DEPLOY_USER:www-data" "$WEBROOT/current"
fi

# nginx
install -d /etc/nginx/snippets
install -m 644 "$HERE/vodja-headers.conf" /etc/nginx/snippets/vodja-headers.conf
SITE="/etc/nginx/sites-available/$DOMAIN"

# Certificate first (with a temporary http-only site), then the real config that references it
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  cat > "$SITE" <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { root $WEBROOT/current; }
}
CONF
  ln -sfn "$SITE" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --agree-tos --register-unsafely-without-email --non-interactive \
    || { echo "certbot failed – is the DNS record for $DOMAIN already pointing at this server?"; exit 1; }
fi
install -m 644 "$HERE/nginx-$DOMAIN.conf" "$SITE"
ln -sfn "$SITE" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx
systemctl enable --now certbot.timer 2>/dev/null || true   # automatic renewal

cat <<MSG

Server is ready.
  1. Put the deploy public key into /home/$DEPLOY_USER/.ssh/authorized_keys
  2. From the repo:  DEPLOY_HOST=<server> bash deploy/deploy.sh
MSG
