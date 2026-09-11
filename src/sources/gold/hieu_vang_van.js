import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const PAGE_URL = "https://hieuvangvan.vn/";

const PRODUCTS = [
  {
    id: "hieu_vang_van_khau_9999",
    name: "Hiệu Vàng Vân (Vàng khâu 9999)",
    needle: "Vàng khâu 9999",
  },
  {
    id: "hieu_vang_van_khau_98",
    name: "Hiệu Vàng Vân (Vàng khâu 98)",
    needle: "Vàng khâu 98",
  },
  {
    id: "hieu_vang_van_nu_trang_cty_98",
    name: "Hiệu Vàng Vân (Vàng Nữ Trang Cty 98)",
    needle: "Vàng Nữ Trang Cty 98",
  },
  {
    id: "hieu_vang_van_610",
    name: "Hiệu Vàng Vân (Vàng 610)",
    needle: "Vàng 610",
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

// Prices on this page are full VND (e.g. 13.540.000); the DB stores
// thousand-VND (13540). Divide by 1000 when the raw number is that large.
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

function parseBuySellByLabel(payload, needle) {
  const target = normalizeText(needle);
  const rows = parseTableRows(payload);

  for (const row of rows) {
    if (normalizeText(row.label) === target) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

// Format: "Cập nhật lúc 08:19 AM, 11/09/2026"
function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const m = text.match(
    /C[ẬÂ]P\s*NH[ẬÂ]T\s*L[ÚU]C\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*,?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (!m) return nowVnText();

  let hh = Number(m[1]);
  const mi = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hh < 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;

  const dd = m[4].padStart(2, "0");
  const mm = m[5].padStart(2, "0");
  const yyyy = m[6];

  return `${String(hh).padStart(2, "0")}:${mi}:00 ${dd}/${mm}/${yyyy}`;
}

export const HIEU_VANG_VAN_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Hiệu Vàng Vân",
  unit: "chi",
  url: PAGE_URL,
  webUrl: PAGE_URL,
  location: "Đà Nẵng",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.needle);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
