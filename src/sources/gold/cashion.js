import { nowVnText, stripHtmlToText } from "../../utils.js";

const CASHION_URL = "https://cashion.vn/gia-vang-hom-nay/";

const CASHION_PRODUCTS = [
  {
    id: "cashion_nhan_tron_9999_1_chi",
    name: "Cashion (Nhẫn trơn 999.9)",
    label: "Nhẫn trơn Cashion 999.9 - 1 chỉ",
  },
];

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const escapedLabel = label
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const token = "(\\d{1,3}(?:[.,]\\d{3})|\\d{1,3}(?:[.,]\\d{3}){1,2})";

  const match = text.match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );

  if (!match) {
    return { buy: null, sell: null };
  }

  return {
    buy: parsePriceToken(match[1]),
    sell: parsePriceToken(match[2]),
  };
}

function parseLastUpdateText(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(
    /Ngày\s*cập\s*nhật\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/i,
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

export const CASHION_SOURCES = CASHION_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Cashion",
  location: "TP.HCM",
  unit: "chi",
  url: CASHION_URL,
  webUrl: CASHION_URL,
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseLastUpdateText(payload),
    };
  },
}));