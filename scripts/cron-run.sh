#!/bin/bash
# Wrapper executed by cron: runs `node scrape.js` and appends the result
# with a Vietnam-time timestamp to status.txt in the repo root.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

OUTPUT="$("$NODE" scrape.js 2>&1)"
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
    const failed = (s.failed || []).length;
    const skipped = (s.skipped || []).length;
    console.log(\`sources: \${ok} succeeded, \${failed} failed, \${skipped} skipped\`);
  } catch {}
});
" 2>/dev/null)"

{
  echo "[$NOW Asia/Ho_Chi_Minh] $STATUS (exit=$EXIT_CODE) - node scrape.js${COUNTS:+ - $COUNTS}"
  echo "$OUTPUT" | tail -n 5 | sed 's/^/    /'
} >> "$STATUS_FILE"

exit "$EXIT_CODE"
