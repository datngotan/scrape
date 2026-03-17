import {
  parseSilverLastUpdateText,
  parseSilverPriceToThousand,
} from "../../utils.js";

const HUONG_CHI_WEB_URL = "http://vanghuongchi.com.vn/";
const HUONG_CHI_JINA_URL = "http://vanghuongchi.com.vn/";

const PRODUCTS = [
  {
    id: "huong_chi_bac_thoi_luong",
    name: "Hương Chi - Thỏi Bạc 1 Lượng",
    needle: "Thỏi Bạc 1 Lượng",
    unit: "luong",
  },
  {
    id: "huong_chi_bac_thoi_kg",
    name: "Hương Chi - Thỏi Bạc 1 KG",
    needle: "Thỏi Bạc 1 KG",
    unit: "kg",
  },
];

function normalizeSpaces(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function escapeReg(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTime(payload) {
  const text = normalizeSpaces(String(payload || "").replace(/\*\*/g, " "));
  const m = text.match(
    /Nguồn\s*Vàng\s*Hương\s*Chi\s*lúc\s*:\s*(\d{1,2}):(\d{2})\s*ngày\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const dd = m[3];
    const mm = m[4];
    const yyyy = m[5];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return parseSilverLastUpdateText(payload);
}

function parseByNeedle(payload, needle, unit) {
  const text = normalizeSpaces(payload);
  const escaped = escapeReg(needle);

  const rowRe = new RegExp(
    `(?:\\*\\*)?\\s*${escaped}\\s*(?:\\*\\*)?\\s*([\\d.,]+)\\s+([\\d.,]+)`,
    "i",
  );
  const m = text.match(rowRe);

  const buy = m ? parseSilverPriceToThousand(m[1]) : null;
  const sell = m ? parseSilverPriceToThousand(m[2]) : null;

  return {
    buy,
    sell,
    unit,
    lastUpdateText: parseTime(payload),
  };
}

const SHARED = {
  storeName: "Vàng Hương Chi",
  location: "Bắc Ninh",
  url: HUONG_CHI_JINA_URL,
  webUrl: HUONG_CHI_WEB_URL,
};

export const HUONG_CHI_SILVER_SOURCES = PRODUCTS.map((product) => ({
  ...SHARED,
  id: product.id,
  name: product.name,
  unit: product.unit,
  parse: (payload) => parseByNeedle(payload, product.needle, product.unit),
}));
