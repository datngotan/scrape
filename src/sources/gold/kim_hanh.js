import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_HANH_PRODUCTS = [
  {
    id: "kim_hanh_nhan_tron_99",
    name: "Kim Hạnh (Nhẫn Trơn Kim Hạnh 99)",
    label: "Nhẫn Trơn Kim Hạnh 99",
  },
  {
    id: "kim_hanh_trang_suc_99",
    name: "Kim Hạnh (Trang sức 99)",
    label: "TRANG SỨC Kim Hạnh 99",
  },
  {
    id: "kim_hanh_trang_suc_999",
    name: "Kim Hạnh (Trang sức 999)",
    label: "TRANG SỨC Kim Hạnh 999",
  },
  {
    id: "kim_hanh_trang_suc_9999",
    name: "Kim Hạnh (Trang sức 9999)",
    label: "TRANG SỨC Kim Hạnh 9999",
  },
  {
    id: "kim_hanh_trang_suc_98",
    name: "Kim Hạnh (Trang sức 98)",
    label: "TRANG SỨC Kim Hạnh 98",
  },
  {
    id: "kim_hanh_ep_vi_9999",
    name: "Kim Hạnh (Kim Hạnh Ép Vỉ 9999)",
    label: "Kim Hạnh Ép VỈ 9999",
  },
  {
    id: "kim_hanh_nhan_tron_999",
    name: "Kim Hạnh (Nhẫn Trơn Kim Hạnh 999)",
    label: "NHẪN TRƠN Kim Hạnh 999",
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
  // Prices on this site are in full VND (e.g. 16800000). Divide to store as thousands.
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

  // Site format: "Cập nhật lúc: 2026-03-18 20:51:04" (YYYY-MM-DD HH:MM:SS)
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const yyyy = m[1];
    const mo = m[2];
    const dd = m[3];
    const HH = m[4];
    const MI = m[5];
    const SS = m[6];
    // Return in HH:MM:SS DD/MM/YYYY format that parseVnToIso accepts
    return `${HH}:${MI}:${SS} ${dd}/${mo}/${yyyy}`;
  }

  return nowVnText();
}

export const KIM_HANH_SOURCES = KIM_HANH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Kim Hạnh",
  url: "https://vangkimhanh.com/",
  webUrl: "https://vangkimhanh.com/",
  location: "TP.HCM",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
