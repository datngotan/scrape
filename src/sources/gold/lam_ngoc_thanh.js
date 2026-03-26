import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const LAM_NGOC_THANH_PRODUCTS = [
  {
    id: "lam_ngoc_thanh_9999_24k",
    name: "Lâm Ngọc Thanh (Vàng 9999 24k)",
    label: "Vàng Lâm Ngọc Thanh 9999 24k",
    aliases: ["Vàng Lâm Ngọc Thanh 9999 24k"],
  },
  {
    id: "lam_ngoc_thanh_nu_trang_999",
    name: "Lâm Ngọc Thanh (Nữ Trang 99.9% 24k)",
    label: "Nữ Trang Lâm Ngọc Thanh 99.9% 24k",
    aliases: [
      "Nữ Trang Lâm Ngọc Thanh 99.9% 24k",
      "Nu Trang Lam Ngoc Thanh 99.9% 24k",
    ],
  },
  {
    id: "lam_ngoc_thanh_nu_trang_97",
    name: "Lâm Ngọc Thanh (Vàng Nữ Trang 97)",
    label: "Vàng Nữ Trang 97 Lâm Ngọc Thanh",
    aliases: [
      "Vàng Nữ Trang 97 Lâm Ngọc Thanh",
      "Vang Nu Trang 97 Lam Ngoc Thanh",
    ],
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

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Prices are full VND (e.g. 16300000); divide to store as thousands
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
  const rows = parseTableRows(payload);

  for (const row of rows) {
    if (isAliasMatch(row.label, aliases)) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Site format: "Cập nhật lúc: 2026-03-18 20:56:03"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const LAM_NGOC_THANH_SOURCES = LAM_NGOC_THANH_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Tiệm Vàng Lâm Ngọc Thanh",
    url: "https://giavangmaothiet.com/gia-vang-lam-ngoc-thanh-hom-nay/",
    webUrl: "https://giavangmaothiet.com/gia-vang-lam-ngoc-thanh-hom-nay/",
    location: "Đồng Nai",
    parse: (payload) => {
      const { buy, sell } = parseBuySellByLabel(payload, product);
      return {
        buy,
        sell,
        lastUpdateText: parseTime(payload),
      };
    },
  }),
);
