import {
  parseSilverBuySellByNeedle,
  parseSilverLastUpdateText,
  parseSilverPriceToThousand,
} from "../../utils.js";

function parseTime(html) {
  return parseSilverLastUpdateText(html);
}

function parse(html, needle) {
  // Preferred format from DataBac9991Luong.txt: buy|sell|HH:mm:ss DD/MM/YYYY
  const lines = String(html || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parts = lines[i].split("|").map((s) => s.trim());
    if (parts.length < 3) continue;

    const buy = parseSilverPriceToThousand(parts[0]);
    const sell = parseSilverPriceToThousand(parts[1]);
    if (buy != null && sell != null) {
      return {
        buy,
        sell,
        unit: "luong",
        lastUpdateText: parseSilverLastUpdateText(parts[2]),
      };
    }
  }

  // Fallback for HTML/markdown payloads.
  const { buy, sell } = parseSilverBuySellByNeedle(html, needle);
  return { buy, sell, unit: "luong", lastUpdateText: parseTime(html) };
}

export const DOJI_SILVER_SOURCES = [
  {
    id: "doji_bac_luong",
    name: "DOJI (Bạc DOJI 99.9)",
    storeName: "DOJI",
    url: "https://banggia.doji.vn/gold-price",
    webUrl: "https://banggia.doji.vn/gold-price",
    location: "Toàn quốc",
    unit: "luong",
    parse: (html) => parse(html, "BẠC DOJI 99.9 - 1 LƯỢNG"),
  },
];
