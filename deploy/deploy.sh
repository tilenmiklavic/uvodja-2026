#!/usr/bin/env bash
# Deploys the site to the netcup server (https://vodja.miklavic.si), the same way as every app there:
# check → upload a new release → `docker compose up` → install site.caddy into the shared proxy.
# (The convention: "The server" in docs/deploy-netcup.md of tilenmiklavic/klin-dom.) Used by hand and by
# .github/workflows/deploy.yml.
#
#   DEPLOY_HOST=vodja@vodja.miklavic.si bash deploy/deploy.sh               # or vodja@<server IP> / an ssh alias
#   DEPLOY_HOST=vodja@vodja.miklavic.si bash deploy/deploy.sh --rollback    # `current` → the previous release
# Optional: SSH_PORT (default 22), KEEP (releases to keep, default 5).
#
# The remote steps arrive on stdin (bash -s), so each is one { ... } block with stdin closed: bash reads it whole
# before running it, and a command that reads stdin (docker compose exec) cannot swallow the rest.
#
# On the server, in /opt/vodja: compose.yml + Caddyfile (from deploy/), releases/<UTC timestamp>/ (the site files)
# and `current` → the live release. Switching `current` is atomic, so a visitor never sees a half-uploaded release.
set -euo pipefail

cd "$(dirname "$0")/.."

: "${DEPLOY_HOST:?set DEPLOY_HOST, e.g. vodja@vodja.miklavic.si}"
APP=vodja
DIR=/opt/vodja
KEEP="${KEEP:-5}"
SSH="ssh -p ${SSH_PORT:-22} -o BatchMode=yes"

if [ "${1:-}" = "--rollback" ]; then
  $SSH "$DEPLOY_HOST" bash -s -- "$DIR" <<'REMOTE'
{
exec </dev/null
set -euo pipefail
cd "$1/releases"
cur="$(basename "$(readlink ../current)")"
prev="$(ls -1 | sort | grep -B1 -x "$cur" | head -1)"
[ -n "$prev" ] && [ "$prev" != "$cur" ] || { echo "no older release" >&2; exit 1; }
ln -sfn "releases/$prev" ../current.new && mv -Tf ../current.new ../current
echo "current → $prev"
}
REMOTE
  exit 0
fi

# Fail before changing anything if the server isn't set up for this app.
echo "==> checking $DEPLOY_HOST"
$SSH "$DEPLOY_HOST" bash -s -- "$APP" "$DIR" <<'REMOTE'
{
exec </dev/null
if [ ! -w "$2" ] || [ ! -w /opt/proxy/sites ] || ! docker inspect proxy-caddy-1 >/dev/null 2>&1; then
  echo "error: the server is not set up for $1 (or the shared proxy is not running). As root, run once:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/tilenmiklavic/klin-dom/main/deploy/netcup/setup-server.sh | ssh root@<server> 'bash -s -- $1'" >&2
  exit 1
fi
}
REMOTE

REL="$(date -u +%Y%m%d-%H%M%S)"
echo "==> uploading release $REL"
# Only what the browser needs. (apps-script/, push-worker/, scripts/, deploy/ and dotfiles stay in git.)
rsync -az --delete --human-readable -e "$SSH" \
  --rsync-path="mkdir -p $DIR/releases/$REL && rsync" \
  --include='/index.html' --include='/sw.js' --include='/manifest.webmanifest' \
  --include='/css/***' --include='/js/***' --include='/data/***' --include='/assets/***' --include='/features/***' \
  --exclude='*' \
  ./ "$DEPLOY_HOST:$DIR/releases/$REL/"
rsync -az -e "$SSH" deploy/compose.yml deploy/Caddyfile "$DEPLOY_HOST:$DIR/"
# The API (api/, built on the server). No --delete of the folder itself: only its files are replaced.
rsync -az --delete -e "$SSH" --rsync-path="mkdir -p $DIR/api && rsync" --exclude='test.js' api/ "$DEPLOY_HOST:$DIR/api/"

echo "==> switching to $REL and restarting"
$SSH "$DEPLOY_HOST" bash -s -- "$DIR" "$REL" "$KEEP" <<'REMOTE'
{
exec </dev/null
set -euo pipefail
cd "$1"
chmod -R a+rX "releases/$2"
ln -sfn "releases/$2" current.new && mv -Tf current.new current
(cd releases && ls -1 | sort | head -n -"$3" | xargs -r rm -rf)
docker compose up -d --build --remove-orphans --wait
# compose only recreates the container when its definition changed; this applies an edited Caddyfile too
# (a restart if the running config can't be reloaded, e.g. right after the container was created).
docker compose exec -T web caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || docker compose restart web
echo "current → $(basename "$(readlink current)")"
}
REMOTE

echo "==> routing $APP in the shared proxy"
# Install site.caddy as /opt/proxy/sites/$APP.caddy; if the proxy rejects it, put the previous one back.
$SSH "$DEPLOY_HOST" "set -e
  cd /opt/proxy/sites
  umask 002
  [ -f $APP.caddy ] && cp $APP.caddy .$APP.caddy.bak
  cat > .$APP.caddy.new && mv -f .$APP.caddy.new $APP.caddy
  if docker exec proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile; then
    rm -f .$APP.caddy.bak
  else
    if [ -f .$APP.caddy.bak ]; then mv -f .$APP.caddy.bak $APP.caddy; else rm -f $APP.caddy; fi
    echo 'error: the proxy rejected deploy/site.caddy; the previous route is still live' >&2
    exit 1
  fi" < deploy/site.caddy

echo "Done: https://vodja.miklavic.si/"
