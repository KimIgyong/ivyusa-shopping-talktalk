#!/usr/bin/env bash
# Bring up infra, seed, then run all apps in dev.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
echo "▶ Starting infra (MySQL/Redis/RabbitMQ)…"
npm run db:up
echo "▶ Waiting for MySQL…"; sleep 12
echo "▶ Seeding…"; npm run db:seed || echo "seed skipped/failed (is MySQL ready?)"
echo "▶ Starting apps (turbo dev)…"
npm run dev
