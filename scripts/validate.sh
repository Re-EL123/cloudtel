#!/usr/bin/env bash
# Full repository validation: sync, function ceiling, syntax check, lint, unit tests.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> sync packages into web mirrors"
node scripts/sync-shared.mjs

echo "==> serverless function ceiling (<= 12)"
node scripts/check-functions.mjs

echo "==> javascript syntax check"
FAIL=0
while IFS= read -r -d '' file; do
  if ! node --check "$file" >/dev/null 2>&1; then
    echo "syntax error: $file"
    node --check "$file" || true
    FAIL=1
  fi
done < <(find apps packages tests scripts telephony/ari-bridge \( -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*' -print0)
if [ "$FAIL" -ne 0 ]; then
  echo "validate: FAILED syntax check"
  exit 1
fi
echo "syntax OK"

if [ -x node_modules/.bin/eslint ]; then
  echo "==> lint"
  npx eslint apps/api/api apps/api/lib packages --max-warnings 0 || exit 1
else
  echo "==> eslint not installed, skipping lint"
fi

echo "==> unit tests"
node --test tests/unit/*.test.js

echo "validate: OK"
