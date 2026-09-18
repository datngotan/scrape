## ADDED Requirements

### Requirement: Deterministic Comparison and Trend Computation

The system SHALL compute a `comparison` value (`above_forecast` | `below_forecast` | `in_line` | `unavailable`) from `actual_value` vs. `forecast_value`, and a `trend` value (`improved` | `weakened` | `unchanged` | `unavailable`) from `actual_value` vs. `previous_value`, using fixed deterministic numeric comparisons with no AI-generated reasoning.

#### Scenario: Actual above forecast

- **WHEN** `actual_value` is greater than `forecast_value`
- **THEN** `comparison` is `"above_forecast"`

#### Scenario: Actual below forecast

- **WHEN** `actual_value` is less than `forecast_value`
- **THEN** `comparison` is `"below_forecast"`

#### Scenario: Actual equals forecast

- **WHEN** `actual_value` equals `forecast_value`
- **THEN** `comparison` is `"in_line"`

#### Scenario: Comparison unavailable

- **WHEN** `actual_value` or `forecast_value` is `null`
- **THEN** `comparison` is `"unavailable"`

#### Scenario: Trend computed against previous value

- **WHEN** `actual_value` and `previous_value` are both present and differ
- **THEN** `trend` is `"improved"` or `"weakened"` according to the event's specific rule definition of improvement (not a blanket "higher is better")

#### Scenario: Trend unavailable

- **WHEN** `actual_value` or `previous_value` is `null`
- **THEN** `trend` is `"unavailable"`

### Requirement: Event-Specific Hard-Coded Economic Signal Rules

The system SHALL derive `economic_signal` and `policy_signal` (`hawkish` | `dovish` | `neutral`) using hard-coded, per-indicator rule functions defined in `economic_signal_rules` (registered by indicator, e.g. CPI, Unemployment Rate, Nonfarm Payrolls, Fed Rate Decision, GDP), rather than a single generic rule applied uniformly to all events. Rules MUST consider what "higher" or "lower" means for that specific indicator.

#### Scenario: CPI actual above forecast is hawkish

- **WHEN** the event is a CPI/inflation indicator and `actual_value` is greater than `forecast_value`
- **THEN** `economic_signal` is `"inflation_higher"` and `policy_signal` is `"hawkish"`

#### Scenario: Unemployment Rate actual below forecast is hawkish

- **WHEN** the event is the Unemployment Rate indicator and `actual_value` is less than `forecast_value`
- **THEN** `economic_signal` is `"employment_stronger"` and `policy_signal` is `"hawkish"`

#### Scenario: Nonfarm Payrolls actual above forecast is hawkish

- **WHEN** the event is the Nonfarm Payrolls indicator and `actual_value` is greater than `forecast_value`
- **THEN** `economic_signal` is `"employment_stronger"` and `policy_signal` is `"hawkish"`

#### Scenario: Fed Rate Decision higher than expected is hawkish

- **WHEN** the event is the Fed Rate Decision indicator and `actual_value` is greater than `forecast_value`
- **THEN** `policy_signal` is `"hawkish"`

#### Scenario: Fed Rate Decision lower than expected is dovish

- **WHEN** the event is the Fed Rate Decision indicator and `actual_value` is less than `forecast_value`
- **THEN** `policy_signal` is `"dovish"`

#### Scenario: Indicator without a specific rule defaults safely

- **WHEN** an event's indicator has no registered rule in `economic_signal_rules`
- **THEN** `economic_signal` is `"unavailable"` and `policy_signal` is `"neutral"`, without guessing a directional signal

#### Scenario: Missing required values yield unavailable/neutral

- **WHEN** the values required by an indicator's specific rule (`actual_value` and/or `forecast_value`/`previous_value`) are `null`
- **THEN** `economic_signal` is `"unavailable"` and `policy_signal` is `"neutral"` for that event

#### Scenario: Rule considers both forecast and previous where available

- **WHEN** an indicator's registered rule defines logic using both `actual vs forecast` and `actual vs previous`
- **THEN** both comparisons are evaluated by that rule and inform the resulting `economic_signal`

### Requirement: Gold Impact Derivation Isolated From Economic Signal Rules

The system SHALL compute `gold_impact` (`positive` | `negative` | `neutral`) and `impact_strength` (`1` | `2` | `3`) from the already-computed `economic_signal` and `policy_signal` using rules defined in a separate `gold_impact_rules` module, kept independent of the Playwright scraping logic and of `economic_signal_rules`.

#### Scenario: Hawkish signal maps to negative gold impact

- **WHEN** `policy_signal` is `"hawkish"` for an indicator whose registered gold-impact mapping treats hawkish as negative for gold
- **THEN** `gold_impact` is `"negative"`

#### Scenario: Dovish signal maps to positive gold impact

- **WHEN** `policy_signal` is `"dovish"` for an indicator whose registered gold-impact mapping treats dovish as positive for gold
- **THEN** `gold_impact` is `"positive"`

#### Scenario: Neutral or unavailable signal maps to neutral gold impact

- **WHEN** `policy_signal` is `"neutral"` or `economic_signal` is `"unavailable"`
- **THEN** `gold_impact` is `"neutral"` and `impact_strength` is `1`

#### Scenario: Impact strength reflects indicator importance and signal magnitude

- **WHEN** a gold-impact-positive or gold-impact-negative signal is computed for a high-importance indicator
- **THEN** `impact_strength` is assigned `2` or `3` per the hard-coded mapping table rather than always defaulting to `1`

### Requirement: No AI-Generated or Generic Heuristic Analysis

The system SHALL NOT use any AI/LLM call, external API, or a single generic "actual greater than forecast is good/bad" heuristic applied uniformly across all indicators to compute `comparison`, `trend`, `economic_signal`, `policy_signal`, `gold_impact`, or `impact_strength`. All analysis MUST be produced by deterministic, hard-coded, event-specific rule functions.

#### Scenario: Same input always produces same analysis output

- **WHEN** an event with identical `actual_value`, `forecast_value`, `previous_value`, and indicator type is analyzed twice
- **THEN** the resulting `comparison`, `trend`, `economic_signal`, `policy_signal`, `gold_impact`, and `impact_strength` are identical both times

#### Scenario: Rule modules contain no network or AI calls

- **WHEN** `economic_signal_rules` or `gold_impact_rules` execute
- **THEN** no network request, external API call, or AI/LLM invocation occurs as part of computing their output

### Requirement: Extensible Rule Registries

The system SHALL structure `economic_signal_rules` and `gold_impact_rules` as extensible registries (e.g. keyed collections of small rule functions/entries) such that adding a new indicator-specific rule or adjusting an existing one requires only a localized addition/edit within the relevant registry, without modifying scraping logic or other indicators' rules.

#### Scenario: Adding a new indicator rule does not affect existing indicators

- **WHEN** a new entry is added to the `economic_signal_rules` registry for a previously unhandled indicator
- **THEN** the behavior of all other already-registered indicators remains unchanged

#### Scenario: Analysis logic remains separate from scraping logic

- **WHEN** the scraping/extraction logic (Playwright navigation, DOM parsing) changes
- **THEN** no changes are required in `economic_signal_rules` or `gold_impact_rules` for the analysis output to remain correct, and vice versa
