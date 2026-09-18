## ADDED Requirements

### Requirement: Five-Week USD Economic Calendar Scrape

The system SHALL use Playwright with the Chromium browser to scrape `https://vn.investing.com/economic-calendar` for economic events covering exactly 5 weeks: 2 weeks before the current week, the current week, and 2 weeks after the current week, where a week is anchored to the date the scrape is run.

#### Scenario: Weekly window computation

- **WHEN** the scraper starts and determines "today"
- **THEN** it computes 5 distinct Monday–Sunday week ranges (2 past, 1 current, 2 future) with no gaps or overlaps between consecutive weeks

#### Scenario: Independent per-week retrieval

- **WHEN** the scraper retrieves events for each of the 5 weeks
- **THEN** it navigates/queries the calendar for that week's date range independently, so a failure retrieving one week does not prevent retrieval of the other weeks

### Requirement: USD/US Event Filtering

The system SHALL retain only events whose country is the United States or whose currency is USD, discarding all other events scraped from the calendar page.

#### Scenario: Non-USD event discarded

- **WHEN** a scraped row has country "Germany" and currency "EUR"
- **THEN** the row is excluded from the output

#### Scenario: USD event retained

- **WHEN** a scraped row has country "United States" and currency "USD"
- **THEN** the row is retained for further processing

### Requirement: Economic Event Field Extraction

For each retained event, the system SHALL extract: event name, country, currency, date/time, actual value, forecast value, previous value, importance, period, and the event's detail/source URL from the calendar page DOM.

#### Scenario: Complete row extraction

- **WHEN** a calendar row contains all fields (name, country, currency, datetime, actual, forecast, previous, importance, period, link)
- **THEN** all fields are captured on the resulting record without loss

#### Scenario: Missing optional field handled

- **WHEN** a calendar row is missing `actual` (event not yet released)
- **THEN** the resulting record has `actual` set to `null` rather than causing an extraction failure

### Requirement: Deterministic Numeric Normalization

The system SHALL normalize `actual`, `forecast`, and `previous` raw strings into numeric `actual_value`, `forecast_value`, `previous_value` fields plus a `unit` field, using fixed, reproducible parsing rules (no randomness, no external calls).

#### Scenario: Percentage value normalized

- **WHEN** a raw value is `"3.2%"`
- **THEN** the parsed value is the number `3.2` and `unit` is `"%"`

#### Scenario: Magnitude suffix normalized

- **WHEN** a raw value is `"250K"`
- **THEN** the parsed value is the number `250000` and `unit` is `"K"`

#### Scenario: Parenthesized negative normalized

- **WHEN** a raw value is `"(1.5%)"`
- **THEN** the parsed value is the number `-1.5` and `unit` is `"%"`

#### Scenario: Unparseable or empty value

- **WHEN** a raw value is empty, missing, or not numeric-like
- **THEN** the corresponding `*_value` field is `null` while the raw string field preserves the original text or `null`

#### Scenario: Identical input yields identical output

- **WHEN** the same raw value string is normalized on two separate runs
- **THEN** the resulting numeric value and unit are identical both times

### Requirement: Hard-Coded Vietnamese Event Name Translation

The system SHALL translate each event's English name into Vietnamese using a hard-coded, static lookup table (`event_name_vi`), with no AI/LLM/translation-API calls.

#### Scenario: Mapped event name translated

- **WHEN** an event name exists as a key in the hard-coded translation map
- **THEN** `event_name_vi` is set to the mapped Vietnamese value

#### Scenario: Unmapped event name falls back

- **WHEN** an event name does not exist in the hard-coded translation map
- **THEN** `event_name_vi` falls back to the original English `event_name` and the gap is logged, without failing the run

### Requirement: Hard-Coded Event Categorization

The system SHALL assign each event a `category` using hard-coded keyword-based rules evaluated against the event name, with no AI/LLM classification calls.

#### Scenario: Keyword match assigns category

- **WHEN** an event name matches a configured category's keyword pattern (e.g. contains "CPI" or "Inflation")
- **THEN** `category` is set to the corresponding category (e.g. `"inflation"`)

#### Scenario: No keyword match falls back to default category

- **WHEN** an event name matches no configured category pattern
- **THEN** `category` is set to a default fallback category (e.g. `"other"`)

### Requirement: Stable Deterministic Event IDs and Deduplication

The system SHALL generate a deterministic `id` for each event derived from stable event attributes (event name, country, date/time, period) such that the same underlying event always produces the same `id`, and SHALL remove duplicate events sharing the same `id` before writing output.

#### Scenario: Same event produces same ID across runs

- **WHEN** the same event (same name, country, datetime, period) is scraped in two separate runs
- **THEN** the generated `id` is identical in both runs

#### Scenario: Different events produce different IDs

- **WHEN** two events differ in name, country, datetime, or period
- **THEN** their generated `id`s are different

#### Scenario: Duplicate event removed

- **WHEN** the same event is encountered more than once within a single scrape run (e.g. due to overlapping week boundaries)
- **THEN** only one instance of that event's `id` appears in the final output

### Requirement: Output Record Validation

The system SHALL validate every event record against the required output schema (required fields present, correct types, enum fields constrained to their allowed values) before including it in the written output, and SHALL exclude and log any record that fails validation rather than crashing the run.

#### Scenario: Valid record included

- **WHEN** a record has all required fields with correct types and valid enum values
- **THEN** the record is included in `data/economic_calendar.json`

#### Scenario: Invalid record excluded and logged

- **WHEN** a record fails validation (e.g. missing required field or invalid enum value)
- **THEN** the record is excluded from the output file and a validation error is logged identifying the offending event

### Requirement: JSON Output Artifact

The system SHALL write all validated, deduplicated events to `data/economic_calendar.json` as a JSON array, where each element conforms to the documented event record shape including `id`, `event_name`, `event_name_vi`, `country`, `currency`, `category`, `importance`, `event_datetime`, `event_date`, `actual`, `forecast`, `previous`, `actual_value`, `forecast_value`, `previous_value`, `unit`, `period`, `release_status`, `comparison`, `trend`, `economic_signal`, `policy_signal`, `gold_impact`, `impact_strength`, `source_url`, and `scraped_at`.

#### Scenario: Output file written on successful run

- **WHEN** the scraper completes a run with at least one valid event
- **THEN** `data/economic_calendar.json` is created or overwritten with a JSON array containing the valid, deduplicated events

#### Scenario: Field presence and format

- **WHEN** an event record is written to the output file
- **THEN** `event_datetime` and `scraped_at` are formatted as ISO-8601 strings and `event_date` is formatted as `YYYY-MM-DD`

### Requirement: Retry, Timeout, and Logging for Resilience

The system SHALL apply bounded retries with timeouts around Playwright navigation and DOM extraction steps, and SHALL emit structured log output describing scraping progress (per-week counts, filtering results, validation failures) to support debugging without requiring code changes.

#### Scenario: Transient navigation failure retried

- **WHEN** a page navigation or DOM wait fails due to a transient error (timeout, temporary network issue)
- **THEN** the operation is retried up to a configured maximum before being treated as a failure for that week

#### Scenario: Week failure does not abort entire run

- **WHEN** all retries for a single week's retrieval are exhausted
- **THEN** that week is skipped with a logged error and the scraper continues processing the remaining weeks

#### Scenario: Progress and summary logging

- **WHEN** the scraper completes a run
- **THEN** logs include, at minimum, the number of rows scraped, the number retained after USD/US filtering, the number removed as duplicates, and the number rejected by validation
