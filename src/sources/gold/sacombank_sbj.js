import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText } from "../../utils.js";

const SACOMBANK_SBJ_PRODUCTS = [
  {
    id: "sacombank_sbj_my_nghe_24k_ep_vi",
    name: "Sacombank-SBJ (Vàng mỹ nghệ SBJ 24K ép vỉ)",
    rowNo: 2,
    keywords: ["my nghe", "24k", "ep vi"],
  },
  {
    id: "sacombank_sbj_nhan_tron_24k_ep_vi",
    name: "Sacombank-SBJ (Nhẫn trơn SBJ 24K ép vỉ)",
    rowNo: 3,
    keywords: ["nhan tron", "24k", "ep vi"],
  },
  {
    id: "sacombank_sbj_vang_24k_9999",
    name: "Sacombank-SBJ (Vàng 24K 99.99%)",
    rowNo: 4,
    keywords: ["24k", "99 99"],
  },
  {
    id: "sacombank_sbj_vang_22k_95",
    name: "Sacombank-SBJ (Vàng 22K 95%)",
    rowNo: 5,
    keywords: ["22k", "95"],
  }
];

let lastPayloadKey = "";
let lastBoardPromise = null;

const SBJ_GOLD_PRICE_GRID = {
  rowCount: 10,
  firstRowTopRatio: 0.417,
  rowHeightRatio: 0.0555,
  buyLeftRatio: 0.518,
  sellLeftRatio: 0.762,
  colWidthRatio: 0.22,
};

function parsePriceToThousand(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1_000_000 ? Math.round(n / 1000) : n;
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
    .map((raw) => parsePriceToThousand(raw))
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

function buildCellRect(width, height, leftRatio, topRatio) {
  const left = Math.max(0, Math.floor(width * leftRatio));
  const top = Math.max(0, Math.floor(height * topRatio));
  const rectWidth = Math.max(
    20,
    Math.floor(width * SBJ_GOLD_PRICE_GRID.colWidthRatio),
  );
  const rectHeight = Math.max(
    20,
    Math.floor(height * SBJ_GOLD_PRICE_GRID.rowHeightRatio) - 2,
  );

  return {
    left,
    top,
    width: Math.min(rectWidth, Math.max(1, width - left)),
    height: Math.min(rectHeight, Math.max(1, height - top)),
  };
}

async function recognizePriceCell(worker, imageBuffer, rect) {
  const cell = await sharp(imageBuffer)
    .extract(rect)
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .resize({ width: 900 })
    .sharpen()
    .png()
    .toBuffer();

  const { data } = await worker.recognize(cell);
  const text = String(data.text || "");
  const token = text.match(/\d{1,3}(?:[.,]\d{3}){1,2}/)?.[0] ?? null;
  return parsePriceToThousand(token);
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
  const { width, height } = await sharp(imageBuffer).metadata();

  const worker = await createWorker("eng");
  try {
    const rowsByNumber = new Map();
    const rows = [];

    // Primary: OCR each buy/sell cell in the fixed 10-row grid.
    await worker.setParameters({
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: "0123456789.,",
    });

    for (let i = 0; i < SBJ_GOLD_PRICE_GRID.rowCount; i += 1) {
      const topRatio =
        SBJ_GOLD_PRICE_GRID.firstRowTopRatio +
        i * SBJ_GOLD_PRICE_GRID.rowHeightRatio;

      const buyRect = buildCellRect(
        width,
        height,
        SBJ_GOLD_PRICE_GRID.buyLeftRatio,
        topRatio,
      );
      const sellRect = buildCellRect(
        width,
        height,
        SBJ_GOLD_PRICE_GRID.sellLeftRatio,
        topRatio,
      );

      const buy = await recognizePriceCell(worker, imageBuffer, buyRect);
      const sell = await recognizePriceCell(worker, imageBuffer, sellRect);

      if (buy == null || sell == null) continue;

      const rowNo = i + 1;
      const row = { rowNo, text: "", buy, sell };
      rowsByNumber.set(rowNo, row);
      rows.push(row);
    }

    // Fallback: OCR right-side columns as one block and infer ordered pairs.
    const cropLeft = Math.floor(width * 0.5);
    const cropTop = Math.floor(height * 0.24);
    const cropWidth = width - cropLeft;
    const cropHeight = height - cropTop;

    const preprocessed = await sharp(imageBuffer)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
      })
      .grayscale()
      .normalize()
      .resize({ width: 1800 })
      .sharpen()
      .png()
      .toBuffer();

    await worker.setParameters({
      tessedit_pageseg_mode: "11",
      tessedit_char_whitelist: "0123456789.,",
    });
    const { data } = await worker.recognize(preprocessed);
    const text = String(data.text || "");

    const orderedRows = extractOrderedRowsFromText(text);
    for (const [rowNo, row] of orderedRows.entries()) {
      if (!rowsByNumber.has(rowNo)) rowsByNumber.set(rowNo, row);
    }

    if (rows.length === 0) {
      rows.push(...rowsByNumber.values());
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

export const SACOMBANK_SBJ_SOURCES = SACOMBANK_SBJ_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Sacombank-SBJ",
  url: "https://sacombank-sbj.com/blogs/gia-vang",
  webUrl: "https://sacombank-sbj.com/blogs/gia-vang",
  location: "Toàn quốc",
  parse: async (payload) => {
    const board = await getBoardPromise(payload);
    const row = pickRowForProduct(board, product);
    return {
      buy: row?.buy ?? null,
      sell: row?.sell ?? null,
      lastUpdateText: board.lastUpdateText,
    };
  },
}));
