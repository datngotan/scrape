## Context

The repo (`gold-scraper`) is a plain Node.js ES-module project (`"type": "module"`, no TypeScript build/tooling configured) that scrapes retail gold/silver prices via Playwright/Cheerio and writes normalized rows. We are adding an independent capability: scraping the Investing.com economic calendar (Vietnamese-locale URL `https://vn.investing.com/economic-calendar`) for US/USD-only events across a 5-week window, then running the result through a deterministic, hard-coded rule engine to derive economic/gold-impact signals. No AI/LLM calls are involved anywhere in this feature.

Constraints:

- Must reuse the existing `playwright` dependency already declared in `package.json`; no new runtime dependencies beyond what's needed for schema validation (kept dependency-free via hand-written validators, consistent with the rest of the repo which has no JSON-schema library).
- The user's request mentions `.ts` file names (`economic_signal_rules.ts`, `gold_impact_rules.ts`) but the repo has zero TypeScript tooling (no `tsconfig.json`, no `ts-node`/`tsx`/`typescript` devDependency). Introducing a TS build step for two files would add disproportionate complexity and break `"type": "module"` plain-Node execution. Decision: implement as `.js` ES modules (`economic_signal_rules.js`, `gold_impact_rules.js`) with JSDoc types, keeping the same separation of concerns the user asked for. This is called out explicitly as an Open Question below in case the user wants an actual TS toolchain added.
- Investing.com is a scrape target prone to DOM/markup churn and anti-bot friction (rate limiting, cookie/consent walls, lazy-loaded rows). The design must isolate DOM selectors and be resilient (retries, timeouts, defensive parsing) so churn only requires updating one extractor module.
- Everything must be deterministic and reproducible: no timestamps-as-randomness in IDs, no reliance on external translation/classification services.

## Goals / Non-Goals

**Goals:**

- Scrape 5 weeks of US/USD-only economic calendar events (2 past + current + 2 future) using Playwright Chromium.
- Produce a single deterministic JSON artifact `data/economic_calendar.json` matching the exact record shape specified by the user, including hard-coded Vietnamese translation, hard-coded category, deterministic ID, and dedup.
- Compute `comparison`, `trend`, `economic_signal`, `policy_signal`, `gold_impact`, `impact_strength` via explicit, per-indicator, hard-coded rules (not a generic actual-vs-forecast heuristic), falling back to `unavailable`/`neutral` when data is insufficient.
- Validate every record before writing output; invalid records are logged and dropped rather than crashing the run.
- Keep scraping logic and analysis-rule logic in separate modules so either can change independently.
- Be resilient to minor DOM changes (centralized selectors, retry + timeout wrapper, structured logs) and support local debugging (verbose logging, optional raw HTML dump on failure).

**Non-Goals:**

- No changes to existing gold/silver price scraping pipeline (`scrape.js`, `src/sources/**`, `src/config.js`).
- No AI/LLM/API calls of any kind (translation, categorization, and signal analysis are all static lookup tables / pure functions).
- No historical backfill beyond the 5-week window, no persistence/DB writes (JSON file output only).
- No UI/dashboard for the calendar data.
- No guarantee of 100% translation coverage — untranslated event names fall back to the original English text (logged as a coverage gap, not a failure).

## Decisions

### 1. Module layout

New top-level directory `src/economic-calendar/` (parallel to existing `src/sources/`) containing:

- `scraper.js` — Playwright orchestration: launch browser, navigate, iterate weeks, collect raw rows.
- `parser.js` — DOM → raw record extraction (selectors isolated here; the file most likely to need updates on DOM churn).
- `normalize.js` — numeric normalization (`parseNumericValue`), unit extraction, date/time parsing to ISO-8601, period parsing.
- `translate.js` — hard-coded `EVENT_NAME_VI_MAP` (English → Vietnamese) + lookup function with fallback to original name.
- `categorize.js` — hard-coded keyword-based category rules (ordered list of `{ pattern, category }`).
- `id.js` — deterministic ID generation (stable hash of `event_name|country|event_datetime|period`) + de-duplication.
- `validate.js` — hand-written schema validator for the output record shape (no external JSON-schema lib, mirrors patterns already used in `src/utils.js`/`src/row.js`).
- `economic_signal_rules.js` — per-indicator rules producing `comparison`, `trend`, `economic_signal`, `policy_signal`.
- `gold_impact_rules.js` — maps `economic_signal` + `policy_signal` (+ raw comparison/trend where indicator-specific) to `gold_impact`, `impact_strength`.
- `run.js` — top-level entry point wiring scrape → filter → normalize → translate → categorize → analyze → validate → dedup → write JSON; used by a new `npm run scrape:calendar` script.

