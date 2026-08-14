---
name: add-price-source
description: "Add a new gold or silver price source to this scraper given a store URL and product name(s). Use when asked to add/create/integrate a new gold source, silver source, price source, vendor, shop, or store into the scraper, or to scrape a new URL for gold_prices/silver_prices. Covers inspecting the target page, writing the parser file under src/sources/gold or src/sources/silver, registering it in src/config.js, and verifying scraped values."
---

# Add a New Gold/Silver Price Source

## When to Use

- User gives a store URL (and optionally product names/labels) and asks to add it as a new gold or silver source.
- User asks to "scrape [store]", "add a new source", "integrate [vendor]" into the price scraper.

## Architecture Recap

- Each source is a plain object: `{ id, name, storeName, url, webUrl, location, unit?, fetchOptions?, parse(payload) }`.
- Gold sources live in `src/sources/gold/<name>.js`, silver in `src/sources/silver/<name>.js`. Each file exports an array constant, e.g. `export const FOO_SOURCES = [...]`.
- Register the new array in [src/config.js](../../../src/config.js): import it, then spread it into `GOLD_SOURCES` or `SILVER_SOURCES`. Comment out (don't delete) an entry instead of removing it if a source needs to be temporarily disabled — follow the existing `// ...ANH_MINH_SILVER_SOURCES,` pattern.
- `src/index.js` fetches each source's `url` via Playwright (`fetchHtml`, see [src/fetch.js](../../../src/fetch.js)) and caches the raw HTML/payload per normalized URL, so multiple products from the _same page_ should be modeled as one `PRODUCTS` array mapped to multiple source entries (one fetch, many rows) — see [src/sources/gold/lam_ngoc_thanh.js](../../../src/sources/gold/lam_ngoc_thanh.js) as the reference pattern.
- `source.parse(payload)` must return `{ buy, sell, lastUpdateText, unit? }`. [src/row.js](../../../src/row.js) rounds buy/sell and rejects the row (returns `null`, source gets `skipped`) unless `0 <= buy,sell <= 1_000_000` — prices are stored in **thousand-VND units**, so a raw price like `123.700.000` or `17.300.000` must be divided by 1000 before returning.
- Never use the `r.jina.ai` proxy — always use the site's direct origin URL (project policy, see repo memory).

## Procedure

### 1. Gather inputs

Confirm with the user (or infer from the given URL/page) for each product to track:

- Store display name (`storeName`) and its province/city (`location`).
- The exact on-page label/name text for each product row (e.g. "Nhẫn ép vỉ 999.9", "Vàng nữ trang 97").
- For silver: the unit per product — `"luong"` or `"kg"` (see `SILVER_UNITS` in [src/types.js](../../../src/types.js)). Silver stores usually have two rows per product (1 lượng and 1 kg) → two source entries.
- Whether the URL is a full webpage (HTML table) or a JSON/AJAX endpoint (like Anh Minh's `admin-ajax.php`).

If any of this is missing, ask the user before writing the parser.

### 2. Inspect the target page

Use [scripts/inspect_source.mjs](./scripts/inspect_source.mjs) to fetch the URL with the project's own Playwright fetcher and dump every `<tr>` as a row of cell texts (or raw payload if no tables are found):

```bash
node .github/skills/add-price-source/scripts/inspect_source.mjs "https://example.com/gia-vang-hom-nay/"
```

Read the output to identify: which `<tr>` rows contain product labels + buy/sell prices, the column order (label, buy, sell — sometimes with extra columns like spread), the "last updated" text format, and how large the raw numbers are (whole VND vs already-in-thousands).

### 3. Write the source file

Copy the closest template and adapt it:

- HTML table page → [assets/gold-source.template.js](./assets/gold-source.template.js) (gold) or [assets/silver-source.template.js](./assets/silver-source.template.js) (silver).
- Prefer parsing `<tr>/<td>` via `cheerio` first (`import * as cheerio from "cheerio"` — never a default import), falling back to flattened-text regex only if needed. Flattening HTML to plain text before parsing numbers can corrupt thousand separators (e.g. "16.600" → "16 600"); parse numbers straight from `<td>` cell text instead.
- `id`: snake_case, prefixed with the store name, e.g. `store_name_product_variant`.
- `name`: `"Store Name (Product Label)"` for display.
- Price parsing: strip non-digits, and if the resulting number is `>= 1_000_000`, divide by 1000 (raw full-VND page) — see `parsePriceToken` in [src/sources/gold/lam_ngoc_thanh.js](../../../src/sources/gold/lam_ngoc_thanh.js). For silver, prefer the shared helpers `parseSilverPriceToThousand` / `toVndThousand` / `parseSilverBuySellByNeedle` from [src/utils.js](../../../src/utils.js) instead of re-implementing.
- `lastUpdateText`: return a string formatted as `"HH:MM:SS dd/mm/yyyy"` parsed from the page's own timestamp, falling back to `nowVnText()` (from `src/utils.js`) if the page doesn't expose one. This gets converted to ISO by `parseVnToIso` in [src/time.js](../../../src/time.js) — unrecognized formats become `null` silently, so match one of the patterns there or extend it.
- Support label drift with an `aliases` array per product and case/diacritic-insensitive matching (normalize: lowercase, strip diacritics, `đ`→`d`, collapse non-alphanumerics) — see `normalizeText`/`isAliasMatch` in [src/sources/gold/chien_minh.js](../../../src/sources/gold/chien_minh.js).
- If the site is JSON/AJAX-based, look at [src/sources/gold/anh_minh.js](../../../src/sources/gold/anh_minh.js) for the pattern (try parsing JSON directly, then embedded-JSON-in-HTML `<pre>`, then HTML table, then pipe-text, then regex — in that fallback order).

### 4. Register the source

Edit [src/config.js](../../../src/config.js):

1. Add an import: `import { FOO_SOURCES } from "./sources/gold/foo.js";` (or `silver/foo.js`).
2. Spread it into `GOLD_SOURCES` or `SILVER_SOURCES`.

### 5. Verify

Write/run a throwaway script (pattern like files in `tmp/`) that imports the new `*_SOURCES` array, calls `fetchHtml(source.url, source.fetchOptions ?? {})`, then `source.parse(payload)` for each entry, and prints `buy`/`sell`/`lastUpdateText`. Confirm:

- `buy`/`sell` are plausible thousand-VND numbers (gold ~ 5,000–200,000; silver ~ 500–2,000 depending on unit).
- `lastUpdateText` matches `HH:MM:SS dd/mm/yyyy`.
- Every product resolves (no `null` buy/sell) — if a label isn't matching, log the parsed table rows to debug alias/normalization issues.

Delete the throwaway script when done (or keep it under `tmp/` for future debugging, consistent with existing files there).

### 6. Record quirks

If the site has a non-obvious quirk (multi-board pages, OCR-only images, ajax endpoints, label drift, non-standard number formats), append a short bullet to repo memory (`/memories/repo/scraping-notes.md`) so future additions reuse the finding.
