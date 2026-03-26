import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const VIET_A_GOLD_PRODUCTS = [
  {
    id: "viet_a_gold_kim_tai_loc",
    name: "VIETAGOLD (VAG - Kim Tài Lộc)",
    label: "VAG - Kim Tài Lộc",
  },
  {
    id: "viet_a_gold_kim_phat_loc",
    name: "VIETAGOLD (VAG - Kim Phát Lộc)",
    label: "VAG - Kim Phát Lộc",
  },
];

function normalizeText(input) {
  return String(input || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripDiacriticsKeepPunctuation(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d");
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function convertPriceForStorage(rawPrice) {
  if (rawPrice == null) return null;
  return Math.round(rawPrice / 10);
}

function parseBuySellByLabel(payload, label) {
  const normalizedLabel = normalizeText(label);

  const $ = cheerio.load(String(payload || ""));
  let matched = { buy: null, sell: null };

  $("tr").each((_, tr) => {
    if (matched.buy != null && matched.sell != null) return;

    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    if (cells.length < 3) return;

    if (!normalizeText(cells[0]).includes(normalizedLabel)) return;

    const buyRaw = parsePriceToken(cells[1]);
    const sellRaw = parsePriceToken(cells[2]);
    const buy = convertPriceForStorage(buyRaw);
    const sell = convertPriceForStorage(sellRaw);
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
  const plain = stripDiacriticsKeepPunctuation(text);

  const d = plain.match(/Ngay\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const t = plain.match(/Gio\s*:\s*(\d{1,2}):(\d{2})\s*([A-Za-z]+)?/i);

  if (d && t) {
    const dd = d[1].padStart(2, "0");
    const mm = d[2].padStart(2, "0");
    const yyyy = d[3];

    let hh = Number(t[1]);
    const mi = t[2];
    const period = normalizeText(t[3] || "");

    if ((period.includes("CHIEU") || period.includes("TOI")) && hh < 12)
      hh += 12;
    if (period.includes("SANG") && hh === 12) hh = 0;

    const HH = String(hh).padStart(2, "0");
    return `${HH}:${mi}:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const VIET_A_GOLD_SOURCES = VIET_A_GOLD_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "VIETAGOLD",
  unit: "chi",
  url: "https://vietagold.com.vn/gia-vang/",
  webUrl: "https://vietagold.com.vn/gia-vang/",
  location: "Hà Nội",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
