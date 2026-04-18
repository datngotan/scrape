import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { parseSilverPriceToThousand } from '../src/utils.js';

const w = 898, h = 435;

// Grid structure from pixel analysis:
// Column separators (from y=0.85 clean line scan):
//   x≈0.508 | x≈0.652 | x≈0.818
// So price columns are:
//   Buy:  0.512 to 0.647
//   Sell: 0.657 to 0.813
//
// Horizontal separators:
//   y≈0.407 (header bottom)
//   y≈0.591 (row 1/2 divider)
//   y≈0.703 (row 2/3 divider or sub-divider)
//   y≈0.779 (another divider)
//   y≈0.855 (another divider)
//   y≈0.963 (bottom)

// The 3 data rows occupy different vertical spans.
// Let's try multiple row candidates and see which ones have prices.

const GRID = {
  buyLeft: 0.512,
  sellLeft: 0.657,
  buyRight: 0.647,
  sellRight: 0.813,
  // Row top/bottom positions (between horizontal separators)
  rows: [
    { top: 0.41, bottom: 0.59 },   // Row 1
    { top: 0.59, bottom: 0.70 },   // Row 2 candidate A
    { top: 0.70, bottom: 0.78 },   // Row 3 candidate A
    { top: 0.78, bottom: 0.85 },   // Row 4 candidate
    { top: 0.85, bottom: 0.96 },   // Row 5 candidate
    // Alternative: row 2 might span 0.59-0.78, row 3 might span 0.78-0.96
  ]
};

const worker = await createWorker("eng");
await worker.setParameters({
  tessedit_pageseg_mode: "7",  // Single line mode - best for individual cells
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
  
  console.log(`${name}: rect=(${rect.left},${rect.top},${rect.width},${rect.height}) | OCR="${text}" | token="${token}" | price=${price}`);
  return price;
}

const imageBuffer = await sharp('/tmp/sbj_silver_original.png').toBuffer();

console.log(`Image: ${w}x${h}\n`);
console.log('=== Per-cell OCR results ===\n');

for (let i = 0; i < GRID.rows.length; i++) {
  const row = GRID.rows[i];
  const buy = await ocrCell(imageBuffer, `row${i+1}_buy`, GRID.buyLeft, GRID.buyRight, row.top, row.bottom);
  const sell = await ocrCell(imageBuffer, `row${i+1}_sell`, GRID.sellLeft, GRID.sellRight, row.top, row.bottom);
  console.log(`  Row ${i+1}: buy=${buy}, sell=${sell}\n`);
}

// Also try with wider columns (include some padding)
console.log('\n=== Wider columns (more padding) ===\n');
const WIDER = {
  buyLeft: 0.50,
  sellLeft: 0.65,
  buyRight: 0.65,
  sellRight: 0.82,
};

for (let i = 0; i < GRID.rows.length; i++) {
  const row = GRID.rows[i];
  const buy = await ocrCell(imageBuffer, `wide_r${i+1}_buy`, WIDER.buyLeft, WIDER.buyRight, row.top, row.bottom);
  const sell = await ocrCell(imageBuffer, `wide_r${i+1}_sell`, WIDER.sellLeft, WIDER.sellRight, row.top, row.bottom);
  console.log(`  Row ${i+1}: buy=${buy}, sell=${sell}\n`);
}

await worker.terminate();
