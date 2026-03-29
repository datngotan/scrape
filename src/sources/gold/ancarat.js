import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const ANCARAT_URL = "https://giavang.ancarat.com/";

const ANCARAT_PRODUCTS = [
  {
    id: "ancarat_vang_9999_1_chi",
    name: "Ancarat (Vàng 9999)",
    label: "Vàng Kim Ấn Trần Triều 9999 (1 chỉ)",
  },
  {
    id: "ancarat_vang_nhan_tich_tai_9999_1_chi",
    name: "Ancarat (Vàng Nhẫn Tích Tài 9999)",
    label: "Vàng Nhẫn Tích Tài 9999 (1 chỉ)",
  },
  {
    id: "ancarat_nhan_vang_acr_9999_1_chi",
    name: "Ancarat (Nhẫn Vàng ACR 9999)",
    label: "Nhẫn Vàng ACR 9999 (1 chỉ)",
  },
  {
    id: "ancarat_nhan_vang_acr_999_1_chi",
    name: "Ancarat (Nhẫn Vàng ACR 999)",
    label: "Nhẫn Vàng ACR 999 (1 chỉ)",
  },
  {
    id: "ancarat_nhan_vang_acr_99_1_chi",
    name: "Ancarat (Nhẫn Vàng ACR 99)",
    label: "Nhẫn Vàng ACR 99 (1 chỉ)",
  },
  {
    id: "ancarat_nhan_vang_acr_98_1_chi",
    name: "Ancarat (Nhẫn Vàng ACR 98)",
    label: "Nhẫn Vàng ACR 98 (1 chỉ)",
  },
  {
    id: "ancarat_trang_suc_vang_24k_9999_1_chi",
    name: "Ancarat (Trang sức Vàng 24K 9999)",
    label: "Trang sức Vàng 24K 9999 (1 chỉ)",
  },
  {
    id: "ancarat_trang_suc_vang_18k_750_1_chi",
    name: "Ancarat (Trang sức Vàng 18K 750)",
    label: "Trang sức Vàng 18K 750 (1 chỉ)",
  },
  {
    id: "ancarat_trang_suc_vang_610_1_chi",
    name: "Ancarat (Trang sức Vàng 610)",
    label: "Trang sức Vàng 610 (1 chỉ)",
  },
  {
    id: "ancarat_trang_suc_vang_14k_585_1_chi",
    name: "Ancarat (Trang sức Vàng 14K 585)",
    label: "Trang sức vàng 14K 585 (1 chỉ)",
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

function orderBuySell(a, b) {
  if (a == null || b == null) return { buy: null, sell: null };
  if (a <= b) return { buy: a, sell: b };
  return { buy: b, sell: a };
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

    const first = parsePriceToken(cells[cells.length - 2]);
    const second = parsePriceToken(cells[cells.length - 1]);
    const { buy, sell } = orderBuySell(first, second);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function parseBuySellByLabel(payload, label) {
  const target = normalizeText(label);

  for (const row of parseTableRows(payload)) {
    if (normalizeText(row.label) === target) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  const text = stripHtmlToText(payload);
  const escapedLabel = label
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const token = "(\\d{1,3}(?:[.,]\\d{3}){1,2})";
  const match = text.match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );
  if (!match) return { buy: null, sell: null };

  return orderBuySell(parsePriceToken(match[1]), parsePriceToken(match[2]));
}

function parseLastUpdateText(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?\s+Cập\s*nhật\s*lần\s*cuối\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
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

export const ANCARAT_SOURCES = ANCARAT_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Ancarat",
  url: ANCARAT_URL,
  webUrl: ANCARAT_URL,
  location: "TP.HCM, Hà Nội",
  unit: "chi",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseLastUpdateText(payload),
    };
  },
}));