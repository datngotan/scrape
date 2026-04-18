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

const SBJ_SILVER_DEBUG =
  process.env.SACOMBANK_SBJ_SILVER_DEBUG === "1" ||
  process.env.SACOMBANK_SBJ_DEBUG === "1" ||
  process.env.DEBUG_SBJ === "1";

function isReasonableSilverPrice(value) {
  return Number.isFinite(value) && value >= 2000 && value <= 100000;
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
    first = {
      url: src.replace(/_medium(?=\.[a-z]+$)/i, ""),
      alt,
    };
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

async function ocrBoard(payload, options = {}) {
  const imageMeta = pickLatestBoardImage(payload);
  if (!imageMeta?.url) {
    return { rowsByNumber: new Map(), rows: [], lastUpdateText: nowVnText() };
  }

  const imageBuffer = Buffer.from(
    await (await fetch(imageMeta.url)).arrayBuffer(),
  );

  const { width, height } = await sharp(imageBuffer).metadata();

  // Fixed grid layout for the silver price board.
  // Each price is OCR'd individually from its own cell for maximum accuracy.
  const SBJ_SILVER_PRICE_GRID = {
    rowCount: 3,
    firstRowTopRatio: 0.703,
    rowHeightRatio: 0.076, // ~(0.779-0.703)
    lastRowHeightRatio: 0.108, // last row is taller (0.963-0.855)
    buyLeftRatio: 0.652,
    sellLeftRatio: 0.813,
    buyWidthRatio: 0.160, // 0.818 - 0.652, with inset
    sellWidthRatio: 0.160, // 0.978 - 0.813, with inset
  };

  function buildCellRect(leftRatio, topRatio, widthRatio, heightRatio) {
    const left = Math.max(0, Math.floor(width * leftRatio) + 2);
    const top = Math.max(0, Math.floor(height * topRatio) + 2);
    const rectWidth = Math.max(20, Math.floor(width * widthRatio) - 4);
    const rectHeight = Math.max(20, Math.floor(height * heightRatio) - 4);
    return {
      left,
      top,
      width: Math.min(rectWidth, Math.max(1, width - left)),
      height: Math.min(rectHeight, Math.max(1, height - top)),
    };
  }

  async function recognizePriceCell(worker, rect) {
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
    const token = text.match(/\d{1,3}(?:[.,]\d{3})+/)?.[0] ?? null;
    return { price: token ? parseSilverPriceToThousand(token) : null, text };
  }

  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: "0123456789.,",
    });

    const rowsByNumber = new Map();
    const cellResults = [];

    for (let i = 0; i < SBJ_SILVER_PRICE_GRID.rowCount; i++) {
      const topRatio =
        SBJ_SILVER_PRICE_GRID.firstRowTopRatio +
        i * SBJ_SILVER_PRICE_GRID.rowHeightRatio;
      const rowH =
        i === SBJ_SILVER_PRICE_GRID.rowCount - 1
          ? SBJ_SILVER_PRICE_GRID.lastRowHeightRatio
          : SBJ_SILVER_PRICE_GRID.rowHeightRatio;

      const buyRect = buildCellRect(
        SBJ_SILVER_PRICE_GRID.buyLeftRatio,
        topRatio,
        SBJ_SILVER_PRICE_GRID.buyWidthRatio,
        rowH,
      );
      const sellRect = buildCellRect(
        SBJ_SILVER_PRICE_GRID.sellLeftRatio,
        topRatio,
        SBJ_SILVER_PRICE_GRID.sellWidthRatio,
        rowH,
      );

      const buyResult = await recognizePriceCell(worker, buyRect);
      const sellResult = await recognizePriceCell(worker, sellRect);

      if (SBJ_SILVER_DEBUG) {
        console.log(
          `[SBJ Silver] Row ${i + 1}: buy="${buyResult.text.trim()}" → ${buyResult.price}, sell="${sellResult.text.trim()}" → ${sellResult.price}`,
        );
      }

      cellResults.push({ buyResult, sellResult, buyRect, sellRect });

      const buy = buyResult.price;
      const sell = sellResult.price;
      if (buy != null && sell != null) {
        const rowNo = i + 1;
        rowsByNumber.set(rowNo, { rowNo, buy, sell, text: "" });
      }
    }

    // Fallback: if per-cell OCR missed rows, try bulk OCR on the right half
    if (rowsByNumber.size < SBJ_SILVER_PRICE_GRID.rowCount) {
      const cropLeft = Math.floor(width * 0.30);
      const cropTop = Math.floor(height * 0.35);
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

      await worker.setParameters({
        tessedit_pageseg_mode: "11",
        tessedit_char_whitelist: "0123456789.,",
      });
      const { data } = await worker.recognize(preprocessed);
      const text = String(data.text || "");

      const rawNumbers = text.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? [];
      const nums = rawNumbers
        .map((raw) => parseSilverPriceToThousand(raw))
        .filter((n) => isReasonableSilverPrice(n));

      for (let i = 0; i < 3; i++) {
        const rowNo = i + 1;
        if (rowsByNumber.has(rowNo)) continue;
        const buy = nums[i * 2] ?? null;
        const sell = nums[i * 2 + 1] ?? null;
        if (buy != null && sell != null) {
          rowsByNumber.set(rowNo, { rowNo, buy, sell, text: "" });
        }
      }
    }

    const debug = options?.debug || SBJ_SILVER_DEBUG
      ? {
          imageMeta,
          imageSize: { width, height },
          cellResults,
        }
      : undefined;

    return {
      rowsByNumber,
      rows: [...rowsByNumber.values()],
      lastUpdateText: parseLastUpdateText(payload, "", imageMeta),
      debug,
    };
  } finally {
    await worker.terminate();
  }
}

function pickRowForProduct(board, product) {
  return board.rowsByNumber.get(product.rowNo) ?? null;
}

function getBoardPromise(payload, options = {}) {
  const debugEnabled = options?.debug || SBJ_SILVER_DEBUG;
  const key = `${String(payload || "").slice(0, 2000)}|debug=${debugEnabled ? 1 : 0}`;
  if (lastBoardPromise && key === lastPayloadKey) return lastBoardPromise;

  lastPayloadKey = key;
  lastBoardPromise = ocrBoard(payload, options);
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
    parse: async (payload, options = {}) => {
      const board = await getBoardPromise(payload, options);
      const row = pickRowForProduct(board, product);
      return {
        buy: row?.buy ?? null,
        sell: row?.sell ?? null,
        unit: product.unit,
        lastUpdateText: board.lastUpdateText,
        debug: board.debug,
      };
    },
  }),
);