Rationale: mirrors the existing repo convention of small, single-responsibility files under `src/sources/*` and keeps the "analysis" concern (explicitly requested to be separate) in its own two files, with `run.js` as the only file that imports everything.

### 2. Week navigation strategy

Investing.com's calendar page exposes date-range controls (custom date picker / "Next week" and "Previous week" buttons, or a date-range query — exact selector confirmed by live DOM inspection during implementation). Decision: compute the 5 target week boundaries (Mon–Sun) in Node using `Date` arithmetic anchored on "today", then drive the page's date-range picker (or reload with a `?dateFrom=...&dateTo=...` query if Investing.com supports it, confirmed at implementation time) for each week rather than repeatedly clicking "next" for reliability — clicking N times is stateful and fragile, whereas one explicit date range per iteration is idempotent and easy to retry independently per week. Each week's scrape is independently retried on failure so one bad week doesn't fail the whole run.

Alternatives considered:

- Clicking "Next week" 4 times from the current view — rejected: cumulative state, a single failed click corrupts all subsequent weeks, harder to retry a single week in isolation.

### 3. Numeric normalization

Deterministic parser handles: thousands separators, `%` suffix, `K`/`M`/`B` suffixes (×1e3/1e6/1e9), parentheses-as-negative (`(1.2%)` → `-1.2`), leading `+`/`-`, and `unit` extraction (`%`, `K`, `M`, `B`, or `null` for plain numbers). Unparseable/empty strings yield `null` for the `*_value` field while the raw string (or `null`) is preserved in `actual`/`forecast`/`previous`.

### 4. Vietnamese translation & categorization

Both are flat, ordered, hard-coded JS objects/arrays checked at build time by a unit test asserting no duplicate keys. Translation: exact-string map keyed by the canonical (trimmed, whitespace-collapsed) English event name; unmatched names fall back to the original English string (never blank, never AI-generated) and are logged once per run as "untranslated". Categorization: ordered array of `{ keywords: RegExp, category }`; first match wins; default category `other`.

### 5. Deterministic IDs & dedup

`id = sha256(`${event_name}|${country}|${event_datetime}|${period ?? ""}`).slice(0, 16)`. Using a hash (not e.g. incrementing counters) makes IDs stable across runs/reruns of the same underlying event, which is required to dedup identical events seen twice across overlapping week boundaries or repeated runs. Dedup is a `Map` keyed by `id`, last-seen-wins is not needed since content for the same key is expected to be identical within a single run; first-seen is kept.

### 6. Economic/gold signal rules — extensibility

`economic_signal_rules.js` exports a `RULES` registry: `Map<string indicatorKey, RuleFn>` where `indicatorKey` is derived from `category` + normalized event-name keyword matching (e.g. `cpi`, `unemployment_rate`, `nonfarm_payrolls`, `fed_rate_decision`, `gdp`, `retail_sales`, `pmi`, `housing_starts`, ...). Each `RuleFn(event) => { comparison, trend, economic_signal, policy_signal }` is a small pure function with explicit business logic (e.g. CPI: `actual > forecast` → `inflation_higher` → `hawkish`; Unemployment Rate: `actual < forecast` → `employment_stronger` → `hawkish`). A `DEFAULT_RULE` (generic comparison/trend only, `economic_signal: "unavailable"`, `policy_signal: "neutral"`) is used for indicators without a specific rule — this default never fabricates a hawkish/dovish/gold call, matching "if required values are missing/unmapped, return unavailable/neutral instead of guessing." `gold_impact_rules.js` maps `(economic_signal, policy_signal)` pairs (plus a small per-indicator override table for cases where the same policy_signal has a different gold direction, e.g. safe-haven-driven indicators) to `{ gold_impact, impact_strength }`, defaulting to `neutral` / `1` when inputs are `unavailable`/`neutral`. Both registries are plain data + pure functions, so adding a new indicator is a 5-10 line addition with no other code changes — a unit test can iterate the registry to assert every entry returns a well-formed shape.

