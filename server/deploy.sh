#!/usr/bin/env bash
# Runs ON the VPS as the deploy user. tools/deploy-api.ps1 pushes a commit to the bare repo and
# feeds THIS FILE FROM THAT COMMIT to bash, so the script that runs is always the one being
# deployed, never whatever the checkout held before:
#   git --git-dir=/srv/kicktro.git show <sha>:server/deploy.sh | bash -s <sha>
#
# It checks out <sha> in /srv/kicktro, builds and starts the api container, waits until it is
# healthy, and installs server/kicktro.caddy into talebindery's Caddy (validate, then reload;
# a file Caddy rejects is rolled back). Going back = run it again with the previous sha, which
# it prints at the start and on failure.
set -euo pipefail
umask 022

rev=${1:-}
[[ $rev =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <full commit sha>" >&2; exit 2; }
APP=${APP_DIR:-/srv/kicktro}
BARE=${BARE_DIR:-/srv/kicktro.git}
SITES=${CADDY_SITES:-/srv/caddy-sites}

exec 9>"$BARE/deploy.lock"
flock -n 9 || { echo "another kicktro deploy is running" >&2; exit 1; }

[ -d "$APP/.git" ] || git clone -q "$BARE" "$APP"
cd "$APP"
prev=$(git rev-parse -q --verify HEAD || echo none)
echo "kicktro: deploying $rev (previous release: $prev)"
git fetch -q origin
git checkout -q --detach "$rev"
[ -r .env ] || { echo "kicktro: $APP/.env is missing; copy server/.env.example and fill it in" >&2; exit 1; }

docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
GIT_REV=$rev docker compose -f server/compose.yml up -d --build --remove-orphans

st=missing
for _ in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' kicktro-api 2>/dev/null || echo missing)
  [ "$st" = healthy ] && break
  sleep 2
done
if [ "$st" != healthy ]; then
  echo "kicktro: the api is '$st' after 80 s" >&2
  docker logs --tail 50 kicktro-api >&2 || true
  echo "kicktro: to go back, deploy $prev" >&2
  exit 1
fi
echo "kicktro: api healthy"

# ---- talebindery's Caddy -----------------------------------------------------------------
caddy=$(docker ps -q --filter label=com.docker.compose.project=talebindery \
  --filter label=com.docker.compose.service=caddy | head -n 1)
if [ -z "$caddy" ]; then
  echo "kicktro: talebindery's caddy is not running, so api.kicktro.com is not routed" >&2
  exit 1
fi
if ! docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$caddy" | grep -qw edge; then
  echo "kicktro: talebindery's caddy is not on the 'edge' network (CLAUDE.md, 'Kicktro API')" >&2
  exit 1
fi
mkdir -p "$SITES"
site="$SITES/kicktro.caddy"
if ! cmp -s server/kicktro.caddy "$site"; then
  had_prev=0
  if [ -f "$site" ]; then cp "$site" "$site.prev"; had_prev=1; fi
  install -m 644 server/kicktro.caddy "$site"
  if docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null \
    && docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo "kicktro: caddy site installed and reloaded"
  else
    if [ "$had_prev" = 1 ]; then mv "$site.prev" "$site"; else rm -f "$site"; fi
    echo "kicktro: caddy rejected server/kicktro.caddy; the previous site file is back" >&2
    exit 1
  fi
fi

# Through Caddy's own network path, so a broken route shows up here and not to a visitor.
docker exec "$caddy" wget -qO- http://kicktro-api:8080/api/health >/dev/null \
  || { echo "kicktro: caddy cannot reach kicktro-api:8080" >&2; exit 1; }
echo "kicktro: deployed $rev"
