#!/bin/bash
# Installs a cron job that runs `node scrape.js` every 5 minutes
# from 07:00 to 22:00 (last run 21:55) Vietnam time.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="tich-chi-scrape-cron"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found in PATH" >&2
  exit 1
fi

chmod +x "$ROOT/scripts/cron-run.sh"

TMP="$(mktemp)"
# Keep existing crontab, but drop any previous block of this job
crontab -l 2>/dev/null | sed "/# >>> $MARKER >>>/,/# <<< $MARKER <<</d" > "$TMP" || true

cat >> "$TMP" <<EOF
# >>> $MARKER >>>
CRON_TZ=Asia/Ho_Chi_Minh
NODE_BIN=$NODE_BIN
*/5 7-21 * * * $ROOT/scripts/cron-run.sh
# <<< $MARKER <<<
EOF

crontab "$TMP"
rm -f "$TMP"

echo "Cron job installed: every 5 minutes, 07:00-21:55 Asia/Ho_Chi_Minh"
echo "Using node: $NODE_BIN"
echo "Status log: $ROOT/status.txt"

# Run once immediately at install time
echo "Running initial scrape now..."
"$ROOT/scripts/cron-run.sh" || true
