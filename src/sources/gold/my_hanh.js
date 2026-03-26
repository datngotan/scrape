import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const MY_HANH_PRODUCTS = [
  {
    id: "my_hanh_9999",
    name: "Mỹ Hạnh (Vàng MH 9999)",
    label: "Vàng MH 9999",
    aliases: ["Vàng MH 9999", "Vang MH 9999", "MH 9999"],
  },
  {
    id: "my_hanh_trang_suc_24k",
    name: "Mỹ Hạnh (Trang Sức 24k)",
    label: "Trang Sức 24k",
    aliases: ["Trang Sức 24k", "Trang Suc 24k", "TS 24K", "Trang Sức MH 24k"],
  },
  {
    id: "my_hanh_trang_suc_18k",
    name: "Mỹ Hạnh (Trang Sức MH 18k)",
    label: "Trang Sức MH 18k",
    aliases: [
      "Trang Sức MH 18k",
      "Trang Sức 18k",
      "Trang Suc MH 18k",
      "TS 18K",
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
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTableRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("table.goldbox-table tbody tr, table tbody tr, tr").each((_, row) => {
    const cells = $(row)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length >= 3) {
      rows.push({
        label: cells[0],
        buy: parsePriceToken(cells[1]),
        sell: parsePriceToken(cells[2]),
      });
    }
  });

  return rows.filter((r) => r.buy != null && r.sell != null);
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

  if (productId === "my_hanh_9999") {
    return normalizedLabel.includes("9999");
  }
  if (productId === "my_hanh_trang_suc_24k") {
    return normalizedLabel.includes("24k");
  }
  if (productId === "my_hanh_trang_suc_18k") {
    return normalizedLabel.includes("18k");
  }

  return false;
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];

  // Primary: parse structured table cells from HTML.
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

  // Fallback: parse flattened text rows (e.g., markdown/plain-text mirrors).
  const text = stripHtmlToText(payload);
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const normalizedLine = normalizeText(line);
    const hasAlias = aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return normalizedLine.includes(normalizedAlias);
    });
    if (!hasAlias) continue;

    const priceTokens = line.match(/\d{1,3}(?:[.,]\d{3})+|\d{4,6}/g) ?? [];
    const prices = priceTokens.map(parsePriceToken).filter((n) => n != null);
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

export const MY_HANH_SOURCES = MY_HANH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Mỹ Hạnh",
  url: "https://giavangmaothiet.com/gia-vang-my-hanh-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-my-hanh-hom-nay/",
  location: "Hà Nội",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
