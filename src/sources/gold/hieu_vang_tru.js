import { nowVnText, stripHtmlToText, toVndThousand } from "../../utils.js";

const HIEU_VANG_TRU_API_URL = "https://hieuvangtru.vn/layout/load_bang_gia.php";
const HIEU_VANG_TRU_WEB_URL = "https://hieuvangtru.vn/";

const PRODUCTS = [
  {
    id: "hieu_vang_tru_vang_9999",
    name: "Hiệu Vàng Trữ (Vàng 9999)",
    needle: "Vàng 9999",
  },
  {
    id: "hieu_vang_tru_vang_98",
    name: "Hiệu Vàng Trữ (Vàng 98%)",
    needle: ["Vàng 98%", "Vàng 98%12"],
  },
  {
    id: "hieu_vang_tru_vang_nu_trang_98",
    name: "Hiệu Vàng Trữ (Vàng Nữ trang 98%)",
    needle: "Vàng Nữ trang 98%",
  },
  // {
  //   id: "hieu_vang_tru_vang_610",
  //   name: "Hiệu Vàng Trữ (Vàng 610)",
  //   needle: "Vàng 610",
  // },
  // {
  //   id: "hieu_vang_tru_vang_416_pnj",
  //   name: "Hiệu Vàng Trữ (Vàng 416 PNJ)",
  //   needle: "Vàng 416 PNJ",
  // },
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parsePriceCell(cell) {
  const compact = String(cell || "")
    .replace(/\s+/g, "")
    .trim();
  if (!compact) return null;

  // Some rows use mixed separators like "14.760,000".
  const normalized = compact.replace(/,/g, ".");
  const parsed = toVndThousand(normalized);
  if (parsed != null && parsed > 0) return parsed;

  const digits = normalized.replace(/\D/g, "");
  if (!digits) return null;

  const n = Number(digits);
  const price = Number.isFinite(n) ? n / 1000 : null;
  return price && price > 0 ? price : null;
}

function parseByNeedle(payload, needle) {
  const trMatches = String(payload || "").match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const targets = new Set(
    (Array.isArray(needle) ? needle : [needle]).map(normalizeText),
  );

  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((m) => stripHtmlToText(m[1]).replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (cells.length < 3) continue;

    const label = normalizeText(cells[0]);
    if (!targets.has(label)) continue;

    // API table columns are: name | sell | buy
    return {
      buy: parsePriceCell(cells[2]),
      sell: parsePriceCell(cells[1]),
    };
  }

  return { buy: null, sell: null };
}

function parseLastUpdateText(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(
    /Bảng\s*giá\s*lúc\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*ngày\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  );

  if (!m) return nowVnText();

  const [h, mi, s = "00"] = m[1].split(":");
  const [d, mo, y] = m[2].split("/");
  return `${h.padStart(2, "0")}:${mi.padStart(2, "0")}:${s.padStart(2, "0")} ${d.padStart(2, "0")}/${mo.padStart(2, "0")}/${y}`;
}

export const HIEU_VANG_TRU_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Hiệu Vàng Trữ",
  unit: "chi",
  url: HIEU_VANG_TRU_API_URL,
  webUrl: HIEU_VANG_TRU_WEB_URL,
  location: "Đà Nẵng",
  parse: (payload) => {
    const { buy, sell } = parseByNeedle(payload, product.needle);
    return {
      buy,
      sell,
      lastUpdateText: parseLastUpdateText(payload),
    };
  },
}));
