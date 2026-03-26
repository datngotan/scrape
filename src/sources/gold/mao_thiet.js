import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const MAO_THIET_PRODUCTS = [
  {
    id: "mao_thiet_nhan_tron_9999",
    name: "Mão Thiệt (Vàng Nhẫn Trơn 9999)",
    label: "Vàng Nhẫn Trơn Mão Thiệt 9999 (24k / 1 chỉ)",
  },
  {
    id: "mao_thiet_trang_suc_23k",
    name: "Mão Thiệt (Vàng Trang Sức 23K)",
    label: "Vàng Trang Sức 23K",
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

  // Site format: "Cập nhật lúc: 2026-03-18 20:06:03"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const MAO_THIET_SOURCES = MAO_THIET_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Mão Thiệt",
  url: "https://giavangmaothiet.com/",
  webUrl: "https://giavangmaothiet.com/",
  location: "Hưng Yên, Thái Bình, Hà Nội",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
