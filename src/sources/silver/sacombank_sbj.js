import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    type: "luong",
    unit: "luong",
  },
  {
    id: "sacombank_sbj_bac_thoi_999_1_kg",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    type: "kg",
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

function collectSilverBoardImages(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);

  const images = [];
  $("img").each((_, el) => {
    const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
    if (!src) return;
    if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;

    const alt = $(el).attr("alt") || "";
    const url = src.replace(/_medium(?=\.[a-z]+$)/i, "");
    images.push({ url, alt });
  });

  return images;
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

const LUONG_RE = /[li]u.{0,2}ng/i;
const PRICE_RE = /\d{1,3}(?:[.,]\d{3}){1,2}/g;

function classifyLine(line) {
  const normalized = normalizeText(line);
  if (normalized.includes("my nghe") || normalized.includes("limited"))
    return "myNghe";
  if (line.toLowerCase().includes("kg")) return "kg";
  if (LUONG_RE.test(line)) return "luong";
  return null;
}

function parseRowsFromOcrText(text) {
  const rows = {
    luong: { buy: null, sell: null },
    kg: { buy: null, sell: null },
    myNghe: { buy: null, sell: null },
  };

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Pass 1: lines with 2+ prices (old row-per-line format)
  const pricedLines = [];
  for (const line of lines) {
    const nums = (line.match(PRICE_RE) ?? [])
      .map((raw) => parseSilverPriceToThousand(raw))
      .filter((n) => n != null);
    if (nums.length < 2) continue;
    const pair = { buy: nums[nums.length - 2], sell: nums[nums.length - 1] };
    const label = classifyLine(line);
    if (label === "kg" && rows.kg.buy == null) rows.kg = pair;
    else if (label === "luong" && rows.luong.buy == null) rows.luong = pair;
    else if (label === "myNghe" && rows.myNghe.buy == null) rows.myNghe = pair;
    else pricedLines.push(pair);
  }

  if (rows.luong.buy == null && pricedLines.length >= 1)
    rows.luong = pricedLines[0];
  if (rows.kg.buy == null && pricedLines.length >= 2) rows.kg = pricedLines[1];

  if (rows.luong.buy != null && rows.kg.buy != null) {
    if (rows.myNghe.buy == null) {
      rows.myNghe =
        pricedLines.length >= 1
          ? pricedLines[0]
          : { buy: rows.luong.buy, sell: rows.luong.sell };
    }
    return rows;
  }

  // Pass 2: single-price lines (PSM 4 column-read format)
  const labeledPrices = { luong: [], kg: [], myNghe: [] };
  const unlabeled = [];
  for (const line of lines) {
    const nums = (line.match(PRICE_RE) ?? [])
      .map((raw) => parseSilverPriceToThousand(raw))
      .filter((n) => n != null);
    if (nums.length === 0) continue;
    const label = classifyLine(line);
    if (label) {
      for (const v of nums) labeledPrices[label].push(v);
    } else {
      for (const v of nums) unlabeled.push(v);
    }
  }

  if (rows.luong.buy == null && labeledPrices.luong.length >= 1) {
    rows.luong.buy = labeledPrices.luong[0];
  }
  if (rows.kg.buy == null && labeledPrices.kg.length >= 1) {
    rows.kg.buy = labeledPrices.kg[0];
  }

  // Unlabeled prices are sell values in order: luong sell, kg sell, myNghe sell
  let ui = 0;
  if (
    rows.luong.sell == null &&
    rows.luong.buy != null &&
    ui < unlabeled.length
  ) {
    rows.luong.sell = unlabeled[ui++];
  }
  if (rows.kg.sell == null && rows.kg.buy != null && ui < unlabeled.length) {
    rows.kg.sell = unlabeled[ui++];
  }
  if (rows.myNghe.buy == null && ui < unlabeled.length) {
    rows.myNghe = {
      buy: rows.luong.buy ?? unlabeled[ui],
      sell: unlabeled[ui++],
    };
  }

  if (rows.myNghe.buy == null && rows.luong.buy != null) {
    rows.myNghe = { buy: rows.luong.buy, sell: rows.luong.sell };
  }

  return rows;
}

async function ocrOneImage(url) {
  const imageBuffer = Buffer.from(await (await fetch(url)).arrayBuffer());
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
    await worker.setParameters({ tessedit_pageseg_mode: "4" });
    const { data } = await worker.recognize(preprocessed);
    return String(data.text || "");
  } finally {
    await worker.terminate();
  }
}

const MAX_IMAGES_TO_TRY = 5;

async function ocrSilverBoard(payload) {
  const images = collectSilverBoardImages(payload);
  if (images.length === 0) {
    return {
      rows: {
        luong: { buy: null, sell: null },
        kg: { buy: null, sell: null },
        myNghe: { buy: null, sell: null },
      },
      lastUpdateText: nowVnText(),
    };
  }

  for (let i = 0; i < Math.min(images.length, MAX_IMAGES_TO_TRY); i++) {
    const img = images[i];
    const text = await ocrOneImage(img.url);
    const rows = parseRowsFromOcrText(text);

    if (rows.luong.buy != null && rows.kg.buy != null) {
      return {
        rows,
        lastUpdateText: parseLastUpdateText(payload, text, img),
      };
    }
  }

  // Fallback: OCR first image and return whatever it has
  const img = images[0];
  const text = await ocrOneImage(img.url);
  return {
    rows: parseRowsFromOcrText(text),
    lastUpdateText: parseLastUpdateText(payload, text, img),
  };
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
      const row =
        product.type === "kg"
          ? board.rows.kg
          : product.type === "my_nghe"
            ? board.rows.myNghe
            : board.rows.luong;
      return {
        buy: row.buy,
        sell: row.sell,
        unit: product.unit,
        lastUpdateText: board.lastUpdateText,
      };
    },
  }),
);
