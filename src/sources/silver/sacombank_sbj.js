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

function extractOrderedRowsFromText(text) {
  const nums = (String(text || "").match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [])
    .map((raw) => parseSilverPriceToThousand(raw))
    .filter((n) => n != null);

  const rowsByNumber = new Map();
  let rowNo = 1;
  for (let i = 0; i + 1 < nums.length && rowNo <= 10; i += 2, rowNo += 1) {
    rowsByNumber.set(rowNo, {
      rowNo,
      text: "",
      buy: nums[i],
      sell: nums[i + 1],
    });
  }

  return rowsByNumber;
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
    .threshold(120)
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
    const rowRegex = new RegExp(
      `^(\\d{1,2})[.)]?\\s+(.+?)\\s+${pricePattern}\\s+${pricePattern}$`,
      "i",
    );

    for (const line of lines) {
      const m = line.match(rowRegex);
      if (!m) continue;

      const rowNo = Number(m[1]);
      const buy = parseSilverPriceToThousand(m[3]);
      const sell = parseSilverPriceToThousand(m[4]);
      if (!Number.isFinite(rowNo) || buy == null || sell == null) continue;

      const row = {
        rowNo,
        text: normalizeText(m[2]),
        buy,
        sell,
      };

      rowsByNumber.set(rowNo, row);
      rows.push(row);
    }

    // Fallback: OCR can split product and prices into separate lines.
    // In that case, take ordered price pairs (row 1..10) from a second OCR pass.
    await worker.setParameters({ tessedit_pageseg_mode: "12" });
    const { data: dataPsm12 } = await worker.recognize(preprocessed);
    const orderedRows = extractOrderedRowsFromText(
      String(dataPsm12.text || ""),
    );
    for (const [rowNo, row] of orderedRows.entries()) {
      if (!rowsByNumber.has(rowNo)) rowsByNumber.set(rowNo, row);
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
