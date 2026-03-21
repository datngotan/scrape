import { nowVnText, stripHtmlToText } from "../../utils.js";

const NGOC_CUA_NHA_BE_PRODUCTS = [
  {
    id: "ngoc_cua_nha_be_nhan_tron_9999",
    name: "Ngọc Của Nhà Bè (Nhẫn Trơn 9999)",
    label: "Nhẫn Trơn 9999",
  },
  {
    id: "ngoc_cua_nha_be_vang_y_980",
    name: "Ngọc Của Nhà Bè (Vàng Y 980)",
    label: "Vàng Y 980",
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

  // Site prices are full VND; keep DB unit as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const raw = String(payload || "");
  const text = stripHtmlToText(raw);
  const normalizedLabel = normalizeText(label);

  // Support markdown table payloads from r.jina.ai.
  const lines = raw.split(/\r?\n/);
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

  // Support direct HTML payloads by scanning table rows/cells.
  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rows) {
    const rowText = stripHtmlToText(rowHtml);
    if (!normalizeText(rowText).includes(normalizedLabel)) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]))
      .filter(Boolean);
    if (cells.length < 3) continue;

    const idx = cells.findIndex((cell) => normalizeText(cell) === normalizedLabel);
    if (idx < 0) continue;

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

  const m = text.match(
    /Cập\s*Nhật\s*Ngày\s*(\d{2})\/(\d{2})\/(\d{4})\s*\/\s*(\d{2}):(\d{2})/i,
  );
  if (m) {
    return `${m[4]}:${m[5]}:00 ${m[1]}/${m[2]}/${m[3]}`;
  }

  return nowVnText();
}

export const NGOC_CUA_NHA_BE_SOURCES = NGOC_CUA_NHA_BE_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Ngọc Của Nhà Bè",
  url: "https://ngoccuanhabe.com/",
  webUrl: "https://ngoccuanhabe.com/",
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