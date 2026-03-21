import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc thỏi SBJ 999 - 1 lượng)",
    unit: "luong",
  },
  {
    id: "sacombank_sbj_bac_thoi_999_1_kg",
    name: "Sacombank-SBJ (Bạc thỏi SBJ 999 - 1kg)",
    unit: "kg",
  },
];

let lastPayloadKey = "";
let lastBoardPromise = null;

function resolveImageUrl(baseUrl, rawSrc) {
  if (!rawSrc) return null;
  if (rawSrc.startsWith("//")) return `https:${rawSrc}`;
  if (rawSrc.startsWith("http")) return rawSrc;
  try {
    return new URL(rawSrc, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseDateParts(input) {
  const m = String(input || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return {
    dd: m[1].padStart(2, "0"),
    mm: m[2].padStart(2, "0"),
    yyyy: m[3],
  };
}

function pickLatestSilverBoard(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);

  const candidates = [];
  $("img").each((_, el) => {
    const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
    if (!src) return;
    if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;

    const normalized = src.toLowerCase();
    const boardMatch = normalized.match(/\/l(\d+)_/i);
    if (!boardMatch) return;

    const alt = $(el).attr("alt") || "";
    const date = parseDateParts(alt);
    const boardNo = Number(boardMatch[1]);
    const fullUrl = src.replace(/_medium(?=\.[a-z]+$)/i, "");
    candidates.push({
      url: fullUrl,
      alt,
      boardNo: Number.isFinite(boardNo) ? boardNo : 0,
      dateKey: date ? `${date.yyyy}${date.mm}${date.dd}` : "00000000",
    });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return b.boardNo - a.boardNo;
  });
  return candidates[0];
}

function parseLastUpdateText(payload, ocrText, imageMeta) {
  const source = `${String(imageMeta?.alt || "")}\n${String(ocrText || "")}\n${String(payload || "")}`;

  const date = parseDateParts(source);
  if (!date) return nowVnText();

  const hm = source.match(/(\d{1,2})h(\d{2})/i);
  if (hm) {
    const HH = hm[1].padStart(2, "0");
    const MI = hm[2];
    return `${HH}:${MI}:00 ${date.dd}/${date.mm}/${date.yyyy}`;
  }

  return `00:00:00 ${date.dd}/${date.mm}/${date.yyyy}`;
}

function extractTwoPrices(line) {
  const nums = (String(line || "").match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [])
    .map((raw) => parseSilverPriceToThousand(raw))
    .filter((n) => n != null);
  if (nums.length < 2) return { buy: null, sell: null };
  return { buy: nums[nums.length - 2], sell: nums[nums.length - 1] };
}

function parseRowsFromOcrText(text) {
  const rows = {
    luong: { buy: null, sell: null },
    kg: { buy: null, sell: null },
  };
  const pricedLines = [];

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    const prices = extractTwoPrices(line);
    if (prices.buy == null || prices.sell == null) continue;
    pricedLines.push(prices);

    if (lower.includes("kg") && rows.kg.buy == null) {
      rows.kg = prices;
      continue;
    }

    if ((/\bl\b/.test(lower) || lower.includes("luong")) && rows.luong.buy == null) {
      rows.luong = prices;
    }
  }

  // Fallback for noisy OCR labels: first priced row is often 1 luong, second is 1 kg.
  if (rows.luong.buy == null && pricedLines.length >= 1) {
    rows.luong = pricedLines[0];
  }
  if (rows.kg.buy == null && pricedLines.length >= 2) {
    rows.kg = pricedLines[1];
  }

  return rows;
}

async function ocrSilverBoard(payload) {
  const board = pickLatestSilverBoard(payload);
  if (!board?.url) {
    return {
      rows: {
        luong: { buy: null, sell: null },
        kg: { buy: null, sell: null },
      },
      lastUpdateText: nowVnText(),
    };
  }

  const imageBuffer = Buffer.from(await (await fetch(board.url)).arrayBuffer());
  const preprocessed = await sharp(imageBuffer)
    .grayscale()
    .normalize()
    .resize({ width: 2600 })
    .linear(1.2, -15)
    .png()
    .toBuffer();

  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const { data } = await worker.recognize(preprocessed);
    const text = String(data.text || "");

    return {
      rows: parseRowsFromOcrText(text),
      lastUpdateText: parseLastUpdateText(payload, text, board),
    };
  } finally {
    await worker.terminate();
  }
}

function getSilverBoardPromise(payload) {
  const key = String(payload || "").slice(0, 2500);
  if (lastBoardPromise && key === lastPayloadKey) return lastBoardPromise;

  lastPayloadKey = key;
  lastBoardPromise = ocrSilverBoard(payload);
  return lastBoardPromise;
}

export const SACOMBANK_SBJ_SILVER_SOURCES = SACOMBANK_SBJ_SILVER_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Sacombank-SBJ",
    url: "https://sacombank-sbj.com/blogs/bang-gia-bac",
    webUrl: "https://sacombank-sbj.com/blogs/bang-gia-bac",
    location: "Toàn quốc",
    unit: product.unit,
    parse: async (payload) => {
      const board = await getSilverBoardPromise(payload);
      const row = product.unit === "kg" ? board.rows.kg : board.rows.luong;
      return {
        buy: row.buy,
        sell: row.sell,
        unit: product.unit,
        lastUpdateText: board.lastUpdateText,
      };
    },
  }),
);