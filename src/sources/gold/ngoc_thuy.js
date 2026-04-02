import { nowVnText, stripHtmlToText } from "../../utils.js";

const NGOC_THUY_PRODUCTS = [
  {
    id: "ngoc_thuy_vang_990",
    name: "Ngọc Thủy (Vàng 990)",
    label: "Vàng 990",
  },
  {
    id: "ngoc_thuy_vang_980",
    name: "Ngọc Thủy (Vàng 980)",
    label: "Vàng 980",
  },
  {
    id: "ngoc_thuy_vang_610",
    name: "Ngọc Thủy (Vàng 610)",
    label: "Vàng 610",
  },
];

const NGOC_THUY_URL = "https://tiemvangngocthuy.com/gia-vang-hom-nay/";
let lastPayloadKey = "";
let lastRowsPromise = null;

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

  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1_000_000 ? Math.round(n / 1000) : n;
}

function extractTableRows(payload) {
  const rows = [];
  const rowMatches = String(payload || "").match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of rowMatches) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]))
      .map((x) => x.trim())
      .filter(Boolean);

    if (cells.length < 3) continue;
    rows.push(cells);
  }

  return rows;
}

function parseBuySellByLabel(payload, label) {
  const rows = extractTableRows(payload);
  const normalizedLabel = normalizeText(label);

  for (const cells of rows) {
    if (normalizeText(cells[0]) !== normalizedLabel) continue;

    // On this page columns are: Loại vàng | Bán ra | Mua vào.
    const sell = parsePriceToken(cells[1]);
    const buy = parsePriceToken(cells[2]);

    if (buy != null && sell != null) return { buy, sell };
  }

  const text = stripHtmlToText(payload);
  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d{1,3}(?:[.,]\\d{3}){1,2})";

  // Fallback follows the same page order: label, sell, buy.
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );

  if (!m) return { buy: null, sell: null };

  const sell = parsePriceToken(m[1]);
  const buy = parsePriceToken(m[2]);
  return {
    buy: buy ?? null,
    sell: sell ?? null,
  };
}

function buildRowsByLabel(payload) {
  const rowsByLabel = new Map();
  for (const product of NGOC_THUY_PRODUCTS) {
    rowsByLabel.set(product.label, parseBuySellByLabel(payload, product.label));
  }
  return rowsByLabel;
}

async function fetchFallbackPayload() {
  const res = await fetch(NGOC_THUY_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!res.ok) {
    throw new Error(`fallback fetch failed with status ${res.status}`);
  }

  return res.text();
}

async function getRowsByLabel(payload) {
  const key = String(payload || "").slice(0, 2000);
  if (lastRowsPromise && key === lastPayloadKey) return lastRowsPromise;

  lastPayloadKey = key;
  lastRowsPromise = (async () => {
    const primary = buildRowsByLabel(payload);
    const hasPrimary = [...primary.values()].some(
      (x) => x.buy != null && x.sell != null,
    );
    if (hasPrimary) return primary;

    try {
      const fallbackPayload = await fetchFallbackPayload();
      const fallback = buildRowsByLabel(fallbackPayload);
      const hasFallback = [...fallback.values()].some(
        (x) => x.buy != null && x.sell != null,
      );
      if (hasFallback) return fallback;
    } catch {
      // Keep null results from primary payload if fallback fetch fails.
    }

    return primary;
  })();

  return lastRowsPromise;
}

export const NGOC_THUY_SOURCES = NGOC_THUY_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Ngọc Thủy",
  url: NGOC_THUY_URL,
  webUrl: NGOC_THUY_URL,
  location: "TP.HCM",
  parse: async (payload) => {
    const rowsByLabel = await getRowsByLabel(payload);
    const { buy, sell } = rowsByLabel.get(product.label) ?? {
      buy: null,
      sell: null,
    };
    return {
      buy,
      sell,
      lastUpdateText: nowVnText(),
    };
  },
}));
