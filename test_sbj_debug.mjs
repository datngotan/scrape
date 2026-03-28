import { fetchHtml } from './src/fetch.js';
import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { parseSilverPriceToThousand } from './src/utils.js';

const payload = await fetchHtml('https://sacombank-sbj.com/blogs/bang-gia-bac');

function resolveImageUrl(baseUrl, rawSrc) {
  if (!rawSrc) return null;
  if (rawSrc.startsWith("//")) return `https:${rawSrc}`;
  if (rawSrc.startsWith("http")) return rawSrc;
  try { return new URL(rawSrc, baseUrl).toString(); } catch { return null; }
}

const $ = cheerio.load(payload);

console.log('--- All matching images ---');
$("img").each((_, el) => {
  const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
  const alt = $(el).attr("alt") || "";
  if (src && src.includes("hstatic")) {
    console.log("  src:", src);
    console.log("  alt:", alt);
  }
});

let imageUrl = null;
let imageAlt = "";
$("img").each((_, el) => {
  const src = resolveImageUrl("https://sacombank-sbj.com", $(el).attr("src"));
  const alt = $(el).attr("alt") || "";
  if (!src) return;
  if (!src.includes("cdn.hstatic.net/files/200000315699/article/")) return;
  if (!imageUrl) { imageUrl = src.replace(/_medium(?=\.[a-z]+$)/i, ""); imageAlt = alt; }
});

console.log('\n--- Selected image ---');
console.log('URL:', imageUrl);
console.log('Alt:', imageAlt);

if (!imageUrl) { console.log('NO IMAGE FOUND'); process.exit(1); }

const imageBuffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
const meta = await sharp(imageBuffer).metadata();
console.log('\n--- Image metadata ---');
console.log('Width:', meta.width, 'Height:', meta.height, 'Format:', meta.format);

await sharp(imageBuffer).toFile('/tmp/sbj_original.png');

const cropLeft = Math.floor(meta.width / 2);
const cropTop = Math.floor(meta.height / 2);
const cropWidth = meta.width - cropLeft;
const cropHeight = meta.height - cropTop;
console.log('Crop: left=', cropLeft, 'top=', cropTop, 'width=', cropWidth, 'height=', cropHeight);

const cropped = await sharp(imageBuffer)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .grayscale()
  .normalize()
  .resize({ width: 1300 })
  .sharpen()
  .threshold(100)
  .png()
  .toBuffer();

await sharp(cropped).toFile('/tmp/sbj_cropped.png');
console.log('Saved /tmp/sbj_original.png and /tmp/sbj_cropped.png');

const worker = await createWorker("eng");
await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789.," });
const { data } = await worker.recognize(cropped);
console.log('\n--- OCR (digit whitelist) ---');
console.log(JSON.stringify(data.text));

await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
const { data: data2 } = await worker.recognize(cropped);
console.log('\n--- OCR (no whitelist, first 600 chars) ---');
console.log(data2.text.substring(0, 600));

await worker.terminate();

const nums = (data.text.match(/\d{1,3}(?:[.,]\d{3}){1,2}/g) ?? [])
  .map(raw => parseSilverPriceToThousand(raw))
  .filter(n => n != null);
console.log('\n--- Parsed numbers ---', nums);
