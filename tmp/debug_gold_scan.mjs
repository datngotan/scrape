import { fetchHtml } from "../src/fetch.js";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

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

const payload = await fetchHtml("https://sacombank-sbj.com/blogs/gia-vang");
const $ = cheerio.load(payload);

let imgUrl = null;
$("img").each((_, el) => {
  const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
  if (!src) return;
  if (src.includes("cdn.hstatic.net/files/200000315699/article/") && !imgUrl) {
    imgUrl = src.replace(/_medium(?=\.[a-z]+$)/i, "");
  }
});

console.log("Image URL:", imgUrl);

const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
const meta = await sharp(buf).metadata();
console.log("Image size:", meta.width, "x", meta.height);

// Try scanning row by row with finer granularity
// Scan the buy column area for each pixel row to find where text/content exists
const buyColLeft = Math.floor(meta.width * 0.5);
const buyColRight = Math.floor(meta.width * 0.75);
const scanWidth = buyColRight - buyColLeft;

// Get raw pixel data for a vertical strip of the buy column
const strip = await sharp(buf)
  .extract({ left: buyColLeft, top: 0, width: scanWidth, height: meta.height })
  .grayscale()
  .raw()
  .toBuffer();

// Find rows with dark pixels (likely text or borders)
console.log("\n--- Vertical pixel intensity scan (buy column area) ---");
console.log(
  "Looking for dark horizontal bands (borders) and content rows...\n",
);

const rowAvgs = [];
for (let y = 0; y < meta.height; y++) {
  let sum = 0;
  for (let x = 0; x < scanWidth; x++) {
    sum += strip[y * scanWidth + x];
  }
  const avg = sum / scanWidth;
  rowAvgs.push(avg);
}

// Find dark lines (borders) - average pixel value < 80
console.log("Dark horizontal lines (potential borders):");
let inBorder = false;
const borders = [];
for (let y = 0; y < meta.height; y++) {
  if (rowAvgs[y] < 80) {
    if (!inBorder) {
      borders.push({ start: y, end: y });
      inBorder = true;
    } else {
      borders[borders.length - 1].end = y;
    }
  } else {
    inBorder = false;
  }
}
for (const b of borders) {
  const mid = Math.round((b.start + b.end) / 2);
  console.log(
    `  y=${b.start}-${b.end} (mid=${mid}, ratio=${(mid / meta.height).toFixed(4)})`,
  );
}

// Now try OCR on strips between borders
console.log("\n--- OCR on strips between borders ---");
const worker = await createWorker("eng");

// Try full-text OCR on each strip between borders (in the price area)
const priceLeft = Math.floor(meta.width * 0.48);
const priceWidth = meta.width - priceLeft;

for (let i = 0; i < borders.length - 1; i++) {
  const top = borders[i].end + 1;
  const bottom = borders[i + 1].start;
  const h = bottom - top;
  if (h < 10) continue; // skip tiny gaps

  const cell = await sharp(buf)
    .extract({ left: priceLeft, top, width: priceWidth, height: h })
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .resize({ width: 1200 })
    .sharpen()
    .png()
    .toBuffer();

  await worker.setParameters({
    tessedit_pageseg_mode: "7",
    tessedit_char_whitelist: "0123456789.,",
  });
  const { data } = await worker.recognize(cell);
  const text = data.text.trim();

  // Also try with full charset for labels
  const cellLabel = await sharp(buf)
    .extract({ left: 0, top, width: priceLeft, height: h })
    .grayscale()
    .normalize()
    .resize({ width: 800 })
    .sharpen()
    .png()
    .toBuffer();

  await worker.setParameters({
    tessedit_pageseg_mode: "7",
    tessedit_char_whitelist: "",
  });
  const { data: labelData } = await worker.recognize(cellLabel);
  const label = labelData.text.trim();

  console.log(
    `Strip ${i}: y=${top}-${bottom} (h=${h}, ratio=${(top / meta.height).toFixed(4)}-${(bottom / meta.height).toFixed(4)}) label="${label}" prices="${text}"`,
  );
}

await worker.terminate();
