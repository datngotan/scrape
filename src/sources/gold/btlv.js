import { nowVnText } from "../../utils.js";

const BTLV_URL = "https://www.btlv.vn/";

const BTLV_PRODUCTS = [
  {
    id: "btlv",
    name: "Bảo Tín Lan Vỹ (Nhẫn tròn 999.9 (24k))",
    labels: ["NHẪN TRÒN BTLV", "NHAN TRON BTLV"],
  },
  {
    id: "btlv_trang_suc_999_9_24k",
    name: "Bảo Tín Lan Vỹ (Vàng trang sức 999.9 (24k))",
    labels: ["VÀNG TRANG SỨC 999.9 (24K)", "VANG TRANG SUC 999.9 (24K)"],
  },
  {
    id: "btlv_than_tai_999_9_24k",
    name: "Bảo Tín Lan Vỹ (Vàng Thần Tài 999.9 (24k))",
    labels: ["VÀNG THẦN TÀI 999.9 (24K)", "VANG THAN TAI 999.9 (24K)"],
  },
  {
    id: "btlv_trang_suc_99_9_24k",
    name: "Bảo Tín Lan Vỹ (Vàng trang sức 99.9 (24k))",
    labels: ["VÀNG TRANG SỨC 99.9 (24K)", "VANG TRANG SUC 99.9 (24K)"],
  },
];

function decodeHtml(input) {
  let output = String(input || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  output = output
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    });

  return output.replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " "));
}

function normalizeText(input) {
  return stripTags(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function nowVnMinuteText() {
  const timestamp = nowVnText();
  const match = timestamp.match(
    /^(\d{2}:\d{2})(?::\d{2})\s+(\d{2}\/\d{2}\/\d{4})$/,
  );
  return match ? `${match[1]} ${match[2]}` : timestamp;
}

function parseTime(html) {
  const text = stripTags(html);
  const match = text.match(
    /Cập\s*nhật\s*lúc\s*:?\s*([0-9]{1,2}:[0-9]{2})\s*ngày\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
  );

  if (match) {
    const hhmm = match[1].trim();
    const [dd, mm, yyyy] = match[2].trim().split("/");
    if (dd && mm && yyyy) {
      return `${hhmm} ${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
    }
  }

  return nowVnMinuteText();
}

function parseCellValue(input) {
  const digits = String(input || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseBuySellByLabels(html, labels) {
  const normalizedLabels = labels.map((label) => normalizeText(label));
  const rows = String(html || "").match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const rowText = normalizeText(row);
    if (!normalizedLabels.some((label) => rowText.includes(label))) continue;

    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/gi)].map((cellMatch) =>
      stripTags(cellMatch[0]),
    );

    if (cells.length < 4) return { buy: null, sell: null };

    return {
      buy: parseCellValue(cells[2]),
      sell: parseCellValue(cells[3]),
    };
  }

  return { buy: null, sell: null };
}

export const BTLV_SOURCES = BTLV_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Bảo Tín Lan Vỹ",
  unit: "chi",
  url: BTLV_URL,
  webUrl: BTLV_URL,
  location: "Hà Nội",
  parse: (html) => {
    const { buy, sell } = parseBuySellByLabels(html, product.labels);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(html),
    };
  },
}));
