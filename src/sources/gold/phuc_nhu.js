import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const PHUC_NHU_PRODUCTS = [
  {
    id: "phuc_nhu_vang_9999_24k",
    name: "Phúc Nhu (Vàng 9999 24K)",
    label: "Vàng 9999 Phúc Nhu (24K)",
  },
  {
    id: "phuc_nhu_nhan_999_24k",
    name: "Phúc Nhu (Nhẫn 999 24K)",
    label: "Nhẫn Phúc Nhu 999 24k",
  },
  {
    id: "phuc_nhu_trang_suc_995",
    name: "Phúc Nhu (Trang sức PN 995)",
    label: "Trang sức PN 995",
  },
  {
    id: "phuc_nhu_trang_suc_999_24k",
    name: "Phúc Nhu (Trang sức PN 999 24K)",
    label: "Trang sức PN 999 24k",
  },
  {
    id: "phuc_nhu_trang_suc_9999_24k",
    name: "Phúc Nhu (Trang sức PN 9999 24K)",
    label: "Trang sức PN 9999 (24K)",
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

  // Keep DB unit in thousands if source ever emits full VND values.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
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

function parseBuySellByLabel(payload, label) {
  const normalizedLabel = normalizeText(label);

  const rows = parseTableRows(payload);
  for (const row of rows) {
    if (normalizeText(row.label) === normalizedLabel) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Example: "Cập nhật: 2026-03-23 19:35:02"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const PHUC_NHU_SOURCES = PHUC_NHU_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Phúc Nhu",
  unit: "luong",
  url: "https://giavangmaothiet.com/gia-vang-phuc-nhu-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-phuc-nhu-hom-nay/",
  location: "Hải Phòng",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
