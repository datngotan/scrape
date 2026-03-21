import { nowVnText, stripHtmlToText } from "../../utils.js";

const HANH_AN_PRODUCTS = [
  {
    id: "hanh_an_nhan_9999",
    name: "Hạnh An (Nhẫn 9999)",
    label: "Nhẫn 9999 Hạnh An",
  },
  {
    id: "hanh_an_trang_suc_9999",
    name: "Hạnh An (Trang sức 99.99)",
    label: "Trang sức 99.99",
  },
  {
    id: "hanh_an_trang_suc_995",
    name: "Hạnh An (Trang Sức 995)",
    label: "Trang Sức 995",
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

  // Keep stored unit as thousands when page outputs full VND.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const html = String(payload || "");
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => stripHtmlToText(m[1]),
    );
    if (cells.length < 3) continue;

    if (!normalizeText(cells[0]).includes(normalizedLabel)) continue;

    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  const lines = String(payload || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    if (!normalizeText(cells[0]).includes(normalizedLabel)) continue;

    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s+");
  const token = "(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,8})";
  const m = String(payload || "").match(
    new RegExp(`${escapedLabel}[\\s\\S]{0,120}?${token}[\\s\\S]{0,40}?${token}`, "i"),
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

export const HANH_AN_SOURCES = HANH_AN_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Hạnh An",
  url: "https://giavangmaothiet.com/gia-vang-hanh-an-hai-phong-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-hanh-an-hai-phong-hom-nay/",
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
