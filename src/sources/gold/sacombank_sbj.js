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
  },
  {
    id: "sacombank_sbj_vang_ep_vi_e_voucher",
    name: "Sacombank-SBJ (Vàng ép vỉ E-Voucher)",
    rowNo: 10,
    keywords: ["voucher"],
  },
];

let lastPayloadKey = "";
let lastBoardPromise = null;

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

function dateKeyFromText(input) {
  const m = String(input || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;

  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}${mm}${dd}`;
}

function pickLatestBoardImage(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);

  const candidates = [];
  $("img").each((_, el) => {
    const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
    if (!src) return;
    if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;

    const normalized = src.toLowerCase();
    if (!/(cn_|ch_)/.test(normalized)) return;

    const full = src.replace(/_medium(?=\.[a-z]+$)/i, "");
    // Prefer CH board (head store) over CN board.
    const score = normalized.includes("/ch_") ? 2 : 1;
    const alt = $(el).attr("alt") || "";
    const dateKey = dateKeyFromText(alt) ?? "00000000";
    candidates.push({ url: full, score, alt, dateKey });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return b.score - a.score;
  });
  return candidates[0];
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

async function ocrBoard(payload) {
  const imageMeta = pickLatestBoardImage(payload);
  if (!imageMeta?.url) {
    return {
      rowsByNumber: new Map(),
      rows: [],
      lastUpdateText: nowVnText(),
    };
  }

  const imageBuffer = Buffer.from(await (await fetch(imageMeta.url)).arrayBuffer());
  const preprocessed = await sharp(imageBuffer)
    .grayscale()
    .normalize()
    .resize({ width: 2600 })
    .linear(1.15, -10)
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
      const buy = parsePriceToThousand(m[3]);
      const sell = parsePriceToThousand(m[4]);
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
    const orderedRows = extractOrderedRowsFromText(String(dataPsm12.text || ""));
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
  return keywords.every((keyword) => normalized.includes(normalizeText(keyword)));
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