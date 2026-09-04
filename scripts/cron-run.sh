#!/bin/bash
# Wrapper executed by cron: runs `node scrape.js` and appends the result
# with a Vietnam-time timestamp to status.txt in the repo root.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)" || exit 1
cd / || exit 1
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT" || exit 1

NODE="${NODE_BIN:-node}"
# Self-heal if NODE_BIN (captured once at install time) has gone stale, e.g.
# it pointed at a session-only temp shim
# (/private/var/folders/.../T/xfs-XXXXXXXX/node) that no longer exists.
if [ ! -x "$NODE" ]; then
  RESOLVED="$(command -v "$NODE" 2>/dev/null || true)"
  if [ -n "$RESOLVED" ] && [ -x "$RESOLVED" ]; then
    NODE="$RESOLVED"
  else
    for candidate in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
      if [ -x "$candidate" ]; then
        NODE="$candidate"
        break
      fi
    done
  fi
fi
STATUS_FILE="$ROOT/status.txt"
NOW="$(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%d %H:%M:%S')"
SEP="--------------------------------------------------------------------"

if [ ! -x "$NODE" ]; then
  {
    echo "$SEP"
    echo "[$NOW Asia/Ho_Chi_Minh] FAILED (exit=127) - node binary not found (last tried: $NODE)"
  } >> "$STATUS_FILE"
  exit 127
fi

# Safety guard: only run between 07:00 and 22:00 Vietnam time,
# even if the cron daemon ignores CRON_TZ (e.g. macOS).
HOUR="$(TZ=Asia/Ho_Chi_Minh date +%H)"
if [ "$HOUR" -lt 7 ] || [ "$HOUR" -ge 22 ]; then
  {
    echo "$SEP"
    echo "[$NOW Asia/Ho_Chi_Minh] SKIPPED - outside 07:00-22:00 window"
  } >> "$STATUS_FILE"
  exit 0
fi

OUTPUT="$("$NODE" "$ROOT/scrape.js" 2>&1)"
EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
  STATUS="SUCCESS"
else
  STATUS="FAILED"
fi

# Extract the summary JSON via the greppable marker line printed by
# scrape.js (a single-line JSON.stringify), instead of guessing where the
# JSON starts/ends by scanning for the first "{" and last "}" in the whole
# output. That heuristic broke silently (empty digest) whenever any other
# log line contained a stray brace or the summary was too large.
SUMMARY_LINE="$(printf '%s\n' "$OUTPUT" | grep -m1 '^SCRAPE_SUMMARY_JSON: ')"
SUMMARY_JSON="${SUMMARY_LINE#SCRAPE_SUMMARY_JSON: }"

COUNTS="$(printf '%s' "$SUMMARY_JSON" | "$NODE" -e "
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  if (!raw.trim()) {
    console.log('WARN: summary JSON marker not found in output');
    return;
  }

  // Collapse multi-line error messages (e.g. Playwright's 'Call log:'
  // block) into a single line so every entry below stays exactly one line.
  const oneLine = (value) => String(value).replace(/\s+/g, ' ').trim();

  try {
    const s = JSON.parse(raw);
    const ok = (s.upserted || []).length;
    const failed = s.failed || [];
    const skipped = s.skipped || [];
    const cs = s.changeSummary || {};
    console.log(\`sources : \${ok} ok / \${failed.length} failed / \${skipped.length} skipped\`);
    console.log(\`changes : \${cs.changed ?? 0} changed / \${cs.unchanged ?? 0} unchanged\`);
    if (s.dbError) console.log(\`dbError : \${oneLine(s.dbError)}\`);
    for (const item of failed) {
      console.log(\`  failed  \${item.id} [\${item.stage}] \${oneLine(item.error)}\`);
    }
    for (const item of skipped) {
      console.log(\`  skipped \${item.id} [\${item.reason}]\`);
    }
    for (const table of ['gold', 'silver']) {
      const r = (s.restSync || {})[table];
      if (r && Array.isArray(r.failed) && r.failed.length > 0) {
        console.log(\`rest(\${table}) : \${r.failed.length}/\${r.attempted} failed\`);
        for (const f of r.failed) {
          console.log(\`  rest(\${table}) \${f.id} \${oneLine(f.error)}\`);
        }
      }
    }
  } catch (e) {
    console.log(\`WARN: failed to parse summary JSON - \${e.message}\`);
  }
});
" 2>/dev/null)"

{
  echo "$SEP"
  echo "[$NOW Asia/Ho_Chi_Minh] $STATUS (exit=$EXIT_CODE) - node scrape.js"
  if [ -n "$COUNTS" ]; then
    printf '%s\n' "$COUNTS" | sed 's/^/    /'
  else
    echo "    WARN: no summary output captured"
  fi
  # Full raw output is only useful when the process itself crashed (e.g. an
  # uncaught exception before/without ever printing the summary marker) —
  # on a normal run the COUNTS digest above already covers what matters.
  # Blank lines are stripped so multi-line error blocks (e.g. Playwright's
  # "Call log:" section) don't blow up the entry with empty gaps.
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "    --- raw output (last 30 non-blank lines) ---"
    echo "$OUTPUT" | tail -n 30 | sed -e 's/^/    /' -e '/^[[:space:]]*$/d'
  fi
} >> "$STATUS_FILE"

exit "$EXIT_CODE"
