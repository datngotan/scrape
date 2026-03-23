import { nowVnText, stripHtmlToText } from "../../utils.js";

const PHUC_NHU_PRODUCTS = [
  {
    id: "phuc_nhu_vang_9999_24k",
    name: "Phúc Nhu (Vàng 9999 24K)",
    label: "Vàng 9999 Phúc Nhu (24K)",
  },
  {
    id: "phuc_nhu_nhan_999_24k",
    name: "Phúc Nhu (Nhẫn 999 24K)",
    label: "Nhẫn Phúc Nhu 999 24k",
  },
  {
    id: "phuc_nhu_trang_suc_995",
    name: "Phúc Nhu (Trang sức PN 995)",
    label: "Trang sức PN 995",
  },
  {
    id: "phuc_nhu_trang_suc_999_24k",
    name: "Phúc Nhu (Trang sức PN 999 24K)",
    label: "Trang sức PN 999 24k",
  },
  {
    id: "phuc_nhu_trang_suc_9999_24k",
    name: "Phúc Nhu (Trang sức PN 9999 24K)",
    label: "Trang sức PN 9999 (24K)",
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

  // Keep DB unit in thousands if source ever emits full VND values.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const raw = String(payload || "");
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    // r.jina.ai may split a logical row across multiple lines.
    const merged = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");

    const cells = merged
      .split("|")
      .map((cell) => cell.trim())
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

  // Example: "Cập nhật: 2026-03-23 19:35:02"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const PHUC_NHU_SOURCES = PHUC_NHU_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Phúc Nhu",
  unit: "luong",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-phuc-nhu-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-phuc-nhu-hom-nay/",
  location: "Hải Phòng",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
