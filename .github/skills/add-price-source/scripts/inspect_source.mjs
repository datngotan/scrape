#!/usr/bin/env node
// Fetches a URL the same way the scraper does (Playwright via src/fetch.js)
// and dumps every <tr> as a row of cell texts, to help identify product
// labels/prices/last-updated formats before writing a new source parser.
//
// Usage:
//   node .github/skills/add-price-source/scripts/inspect_source.mjs "<url>"
//
// Run from anywhere inside the repo; paths below are relative to this file.
import * as cheerio from "cheerio";

import { fetchHtml } from "../../../../src/fetch.js";

const url = process.argv[2];
if (!url) {
  console.error(
    'Usage: node inspect_source.mjs "<url>"\n' +
      "Fetches the page and prints table rows to help identify product labels/prices.",
  );
  process.exit(1);
}

const html = await fetchHtml(url);
console.log(`Fetched ${html.length} chars from ${url}\n`);

const $ = cheerio.load(html);
const rows = [];

$("tr").each((_, tr) => {
  const cells = $(tr)
    .find("th,td")
    .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  if (cells.length > 0) rows.push(cells);
});

if (rows.length === 0) {
  console.log(
    "No <tr> rows found. Page may be JSON/AJAX-based or render via client-side JS.\n" +
      "Dumping a text snippet instead (first 4000 chars of stripped text):\n",
  );
  const text = $("body").text().replace(/\s+/g, " ").trim();
  console.log(text.slice(0, 4000));
} else {
  console.log(`Found ${rows.length} table rows:\n`);
  rows.forEach((cells, i) => {
    console.log(`[${i}] ${JSON.stringify(cells)}`);
  });
}

// Best-effort scan for common "last updated" phrasing to help design parseTime().
const bodyText = $("body").text().replace(/\s+/g, " ").trim();
const updateHints = bodyText.match(
  /(cập\s*nhật|ngày\s*cập\s*nhật|giờ\s*cập\s*nhật)[^.]{0,80}/gi,
);
if (updateHints) {
  console.log("\nPossible last-updated text hints:");
  updateHints.slice(0, 5).forEach((hint) => console.log(`  - ${hint}`));
}
