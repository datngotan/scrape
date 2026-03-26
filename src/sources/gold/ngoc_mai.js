import { stripHtmlToText } from "../../utils.js";

const NGOC_MAI_WEB_URL = "https://ngocmaigold.com/gia-vang";
const NGOC_MAI_CANVA_URL =
  "http://www.canva.com/design/DAHDJTFk6U8/t1PZsBcBRsZ6zyj-eEsIGg/view?embed";

const PRODUCTS = [
  {
    id: "ngoc_mai_nhan_990",
    name: "Ngọc Mai (Vàng nhẫn 990)",
    label: "VÀNG NHẪN 990",
  },
  {
    id: "ngoc_mai_trang_suc_9999",
    name: "Ngọc Mai (Trang sức 9999)",
    label: "TRANG SỨC 9999",
  },
  {
    id: "ngoc_mai_trang_suc_985_980",
    name: "Ngọc Mai (Trang sức 985/980)",
    label: "TRANG SỨC 985/980",
  },
  {
    id: "ngoc_mai_trang_suc_610",
    name: "Ngọc Mai (Trang sức 610)",
    label: "TRANG SỨC 610",
  },
];

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseUpdateText(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(/Ngày\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!m) return "";
  return `00:00:00 ${m[1]}`;
}

function parseByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const labelsInOrder = [
    "VÀNG NHẪN 990",
    "TRANG SỨC 9999",
    "TRANG SỨC 985/980",
    "TRANG SỨC 610",
  ];
  const normalized = text.toUpperCase();
  const sectionStartRaw = normalized.indexOf("BẢNG GIÁ VÀNG");
  const sectionStart =
    sectionStartRaw >= 0 ? sectionStartRaw : normalized.indexOf("LOẠI VÀNG");
  const sectionEndRaw = normalized.indexOf("LƯU Ý");
  const sectionEnd =
    sectionEndRaw > sectionStart
      ? sectionEndRaw
      : Math.min(text.length, sectionStart + 2000);
  const section =
    sectionStart >= 0 ? text.slice(sectionStart, sectionEnd) : text;

  const labelIndex = labelsInOrder.indexOf(label);
  if (labelIndex < 0) return { buy: null, sell: null };

  const numbers = (section.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? [])
    .map(parsePriceToken)
    .filter((n) => n != null)
    .filter((n, i, arr) => i === 0 || n !== arr[i - 1]);

  const buy = numbers[labelIndex * 2] ?? null;
  const sell = numbers[labelIndex * 2 + 1] ?? null;
  if (buy == null || sell == null) return { buy: null, sell: null };

  const hasAllLabels = labelsInOrder.every((x) => normalized.includes(x));
  if (!hasAllLabels) return { buy: null, sell: null };

  return { buy, sell };
}

export const NGOC_MAI_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Ngọc Mai",
  location: "Tây Ninh",
  unit: "luong",
  url: NGOC_MAI_CANVA_URL,
  webUrl: NGOC_MAI_WEB_URL,
  parse: (payload) => {
    const row = parseByLabel(payload, product.label);
    return {
      buy: row.buy,
      sell: row.sell,
      lastUpdateText: parseUpdateText(payload),
    };
  },
}));
