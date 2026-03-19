import { nowVnText, stripHtmlToText } from "../../utils.js";

const DA_PHUC_PRODUCTS = [
  {
    id: "da_phuc_nhan_tron_24k",
    name: "Đa Phúc (Nhẫn trơn Đa Phúc 24K)",
    label: "NHẪN TRƠN ĐA PHÚC 24K",
  },
  {
    id: "da_phuc_trang_suc_238k",
    name: "Đa Phúc (Trang sức Đa Phúc 23,8K)",
    label: "TRANG SỨC ĐA PHÚC 23,8K",
  },
];

function normalizeText(input) {
  return String(input || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
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

function parseBuySellByLabel(payload, label) {
  const normalizedLabel = normalizeText(label);
  const rows = String(payload || "").match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => stripHtmlToText(m[1]),
    );
    if (cells.length < 3) continue;

    const rowLabel = normalizeText(cells[0]);
    if (!rowLabel) continue;
    if (rowLabel !== normalizedLabel && !rowLabel.startsWith(`${normalizedLabel} `)) {
      continue;
    }

    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback for flattened content or malformed rows.
  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const flat = normalizeText(stripHtmlToText(payload));
  const m = flat.match(new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"));
  if (!m) return { buy: null, sell: null };

  const buy = parsePriceToken(m[1]);
  const sell = parsePriceToken(m[2]);
  return {
    buy: buy != null ? buy : null,
    sell: sell != null ? sell : null,
  };
}

function parseTime(payload) {
  const html = String(payload || "");

  // Current page includes an input with value like "19/03/2026 T22:22".
  let m = html.match(/id=["']TimePrice["'][^>]*value=["']([^"']+)["']/i);
  if (m) {
    const value = m[1].trim();

    let t = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[T ]\s*(\d{1,2}):(\d{2})/i);
    if (t) {
      const dd = t[1].padStart(2, "0");
      const mm = t[2].padStart(2, "0");
      const yyyy = t[3];
      const HH = t[4].padStart(2, "0");
      const MI = t[5];
      return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
    }

    t = value.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/i);
    if (t) {
      const yyyy = t[1];
      const mm = t[2];
      const dd = t[3];
      const HH = t[4];
      const MI = t[5];
      return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
    }
  }

  m = html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[T ]\s*(\d{1,2}):(\d{2})/i);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const DA_PHUC_SOURCES = DA_PHUC_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Bạc Đa Phúc",
  location: "Sơn Tây, Hà Nội",
  unit: "chi",
  url: "http://vangdaphuc.vn/",
  webUrl: "https://vangdaphuc.vn/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
