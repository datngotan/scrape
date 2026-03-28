import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    rowNo: 1,
    unit: "luong",
  },
  {
    id: "sacombank_sbj_bac_thoi_999_1_kg",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    rowNo: 2,
    unit: "kg",
  },
  {
    id: "sacombank_sbj_bac_my_nghe",
    name: "Sacombank-SBJ (Bạc mỹ nghệ)",
    rowNo: 3,
    unit: "luong",
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

function extractDateKeyFromText(input) {
  const m = String(input || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}${mm}${dd}`;
}

function extractBoardNoFromText(input) {
  const m = String(input || "").match(/\bbang\s*(\d{1,2})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function pickLatestBoardImages(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);
  const images = [];

  $("img").each((_, el) => {
    const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
    if (!src) return;
    if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;

    const alt = $(el).attr("alt") || "";
    images.push({
      url: src.replace(/_medium(?=\.[a-z]+$)/i, ""),
      alt,
      dateKey: extractDateKeyFromText(alt),
      boardNo: extractBoardNoFromText(alt),
    });
  });

  if (images.length === 0) return [];

  const latestDateKey = images
    .map((i) => i.dateKey)
    .filter(Boolean)
    .sort()
    .at(-1);

  const latest = latestDateKey
    ? images.filter((i) => i.dateKey === latestDateKey)
    : images;

  latest.sort((a, b) => {
    const aNo = a.boardNo ?? -1;
    const bNo = b.boardNo ?? -1;
    return bNo - aNo;
  });

  return latest;
}

function pickLatestBoardImage(payload) {
  return pickLatestBoardImages(payload)[0] ?? null;
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


async function ocrBoard(payload) {
  const imageMeta = pickLatestBoardImage(payload);
  if (!imageMeta?.url) {
    return { rowsByNumber: new Map(), rows: [], lastUpdateText: nowVnText() };
  }

  const imageBuffer = Buffer.from(
    await (await fetch(imageMeta.url)).arrayBuffer(),
  );

  const { width, height } = await sharp(imageBuffer).metadata();

  // Crop to bottom-right quarter: prices (GIÁ MUA + GIÁ BÁN) are in the right
  // half; the left columns contain product names and units only.
  const cropLeft = Math.floor(width / 2);
  const cropTop = Math.floor(height / 2);
  const cropWidth = width - cropLeft;
  const cropHeight = height - cropTop;

  const preprocessed = await sharp(imageBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .grayscale()
    .normalize()
    .resize({ width: 1300 })
    .sharpen()
    .threshold(100)
    .png()
    .toBuffer();

  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_char_whitelist: "0123456789.,",
    });
    const { data } = await worker.recognize(preprocessed);
    const text = String(data.text || "");

    // Extract all price-formatted numbers in document order
    const nums = (text.match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [])
      .map((raw) => parseSilverPriceToThousand(raw))
      .filter((n) => n != null);

    // Map consecutive buy/sell pairs to products in board order: row 1 → row 2 → row 3
    const PRODUCT_ORDER = [1, 2, 3];
    const rowsByNumber = new Map();
    for (let i = 0; i < PRODUCT_ORDER.length; i++) {
      const buy = nums[i * 2] ?? null;
      const sell = nums[i * 2 + 1] ?? null;
      if (buy != null && sell != null) {
        const rowNo = PRODUCT_ORDER[i];
        rowsByNumber.set(rowNo, { rowNo, buy, sell, text: "" });
      }
    }

    return {
      rowsByNumber,
      rows: [...rowsByNumber.values()],
      lastUpdateText: parseLastUpdateText(payload, text, imageMeta),
    };
  } finally {
    await worker.terminate();
  }
}

function pickRowForProduct(board, product) {
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
