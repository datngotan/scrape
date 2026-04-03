import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const THANH_LIEN_PRODUCTS = [
  { id: "thanh_lien_nt99", code: "NT99", name: "Thành Liên (NT99)" },
  { id: "thanh_lien_ts99", code: "TS99", name: "Thành Liên (TS99)" },
  { id: "thanh_lien_ts999", code: "TS999", name: "Thành Liên (TS999)" },
  { id: "thanh_lien_ts9999", code: "TS9999", name: "Thành Liên (TS9999)" },
  { id: "thanh_lien_ts98", code: "TS98", name: "Thành Liên (TS98)" },
  { id: "thanh_lien_vi9999", code: "VI9999", name: "Thành Liên (VI9999)" },
  { id: "thanh_lien_nt999", code: "NT999", name: "Thành Liên (NT999)" },
];

function normalizeText(input) {
  return String(input || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Site displays full VND values (e.g. 15.100.000); DB stores by thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByCode(payload, code) {
  const target = normalizeText(code);

  // Primary path for direct-site HTML.
  const $ = cheerio.load(String(payload || ""));
  for (const table of $("table").toArray()) {
    for (const row of $(table).find("tr").toArray()) {
      const cells = $(row)
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().trim())
        .filter(Boolean);
      if (cells.length < 3) continue;

      const codeCellIdx = cells.findIndex(
        (cell) => normalizeText(cell) === target,
      );
      if (codeCellIdx < 0) continue;

      const buy = parsePriceToken(cells[codeCellIdx + 1] ?? "");
      const sell = parsePriceToken(cells[codeCellIdx + 2] ?? "");
      if (buy != null && sell != null) return { buy, sell };
    }
  }

  const lines = String(payload || "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    // Handle wrapped markdown rows by merging a short window.
    const merged = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((v) => v.includes("|"))
      .join(" ");

    const cells = merged
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const codeCellIdx = cells.findIndex(
      (cell) => normalizeText(cell) === target,
    );
    if (codeCellIdx < 0) continue;

    const buy = parsePriceToken(cells[codeCellIdx + 1] ?? "");
    const sell = parsePriceToken(cells[codeCellIdx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback over flattened text.
  const text = normalizeText(stripHtmlToText(payload));
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(
    new RegExp(`${escaped}\\s+(\\d[\\d.\\s,]*)\\s+(\\d[\\d.\\s,]*)`, "i"),
  );
  if (m) {
    const buy = parsePriceToken(m[1]);
    const sell = parsePriceToken(m[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(
    /cập\s*nhật\s*lúc\s*:\s*(\d{1,2})h(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const dd = m[3].padStart(2, "0");
    const mm = m[4].padStart(2, "0");
    const yyyy = m[5];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const THANH_LIEN_SOURCES = THANH_LIEN_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Thành Liên",
  unit: "luong",
  url: "https://vangthanhlien.vn/#banggia",
  webUrl: "https://vangthanhlien.vn/#banggia",
  location: "Hải Phòng",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByCode(payload, product.code);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
