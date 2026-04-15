#!/bin/bash
# Pushes a fresh SF access token from the local CLI to Vercel.
# Run via cron every hour: 0 * * * * /Users/thorsnode/cw-federal-benefits/scripts/refresh-sf-token.sh

TOKEN=$(sf org display --target-org cw --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['accessToken'], end='')")

if [ -z "$TOKEN" ]; then
  echo "$(date): Failed to get SF token" >> /tmp/sf-token-refresh.log
  exit 1
fi

vercel env rm SF_ACCESS_TOKEN production --yes --cwd /Users/thorsnode/cw-federal-benefits 2>/dev/null
printf '%s' "$TOKEN" | vercel env add SF_ACCESS_TOKEN production --force --cwd /Users/thorsnode/cw-federal-benefits 2>/dev/null

echo "$(date): Token refreshed" >> /tmp/sf-token-refresh.log
