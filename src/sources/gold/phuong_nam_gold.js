import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const PHUONG_NAM_GOLD_PRODUCTS = [
  {
    id: "phuong_nam_gold_nhan_tron_9999",
    name: "Phương Nam Gold (Vàng Nhẫn Tròn Trơn 999.9)",
    label: "Vàng Nhẫn Tròn Trơn 999.9",
    aliases: [
      "Vàng Nhẫn Tròn Trơn 999.9 Cánh Diều Phương Nam",
      "Vàng Nhẫn Tròn Trơn 999.9",
    ],
  },
  {
    id: "phuong_nam_gold_canh_dieu",
    name: "Phương Nam Gold (Cánh Diều Phương Nam)",
    label: "Cánh Diều Phương Nam",
    aliases: [
      "Vàng Nhẫn Tròn Trơn 999.9 Cánh Diều Phương Nam",
      "Cánh Diều Phương Nam",
    ],
  },
  {
    id: "phuong_nam_gold_trang_suc_9999",
    name: "Phương Nam Gold (Vàng Trang Sức Phương Nam 999.9)",
    label: "Vàng Trang Sức Phương Nam 999.9",
    aliases: ["Vàng Trang Sức Phương Nam 999.9"],
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

  // Site uses VND/chi with dot separators like 15.950 => store as 15950.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];
  const normalizedAliases = aliases.map(normalizeText);
  const $ = cheerio.load(String(payload || ""));

  let matched = { buy: null, sell: null };
  $("tr").each((_, tr) => {
    if (matched.buy != null && matched.sell != null) return;

    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 4) return;

    const rowName = normalizeText(cells[0]);
    const isMatch = normalizedAliases.some((alias) => rowName.includes(alias));
    if (!isMatch) return;

    const buy = parsePriceToken(cells[2]);
    const sell = parsePriceToken(cells[3]);
    if (buy != null && sell != null) {
      matched = { buy, sell };
    }
  });

  if (matched.buy != null && matched.sell != null) {
    return matched;
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Example: "Cập Nhật Lúc : 18-03-2026 15 : 48 : 10 ."
  let m = text.match(
    /(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/,
  );
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const PHUONG_NAM_GOLD_SOURCES = PHUONG_NAM_GOLD_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Vàng Phương Nam Gold",
    unit: "luong",
    url: "https://png.net.vn/",
    webUrl: "https://png.net.vn/",
    location: "Hà Nội",
    parse: (payload) => {
      const { buy, sell } = parseBuySellByLabel(payload, product);
      return {
        buy,
        sell,
        lastUpdateText: parseTime(payload),
      };
    },
  }),
);
