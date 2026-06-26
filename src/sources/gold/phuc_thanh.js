import { nowVnText } from "../../utils.js";

const PAGE_URL = "https://vangbacphucthanh.vn/";

const PRODUCTS = [
  {
    id: "phuc_thanh",
    name: "Phúc Thành (Nhẫn tròn 9999)",
    needle: "Nhẫn tròn 9999",
  },
  {
    id: "phuc_thanh_trang_suc_9999",
    name: "Phúc Thành (Trang sức 9999)",
    needle: "Trang sức 9999",
  },
  {
    id: "phuc_thanh_trang_suc_999",
    name: "Phúc Thành (Trang sức 999)",
    needle: "Trang sức 999",
  },
  {
    id: "phuc_thanh_trang_suc_99",
    name: "Phúc Thành (Trang sức 99%)",
    needle: "Trang sức 99%",
  },
];

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s) {
  return decodeHtml(String(s || "").replace(/<[^>]+>/g, " "));
}

function parseTime(payload) {
  const text = stripTags(payload);

  let m = text.match(
    /Cập\s*nhật\s*lúc\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*Ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = (m[3] ?? "00").padStart(2, "0");
    const dd = m[4].padStart(2, "0");
    const mm = m[5].padStart(2, "0");
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(
    /Cập\s*nhật\s*lúc\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = (m[3] ?? "00").padStart(2, "0");
    const dd = m[4].padStart(2, "0");
    const mm = m[5].padStart(2, "0");
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBuySellByLabel(payload, label) {
  const text = stripTags(payload);
  const escaped = escapeRegExp(label).replace(/\s+/g, "\\s*");

  let m = text.match(new RegExp(`${escaped}\\s*(\\d{4,6})\\s*(\\d{4,6})`, "i"));
  if (!m && String(label).includes("%")) {
    const withoutPercent = escaped.replace(/%/g, "");
    m = text.match(
      new RegExp(`${withoutPercent}\\s*(\\d{4,6})\\s*(\\d{4,6})`, "i"),
    );
  }

  if (!m) return { buy: null, sell: null };

  const sell = Number(m[1]);
  const buy = Number(m[2]);

  return {
    buy: Number.isFinite(buy) && buy > 0 ? buy : null,
    sell: Number.isFinite(sell) && sell > 0 ? sell : null,
  };
}

export const PHUC_THANH_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Bạc Phúc Thành",
  unit: "chi",
  url: PAGE_URL,
  webUrl: PAGE_URL,
  location: "Hà Nội",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.needle);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
