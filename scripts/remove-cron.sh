#!/bin/bash
# Removes the tich-chi-scrape cron job installed by install-cron.sh.

set -euo pipefail

MARKER="tich-chi-scrape-cron"

if ! crontab -l 2>/dev/null | grep -q "$MARKER"; then
  echo "No tich-chi-scrape cron job found. Nothing to remove."
  exit 0
fi

TMP="$(mktemp)"
crontab -l 2>/dev/null | sed "/# >>> $MARKER >>>/,/# <<< $MARKER <<</d" > "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Cron job removed."
