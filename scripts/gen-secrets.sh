#!/usr/bin/env bash
# Generate the secrets a self-hosted deployment needs (PLN-260820 W3).
#
#   bash scripts/gen-secrets.sh
#
# Prints values to paste into .env.self-hosted. Nothing is written to disk and
# nothing is logged — copy them once, into the env file, and close the terminal.
#
# The API refuses to boot in production when any required secret is short,
# missing, or matches its placeholder pattern (change_me|example|dev_|…), so
# these are generated rather than left to invention.
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl not found — install it, or generate 32+ byte random values another way." >&2
  exit 1
fi

# The API rejects any secret matching its placeholder pattern. Hex output can
# never match it, but base64 uses the whole alphabet — so regenerate rather than
# hand an operator a value that boots fine in dev and refuses in production.
PLACEHOLDER='change_me|changeme|placeholder|example|dev_|_dev|secret_here|xxxx'

hex() { openssl rand -hex "$1"; }

b64() {
  local value
  for _ in 1 2 3 4 5; do
    value="$(openssl rand -base64 "$1")"
    if ! printf '%s' "$value" | grep -qiE "$PLACEHOLDER"; then
      printf '%s' "$value"
      return 0
    fi
  done
  echo "ERROR: could not generate a value that passes the placeholder check" >&2
  return 1
}

cat <<VALUES
# ---- generated $(date -u +%Y-%m-%dT%H:%M:%SZ) ----
# Paste into docker/self-hosted/.env.self-hosted, then delete this output.

JWT_ACCESS_SECRET=$(hex 32)
JWT_REFRESH_SECRET=$(hex 32)

# AES-256-GCM key for stored credentials and PII. MUST be 32 bytes, base64.
CRED_ENC_KEY=$(b64 32)

# Signs attachment links. Optional — derived from CRED_ENC_KEY when unset — but
# setting it explicitly lets you rotate link signing on its own later.
FILE_URL_SECRET=$(hex 32)

DB_PASSWORD=$(hex 16)
DB_ROOT_PASSWORD=$(hex 16)
RABBITMQ_PASSWORD=$(hex 16)
# Remember to put the same RabbitMQ password into RABBITMQ_URL.

# First console login; must be changed on first sign-in.
SEED_PASSWORD=$(hex 8)!Aa
VALUES

cat >&2 <<'WARN'

⚠️  Once this deployment holds data, two of these can no longer be changed freely:

    CRED_ENC_KEY     rotating it makes every stored credential and every
                     encrypted PII column undecryptable. There is no recovery
                     without the old key.
    FILE_URL_SECRET  rotating it invalidates every attachment link already sent
                     to a customer or an external messenger.

    Store both wherever this deployment's other secrets live, before first boot.
WARN
