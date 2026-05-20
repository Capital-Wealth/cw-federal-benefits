#!/bin/bash
# Pushes a fresh SF access token from the local CLI to Vercel.
# Run via cron every hour: 0 * * * * /Users/thorsnode/cw-federal-benefits/scripts/refresh-sf-token.sh
#
# PATH must be explicit — cron runs with a minimal PATH that doesn't include
# Homebrew (sf, vercel) or Node (vercel sometimes). Without this, the script
# silently gets empty output and fails.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# macOS cron sets HOME=/var/empty which breaks sf CLI (can't write ~/.sf cache).
export HOME="/Users/thorsnode"

LOG=/tmp/sf-token-refresh.log
PROJECT_DIR=/Users/thorsnode/cw-federal-benefits

TOKEN=$(sf org display --target-org cw --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result']['accessToken'], end='')" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "$(date): Failed to get SF token" >> "$LOG"
  exit 1
fi

vercel env rm SF_ACCESS_TOKEN production --yes --cwd "$PROJECT_DIR" >> "$LOG" 2>&1
printf '%s' "$TOKEN" | vercel env add SF_ACCESS_TOKEN production --force --cwd "$PROJECT_DIR" >> "$LOG" 2>&1

# Trigger a redeploy so the updated env var takes effect (Vercel caches env on each deploy).
vercel deploy --prod --yes --cwd "$PROJECT_DIR" >> "$LOG" 2>&1

echo "$(date): Token refreshed and redeployed" >> "$LOG"
