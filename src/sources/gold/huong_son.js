import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const HUONG_SON_PRODUCTS = [
  {
    id: "huong_son_vang_999_lan_7",
    name: "Hương Sơn (Vàng 99.9)",
    label: "Vàng 9999 Hương Sơn",
    aliases: ["Vàng 9999 Hương Sơn", "Vàng 99.9 HS", "Vàng 99 9 HS"],
  },
  {
    id: "huong_son_vang_950",
    name: "Hương Sơn (Vàng 950)",
    label: "Vàng 950 Hương Sơn",
    aliases: [
      "Vàng 950 Hương Sơn",
      "Trần 950 HS",
      "Trơn 950 HS",
      "Tran 950 HS",
    ],
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

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Prices are presented in full VND (e.g. 16650000); store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseTableRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("table.goldbox-table tbody tr, table tbody tr, tr").each((_, tr) => {
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

function isProductIdMatch(label, productId) {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return false;

  if (productId === "huong_son_vang_999_lan_7") {
    return (
      normalizedLabel.includes("99 9") ||
      normalizedLabel.includes("9999") ||
      normalizedLabel.includes("99.9")
    );
  }

  if (productId === "huong_son_vang_950") {
    return normalizedLabel.includes("950");
  }

  return false;
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];

  const rows = parseTableRows(payload);
  for (const row of rows) {
    if (
      !isAliasMatch(row.label, aliases) &&
      !isProductIdMatch(row.label, product.id)
    ) {
      continue;
    }

    return { buy: row.buy, sell: row.sell };
  }

  // Fallback for plain text/markdown mirrors.
  const text = stripHtmlToText(payload);
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const normalizedLine = normalizeText(line);
    const hasAlias = aliases.some((alias) =>
      normalizedLine.includes(normalizeText(alias)),
    );
    if (!hasAlias) continue;

    const tokens = line.match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [];
    const prices = tokens.map(parsePriceToken).filter((n) => n != null);
    if (prices.length >= 2) {
      return { buy: prices[0], sell: prices[1] };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const HUONG_SON_SOURCES = HUONG_SON_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Hương Sơn",
  url: "https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  location: "Ninh Bình",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product);

    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
