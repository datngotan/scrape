## Why

The scraper currently tracks gold/silver retail prices only. There is no visibility into the US macroeconomic events (CPI, NFP, Fed rate decisions, etc.) that drive gold price movements, making it hard to correlate price changes with market-moving news. We need a deterministic (no AI/LLM) scraper that pulls US-only economic calendar data from Investing.com and pre-computes a hawkish/dovish/gold-impact signal for each event so downstream consumers can reason about price drivers without manual lookup.

## What Changes

- Add a Playwright-based scraper that loads `https://vn.investing.com/economic-calendar`, walks 5 weeks (2 past + current + 2 next) via the page's week navigation controls, and extracts every event row (name, country, currency, date/time, actual, forecast, previous, importance, period, event detail URL).
- Filter results to only USD/US events.
- Normalize numeric fields (`%`, `K`, `M`, `B`, commas, parentheses-as-negative) into deterministic `*_value` numbers plus an extracted `unit`.
- Translate event names to Vietnamese via a hard-coded lookup table (`event_name_vi`), falling back to the original English name when no mapping exists.
- Categorize events (e.g. `inflation`, `employment`, `monetary_policy`, `growth`, `housing`, `trade`, `sentiment`, `other`) via hard-coded keyword rules.
- Generate a stable, deterministic event ID (hash of event name + country + date/time + period) and de-duplicate events on that ID.
- Implement deterministic, event-specific economic/gold analysis rules (no generic `actual > forecast` heuristic) in two isolated rule modules:
  - `economic_signal_rules` — computes `comparison`, `trend`, `economic_signal`, `policy_signal`.
  - `gold_impact_rules` — computes `gold_impact`, `impact_strength` from the economic signal + policy signal.
- Validate every output record against a schema before writing; drop/log invalid records instead of crashing.
- Write the deduplicated, validated, sorted event list to `data/economic_calendar.json`.
- Add retry/timeout handling around Playwright navigation and DOM extraction, plus structured logging for scraping progress, filtering, and validation failures.

### Non-goals

- No changes to the existing gold/silver price sources or `scrape.js` pipeline.
- No AI/LLM calls of any kind — all translation, categorization, and signal analysis are hard-coded lookup tables / rule functions.
- No historical backfill beyond the 5-week window described above.

## Capabilities

### New Capabilities

- `economic-calendar-scraping`: Playwright-driven extraction of US economic calendar events from Investing.com across a 5-week window, including navigation, DOM parsing, filtering to USD/US, numeric normalization, Vietnamese translation, categorization, deterministic ID generation, deduplication, validation, and JSON output.
- `economic-signal-analysis`: Deterministic, event-specific rule engine that derives `comparison`, `trend`, `economic_signal`, `policy_signal`, `gold_impact`, and `impact_strength` from `actual`/`forecast`/`previous` values, kept separate from scraping logic and easily extensible with new per-event rules.

### Modified Capabilities

- (none — this is an additive, independent feature; no existing capability specs exist yet in `openspec/specs/`)

## Impact

- **New code**: new source directory for the economic calendar scraper (e.g. `src/economic-calendar/`) with a Playwright page-object/extractor, a translation map, a categorization map, ID/dedup utilities, a validation schema, and the two rule modules described above; a new entry script/CLI to run the scrape.
- **New dependency surface**: reuses the existing `playwright` dependency already in `package.json`; no new npm packages required.
- **New output artifact**: `data/economic_calendar.json` (new file/directory, does not touch existing `data/` outputs if any exist for gold/silver).
- **No impact** on `src/sources/gold/**`, `src/sources/silver/**`, `src/config.js`, `scrape.js`, or the cron scripts.
