#!/usr/bin/env bash
# Free the dev ports (API 3000, web 5173, widget 5174).
set -e
for port in 3000 5173 5174; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing pid $pid on :$port"
    kill -9 "$pid" 2>/dev/null || true
  fi
done
echo "Ports cleared."
