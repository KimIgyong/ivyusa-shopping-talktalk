#!/usr/bin/env bash
# IVY TalkTalk — production deploy. Amoeba Structure v2 §5.1 (deploy scripts mandatory).
set -euo pipefail

# Resolve repo root from this script's location (docker/production/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker/production/docker-compose.production.yml"
ENV_FILE="docker/production/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy docker/production/.env.production.example and fill it in." >&2
  exit 1
fi

# Optional: pull latest source before deploying.
# git pull --ff-only

echo "==> Building and starting production stack..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo "==> Status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
