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
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
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

    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
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
    waitMs: 4_000,
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
