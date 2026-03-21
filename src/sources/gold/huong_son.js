import { nowVnText, stripHtmlToText } from "../../utils.js";

const HUONG_SON_PRODUCTS = [
  {
    id: "huong_son_vang_999_lan_7",
    name: "Hương Sơn (Vàng 99.9)",
    label: "Vàng 99.9",
  },
  {
    id: "huong_son_vang_950",
    name: "Hương Sơn (Vàng 950)",
    label: "Vàng 950 Hương Sơn",
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

function buildLabelPrefix(label) {
  const normalized = normalizeText(label)
    .replace(/\bvang\s+9999\b/g, "vang 99 9")
    .replace(/\bvang\s+99\s*9\b/g, "vang 99 9")
    .replace(/\blan\s+\d+\b/g, " ")
    .replace(/\bhuong\s+son\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized;
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Prices are presented in full VND (e.g. 16650000); store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);
  const labelPrefix = buildLabelPrefix(label) || normalizedLabel;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    const nameCell = cells.find((cell) => {
      const normalizedCell = normalizeText(cell).replace(/\blan\s+\d+\b/g, " ").trim();
      return (
        normalizedCell === normalizedLabel ||
        normalizedCell === labelPrefix ||
        normalizedCell.startsWith(`${labelPrefix} `)
      );
    });
    if (!nameCell) continue;

    const idx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[idx + 1] ?? "");
    const sell = parsePriceToken(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback for flattened content.
  const escapedLabel = labelPrefix
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

export const HUONG_SON_SOURCES = HUONG_SON_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Hương Sơn",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  location: "Ninh Bình",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
