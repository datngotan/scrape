import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    rowNo: 1,
    keywords: ["kim phuc loc", "1l"],
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

function addRow(rowsByNumber, rowNo, buy, sell, text) {
  if (!Number.isFinite(rowNo)) return;
  if (buy == null || sell == null) return;

  rowsByNumber.set(rowNo, {
    rowNo,
    text: normalizeText(text),
    buy,
    sell,
  });
}

function extractRowsByProductHints(lines) {
  const rowsByNumber = new Map();
  const candidates = [];
  const pricePattern = /\d{1,3}(?:[.,]\d{3}){1,2}/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prices = line.match(pricePattern) ?? [];
    if (prices.length < 2) continue;

    const buy = parseSilverPriceToThousand(prices[0]);
    const sell = parseSilverPriceToThousand(prices[1]);
    if (buy == null || sell == null) continue;

    const context = normalizeText(
      [lines[i - 2], lines[i - 1], lines[i], lines[i + 1]]
        .filter(Boolean)
        .join(" "),
    );

    let rowNo = null;
    if (/\bmy nghe\b|limited edition/.test(context)) {
      rowNo = 3;
    } else if (/\bkg\b|vnd kg|1\s*kg/.test(context)) {
      rowNo = 2;
    } else if (/kim phuc loc|phuc loc|\b1l\b|\b10l\b|\b50l\b/.test(context)) {
      rowNo = 1;
    }

    candidates.push({ rowNo, buy, sell, text: context, index: i });
    if (rowNo != null && !rowsByNumber.has(rowNo)) {
      addRow(rowsByNumber, rowNo, buy, sell, context);
    }
  }

  // Fallback by value shape/order if OCR misses row labels.
  if (!rowsByNumber.has(2) && candidates.length > 0) {
    const kgCandidate = [...candidates].sort((a, b) => b.buy - a.buy)[0];
    if (kgCandidate?.buy > 10_000) {
      addRow(
        rowsByNumber,
        2,
        kgCandidate.buy,
        kgCandidate.sell,
        kgCandidate.text,
      );
    }
  }

  if (!rowsByNumber.has(3)) {
    const myNgheCandidate = candidates.find((c) =>
      /\bmy nghe\b|limited edition/.test(c.text),
    );
    if (myNgheCandidate) {
      addRow(
        rowsByNumber,
        3,
        myNgheCandidate.buy,
        myNgheCandidate.sell,
        myNgheCandidate.text,
      );
    }
  }

  if (!rowsByNumber.has(1)) {
    const row1Candidate = candidates.find((c) =>
      /kim phuc loc|phuc loc|\b1l\b|\b10l\b|\b50l\b/.test(c.text),
    );
    if (row1Candidate) {
      addRow(
        rowsByNumber,
        1,
        row1Candidate.buy,
        row1Candidate.sell,
        row1Candidate.text,
      );
    }
  }

  return rowsByNumber;
}

function extractRowsFromSparseText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const detectRowNo = (norm) => {
    if (/\bmy\s*ngh\w*\b|limited edition/.test(norm)) return 3;
    if (/\bkg\b|1\s*kg/.test(norm)) return 2;
    if (/kim\s*phuc|phuc\s*loc|phuc\s*lec/.test(norm)) return 1;
    return null;
  };

  const rowsByNumber = new Map();
  const rows = [];
  const buckets = new Map();
  let currentRowNo = null;

  const ensureBucket = (rowNo) => {
    if (!buckets.has(rowNo)) {
      buckets.set(rowNo, { text: "", prices: [] });
    }
    return buckets.get(rowNo);
  };

  for (const line of lines) {
    const norm = normalizeText(line);
    if (!norm) continue;

    const detectedRowNo = detectRowNo(norm);
    if (detectedRowNo != null) {
      currentRowNo = detectedRowNo;
      const bucket = ensureBucket(detectedRowNo);
      bucket.text = bucket.text ? `${bucket.text} ${norm}` : norm;
    } else if (currentRowNo != null && /vnd|luong|kg/.test(norm)) {
      const bucket = ensureBucket(currentRowNo);
      bucket.text = bucket.text ? `${bucket.text} ${norm}` : norm;
    }

    if (currentRowNo != null) {
      const prices = line.match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [];
      const bucket = ensureBucket(currentRowNo);
      for (const raw of prices) {
        const val = parseSilverPriceToThousand(raw);
        if (val != null) bucket.prices.push(val);
      }
    }
  }

  for (const rowNo of [1, 2, 3]) {
    const bucket = buckets.get(rowNo);
    if (!bucket || bucket.prices.length < 2) continue;

    const row = {
      rowNo,
      text: bucket.text,
      buy: bucket.prices[0],
      sell: bucket.prices[1],
    };

    rowsByNumber.set(rowNo, row);
    rows.push(row);
  }

  return { rowsByNumber, rows };
}

