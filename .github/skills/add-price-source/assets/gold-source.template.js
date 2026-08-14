// Template for a new GOLD source. Copy into src/sources/gold/<store_name>.js,
// rename STORE_ID_PREFIX/STORE_NAME/products/URLs, then wire the exported
// `<NAME>_SOURCES` array into GOLD_SOURCES inside src/config.js.
import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

// One page can list several products (e.g. different karats/rings). Each
// entry below becomes one row in the gold_prices table, all sharing a single
// fetch of `url` (payloads are cached per normalized URL in src/index.js).
const STORE_ID_PREFIX = "store_name"; // snake_case store slug
const PRODUCTS = [
  {
    id: `${STORE_ID_PREFIX}_nhan_9999`,
    name: "Store Name (Nhẫn 999.9)",
    label: "Nhẫn 999.9", // exact/primary label as it appears on the page
    aliases: ["Nhẫn tròn 999.9", "Nhan 999.9"], // optional label drift variants
  },
  // ...add one entry per product row on the page
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isAliasMatch(label, aliases) {
  const normalizedLabel = normalizeText(label);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) return false;
    return (
      normalizedLabel === normalizedAlias ||
      normalizedLabel.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedLabel)
    );
  });
}

// Prices on most sites are full VND (e.g. 79300000); the DB stores
// thousand-VND (79300). Divide by 1000 when the raw number is that large.
function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

// Parse every <tr> on the page into [label, buy, sell] cell text. Prefer
// this over flattened-text regex: flattening HTML can corrupt thousand
// separators (e.g. "16.600" -> "16 600").
function parseTableRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;
    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];
  const rows = parseTableRows(payload);

  for (const row of rows) {
    if (isAliasMatch(row.label, aliases)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

// Adapt the regex below to the page's actual "last updated" text format.
// Must resolve to "HH:MM:SS dd/mm/yyyy" so src/time.js parseVnToIso can
// convert it to ISO; fall back to nowVnText() if unavailable/unrecognized.
function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const m = text.match(
    /Cập\s*nhật\s*(?:lúc)?\s*:?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(?:ngày\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = m[3] ?? "00";
    const dd = m[4].padStart(2, "0");
    const mm = m[5].padStart(2, "0");
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const STORE_NAME_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Store Display Name",
  url: "https://example.com/gia-vang-hom-nay/", // direct origin URL, never r.jina.ai
  webUrl: "https://example.com/gia-vang-hom-nay/",
  location: "Tỉnh/Thành phố",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
