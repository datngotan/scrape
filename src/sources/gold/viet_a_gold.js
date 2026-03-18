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

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  // Preferred path when r.jina.ai keeps markdown-like lines.
  const lines = String(payload || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    if (!normalizeText(line).includes(normalizedLabel)) continue;

    const nums = (line.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? []).map(parsePriceToken);
    const filtered = nums.filter((x) => x != null);
    if (filtered.length >= 2) {
      return {
        buy: filtered[0],
        sell: filtered[1],
      };
    }
  }

  // Fallback for flattened table text where columns are not pipe-separated.
  const normalized = normalizeText(text);
  const idx = normalized.indexOf(normalizedLabel);
  if (idx >= 0) {
    const slice = normalized.slice(idx, Math.min(normalized.length, idx + 220));
    const nums = (slice.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? []).map(parsePriceToken);
    const filtered = nums.filter((x) => x != null);
    if (filtered.length >= 2) {
      return {
        buy: filtered[0],
        sell: filtered[1],
      };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const d = text.match(/Ngay\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const t = text.match(/Gio\s*:\s*(\d{1,2}):(\d{2})\s*([A-Za-z\u00C0-\u1EF9]+)?/i);

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
  unit: "luong",
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
