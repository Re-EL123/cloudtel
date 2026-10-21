#!/usr/bin/env bash
# Run the automated test suites that do not require external infrastructure.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> sync packages"
node scripts/sync-shared.mjs

echo "==> function ceiling"
node scripts/check-functions.mjs

echo "==> unit tests"
node --test tests/unit/*.test.js

if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> integration tests (DATABASE_URL set)"
  node --test tests/api/*.test.js
  echo "==> tenant security tests"
  node --test tests/security/*.test.js
else
  echo "==> skipping integration/security tests (DATABASE_URL not set)"
fi

echo "test: complete"
