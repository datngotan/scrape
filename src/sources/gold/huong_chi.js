import * as cheerio from "cheerio";

const HUONG_CHI_PRODUCTS = [
  {
    id: "huong_chi_ep_vi_hcj_9999",
    name: "Hương Chi (Vàng 999.9 ép vỉ HCJ)",
    label: "Vàng 999.9 (ép vỉ HCJ)",
    aliases: ["Vàng 999.9 (ép vỉ HCJ)", "Vang 999.9 ep vi HCJ"],
  },
  {
    id: "huong_chi_9999",
    name: "Hương Chi (Vàng 999.9)",
    label: "Vàng 999.9",
    aliases: ["Vàng 999.9", "Vang 999.9"],
  },
  {
    id: "huong_chi_999",
    name: "Hương Chi (Vàng 99.9)",
    label: "Vàng 99.9",
    aliases: ["Vàng 99.9", "Vang 99.9"],
  },
];

const HUONG_CHI_WEB_URL = "http://vanghuongchi.com.vn/";
const HUONG_CHI_SOURCE_URL = "http://vanghuongchi.com.vn/";

function normalizeSpaces(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
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

function parseTableRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;
    const buy = parseDongPerChiToThousand(cells[1]);
    const sell = parseDongPerChiToThousand(cells[2]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function isAliasMatch(label, aliases) {
  const normalizedLabel = normalizeText(label);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return (
      normalizedLabel === normalizedAlias ||
      normalizedLabel.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedLabel)
    );
  });
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];
  const normalizedAliases = aliases.map(normalizeText);

  const rows = parseTableRows(payload);
  // Pass 1: exact label match to avoid 999.9 matching the "ep vi" row.
  for (const row of rows) {
    const normalizedRowLabel = normalizeText(row.label);
    if (normalizedAliases.includes(normalizedRowLabel)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  // Pass 2: loose alias matching.
  for (const row of rows) {
    if (isAliasMatch(row.label, aliases)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  // Fallback for plain-text payloads.
  const text = normalizeSpaces(payload);
  for (const alias of aliases) {
    const escapedLabel = escapeReg(alias);
    const rowRe = new RegExp(
      `(?:\\*\\*)?\\s*${escapedLabel}\\s*(?:\\*\\*)?\\s*([\\d.,]+)\\s+([\\d.,]+)`,
      "i",
    );
    const m = text.match(rowRe);
    if (!m) continue;

    return {
      buy: parseDongPerChiToThousand(m[1]),
      sell: parseDongPerChiToThousand(m[2]),
    };
  }

  return { buy: null, sell: null };
}

export const HUONG_CHI_SOURCES = HUONG_CHI_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Hương Chi",
  location: "Bắc Ninh",
  unit: "luong",
  url: HUONG_CHI_SOURCE_URL,
  webUrl: HUONG_CHI_WEB_URL,
  parse: (payload) => {
    const row = parseBuySellByLabel(payload, product);
    return {
      buy: row.buy,
      sell: row.sell,
      lastUpdateText: parseTime(payload) || nowVnText(),
    };
  },
}));
