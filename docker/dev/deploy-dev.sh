#!/usr/bin/env bash
# IVY TalkTalk — dev infra bring-up. Amoeba Structure v2 §5.1.
# Starts dev infra (MySQL, Redis, RabbitMQ) and seeds the database.
set -euo pipefail

# Resolve repo root from this script's location (docker/dev/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Starting dev infrastructure (MySQL, Redis, RabbitMQ)..."
docker compose -f docker/docker-compose.dev.yml up -d

echo "==> Seeding database..."
npm run db:seed

echo "==> Dev infra is up. API/web/widget run on the host via 'npm run dev'."
