import { nowVnText, stripHtmlToText } from "../../utils.js";

const THANH_THANH_BINH_PRODUCTS = [
  {
    id: "thanh_thanh_binh_nhan_tron_9999",
    name: "Thanh Thanh Bình (Nhẫn Tròn 9999)",
    label: "Nhẫn Tròn TT Bình 9999",
  },
  {
    id: "thanh_thanh_binh_vang_dau_99",
    name: "Thanh Thanh Bình (Vàng Đậu 99%)",
    label: "Vàng Đậu 99%",
  },
  {
    id: "thanh_thanh_binh_trang_suc_9999",
    name: "Thanh Thanh Bình (Trang Sức 999.9)",
    label: "Trang Sức TT Bình 999.9",
  },
  {
    id: "thanh_thanh_binh_trang_suc_999",
    name: "Thanh Thanh Bình (Trang Sức 99.9)",
    label: "Trang Sức TT Bình 99.9",
  },
  {
    id: "thanh_thanh_binh_98",
    name: "Thanh Thanh Bình (98)",
    label: "98 TT Bình",
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
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    const nameCell = cells.find((cell) => normalizeText(cell) === normalizedLabel);
    if (!nameCell) continue;

    const idx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[idx + 1] ?? "");
    const sell = parsePriceToken(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );

  if (m) {
    const buy = parsePriceToken(m[1]);
    const sell = parsePriceToken(m[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const THANH_THANH_BINH_SOURCES = THANH_THANH_BINH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Thanh Thanh Bình",
  url: "https://r.jina.ai/https://giavangmaothiet.com/tiem-vang-thanh-thanh-binh/",
  webUrl: "https://giavangmaothiet.com/tiem-vang-thanh-thanh-binh/",
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