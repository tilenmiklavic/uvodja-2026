#!/usr/bin/env bash
# Upload the site to the netcup server as a new release and switch `current` to it (atomic; old releases are kept for
# rollback). Used by hand and by .github/workflows/deploy.yml.
#
#   DEPLOY_HOST=vodja.miklavic.si bash deploy/deploy.sh          # or the server's IP / ssh alias
#   DEPLOY_USER=deploy DEPLOY_PORT=22 KEEP=5                      # optional
#   bash deploy/deploy.sh --rollback                              # point `current` at the previous release
set -euo pipefail

HOST="${DEPLOY_HOST:?set DEPLOY_HOST (server name or IP)}"
USER_="${DEPLOY_USER:-deploy}"
PORT="${DEPLOY_PORT:-22}"
KEEP="${KEEP:-5}"
ROOT="${DEPLOY_ROOT:-/var/www/vodja.miklavic.si}"
SSH=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "$USER_@$HOST")

if [ "${1:-}" = "--rollback" ]; then
  "${SSH[@]}" "set -e; cd $ROOT/releases; cur=\$(basename \$(readlink -f ../current)); prev=\$(ls -1 | grep -v '^empty\$' | sort | grep -B1 -x \"\$cur\" | head -1); \
    [ -n \"\$prev\" ] && [ \"\$prev\" != \"\$cur\" ] || { echo 'no older release'; exit 1; }; ln -sfn $ROOT/releases/\$prev ../current.new && mv -Tf ../current.new ../current; echo \"current → \$prev\""
  exit 0
fi

cd "$(dirname "$0")/.."
REL="$(date -u +%Y%m%d-%H%M%S)"
echo "Uploading release $REL to $USER_@$HOST …"

# Only what the browser needs. (apps-script/, push-worker/, scripts/, deploy/ and dotfiles stay in git.)
rsync -az --delete --human-readable \
  -e "ssh -p $PORT -o StrictHostKeyChecking=accept-new" \
  --rsync-path="mkdir -p $ROOT/releases/$REL && rsync" \
  --include='/index.html' --include='/sw.js' --include='/manifest.webmanifest' \
  --include='/css/***' --include='/js/***' --include='/data/***' --include='/assets/***' --include='/features/***' \
  --exclude='*' \
  ./ "$USER_@$HOST:$ROOT/releases/$REL/"

"${SSH[@]}" "set -e
  chmod -R a+rX $ROOT/releases/$REL
  ln -sfn $ROOT/releases/$REL $ROOT/current.new && mv -Tf $ROOT/current.new $ROOT/current
  cd $ROOT/releases && ls -1 | grep -v '^empty\$' | sort | head -n -$KEEP | xargs -r rm -rf
  echo 'current →' \$(basename \$(readlink -f $ROOT/current))"
echo "Done: https://vodja.miklavic.si/"
