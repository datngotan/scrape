import * as cheerio from "cheerio";

import { nowVnText } from "../../utils.js";

const MLC_PRODUCTS = [
  {
    id: "mai_linh_chau_nhan_ep_vi",
    name: "Mai Linh Châu (Nhẫn ép vĩ)",
    label: "Nhẫn Ép Vỉ",
    aliases: ["Nhẫn Ép Vỉ", "Nhan Ep Vi"],
  },
  {
    id: "mai_linh_chau_trang_suc",
    name: "Mai Linh Châu (Trang sức)",
    label: "Trang Sức",
    aliases: ["Trang Sức", "Trang Suc"],
  },
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

function parsePriceToken(raw) {
  const input = String(raw || "");
  if (!input) return null;

  const normalizePrice = (digits) => {
    let n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) return null;

    // If the site emits full VND values (e.g. 15.800.000), normalize to nghin VND.
    if (n >= 1_000_000) n = Math.round(n / 1000);

    // Mai Linh Chau gold rows should be in a practical range like 15.000-20.000.
    if (n < 1_000 || n > 200_000) return null;
    return n;
  };

  const groupedMatches = input.match(/\d{1,3}(?:[.,]\d{3}){1,2}|\d{4,}/g) ?? [];
  for (const token of groupedMatches) {
    const digits = token.replace(/[^\d]/g, "");
    if (!digits) continue;

    const value = normalizePrice(digits);
    if (value != null) return value;
  }

  // Fallback for plain numeric strings while still rejecting short noisy fragments.
  const fallbackDigits = input.replace(/[^\d]/g, "");
  if (fallbackDigits.length < 4) return null;
  return normalizePrice(fallbackDigits);
}

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

    // Use trailing columns in case the table injects extra metadata columns.
    const buy = parsePriceToken(cells[cells.length - 2]);
    const sell = parsePriceToken(cells[cells.length - 1]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function isAliasMatch(label, aliases) {
  const normalizedLabel = normalizeText(label);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return (
      normalizedLabel === normalizedAlias ||
      normalizedLabel.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedLabel)
    );
  });
}

function parseBuySellByProduct(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];
  const rows = parseTableRows(payload);

  for (const row of rows) {
    if (isAliasMatch(row.label, aliases)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

export const MLC_SOURCES = MLC_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Mai Linh Châu",
  unit: "chi",
  url: "https://vangmlc.vn/",
  webUrl: "https://vangmlc.vn/",
  location: "Thanh Hóa",
  fetchOptions: {
    timeoutMs: 90_000,
    waitMs: 5_000,
    maxAttempts: 4,
    waitUntil: "commit",
  },
  parse: (payload) => {
    const { buy, sell } = parseBuySellByProduct(payload, product);
    return {
      buy,
      sell,
      lastUpdateText: nowVnText(),
    };
  },
}));
