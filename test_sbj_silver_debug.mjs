import { fetchHtml } from "./src/fetch.js";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { parseSilverPriceToThousand } from "./src/utils.js";

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

function isReasonableSilverPrice(value) {
  return Number.isFinite(value) && value >= 2000 && value <= 100000;
}

const url = "https://sacombank-sbj.com/blogs/bang-gia-bac";
const payload = await fetchHtml(url);

console.log(`\nFetching payload from ${url}`);
console.log(`Loaded payload length: ${String(payload.length)} bytes\n`);

const imageMeta = pickLatestBoardImage(payload);
if (!imageMeta?.url) {
  console.error("❌ NO IMAGE FOUND");
  process.exit(1);
}

console.log("✓ Image found:");
console.log(`  URL: ${imageMeta.url}`);
console.log(`  Alt: ${imageMeta.alt}\n`);

const imageBuffer = Buffer.from(
  await (await fetch(imageMeta.url)).arrayBuffer(),
);
const { width, height } = await sharp(imageBuffer).metadata();

console.log(`Image metadata: ${width}x${height}\n`);

// Save original
await sharp(imageBuffer).toFile("/tmp/sbj_silver_original.png");

// Per-cell OCR grid (same as main source)
const GRID = {
  rowCount: 3,
  firstRowTopRatio: 0.703,
  rowHeightRatio: 0.076,
  lastRowHeightRatio: 0.108,
  buyLeftRatio: 0.652,
  sellLeftRatio: 0.813,
  buyWidthRatio: 0.160,
  sellWidthRatio: 0.160,
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

const worker = await createWorker("eng");
await worker.setParameters({
  tessedit_pageseg_mode: "7",
  tessedit_char_whitelist: "0123456789.,",
});

console.log("--- PER-CELL OCR ---\n");

for (let i = 0; i < GRID.rowCount; i++) {
  const topRatio = GRID.firstRowTopRatio + i * GRID.rowHeightRatio;
  const rowH = i === GRID.rowCount - 1 ? GRID.lastRowHeightRatio : GRID.rowHeightRatio;

  const buyRect = buildCellRect(GRID.buyLeftRatio, topRatio, GRID.buyWidthRatio, rowH);
  const sellRect = buildCellRect(GRID.sellLeftRatio, topRatio, GRID.sellWidthRatio, rowH);

  for (const [label, rect] of [["buy", buyRect], ["sell", sellRect]]) {
    const cellBuf = await sharp(imageBuffer)
      .extract(rect)
      .grayscale()
      .normalize()
      .linear(1.5, -30)
      .resize({ width: 900 })
      .sharpen()
      .png()
      .toBuffer();

    await sharp(cellBuf).toFile(`/tmp/sbj_silver_r${i+1}_${label}.png`);

    const { data } = await worker.recognize(cellBuf);
    const text = String(data.text || "").trim();
    const token = text.match(/\d{1,3}(?:[.,]\d{3})+/)?.[0] ?? null;
    const price = token ? parseSilverPriceToThousand(token) : null;

    console.log(`Row ${i+1} ${label}: rect=(${rect.left},${rect.top},${rect.width},${rect.height}) | OCR="${text}" | price=${price}`);
  }
  console.log("");
}

await worker.terminate();

console.log("Expected: Row1=3012/3102, Row2=80320/82720, Row3=3012/3302");
console.log("\n✓ Cell images saved to /tmp/sbj_silver_r*_*.png");
