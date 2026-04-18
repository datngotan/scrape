import { fetchHtml } from "../src/fetch.js";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { parseSilverPriceToThousand } from "../src/utils.js";

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

// Find ALL board images, not just the first one
function pickAllBoardImages(payload) {
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
    });
  });

  return images;
}

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

const url = "https://sacombank-sbj.com/blogs/bang-gia-bac";
const payload = await fetchHtml(url);
console.log(`Fetched ${url} (${payload.length} bytes)\n`);

const allImages = pickAllBoardImages(payload);
console.log(`Found ${allImages.length} board images total:`);
allImages.forEach((img, i) => console.log(`  [${i}] ${img.alt} → ${img.url}`));
console.log("");

// Test the 3 most recent
const testImages = allImages.slice(0, 3);

for (let imgIdx = 0; imgIdx < testImages.length; imgIdx++) {
  const imageMeta = testImages[imgIdx];
  console.log(`\n${"=".repeat(70)}`);
  console.log(`IMAGE ${imgIdx + 1}: ${imageMeta.alt}`);
  console.log(`URL: ${imageMeta.url}`);
  console.log(`${"=".repeat(70)}\n`);

  const imageBuffer = Buffer.from(
    await (await fetch(imageMeta.url)).arrayBuffer(),
  );
  const { width, height } = await sharp(imageBuffer).metadata();
  console.log(`Dimensions: ${width}x${height}`);

  // Save original
  await sharp(imageBuffer).toFile(`/tmp/sbj_silver_test_${imgIdx + 1}_original.png`);

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

  let allParsed = true;
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

      await sharp(cellBuf).toFile(`/tmp/sbj_silver_test_${imgIdx + 1}_r${i + 1}_${label}.png`);

      const { data } = await worker.recognize(cellBuf);
      const text = String(data.text || "").trim();
      const token = text.match(/\d{1,3}(?:[.,]\d{3})+/)?.[0] ?? null;
      const price = token ? parseSilverPriceToThousand(token) : null;

      const status = price != null ? "✓" : "✗ FAIL";
      if (price == null) allParsed = false;
      console.log(`  Row ${i + 1} ${label.padEnd(4)}: ${status} | rect=(${rect.left},${rect.top},${rect.width},${rect.height}) | OCR="${text}" | price=${price}`);
    }
  }

  await worker.terminate();
  console.log(`\n  Result: ${allParsed ? "✓ ALL PRICES PARSED" : "✗ SOME PRICES FAILED"}`);
}

console.log("\n\nDone. Cell images saved to /tmp/sbj_silver_test_*");
