const HUONG_CHI_PRODUCTS = [
  {
    id: "huong_chi_ep_vi_hcj_9999",
    name: "Hương Chi (Vàng 999.9 ép vỉ HCJ)",
    label: "Vàng 999.9 (ép vỉ HCJ)",
  },
  {
    id: "huong_chi_9999",
    name: "Hương Chi (Vàng 999.9)",
    label: "Vàng 999.9",
  },
  {
    id: "huong_chi_999",
    name: "Hương Chi (Vàng 99.9)",
    label: "Vàng 99.9",
  },
];

const HUONG_CHI_WEB_URL = "http://vanghuongchi.com.vn/";
const HUONG_CHI_JINA_URL = "http://vanghuongchi.com.vn/";

function normalizeSpaces(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function escapeReg(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDongPerChiToThousand(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 1000);
}

function nowVnText() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const s = fmt.format(d).replace(",", "");
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return "";
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  const HH = m[4];
  const MI = m[5];
  const SS = m[6];
  return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
}

function parseTime(payload) {
  const text = normalizeSpaces(String(payload || "").replace(/\*\*/g, " "));
  const m = text.match(
    /Nguồn\s*Vàng\s*Hương\s*Chi\s*lúc\s*:\s*(\d{1,2}):(\d{2})\s*ngày\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (!m) return "";

  const HH = m[1].padStart(2, "0");
  const MI = m[2];
  const dd = m[3];
  const mm = m[4];
  const yyyy = m[5];
  return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
}

function parseBuySellByLabel(payload, label) {
  const text = normalizeSpaces(payload);
  const escapedLabel = escapeReg(label);

  const rowRe = new RegExp(
    `(?:\\*\\*)?\\s*${escapedLabel}\\s*(?:\\*\\*)?\\s*([\\d.,]+)\\s+([\\d.,]+)`,
    "i",
  );
  const m = text.match(rowRe);
  if (!m) return { buy: null, sell: null };

  return {
    buy: parseDongPerChiToThousand(m[1]),
    sell: parseDongPerChiToThousand(m[2]),
  };
}

export const HUONG_CHI_SOURCES = HUONG_CHI_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Hương Chi",
  location: "Bắc Ninh",
  unit: "luong",
  url: HUONG_CHI_JINA_URL,
  webUrl: HUONG_CHI_WEB_URL,
  parse: (payload) => {
    const row = parseBuySellByLabel(payload, product.label);
    return {
      buy: row.buy,
      sell: row.sell,
      lastUpdateText: parseTime(payload) || nowVnText(),
    };
  },
}));
