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

function parseBuySellByLabel(payload, label) {
  const normalizedLabel = normalizeText(label);
  const raw = String(payload || "");

  // Parse per raw line so numeric separators (.,) are preserved.
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!normalizeText(line).includes(normalizedLabel)) continue;

    const nums = (line.match(/\d{1,3}(?:[.,]\d{3})+|\d{4,6}/g) ?? []).map(
      parsePriceToken,
    );
    const filtered = nums.filter((x) => x != null);
    if (filtered.length >= 2) {
      return {
        buy: filtered[0] / 10,
        sell: filtered[1] / 10,
      };
    }
  }

  // Fallback for flattened output.
  const text = stripHtmlToText(payload);
  if (normalizeText(text).includes(normalizedLabel)) {
    const nums = (text.match(/\d{1,3}(?:[.,]\d{3})+|\d{4,6}/g) ?? []).map(
      parsePriceToken,
    );
    const filtered = nums.filter((x) => x != null);
    if (filtered.length >= 2) {
      return {
        buy: filtered[0] / 10,
        sell: filtered[1]/ 10,
      };
    }
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

    if ((period.includes("CHIEU") || period.includes("TOI")) && hh < 12) hh += 12;
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
  url: "https://r.jina.ai/https://vietagold.com.vn/gia-vang/",
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
