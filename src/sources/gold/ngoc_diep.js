import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const NGOC_DIEP_URL = "https://www.vangbacdn.com/stores/ngocdiep";

const NGOC_DIEP_PRODUCTS = [
  {
    id: "ngoc_diep_vang_9999",
    name: "Ngọc Diệp (Vàng 9999)",
    label: "Vàng 9999",
  },
  {
    id: "ngoc_diep_vang_98",
    name: "Ngọc Diệp (Vàng 98%)",
    label: "Vàng 98%",
  },
  {
    id: "ngoc_diep_vang_96",
    name: "Ngọc Diệp (Vàng 96%)",
    label: "Vàng 96%",
  },
  {
    id: "ngoc_diep_nu_trang_98",
    name: "Ngọc Diệp (Nữ trang 98%)",
    label: "Nữ trang 98%",
  },
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  return n >= 1_000_000 ? Math.round(n / 1000) : n;
}

function extractRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    // Page rows are typically: [label, type, buy, sell, spread].
    // Prefer explicit buy/sell columns and keep a fallback for 3-col layouts.
    const buy =
      parsePriceToken(cells[2]) ??
      parsePriceToken(cells[1]) ??
      parsePriceToken(cells[cells.length - 2]);
    const sell =
      parsePriceToken(cells[3]) ??
      parsePriceToken(cells[2]) ??
      parsePriceToken(cells[cells.length - 1]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function parseByLabel(payload, label) {
  const target = normalizeText(label);

  for (const row of extractRows(payload)) {
    const rowLabel = normalizeText(row.label);
    if (rowLabel.includes(target)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

function parseLastUpdateText(payload) {
  const text = stripHtmlToText(payload);

  // Example: "Cập nhật: 19:15:00 28/03/2026"
  const m = text.match(
    /Cập\s*nhật\s*:?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = (m[3] || "00").padStart(2, "0");
    const dd = m[4].padStart(2, "0");
    const mm = m[5].padStart(2, "0");
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const NGOC_DIEP_SOURCES = NGOC_DIEP_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Ngọc Diệp",
  unit: "luong",
  url: NGOC_DIEP_URL,
  webUrl: "https://www.facebook.com/HieuVangNgocDiepHau/",
  location: "Đà Nẵng",
  parse: (payload) => {
    const { buy, sell } = parseByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseLastUpdateText(payload),
    };
  },
}));
