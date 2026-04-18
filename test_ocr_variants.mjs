import { fetchHtml } from "./src/fetch.js";
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

const url = "https://sacombank-sbj.com/blogs/bang-gia-bac";
console.log("Fetching...");
const payload = await fetchHtml(url);

const imageMeta = pickLatestBoardImage(payload);
if (!imageMeta?.url) {
  console.error("❌ NO IMAGE FOUND");
  process.exit(1);
}

console.log("✓ Image found:", imageMeta.url);

const imageBuffer = Buffer.from(
  await (await fetch(imageMeta.url)).arrayBuffer(),
);
const { width, height } = await sharp(imageBuffer).metadata();
console.log(`Image size: ${width}x${height}`);

const cropLeft = Math.floor(width / 2);
const cropTop = Math.floor(height * 0.35);
const cropWidth = width - cropLeft;
const cropHeight = height - cropTop;

console.log(`Crop: left=${cropLeft} top=${cropTop} w=${cropWidth} h=${cropHeight}\n`);

const cropped = await sharp(imageBuffer)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .grayscale()
  .normalize()
  .resize({ width: 1300 })
  .sharpen()
  .threshold(100)
  .png()
  .toBuffer();

await sharp(cropped).toFile("/tmp/sbj_test_crop.png");
console.log("✓ Saved: /tmp/sbj_test_crop.png\n");

const worker = await createWorker("eng");

// Test 1: Current settings (whitelist + mode 11)
console.log("=== TEST 1: Current (mode=11, whitelist=0123456789.,) ===");
await worker.setParameters({
  tessedit_pageseg_mode: "11",
  tessedit_char_whitelist: "0123456789.,",
});
let { data } = await worker.recognize(cropped);
console.log(data.text);
console.log("");

// Test 2: No whitelist (see all characters)
console.log("=== TEST 2: No whitelist (mode=11) ===");
await worker.setParameters({
  tessedit_pageseg_mode: "11",
  tessedit_char_whitelist: "",
});
({ data } = await worker.recognize(cropped));
console.log(data.text.substring(0, 500));
console.log("");

// Test 3: Mode 6 (single uniform text block)
console.log("=== TEST 3: Mode 6, whitelist=0123456789., ===");
await worker.setParameters({
  tessedit_pageseg_mode: "6",
  tessedit_char_whitelist: "0123456789.,",
});
({ data } = await worker.recognize(cropped));
console.log(data.text);
console.log("");

// Test 4: Mode 3 (fully automatic)
console.log("=== TEST 4: Mode 3 (auto), whitelist=0123456789., ===");
await worker.setParameters({
  tessedit_pageseg_mode: "3",
  tessedit_char_whitelist: "0123456789.,",
});
({ data } = await worker.recognize(cropped));
console.log(data.text);
console.log("");

// Test 5: Remove threshold (keep more detail)
console.log("=== TEST 5: No threshold, mode=11 ===");
const croppedNoThreshold = await sharp(imageBuffer)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .grayscale()
  .normalize()
  .resize({ width: 1300 })
  .sharpen()
  .png()
  .toBuffer();

await worker.setParameters({
  tessedit_pageseg_mode: "11",
  tessedit_char_whitelist: "0123456789.,",
});
({ data } = await worker.recognize(croppedNoThreshold));
console.log(data.text);
console.log("");

// Test 6: Increase contrast
console.log("=== TEST 6: Higher contrast, mode=11 ===");
const croppedHighContrast = await sharp(imageBuffer)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .grayscale()
  .normalize()
  .linear(2.0, -50)
  .resize({ width: 1300 })
  .sharpen()
  .threshold(100)
  .png()
  .toBuffer();

await worker.setParameters({
  tessedit_pageseg_mode: "11",
  tessedit_char_whitelist: "0123456789.,",
});
({ data } = await worker.recognize(croppedHighContrast));
console.log(data.text);

await worker.terminate();
console.log("\n✓ Done. Compare outputs above.");
