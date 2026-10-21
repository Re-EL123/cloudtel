#!/usr/bin/env bash
# Local development: web app on :3000, API on :3001 via vercel dev.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "NOTE: no .env file found. Copy .env.example to .env and fill in values."
fi

npm run build >/dev/null

if command -v vercel >/dev/null 2>&1; then
  vercel dev --dir apps/api --listen 3001 &
  API_PID=$!
  trap 'kill ${API_PID} 2>/dev/null || true' EXIT
else
  echo "NOTE: Vercel CLI not installed (npm i -g vercel). API will not run locally."
fi

node scripts/serve-web.mjs 3000
