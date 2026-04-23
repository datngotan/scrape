import { fetchHtml } from "../src/fetch.js";
import * as cheerio from "cheerio";
import sharp from "sharp";

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

await sharp(buf).toFile("/tmp/sbj_gold_board.png");
console.log("Saved to /tmp/sbj_gold_board.png");

// Current grid
const grid = {
  firstRowTopRatio: 0.417,
  rowHeightRatio: 0.0555,
  buyLeftRatio: 0.518,
  sellLeftRatio: 0.762,
  buyWidthRatio: 0.22,
  sellWidthRatio: 0.22,
};

console.log("\n--- Current grid cell positions ---");
for (let i = 0; i < 10; i++) {
  const topRatio = grid.firstRowTopRatio + i * grid.rowHeightRatio;
  const buyLeft = Math.floor(meta.width * grid.buyLeftRatio) + 2;
  const sellLeft = Math.floor(meta.width * grid.sellLeftRatio) + 2;
  const top = Math.floor(meta.height * topRatio) + 2;
  const w = Math.floor(meta.width * grid.buyWidthRatio) - 4;
  const h = Math.floor(meta.height * grid.rowHeightRatio) - 4;
  console.log(
    `Row ${i + 1}: top=${top} buyLeft=${buyLeft} sellLeft=${sellLeft} w=${w} h=${h}`,
  );
}

// Extract individual cells for rows 1-4 to visually inspect
import { createWorker } from "tesseract.js";
const worker = await createWorker("eng");
await worker.setParameters({
  tessedit_pageseg_mode: "7",
  tessedit_char_whitelist: "0123456789.,",
});

for (let i = 0; i < 10; i++) {
  const topRatio = grid.firstRowTopRatio + i * grid.rowHeightRatio;
  const buyLeft = Math.max(0, Math.floor(meta.width * grid.buyLeftRatio) + 2);
  const sellLeft = Math.max(0, Math.floor(meta.width * grid.sellLeftRatio) + 2);
  const top = Math.max(0, Math.floor(meta.height * topRatio) + 2);
  const w = Math.max(20, Math.floor(meta.width * grid.buyWidthRatio) - 4);
  const h = Math.max(20, Math.floor(meta.height * grid.rowHeightRatio) - 4);

  const buyCell = await sharp(buf)
    .extract({
      left: buyLeft,
      top,
      width: Math.min(w, meta.width - buyLeft),
      height: Math.min(h, meta.height - top),
    })
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .resize({ width: 900 })
    .sharpen()
    .png()
    .toBuffer();

  const sellCell = await sharp(buf)
    .extract({
      left: sellLeft,
      top,
      width: Math.min(w, meta.width - sellLeft),
      height: Math.min(h, meta.height - top),
    })
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .resize({ width: 900 })
    .sharpen()
    .png()
    .toBuffer();

  await sharp(buyCell).toFile(`/tmp/sbj_gold_buy_r${i + 1}.png`);
  await sharp(sellCell).toFile(`/tmp/sbj_gold_sell_r${i + 1}.png`);

  const buyOcr = await worker.recognize(buyCell);
  const sellOcr = await worker.recognize(sellCell);
  console.log(
    `Row ${i + 1}: buy="${buyOcr.data.text.trim()}" sell="${sellOcr.data.text.trim()}"`,
  );
}

await worker.terminate();
console.log(
  "\nSaved cell images to /tmp/sbj_gold_buy_rN.png and /tmp/sbj_gold_sell_rN.png",
);
