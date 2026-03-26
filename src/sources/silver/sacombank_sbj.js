import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    rowNo: 1,
    keywords: ["luong"],
    unit: "luong",
  },
  {
    id: "sacombank_sbj_bac_thoi_999_1_kg",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    rowNo: 2,
    keywords: ["kg"],
    unit: "kg",
  },
  {
    id: "sacombank_sbj_bac_my_nghe",
    name: "Sacombank-SBJ (Bạc mỹ nghệ)",
    rowNo: 3,
    keywords: ["my nghe"],
    unit: "luong",
  },
];

let lastPayloadKey = "";
let lastBoardPromise = null;

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

function pickLatestBoardImage(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);

  let first = null;
  $("img").each((_, el) => {
    if (first) return;
    const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
    if (!src) return;
    if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;

    const alt = $(el).attr("alt") || "";
    const url = src.replace(/_medium(?=\.[a-z]+$)/i, "");
    first = { url, alt };
  });

  return first;
}

function parseLastUpdateText(payload, ocrText, imageMeta) {
  const source = `${String(imageMeta?.alt || "")}\n${String(ocrText || "")}\n${String(payload || "")}`;

  const dateMatch = source.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dateMatch) return nowVnText();

  const dd = dateMatch[1].padStart(2, "0");
  const mm = dateMatch[2].padStart(2, "0");
  const yyyy = dateMatch[3];

  const hourMatch = source.match(/(\d{1,2})h(\d{2})/i);
  if (hourMatch) {
    const HH = hourMatch[1].padStart(2, "0");
    const MI = hourMatch[2];
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return `00:00:00 ${dd}/${mm}/${yyyy}`;
}

function extractRowsFromSparseText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const priceOnlyRe = /^\d{1,3}(?:[.,]\d{3}){1,2}$/;

  // Classify each line as price, product-name, or other.
  const elements = [];
  for (const line of lines) {
    if (priceOnlyRe.test(line.replace(/\s+/g, ""))) {
      const val = parseSilverPriceToThousand(line);
      if (val != null) {
        elements.push({ type: "price", value: val });
        continue;
      }
    }
    const norm = normalizeText(line);
    if (norm.length > 8 && /\bbac\b|\bsbj\b/.test(norm)) {
      elements.push({ type: "product", text: norm });
    } else {
      elements.push({ type: "other", text: norm });
    }
  }

  // For each product, collect nearest prices (prefer forward, fallback backward).
  const rowsByNumber = new Map();
  const rows = [];
  let rowNo = 0;

  for (let i = 0; i < elements.length; i++) {
    if (elements[i].type !== "product") continue;
    rowNo += 1;

    const forwardPrices = [];
    for (let j = i + 1; j < elements.length; j++) {
      if (elements[j].type === "product") break;
      if (elements[j].type === "price") forwardPrices.push(elements[j].value);
    }

    let prices = forwardPrices;
    if (prices.length === 0) {
      const backwardPrices = [];
      for (let j = i - 1; j >= 0; j--) {
        if (elements[j].type === "product") break;
        if (elements[j].type === "price")
          backwardPrices.unshift(elements[j].value);
      }
      prices = backwardPrices;
    }

    // Include next non-price line for context (unit text like VND/kg).
    let fullText = elements[i].text;
    if (i + 1 < elements.length && elements[i + 1].type === "other") {
      fullText += " " + elements[i + 1].text;
    }

    const row = {
      rowNo,
      text: fullText,
      buy: prices[0] ?? null,
      sell: prices[1] ?? null,
    };
    if (row.buy != null) {
      rowsByNumber.set(rowNo, row);
      rows.push(row);
    }
  }

  return { rowsByNumber, rows };
}

async function ocrBoard(payload) {
  const imageMeta = pickLatestBoardImage(payload);
  if (!imageMeta?.url) {
    return {
      rowsByNumber: new Map(),
      rows: [],
      lastUpdateText: nowVnText(),
    };
  }

  const imageBuffer = Buffer.from(
    await (await fetch(imageMeta.url)).arrayBuffer(),
  );
  const preprocessed = await sharp(imageBuffer)
    .grayscale()
    .normalize()
    .resize({ width: 2600 })
    .sharpen()
    .threshold(100)
    .png()
    .toBuffer();

  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const { data } = await worker.recognize(preprocessed);
    const text = String(data.text || "");

    const rowsByNumber = new Map();
    const rows = [];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const pricePattern = "(\\d{1,3}(?:[.,]\\d{3}){1,2})";
    // Silver board has no row numbers, so match product text followed by two prices
    const rowRegex = new RegExp(
      `^(.+?)\\s+${pricePattern}\\s+${pricePattern}$`,
      "i",
    );

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(rowRegex);
      if (!m) continue;

      const buy = parseSilverPriceToThousand(m[2]);
      const sell = parseSilverPriceToThousand(m[3]);
      if (buy == null || sell == null) continue;

      // Use preceding lines as context for product identification,
      // excluding the matched line itself (which may contain unit text like VND/luong).
      const contextText = lines.slice(Math.max(0, i - 3), i).join(" ");

      const row = {
        rowNo: 0,
        text: normalizeText(contextText),
        buy,
        sell,
      };

      // Only add to rows for keyword matching;
      // rowsByNumber is populated by the PSM12 product-aware parser below.
      rows.push(row);
    }

    // Fallback: OCR can split product and prices into separate lines.
    // Use a product-name-aware parser on a second OCR pass (sparse text mode).
    await worker.setParameters({ tessedit_pageseg_mode: "12" });
    const { data: dataPsm12 } = await worker.recognize(preprocessed);
    const sparse = extractRowsFromSparseText(String(dataPsm12.text || ""));
    for (const [rowNo, row] of sparse.rowsByNumber.entries()) {
      rowsByNumber.set(rowNo, row);
    }
    for (const row of sparse.rows) {
      rows.push(row);
    }

    return {
      rowsByNumber,
      rows,
      lastUpdateText: parseLastUpdateText(payload, text, imageMeta),
    };
  } finally {
    await worker.terminate();
  }
}

function includesAllKeywords(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.every((keyword) =>
    normalized.includes(normalizeText(keyword)),
  );
}

function pickRowForProduct(board, product) {
  const byKeywords = (board.rows || []).find((row) =>
    includesAllKeywords(row.text, product.keywords || []),
  );
  if (byKeywords) return byKeywords;

  return board.rowsByNumber.get(product.rowNo) ?? null;
}

function getBoardPromise(payload) {
  const key = String(payload || "").slice(0, 2000);
  if (lastBoardPromise && key === lastPayloadKey) return lastBoardPromise;

  lastPayloadKey = key;
  lastBoardPromise = ocrBoard(payload);
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
      const board = await getBoardPromise(payload);
      const row = pickRowForProduct(board, product);
      return {
        buy: row?.buy ?? null,
        sell: row?.sell ?? null,
        unit: product.unit,
        lastUpdateText: board.lastUpdateText,
      };
    },
  }),
);
