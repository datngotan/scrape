import { nowVnText, stripHtmlToText } from "../../utils.js";

const CHAT_VE_GOLD_PRODUCTS = [
  {
    id: "chat_ve_vang_ep_vi_24k",
    name: "Chất Vệ (Vàng ép vỉ Chất Vệ 24K)",
    label: "VÀNG ÉP VỈ CHẤT VỆ 24K",
  },
  {
    id: "chat_ve_vang_nhan_tron_cv_24k",
    name: "Chất Vệ (Vàng nhẫn tròn CV 24K)",
    label: "VÀNG NHẪN TRÒN CV 24K",
  },
  {
    id: "chat_ve_vang_trang_suc_cv_23k_24k",
    name: "Chất Vệ (Vàng trang sức CV 23K 24K)",
    label: "VÀNG TRANG SỨC CV 23K 24K",
  },
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeAscii(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-");
}

function parsePriceToken(raw) {
  const cleaned = String(raw || "").replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const digits = cleaned.replace(/[.,]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBuySellFromPipeLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 3) return { buy: null, sell: null };

  const buy = parsePriceToken(cells[cells.length - 2]);
  const sell = parsePriceToken(cells[cells.length - 1]);
  return { buy, sell };
}

function parseBuySellByLabel(payload, label) {
  const raw = String(payload || "");
  const normalizedLabel = normalizeText(label);
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;
    if (!normalizeText(line).includes(normalizedLabel)) continue;

    const direct = parseBuySellFromPipeLine(line);
    if (direct.buy != null && direct.sell != null) return direct;

    // Some rows are split across lines in r.jina output.
    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const merged = parseBuySellFromPipeLine(combined);
    if (merged.buy != null && merged.sell != null) return merged;
  }

  const text = stripHtmlToText(raw);
  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );
  if (!m) return { buy: null, sell: null };

  return {
    buy: parsePriceToken(m[1]),
    sell: parsePriceToken(m[2]),
  };
}

function parseTime(payload) {
  const text = normalizeAscii(stripHtmlToText(payload));
  const m = text.match(
    /CAP\s*NHAT\s*NGAY\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*:\s*(\d{1,2})h(\d{2})/i,
  );
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const CHAT_VE_GOLD_SOURCES = CHAT_VE_GOLD_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Bạc Chất Vệ",
  location: "Tam Dương, Vĩnh Phúc",
  unit: "chi",
  url: "https://r.jina.ai/https://chatve.vn/gia-vang/",
  webUrl: "https://chatve.vn/gia-vang/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
