import { nowVnText, stripHtmlToText } from "../../utils.js";

const LAM_NGOC_THANH_PRODUCTS = [
  {
    id: "lam_ngoc_thanh_9999_24k",
    name: "Lâm Ngọc Thanh (Vàng 9999 24k)",
    label: "Vàng Lâm Ngọc Thanh 9999 24k",
  },
  {
    id: "lam_ngoc_thanh_nu_trang_999",
    name: "Lâm Ngọc Thanh (Nữ Trang 99.9% 24k)",
    label: "Nữ Trang Lâm Ngọc Thanh 99.9% 24k",
  },
  {
    id: "lam_ngoc_thanh_nu_trang_97",
    name: "Lâm Ngọc Thanh (Vàng Nữ Trang 97)",
    label: "Vàng Nữ Trang 97 Lâm Ngọc Thanh",
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
  // Prices are full VND (e.g. 16300000); divide to store as thousands
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    const nameCell = cells.find((c) => normalizeText(c) === normalizedLabel);
    if (!nameCell) continue;
    const nameIdx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[nameIdx + 1] ?? "");
    const sell = parsePriceToken(cells[nameIdx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback: regex on flattened normalized text
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

  // Site format: "Cập nhật lúc: 2026-03-18 20:56:03"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const LAM_NGOC_THANH_SOURCES = LAM_NGOC_THANH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Lâm Ngọc Thanh",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-lam-ngoc-thanh-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-lam-ngoc-thanh-hom-nay/",
  location: "Đồng Nai",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
