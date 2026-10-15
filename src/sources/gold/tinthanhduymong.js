import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

export const PAGE_URL = "https://tinthanhduymong.vn";
export const API_URL = "https://tinthanhduymong.vn/api/v2/gold-prices/latest";

export const TIN_THANH_DUY_MONG_PRODUCTS = [
  {
    id: "tin_thanh_duy_mong",
    name: "Tín Thành Duy Mong (Vàng 24K)",
    code: "24K",
    label: "Vàng 24K",
  },
  {
    id: "tin_thanh_duy_mong_nu_trang_995",
    name: "Tín Thành Duy Mong (Nữ Trang 995)",
    code: "NT995",
    label: "Nữ Trang 995",
  },
  {
    id: "tin_thanh_duy_mong_vang_980",
    name: "Tín Thành Duy Mong (Vàng 980)",
    code: "980",
    label: "Vàng 980",
  },
  {
    id: "tin_thanh_duy_mong_vang_610",
    name: "Tín Thành Duy Mong (Vàng Tây 610)",
    code: "610",
    label: "Vàng Tây 610",
  },
  {
    id: "tin_thanh_duy_mong_vang_10k",
    name: "Tín Thành Duy Mong (Vàng 10K)",
    code: "10K",
    label: "Vàng 10K",
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
  // Drop decimal part (API returns e.g. "13300000.00").
  const digits = String(raw ?? "")
    .replace(/[.,]\d{1,2}$/, "")
    .replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Prices on site are full VND (e.g. 13.400.000); DB stores thousand-VND (13400).
  if (n >= 1_000_000) {
    n = Math.round(n / 1000);
  }
  return n;
}

function sanitizeBuySell(buy, sell) {
  if (buy != null && sell != null) {
    // Guard against accidental typo entry where digits are missed (e.g. 134 instead of 13400)
    if (
      buy < 1000 &&
      sell >= 5000 &&
      buy * 100 <= sell * 1.2 &&
      buy * 100 >= sell * 0.7
    ) {
      buy = buy * 100;
    }
    if (
      sell < 1000 &&
      buy >= 5000 &&
      sell * 100 >= buy * 0.8 &&
      sell * 100 <= buy * 1.3
    ) {
      sell = sell * 100;
    }
  }
  return { buy, sell };
}

function parseBuySellFromHtml(payload, product) {
  const $ = cheerio.load(String(payload || ""));
  const targetLabel = normalizeText(product.label);
  const targetCode = normalizeText(product.code);

  let buy = null;
  let sell = null;

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const rowName = normalizeText($(tds[0]).text());
    if (
      !rowName.includes(targetLabel) &&
      (!targetCode || !rowName.includes(targetCode))
    ) {
      return;
    }

    const buyTd = $(tds[1]).clone();
    buyTd.find("span").remove();
    const sellTd = $(tds[2]).clone();
    sellTd.find("span").remove();

    buy = parsePriceToken(buyTd.text());
    sell = parsePriceToken(sellTd.text());
    return false;
  });

  return sanitizeBuySell(buy, sell);
}

function parseBuySellFromJson(payload, product) {
  const raw = String(payload || "");
  const embeddedMatch = raw.match(/\{[\s\S]*\}/);
  if (!embeddedMatch) return { buy: null, sell: null };

  let data;
  try {
    data = JSON.parse(embeddedMatch[0]);
  } catch {
    return { buy: null, sell: null };
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data?.data)
      ? data.data.data
      : Array.isArray(data?.data)
        ? data.data
        : [];

  const targetCode = normalizeText(product.code);
  const targetLabel = normalizeText(product.label);

  const item = list.find((row) => {
    const code = normalizeText(row?.type?.code || row?.code);
    const name = normalizeText(row?.type?.name || row?.name);
    return code === targetCode || name.includes(targetLabel);
  });

  if (!item) return { buy: null, sell: null };

  const priceObj = item.price ?? item;
  const buy = parsePriceToken(priceObj.buy_price ?? priceObj.buy);
  const sell = parsePriceToken(priceObj.sell_price ?? priceObj.sell);

  return sanitizeBuySell(buy, sell);
}

export function parseBuySell(payload, product) {
  const raw = String(payload || "").trim();
  if (
    raw.startsWith("{") ||
    raw.startsWith("[") ||
    raw.includes("application/json") ||
    /<pre>[\s\S]*\{/.test(raw)
  ) {
    const jsonResult = parseBuySellFromJson(raw, product);
    if (jsonResult.buy != null && jsonResult.sell != null) {
      return jsonResult;
    }
  }

  return parseBuySellFromHtml(payload, product);
}

export function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Format on page: "Cập nhật lần cuối: 10:15 · 05/10/2026 · Giá tham khảo"
  const m = text.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*·\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
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

  const jsonMatch = String(payload || "").match(
    /"effective_at"\s*:\s*"([^"]+)"/,
  );
  if (jsonMatch) {
    const d = new Date(jsonMatch[1]);
    if (!Number.isNaN(d.getTime())) {
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
      const parts = fmt.formatToParts(d);
      const get = (type) => parts.find((p) => p.type === type)?.value || "00";
      return `${get("hour")}:${get("minute")}:${get("second")} ${get("day")}/${get("month")}/${get("year")}`;
    }
  }

  return nowVnText();
}

export const TIN_THANH_DUY_MONG_SOURCES = TIN_THANH_DUY_MONG_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Tín Thành Duy Mong",
    unit: "chi",
    url: API_URL,
    webUrl: PAGE_URL,
    location: "Huế",
    parse: (payload) => {
      const { buy, sell } = parseBuySell(payload, product);
      return {
        buy,
        sell,
        lastUpdateText: parseTime(payload),
      };
    },
  }),
);
