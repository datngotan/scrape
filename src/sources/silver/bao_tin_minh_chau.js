import { parseSilverLastUpdateText } from "../../utils.js";

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

function stripTags(input) {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBtmcPrice(raw) {
  const cleaned = String(raw || "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, "");
  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseByRow(html, productNeedle, unitNeedle) {
  const targetProduct = normalizeText(productNeedle);
  const targetUnit = normalizeText(unitNeedle);
  const rows = String(html || "").match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/gi)].map((m) =>
      stripTags(m[0]),
    );

    if (cells.length < 3) continue;

    const productIdx = cells.findIndex((cellText) => {
      const normalized = normalizeText(cellText);
      return (
        normalized.includes(targetProduct) && normalized.includes(targetUnit)
      );
    });
    if (productIdx < 0) continue;

    const buy = parseBtmcPrice(cells[productIdx + 1] ?? "");
    const sell = parseBtmcPrice(cells[productIdx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(html) {
  const text = stripTags(html);
  const m = text.match(
    /Cập\s*nhật\s*lúc\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s+([0-9]{1,2}:[0-9]{2})/i,
  );
  if (m) {
    return parseSilverLastUpdateText(`${m[1]} ${m[2]}`);
  }

  return parseSilverLastUpdateText(text);
}

function parse(html, unitNeedle, unit) {
  const { buy, sell } = parseByRow(
    html,
    "BẠC RỒNG THĂNG LONG AG 999",
    unitNeedle,
  );
  return {
    buy,
    sell,
    unit,
    lastUpdateText: parseTime(html),
  };
}

const SHARED = {
  storeName: "Bảo tín minh châu",
  url: "https://btmc.vn/Home/BGiaBac",
  webUrl: "https://btmc.vn/Home/BGiaBac",
  location: "Hà Nội",
};

export const BAO_TIN_MINH_CHAU_SILVER_SOURCES = [
  {
    ...SHARED,
    id: "bao_tin_minh_chau_bac_rong_thang_long_luong",
    name: "Bảo tín minh châu (Bạc Rồng Thăng Long Ag 999)",
    unit: "luong",
    parse: (html) => parse(html, "1 LƯỢNG", "luong"),
  },
  {
    ...SHARED,
    id: "bao_tin_minh_chau_bac_rong_thang_long_kg",
    name: "Bảo tín minh châu (Bạc Rồng Thăng Long Ag 999)",
    unit: "kg",
    parse: (html) => parse(html, "1 KG", "kg"),
  },
];
