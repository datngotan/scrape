import { nowVnText, stripHtmlToText } from "../../utils.js";

const ANH_MINH_GOLD_PRODUCTS = [
  {
    id: "anh_minh_nhan_ep_vi_9999",
    name: "Anh Minh (Nhẫn ép vỉ 999.9)",
    label: "Nhẫn ép vỉ 999.9 Anh Minh",
  },
  {
    id: "anh_minh_nhan_tron_9999",
    name: "Anh Minh (Nhẫn tròn 999.9)",
    label: "Nhẫn tròn 999.9 Anh Minh",
  },
  {
    id: "anh_minh_vang_trang_suc",
    name: "Anh Minh (Vàng trang sức)",
    label: "Vàng trang sức Anh Minh",
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
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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

  const m = text.match(
    /Ngay\s*cap\s*nhat\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*Gio\s*cap\s*nhat\s*:\s*(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const ANH_MINH_GOLD_SOURCES = ANH_MINH_GOLD_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Anh Minh",
  url: "https://r.jina.ai/https://vanganhminh.com/",
  webUrl: "https://vanganhminh.com/",
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