function extractPricePairsFromText(text) {
  const nums = (String(text || "").match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [])
    .map((raw) => parseSilverPriceToThousand(raw))
    .filter((n) => n != null);

  const pairs = [];
  for (let i = 0; i + 1 < nums.length; i += 1) {
    const buy = nums[i];
    const sell = nums[i + 1];
    if (buy == null || sell == null) continue;
    if (buy > sell) continue;
    pairs.push({ buy, sell });
  }

  return pairs;
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

    const hintedRows = extractRowsByProductHints(lines);
    for (const [rowNo, row] of hintedRows.entries()) {
      if (!rowsByNumber.has(rowNo)) rowsByNumber.set(rowNo, row);
    }

    // Fallback: OCR can split product and prices into separate lines.
    // Use sparse text mode without OSD to avoid requiring osd.traineddata.
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const { data: dataPsm12 } = await worker.recognize(preprocessed);
    const sparse = extractRowsFromSparseText(String(dataPsm12.text || ""));
    for (const [rowNo, row] of sparse.rowsByNumber.entries()) {
      rowsByNumber.set(rowNo, row);
    }
    for (const row of sparse.rows) {
      rows.push(row);
    }

    // Final fallback: if row 2 (1 kg) is still missing, infer from numeric pairs.
    // On this board, kg row is always the largest price pair by buy value.
    if (!rowsByNumber.has(2)) {
      const pairCandidates = extractPricePairsFromText(
        `${text}\n${String(dataPsm12.text || "")}`,
      )
        .filter((p) => p.buy > 10_000)
        .sort((a, b) => b.buy - a.buy);

      const kgPair = pairCandidates[0] ?? null;
      if (kgPair) {
        rowsByNumber.set(2, {
          rowNo: 2,
          text: "fallback kg pair",
          buy: kgPair.buy,
          sell: kgPair.sell,
        });
      }
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
  const compact = normalized.replace(/\s+/g, "");
  return keywords.every(
    (keyword) =>
      normalized.includes(normalizeText(keyword)) ||
      compact.includes(normalizeText(keyword).replace(/\s+/g, "")),
  );
}

function samePricePair(a, b) {
  if (!a || !b) return false;
  return a.buy === b.buy && a.sell === b.sell;
}

function pickRowForProduct(board, product) {
  const byKeywords = (board.rows || []).find((row) =>
    includesAllKeywords(row.text, product.keywords || []),
  );
  if (byKeywords) return byKeywords;

  // Guard against OCR fallback assigning the same luong pair to both row 1 and row 3.
  if (product.id === "sacombank_sbj_bac_my_nghe") {
    const row1 = board.rowsByNumber.get(1) ?? null;
    const row3 = board.rowsByNumber.get(3) ?? null;
    if (samePricePair(row1, row3)) {
      const alt = (board.rows || [])
        .filter((row) => row?.buy != null && row?.sell != null)
        .filter((row) => row.buy < 10_000)
        .filter((row) => !samePricePair(row, row1))
        .sort((a, b) => b.buy - a.buy)[0];
      if (alt) return alt;
    }
  }

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
