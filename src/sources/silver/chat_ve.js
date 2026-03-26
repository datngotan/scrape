import {
  parseSilverLastUpdateText,
  parseSilverPriceToThousand,
} from "../../utils.js";

const CHAT_VE_SILVER_PRODUCTS = [
  {
    id: "chat_ve_bac_thoi_999_1_luong",
    name: "Chất Vệ (Bạc thỏi Chất Vệ 999 - 1 lượng)",
    label: "BẠC THỎI CHẤT VỆ 999 – 1 LƯỢNG",
    unit: "luong",
  },
  {
    id: "chat_ve_bac_thoi_cv_999_1_luong_con_giap",
    name: "Chất Vệ (Bạc thỏi CV 999 - 1 lượng con giáp)",
    label: "BẠC THỎI CV 999 – 1 LƯỢNG CON GIÁP",
    unit: "luong",
  },
  {
    id: "chat_ve_bac_thoi_999_1_kilo",
    name: "Chất Vệ (Bạc thỏi Chất Vệ 999 - 1 kilo)",
    label: "BẠC THỎI CHẤT VỆ 999 – 1KILO",
    unit: "kg",
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

function parseBuySellFromPipeLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 3) return { buy: null, sell: null };

  const buy = parseSilverPriceToThousand(cells[cells.length - 2]);
  const sell = parseSilverPriceToThousand(cells[cells.length - 1]);
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

    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const merged = parseBuySellFromPipeLine(combined);
    if (merged.buy != null && merged.sell != null) return merged;
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = normalizeAscii(String(payload || ""));
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

  return parseSilverLastUpdateText(payload);
}

export const CHAT_VE_SILVER_SOURCES = CHAT_VE_SILVER_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Bạc Chất Vệ",
  location: "Tam Dương, Vĩnh Phúc",
  unit: product.unit,
  url: "https://chatve.vn/gia-vang/",
  webUrl: "https://chatve.vn/gia-vang/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      unit: product.unit,
      lastUpdateText: parseTime(payload),
    };
  },
}));
