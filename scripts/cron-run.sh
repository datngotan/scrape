#!/bin/bash
# Wrapper executed by cron: runs `node scrape.js` and appends the result
# with a Vietnam-time timestamp to status.txt in the repo root.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)" || exit 1
cd / || exit 1
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT" || exit 1

NODE="${NODE_BIN:-node}"
STATUS_FILE="$ROOT/status.txt"
NOW="$(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%d %H:%M:%S')"

# Safety guard: only run between 07:00 and 22:00 Vietnam time,
# even if the cron daemon ignores CRON_TZ (e.g. macOS).
HOUR="$(TZ=Asia/Ho_Chi_Minh date +%H)"
if [ "$HOUR" -lt 7 ] || [ "$HOUR" -ge 22 ]; then
  echo "[$NOW Asia/Ho_Chi_Minh] SKIPPED - outside 07:00-22:00 window" >> "$STATUS_FILE"
  exit 0
fi

OUTPUT="$("$NODE" "$ROOT/scrape.js" 2>&1)"
EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
  STATUS="SUCCESS"
else
  STATUS="FAILED"
fi

# Extract source counts from the JSON summary printed by scrape.js
COUNTS="$(printf '%s' "$OUTPUT" | "$NODE" -e "
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return;
  try {
    const s = JSON.parse(raw.slice(start, end + 1));
    const ok = (s.upserted || []).length;
    const failed = s.failed || [];
    const skipped = s.skipped || [];
    console.log(\`sources: \${ok} succeeded, \${failed.length} failed, \${skipped.length} skipped\`);
    for (const item of failed) {
      console.log(\`failed: \${item.id} [\${item.stage}] - \${item.error}\`);
    }
    for (const item of skipped) {
      console.log(\`skipped: \${item.id} [\${item.reason}]\`);
    }
  } catch {}
});
" 2>/dev/null)"

{
  echo "[$NOW Asia/Ho_Chi_Minh] $STATUS (exit=$EXIT_CODE) - node scrape.js"
  printf '%s\n' "$COUNTS" | sed 's/^/    /'
  echo "$OUTPUT" | tail -n 5 | sed 's/^/    /'
} >> "$STATUS_FILE"

exit "$EXIT_CODE"
