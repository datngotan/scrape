import sharp from 'sharp';

const w = 898, h = 435;

// Scan vertical strip at x=50% to find horizontal grid lines
const vstrip = await sharp('/tmp/sbj_silver_original.png')
  .extract({ left: Math.floor(w * 0.5), top: 0, width: 1, height: h })
  .raw()
  .toBuffer();

const darkRows = [];
let inDark = false;
for (let y = 0; y < h; y++) {
  const idx = y * 3;
  const avg = (vstrip[idx] + vstrip[idx+1] + vstrip[idx+2]) / 3;
  if (avg < 120 && !inDark) {
    inDark = true;
    darkRows.push({ start: y, ratio: (y/h).toFixed(3) });
  } else if (avg >= 120) {
    inDark = false;
  }
}
console.log('Dark horizontal lines at y positions:');
darkRows.forEach(r => console.log(`  y=${r.start} (ratio=${r.ratio})`));

// Scan multiple horizontal strips to find vertical grid lines
for (const yRatio of [0.45, 0.55, 0.65, 0.75, 0.85]) {
  const hstrip = await sharp('/tmp/sbj_silver_original.png')
    .extract({ left: 0, top: Math.floor(h * yRatio), width: w, height: 1 })
    .raw()
    .toBuffer();

  const darkCols = [];
  let inDarkV = false;
  for (let x = 0; x < w; x++) {
    const idx = x * 3;
    const avg = (hstrip[idx] + hstrip[idx+1] + hstrip[idx+2]) / 3;
    if (avg < 120 && !inDarkV) {
      inDarkV = true;
      darkCols.push({ start: x, ratio: (x/w).toFixed(3) });
    } else if (avg >= 120) {
      inDarkV = false;
    }
  }
  console.log(`\nDark vertical lines at y=${yRatio}:`);
  darkCols.forEach(c => console.log(`  x=${c.start} (ratio=${c.ratio})`));
}

// Also extract and save individual test cells for manual verification
// Try buy column cell for row 1
const testCells = [
  { name: 'r1_buy', left: 0.40, top: 0.42, width: 0.22, height: 0.12 },
  { name: 'r1_sell', left: 0.65, top: 0.42, width: 0.22, height: 0.12 },
  { name: 'r2_buy', left: 0.40, top: 0.55, width: 0.22, height: 0.12 },
  { name: 'r2_sell', left: 0.65, top: 0.55, width: 0.22, height: 0.12 },
  { name: 'r3_buy', left: 0.40, top: 0.70, width: 0.22, height: 0.12 },
  { name: 'r3_sell', left: 0.65, top: 0.70, width: 0.22, height: 0.12 },
];

for (const cell of testCells) {
  const rect = {
    left: Math.floor(w * cell.left),
    top: Math.floor(h * cell.top),
    width: Math.floor(w * cell.width),
    height: Math.floor(h * cell.height),
  };
  await sharp('/tmp/sbj_silver_original.png')
    .extract(rect)
    .toFile(`/tmp/sbj_silver_cell_${cell.name}.png`);
  console.log(`\nSaved cell ${cell.name}: left=${rect.left} top=${rect.top} w=${rect.width} h=${rect.height}`);
}
