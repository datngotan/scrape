import * as cheerio from "cheerio";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import { nowVnText, parseSilverPriceToThousand } from "../../utils.js";

const SACOMBANK_SBJ_SILVER_PRODUCTS = [
  {
    id: "sacombank_sbj_bac_thoi_999_1_luong",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    type: "luong",
    unit: "luong",
  },
  {
    id: "sacombank_sbj_bac_thoi_999_1_kg",
    name: "Sacombank-SBJ (Bạc kim phúc lộc)",
    type: "kg",
    unit: "kg",
  },
];

let lastPayloadKey = "";
let lastBoardPromise = null;

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

function parseDateParts(input) {
  const m = String(input || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return {
    dd: m[1].padStart(2, "0"),
    mm: m[2].padStart(2, "0"),
    yyyy: m[3],
  };
}

function withHttpsProtocol(url) {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function buildImageVariants(url) {
  const input = withHttpsProtocol(String(url || "").trim());
  if (!input) return [];

  const variants = [input];

  // Keep the currently rendered image URL as primary, then try a higher-res
  // variant for better OCR quality when available.
  if (/_medium(?=\.[a-z]+(?:\?|$))/i.test(input)) {
    variants.push(input.replace(/_medium(?=\.[a-z]+(?:\?|$))/i, "_1024x1024"));
  }

  return variants;
}

function collectSilverBoardImages(payload) {
  const html = String(payload || "");
  const $ = cheerio.load(html);

  const images = [];

  // Primary source of truth: first board image currently displayed in the list.
  const firstDisplayedSrc = $(".sidebar_blog_article-bgv .giavang-img img")
    .first()
    .attr("src");
  if (firstDisplayedSrc) {
    const firstDisplayedUrl = resolveImageUrl(
      "https://sacombank-sbj.com",
      firstDisplayedSrc,
    );
    for (const url of buildImageVariants(firstDisplayedUrl)) {
      images.push({ url, alt: "", score: 1000 });
    }
  }

  // Second source of truth: latest board image from preload link.
  const preloadHref = withHttpsProtocol(
    $("link[rel='preload'][as='image']").first().attr("href") || "",
  );
  if (
    preloadHref &&
    preloadHref.includes("cdn.hstatic.net") &&
    preloadHref.includes("/article/") &&
    /\bl\d+_/i.test(preloadHref)
  ) {
    for (const url of buildImageVariants(preloadHref)) {
      images.push({ url, alt: "", score: 900 });
    }
  }

  // Deduplicate while preserving priority order.
  const seen = new Set();
  return images.filter((img) => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });
}

function parseLastUpdateText(payload, ocrText, imageMeta) {
  const source = `${String(imageMeta?.alt || "")}\n${String(ocrText || "")}\n${String(payload || "")}`;

  const date = parseDateParts(source);
  if (!date) return nowVnText();

  const hm = source.match(/(\d{1,2})h(\d{2})/i);
  if (hm) {
    const HH = hm[1].padStart(2, "0");
    const MI = hm[2];
    return `${HH}:${MI}:00 ${date.dd}/${date.mm}/${date.yyyy}`;
  }

  return `00:00:00 ${date.dd}/${date.mm}/${date.yyyy}`;
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

const LUONG_RE = /[li]u.{0,2}ng/i;
const PRICE_RE = /\d{1,3}(?:[.,]\d{3}){1,2}/g;

function classifyLine(line) {
  const normalized = normalizeText(line);
  if (normalized.includes("my nghe") || normalized.includes("limited"))
    return "myNghe";
  if (line.toLowerCase().includes("kg")) return "kg";
  if (LUONG_RE.test(line)) return "luong";
  return null;
}

function parseRowsFromOcrText(text) {
  const pricesInOrder = (String(text || "").match(PRICE_RE) ?? [])
    .map((raw) => parseSilverPriceToThousand(raw))
    .filter((n) => n != null);

  // Board order is stable:
  // Buy column:   row1 luong, row2 kg, row3 myNghe
  // Sell column:  row1 luong, row2 kg, row3 myNghe
  if (pricesInOrder.length >= 5) {
    const luongBuy = pricesInOrder[0] ?? null;
    const kgBuy = pricesInOrder[1] ?? null;
    const myNgheBuy = pricesInOrder[2] ?? luongBuy;
    const luongSell = pricesInOrder[3] ?? null;
    const kgSell = pricesInOrder[4] ?? null;
    const myNgheSell = pricesInOrder[5] ?? luongSell;

    return {
      luong: { buy: luongBuy, sell: luongSell },
      kg: { buy: kgBuy, sell: kgSell },
      myNghe: { buy: myNgheBuy, sell: myNgheSell },
    };
  }

  // Minimal fallback when OCR misses numbers.
  return {
    luong: { buy: pricesInOrder[0] ?? null, sell: pricesInOrder[3] ?? null },
    kg: { buy: pricesInOrder[1] ?? null, sell: pricesInOrder[4] ?? null },
    myNghe: {
      buy: pricesInOrder[2] ?? pricesInOrder[0] ?? null,
      sell: pricesInOrder[5] ?? pricesInOrder[3] ?? null,
    },
  };
}

async function ocrOneImage(url) {
  const imageBuffer = Buffer.from(await (await fetch(url)).arrayBuffer());

  const variants = [
    sharp(imageBuffer)
      .grayscale()
      .normalize()
      .resize({ width: 2800 })
      .sharpen({ sigma: 1.2 })
      .threshold(115)
      .png()
      .toBuffer(),
    sharp(imageBuffer)
      .grayscale()
      .normalize()
      .resize({ width: 2800 })
      .sharpen({ sigma: 1.0 })
      .threshold(130)
      .png()
      .toBuffer(),
    sharp(imageBuffer)
      .grayscale()
      .normalize()
      .resize({ width: 2600 })
      .sharpen({ sigma: 0.9 })
      .png()
      .toBuffer(),
  ];

  const worker = await createWorker("eng");
  try {
    const texts = [];
    for (const psm of [4, 6]) {
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        tessedit_char_whitelist: "0123456789,.:/hHkKgGlLiIuUnN ",
      });

      for (const bufferPromise of variants) {
        const preprocessed = await bufferPromise;
        const { data } = await worker.recognize(preprocessed);
        texts.push(String(data.text || ""));
      }
    }

    const scored = texts
      .map((text) => {
        const rows = parseRowsFromOcrText(text);
        const lb = rows.luong.buy ?? 0;
        const ls = rows.luong.sell ?? 0;
        const kb = rows.kg.buy ?? 0;
        const ks = rows.kg.sell ?? 0;

        let score = 0;
        if (lb > 0) score += 8;
        if (kb > 0) score += 8;
        if (ls > lb) score += 5;
        if (ks > kb) score += 5;

        if (lb > 0 && kb > 0) {
          const ratio = kb / lb;
          score += Math.max(0, 10 - Math.abs(ratio - 26.666));
        }

        if (lb > 0 && ls > 0) {
          const spread = ls / lb;
          if (spread <= 1.06) score += 8;
          else if (spread <= 1.09) score += 4;
        }

        if (kb > 0 && ks > 0) {
          const spread = ks / kb;
          if (spread <= 1.06) score += 8;
          else if (spread <= 1.09) score += 4;
        }

        return { text, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.text ?? "";
  } finally {
    await worker.terminate();
  }
}

const MAX_IMAGES_TO_TRY = 5;

async function ocrSilverBoard(payload) {
  const images = collectSilverBoardImages(payload);
  if (images.length === 0) {
    return {
      rows: {
        luong: { buy: null, sell: null },
        kg: { buy: null, sell: null },
        myNghe: { buy: null, sell: null },
      },
      lastUpdateText: nowVnText(),
    };
  }

  for (let i = 0; i < Math.min(images.length, MAX_IMAGES_TO_TRY); i++) {
    const img = images[i];
    const text = await ocrOneImage(img.url);
    const rows = parseRowsFromOcrText(text);

    if (rows.luong.buy != null && rows.kg.buy != null) {
      return {
        rows,
        lastUpdateText: parseLastUpdateText(payload, text, img),
      };
    }
  }

  // Fallback: OCR first image and return whatever it has
  const img = images[0];
  const text = await ocrOneImage(img.url);
  return {
    rows: parseRowsFromOcrText(text),
    lastUpdateText: parseLastUpdateText(payload, text, img),
  };
}

function getSilverBoardPromise(payload) {
  const key = String(payload || "").slice(0, 2500);
  if (lastBoardPromise && key === lastPayloadKey) return lastBoardPromise;

  lastPayloadKey = key;
  lastBoardPromise = ocrSilverBoard(payload);
  return lastBoardPromise;
}

export const SACOMBANK_SBJ_SILVER_SOURCES = SACOMBANK_SBJ_SILVER_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Sacombank-SBJ",
    url: "https://sacombank-sbj.com/blogs/bang-gia-bac",
    webUrl: "https://sacombank-sbj.com/blogs/bang-gia-bac",
    location: "Toàn quốc",
    unit: product.unit,
    parse: async (payload) => {
      const board = await getSilverBoardPromise(payload);
      const row =
        product.type === "kg"
          ? board.rows.kg
          : product.type === "my_nghe"
            ? board.rows.myNghe
            : board.rows.luong;
      return {
        buy: row.buy,
        sell: row.sell,
        unit: product.unit,
        lastUpdateText: board.lastUpdateText,
      };
    },
  }),
);
