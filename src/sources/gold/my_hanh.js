import { nowVnText, stripHtmlToText } from "../../utils.js";

const MY_HANH_PRODUCTS = [
  {
    id: "my_hanh_9999",
    name: "Mỹ Hạnh (Vàng MH 9999)",
    label: "Vàng MH 9999",
  },
  {
    id: "my_hanh_trang_suc_24k",
    name: "Mỹ Hạnh (Trang Sức 24k)",
    label: "Trang Sức 24k",
  },
  {
    id: "my_hanh_trang_suc_18k",
    name: "Mỹ Hạnh (Trang Sức MH 18k)",
    label: "Trang Sức MH 18k",
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
    const cells = line.split("|").map((c) => c.trim());
    const nameCell = cells.find((c) => normalizeText(c) === normalizedLabel);
    if (!nameCell) continue;
    const nameIdx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[nameIdx + 1] ?? "");
    const sell = parsePriceToken(cells[nameIdx + 2] ?? "");
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

export const MY_HANH_SOURCES = MY_HANH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Mỹ Hạnh",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-my-hanh-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-my-hanh-hom-nay/",
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
