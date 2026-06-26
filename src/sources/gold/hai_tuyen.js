import { nowVnText, stripHtmlToText } from "../../utils.js";

const HAI_TUYEN_PRODUCTS = [
  {
    id: "hai_tuyen_nhan_tron",
    name: "Hải Tuyến (Vàng nhẫn trơn)",
    label: "vang nhan tron",
    aliases: ["vang nhan tro", "nhan tron", "nhan tro", "nhan tron tron"],
  },
  {
    id: "hai_tuyen_vang_trang_suc",
    name: "Hải Tuyến (Vàng Trang Sức)",
    label: "vang trang suc",
    aliases: ["trang suc"],
  },
];

const HAI_TUYEN_URL =
  "https://pc.thietbinganhvang.vn/share/facebook/vbhaituyen";

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

  // Page prices are full VND; store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function fuzzyTokenMatch(needle, haystack) {
  const need = String(needle || "")
    .split(" ")
    .filter(Boolean);
  const has = String(haystack || "")
    .split(" ")
    .filter(Boolean);

  if (need.length === 0 || has.length === 0) return false;

  return need.every((token) => {
    if (token.length < 3) return has.includes(token);
    return has.some(
      (h) => h === token || h.startsWith(token) || token.startsWith(h),
    );
  });
}

function matchesAnyLabel(rawLabel, labels) {
  const normalized = normalizeText(rawLabel);
  if (!normalized) return false;

  for (const label of labels) {
    if (!label) continue;
    if (normalized.includes(label) || fuzzyTokenMatch(label, normalized)) {
      return true;
    }
  }

  return false;
}

function parseBuySellByLabel(payload, labels) {
  const raw = String(payload || "");

  // Try HTML table rows first.
  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rows) {
    const rowText = stripHtmlToText(rowHtml);
    if (!matchesAnyLabel(rowText, labels)) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]))
      .filter(Boolean);
    if (cells.length < 3) continue;

    const idx = cells.findIndex((cell) => matchesAnyLabel(cell, labels));
    if (idx < 0) continue;

    const buy = parsePriceToken(cells[idx + 1] ?? "");
    const sell = parsePriceToken(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback: markdown table lines.
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const idx = cells.findIndex((c) => matchesAnyLabel(c, labels));
    if (idx < 0) continue;

    const buy = parsePriceToken(cells[idx + 1] ?? "");
    const sell = parsePriceToken(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Format: Ngày DD Tháng MM Năm YYYY | HH:MM:SS (or HH:MM)
  const m = text.match(
    /Ng[aà]y\s+(\d{1,2})\s+Th[aá]ng\s+(\d{1,2})\s+N[aă]m\s+(\d{4})[\s\S]{0,20}?(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    const HH = String(m[4]).padStart(2, "0");
    const MI = m[5];
    const SS = m[6] ? m[6] : "00";
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const HAI_TUYEN_SOURCES = HAI_TUYEN_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Hải Tuyến",
  unit: "chi",
  url: HAI_TUYEN_URL,
  webUrl: HAI_TUYEN_URL,
  location: "Phú Thọ",
  parse: (payload) => {
    const labels = [product.label, ...(product.aliases ?? [])].map((value) =>
      normalizeText(value),
    );
    const { buy, sell } = parseBuySellByLabel(payload, labels);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
