#!/usr/bin/env bash
# IVY TalkTalk — staging deploy. Amoeba Structure v2 §5.1 (deploy scripts mandatory).
set -euo pipefail

# Resolve repo root from this script's location (docker/staging/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker/staging/docker-compose.staging.yml"
ENV_FILE="docker/staging/.env.staging"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy docker/staging/.env.staging.example and fill it in." >&2
  exit 1
fi

# Optional: pull latest source before deploying.
# git pull --ff-only

echo "==> Building and starting staging stack..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

# Recreated app containers get new IPs; reload the edge nginx so it re-reads its
# config and re-resolves upstreams (avoids stale-IP 404/502 after a redeploy).
echo "==> Reloading edge nginx..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T nginx nginx -s reload \
  || docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate nginx

echo "==> Status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
