## 1. Project Scaffolding

- [ ] 1.1 Create `src/economic-calendar/` directory with empty module files: `scraper.js`, `parser.js`, `normalize.js`, `translate.js`, `categorize.js`, `id.js`, `validate.js`, `economic_signal_rules.js`, `gold_impact_rules.js`, `retry.js`, `run.js`
- [ ] 1.2 Add `scrape:calendar` script to `package.json` (e.g. `"scrape:calendar": "node src/economic-calendar/run.js"`)
- [ ] 1.3 Ensure `data/` output directory is created at runtime if missing (do not commit generated `data/economic_calendar.json`; add it to `.gitignore` if a `data/` ignore rule doesn't already cover it)

## 2. Retry/Logging Utilities

- [ ] 2.1 Implement `withRetry(fn, { retries, baseDelayMs, label })` in `retry.js` with exponential backoff and a max attempt count
- [ ] 2.2 Implement a small `[economic-calendar]`-prefixed logger helper (info/warn/error) used consistently across all modules

## 3. Week Window Computation

- [ ] 3.1 Implement a pure function in `scraper.js` (or a small `weeks.js` helper) that computes 5 Monday–Sunday week ranges (2 past, current, 2 future) anchored to "today", with unit-testable, injectable "now"
- [ ] 3.2 Add a quick manual/unit check that the 5 computed ranges have no gaps/overlaps for a few fixed reference dates

## 4. Playwright Scraping

- [ ] 4.1 Implement Chromium launch/navigation in `scraper.js` targeting `https://vn.investing.com/economic-calendar`, wrapped in `withRetry` with explicit timeouts
- [ ] 4.2 Inspect live DOM to confirm the week-selection mechanism (date-range query params vs. UI date picker vs. next/prev buttons) and implement per-week retrieval accordingly, isolating all selectors in `parser.js`
- [ ] 4.3 Implement per-week failure isolation: if a week's retries are exhausted, log the error and continue with remaining weeks (only abort if all 5 weeks fail)
- [ ] 4.4 Implement `parser.js` extraction of raw rows: event name, country, currency flag/code, raw date/time, raw actual/forecast/previous, importance (e.g. bull icon count), period, and row detail URL
- [ ] 4.5 Handle missing/optional fields defensively (e.g. `actual` absent for upcoming events) without throwing

## 5. Filtering and Normalization

- [ ] 5.1 Implement USD/US filter (country === "United States" OR currency === "USD") applied right after raw extraction
- [ ] 5.2 Implement `normalize.js`: `parseNumericValue(raw)` handling `%`, `K`/`M`/`B` suffixes, thousands separators, parentheses-as-negative, leading sign, returning `{ value: number|null, unit: string|null }`
- [ ] 5.3 Implement date/time parsing to `event_datetime` (ISO-8601) and derived `event_date` (`YYYY-MM-DD`)
- [ ] 5.4 Implement `release_status` derivation (`upcoming` | `released` | `revised`) based on presence of `actual`/whether the event datetime is in the past, per rules defined in design

## 6. Translation and Categorization

- [ ] 6.1 Implement `translate.js` with a hard-coded `EVENT_NAME_VI_MAP` covering common US indicators (CPI, Core CPI, Unemployment Rate, Nonfarm Payrolls, Fed Rate Decision, GDP, Retail Sales, PMI, Housing Starts, Initial Jobless Claims, PCE, etc.) plus a lookup function that falls back to the original English name and logs unmapped names once per run
- [ ] 6.2 Implement `categorize.js` with an ordered `{ pattern: RegExp, category }` list (inflation, employment, monetary_policy, growth, housing, trade, sentiment, manufacturing, other) and a function returning the first match or `"other"`
- [ ] 6.3 Add a small startup check (or unit test) that both `EVENT_NAME_VI_MAP` keys and the categorization pattern list contain no accidental duplicates

## 7. Deterministic IDs and Deduplication

- [ ] 7.1 Implement `id.js`: `generateEventId(event)` using a stable hash (e.g. Node `crypto.createHash("sha256")`) over `event_name|country|event_datetime|period`
- [ ] 7.2 Implement de-duplication (`Map` keyed by `id`, first-seen-wins) applied across all 5 weeks' combined results before validation/output

## 8. Economic Signal Rules

- [ ] 8.1 Implement `economic_signal_rules.js` with a `RULES` registry keyed by indicator (derived from category + event-name keyword matching), each entry a pure function `(event) => { comparison, trend, economic_signal, policy_signal }`
- [ ] 8.2 Implement rules for at least: CPI/Core CPI (`inflation_higher`/`inflation_lower` → hawkish/dovish), Unemployment Rate (`employment_stronger`/`employment_weaker` → hawkish/dovish), Nonfarm Payrolls (same pattern), Fed Rate Decision (`hawkish`/`dovish` from actual vs. forecast rate), GDP (growth stronger/weaker → hawkish/dovish), Retail Sales, PMI
- [ ] 8.3 Implement a `DEFAULT_RULE` for unregistered indicators returning `comparison`/`trend` computed generically (still deterministic, from numeric comparison) but `economic_signal: "unavailable"`, `policy_signal: "neutral"`
- [ ] 8.4 Implement shared `comparison`/`trend` computation helpers used by all rules, handling `null` inputs by returning `"unavailable"`

## 9. Gold Impact Rules

- [ ] 9.1 Implement `gold_impact_rules.js` with a mapping from `(policy_signal, economic_signal, indicator)` to `{ gold_impact, impact_strength }`, plus a default `{ gold_impact: "neutral", impact_strength: 1 }` for `neutral`/`unavailable` inputs
- [ ] 9.2 Implement impact-strength weighting so high-importance indicators (e.g. CPI, Fed Rate Decision, Nonfarm Payrolls) can reach `2`/`3` while low-importance ones cap lower, per a hard-coded importance-to-strength table
- [ ] 9.3 Add unit tests asserting the mapping is a pure function with no network/AI calls and produces identical output for identical input

## 10. Validation

- [ ] 10.1 Implement `validate.js`: `validateEconomicEvent(record)` checking required fields, types, and enum membership (`comparison`, `trend`, `policy_signal`, `gold_impact`, `release_status`, `importance`, `currency === "USD"`, ISO-8601 format for datetime fields)
- [ ] 10.2 Wire validation into `run.js` so invalid records are excluded and logged with specific error reasons, without aborting the run

## 11. Orchestration and Output

- [ ] 11.1 Implement `run.js` wiring: compute weeks → scrape each week (retry-wrapped) → flatten rows → USD/US filter → normalize → translate → categorize → generate ID → dedup → compute economic signal → compute gold impact → validate → sort (e.g. by `event_datetime`) → write `data/economic_calendar.json`
- [ ] 11.2 Add summary logging at end of run: total scraped, retained after filter, duplicates removed, validation failures, final written count
- [ ] 11.3 Ensure the browser/context is always closed (try/finally) even on error paths

## 12. Verification

- [ ] 12.1 Run `npm run scrape:calendar` locally against the live site and confirm `data/economic_calendar.json` is produced with well-formed records spanning the 5-week window, USD/US only
- [ ] 12.2 Spot-check several known indicators (CPI, Unemployment Rate, Nonfarm Payrolls, Fed Rate Decision) in the output to confirm `economic_signal`/`policy_signal`/`gold_impact` match the hard-coded rule expectations from the design doc
- [ ] 12.3 Confirm re-running the scraper produces identical `id`s for unchanged events (determinism check) and that no duplicate `id`s exist in the output
- [ ] 12.4 Confirm records with missing actual/forecast/previous values surface `unavailable`/`neutral` rather than fabricated signals
