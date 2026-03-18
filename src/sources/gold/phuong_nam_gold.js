import { nowVnText, stripHtmlToText } from "../../utils.js";

const PHUONG_NAM_GOLD_PRODUCTS = [
  {
    id: "phuong_nam_gold_nhan_tron_9999",
    name: "Phương Nam Gold (Vàng Nhẫn Tròn Trơn 999.9)",
    label: "Vàng Nhẫn Tròn Trơn 999.9",
  },
  {
    id: "phuong_nam_gold_canh_dieu",
    name: "Phương Nam Gold (Cánh Diều Phương Nam)",
    label: "Cánh Diều Phương Nam",
  },
  {
    id: "phuong_nam_gold_trang_suc_9999",
    name: "Phương Nam Gold (Vàng Trang Sức Phương Nam 999.9)",
    label: "Vàng Trang Sức Phương Nam 999.9",
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

  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBuySellByLabel(payload, label) {
  const target = normalizeText(label);
  const lines = String(payload || "").split(/\r?\n/);

  // Prefer markdown-table lines from r.jina.ai
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((x) => x.trim());
    const rowName = cells[1] ?? "";
    const normalizedRowName = normalizeText(rowName);
    if (!normalizedRowName || !normalizedRowName.includes(target)) continue;

    const buy = parsePriceToken(cells[3] ?? cells[2] ?? "");
    const sell = parsePriceToken(cells[4] ?? cells[3] ?? "");
    if (buy != null && sell != null) return { buy, sell };

    const nums = (line.match(/\d{1,3}(?:[.,]\d{3})+|\d{3,6}/g) ?? [])
      .map(parsePriceToken)
      .filter((n) => n != null);
    if (nums.length >= 2) return { buy: nums[0], sell: nums[1] };
  }

  // Fallback for flattened text output.
  const plain = normalizeText(stripHtmlToText(payload));
  const idx = plain.indexOf(target);
  if (idx >= 0) {
    const slice = plain.slice(idx, Math.min(plain.length, idx + 260));
    const nums = (slice.match(/\d{1,3}(?:[.,]\d{3})+|\d{3,6}/g) ?? [])
      .map(parsePriceToken)
      .filter((n) => n != null);
    if (nums.length >= 2) return { buy: nums[0], sell: nums[1] };
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

export const PHUONG_NAM_GOLD_SOURCES = PHUONG_NAM_GOLD_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Phương Nam Gold",
  unit: "luong",
  url: "https://r.jina.ai/https://png.net.vn/",
  webUrl: "https://png.net.vn/",
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
