import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const BAO_TIN_KK_PRODUCTS = [
  {
    id: "bao_tin_kk",
    name: "Bảo Tín KK (Nhẫn ép vỉ 99,9)",
    aliases: ["Nhẫn ép vỉ 99,9", "Nhẫn ép vỉ 99.9", "Nhẫn ép vỉ 999"],
  },
  {
    id: "bao_tin_kk_nu_trang_cuoi_980",
    name: "Bảo Tín KK (Nữ trang cưới 980)",
    aliases: ["Nữ trang cưới 980", "Nu trang cuoi 980"],
  },
  {
    id: "bao_tin_kk_nu_trang_750",
    name: "Bảo Tín KK (Nữ trang 750)",
    aliases: ["Nữ trang 750"],
  },
  {
    id: "bao_tin_kk_nu_trang_610",
    name: "Bảo Tín KK (Nữ trang 610)",
    aliases: ["Nữ trang 610"],
  },
];

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

function isAliasMatch(label, aliases) {
  const normalizedLabel = normalizeText(label);
  return aliases.some((alias) => normalizedLabel === normalizeText(alias));
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Prices are full VND per "chỉ" (e.g. "13.200.000/chỉ"); store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
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
    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function parseBuySell(payload, product) {
  const rows = parseTableRows(payload);
  for (const row of rows) {
    if (isAliasMatch(row.label, product.aliases)) {
      return { buy: row.buy, sell: row.sell };
    }
  }
  return { buy: null, sell: null };
}

function vnTextAt(date) {
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
  const s = fmt.format(date).replace(",", "");
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return "";
  const [, dd, mm, yyyy, HH, MI, SS] = m;
  return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Absolute format: "Cập nhật mới nhất: 14:01, 08/03/2026 (Giờ VN)"
  const abs = text.match(
    /Cập\s*nhật\s*mới\s*nhất\s*:\s*(\d{1,2}):(\d{2})\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (abs) {
    const HH = abs[1].padStart(2, "0");
    const MI = abs[2];
    const dd = abs[3].padStart(2, "0");
    const mm = abs[4].padStart(2, "0");
    const yyyy = abs[5];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  // Relative format (observed live): "Cập nhật mới nhất: 5 phút trước (Giờ VN)",
  // also "... 1 giờ trước ...", "... vừa xong ...".
  const rel = text.match(/Cập\s*nhật\s*mới\s*nhất\s*:\s*([^(]+?)\s*\(/i);
  if (rel) {
    const phrase = rel[1].trim().toLowerCase();
    const num = phrase.match(/(\d+)/);
    const n = num ? parseInt(num[1], 10) : 0;
    let offsetMs = 0;
    if (/giây/.test(phrase)) offsetMs = n * 1_000;
    else if (/phút/.test(phrase)) offsetMs = n * 60_000;
    else if (/giờ/.test(phrase)) offsetMs = n * 3_600_000;
    else if (/ngày/.test(phrase)) offsetMs = n * 86_400_000;
    // "vừa xong" (just now) or unrecognized phrasing falls through with offsetMs = 0.
    return vnTextAt(new Date(Date.now() - offsetMs));
  }

  return nowVnText();
}

export const BAO_TIN_KK_SOURCES = BAO_TIN_KK_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Bảo Tín K&K",
  url: "https://baotinkk.com/pages/gia-vang",
  webUrl: "https://baotinkk.com/pages/gia-vang",
  location: "TP.HCM",
  parse: (payload) => {
    const { buy, sell } = parseBuySell(payload, product);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