### 7. Validation

`validate.js` exports `validateEconomicEvent(record) => { valid: boolean, errors: string[] }` checking required keys, enum membership (e.g. `comparison`, `trend`, `policy_signal`, `gold_impact`, `importance`, `release_status`), and type/format checks (ISO-8601 for datetime/date fields, `currency === "USD"`). `run.js` filters out invalid records, logging each with its errors, and continues (never throws for a single bad record — only for systemic failures like navigation timeout after retries).

### 8. Resilience: retry/timeout/logging

A small `withRetry(fn, { retries, baseDelayMs, label })` helper (new `src/economic-calendar/retry.js`, or reused if an equivalent already exists in `src/utils.js`) wraps: page navigation, per-week DOM extraction, and (if applicable) event-detail-page visits. Playwright actions use explicit timeouts (`page.goto(..., { timeout })`, `locator.waitFor({ timeout })`). Logging uses `console.log`/`console.error` with a consistent `[economic-calendar]` prefix and per-stage counts (rows scraped, rows kept after USD filter, rows deduped, rows invalid), consistent with the lightweight logging style already used in `scrape.js`. On unrecoverable failure for a given week (all retries exhausted), that week is skipped with a logged error rather than aborting the whole 5-week run, and the process exits non-zero only if zero weeks succeeded.

## Risks / Trade-offs

- **[Risk]** Investing.com DOM/selectors change or add anti-bot measures (Cloudflare/captcha) → **Mitigation**: selectors isolated in `parser.js`; retry+timeout wrapper; run logs raw failure context (URL, week range) to ease debugging; failure of one week doesn't abort the whole run.
- **[Risk]** Translation/categorization maps are inherently incomplete (new event names appear over time) → **Mitigation**: safe fallbacks (original English name; `other` category) rather than throwing; run logs a summary of unmapped names so the map can be extended over time.
- **[Risk]** Per-indicator economic rules can only cover a finite set of known indicators; new/rare indicators default to `unavailable`/`neutral` → **Mitigation**: explicitly required by the spec ("if required values are missing, return unavailable/neutral instead of guessing"); registry is designed for cheap incremental additions.
- **[Risk]** Week-boundary logic (Mon–Sun vs. site's own definition of "week") could mismatch Investing.com's own grouping → **Mitigation**: confirm exact date-range parameterization against the live site during implementation; add a unit test around the 5 computed week boundaries anchored to a fixed "today" for determinism.
- **[Trade-off]** Implementing rule/translation/category files as `.js` instead of the requested `.ts` — accepted because the repo has no TS toolchain; flagged as an open question.

## Migration Plan

This is purely additive (new directory, new npm script, new output file) — no existing code paths change. No rollback plan beyond removing `src/economic-calendar/` and the new script/output file. No data migration needed.

## Open Questions

- Should `economic_signal_rules` and `gold_impact_rules` actually be TypeScript (as literally requested) with a minimal build step (e.g. `tsx`) added to the repo, or is plain JS with JSDoc acceptable given the repo has no existing TS tooling? (Design assumes plain `.js` for now.)
- Does Investing.com's `vn.investing.com/economic-calendar` support a direct date-range query parameter/API response we can request per week, or must week navigation be done purely via UI controls? (Confirmed during implementation via live DOM inspection.)
- Should the scraper also fetch each event's detail page for extra fields, or is the calendar row (plus its own row link as `source_url`) sufficient? (Design assumes row-level data + row link is sufficient; no detail-page visits, to minimize request volume and anti-bot risk.)
