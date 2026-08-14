// Template for a new SILVER source. Copy into src/sources/silver/<store_name>.js,
// rename STORE_ID_PREFIX/STORE_NAME/products/URLs, then wire the exported
// `<NAME>_SOURCES` array into SILVER_SOURCES inside src/config.js.
import * as cheerio from "cheerio";

import {
  nowVnText,
  parseSilverPriceToThousand,
  stripHtmlToText,
} from "../../utils.js";

// Silver stores usually quote the same product per unit ("luong" and "kg").
// Model each unit as its own product entry -> its own row in silver_prices,
// all sharing a single fetch of `url`.
const STORE_ID_PREFIX = "store_name"; // snake_case store slug
const PRODUCTS = [
  {
    id: `${STORE_ID_PREFIX}_bac_thoi_luong`,
    name: "Store Name (Bạc thỏi 999 1 Lượng)",
    label: "Bạc thỏi 999 1 Lượng",
    aliases: ["Bạc thỏi 1 lượng"],
    unit: "luong",
  },
  {
    id: `${STORE_ID_PREFIX}_bac_thoi_kg`,
    name: "Store Name (Bạc thỏi 999 1 KG)",
    label: "Bạc thỏi 999 1 KG",
    aliases: ["Bạc thỏi 1 kg"],
    unit: "kg",
  },
  // ...add more products/units as needed
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

// Prefer this over flattened-text regex: flattening HTML can corrupt
// thousand separators (e.g. "16.600" -> "16 600").
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
    // Use the shared silver-price normalizer: it auto-detects whether the
    // number is already in thousand-VND or full VND.
    const buy = parseSilverPriceToThousand(cells[1]);
    const sell = parseSilverPriceToThousand(cells[2]);
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
  url: "https://example.com/gia-bac-hom-nay/", // direct origin URL, never r.jina.ai
  webUrl: "https://example.com/gia-bac-hom-nay/",
  location: "Tỉnh/Thành phố",
  unit: product.unit,
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product);
    return {
      buy,
      sell,
      unit: product.unit,
      lastUpdateText: parseTime(payload),
    };
  },
}));
