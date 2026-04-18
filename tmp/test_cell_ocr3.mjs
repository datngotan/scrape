import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { parseSilverPriceToThousand } from '../src/utils.js';

const w = 898, h = 435;

// Verified grid: buy=0.652-0.818, sell=0.818-0.978
// Row 2 sell is clipping leading digits. Try sell from 0.80 instead.
// Also try different preprocessing for the sell column.

const GRID = {
  buyLeft: 0.652,
  buyRight: 0.818,
  sellLeft: 0.80,  // shifted left from 0.818 to avoid clipping
  sellRight: 0.978,
  rows: [
    { top: 0.703, bottom: 0.779 },
    { top: 0.779, bottom: 0.855 },
    { top: 0.855, bottom: 0.963 },
  ]
};

const worker = await createWorker("eng");
await worker.setParameters({
  tessedit_pageseg_mode: "7",
  tessedit_char_whitelist: "0123456789.,",
});

async function ocrCell(imageBuffer, name, leftRatio, rightRatio, topRatio, bottomRatio) {
  const rect = {
    left: Math.max(0, Math.floor(w * leftRatio) + 2),
    top: Math.max(0, Math.floor(h * topRatio) + 2),
    width: Math.max(20, Math.floor(w * (rightRatio - leftRatio)) - 4),
    height: Math.max(20, Math.floor(h * (bottomRatio - topRatio)) - 4),
  };
  
  const cellBuf = await sharp(imageBuffer)
    .extract(rect)
    .grayscale()
    .normalize()
    .linear(1.5, -30)
    .resize({ width: 900 })
    .sharpen()
    .png()
    .toBuffer();
  
  await sharp(cellBuf).toFile(`/tmp/sbj_silver_cell_${name}.png`);
  
  const { data } = await worker.recognize(cellBuf);
  const text = String(data.text || '').trim();
  const token = text.match(/\d{1,3}(?:[.,]\d{3})+/)?.[0] ?? null;
  const price = token ? parseSilverPriceToThousand(token) : null;
  
  console.log(`${name}: rect=(${rect.left},${rect.top},${rect.width},${rect.height}) | OCR="${text}" | price=${price}`);
  return price;
}

const imageBuffer = await sharp('/tmp/sbj_silver_original.png').toBuffer();
console.log(`Image: ${w}x${h}\n`);

console.log('=== sell from 0.80 ===');
for (let i = 0; i < GRID.rows.length; i++) {
  const row = GRID.rows[i];
  const buy = await ocrCell(imageBuffer, `r${i+1}_buy`, GRID.buyLeft, GRID.buyRight, row.top, row.bottom);
  const sell = await ocrCell(imageBuffer, `r${i+1}_sell`, GRID.sellLeft, GRID.sellRight, row.top, row.bottom);
  console.log(`  → Row ${i+1}: buy=${buy}, sell=${sell}\n`);
}

// Try sell from 0.78
console.log('\n=== sell from 0.78 ===');
for (let i = 0; i < GRID.rows.length; i++) {
  const row = GRID.rows[i];
  const sell = await ocrCell(imageBuffer, `s78_r${i+1}_sell`, 0.78, 0.978, row.top, row.bottom);
  console.log(`  → Row ${i+1}: sell=${sell}\n`);
}

// Try sell from 0.75
console.log('\n=== sell from 0.75 ===');
for (let i = 0; i < GRID.rows.length; i++) {
  const row = GRID.rows[i];
  const sell = await ocrCell(imageBuffer, `s75_r${i+1}_sell`, 0.75, 0.978, row.top, row.bottom);
  console.log(`  → Row ${i+1}: sell=${sell}\n`);
}

await worker.terminate();
console.log('\nExpected: Row1=3012/3102, Row2=80320/82720, Row3=3012/3302');
