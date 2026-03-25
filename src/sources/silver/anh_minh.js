import {
  nowVnText,
  parseSilverPriceToThousand,
  stripHtmlToText,
} from "../../utils.js";

const ANH_MINH_SILVER_PRODUCTS = [
  {
    id: "anh_minh_bac_thoi_999_1kg",
    name: "Anh Minh (Bạc thỏi AM 999 1KG)",
    label: "Bạc thỏi AM 999 1KG",
    unit: "kg",
  },
  {
    id: "anh_minh_bac_thoi_999_1_10_luong",
    name: "Anh Minh (Bạc thỏi AM 999 1 - 10 Lượng)",
    label: "Bạc thỏi AM 999 1 - 10 Lượng",
    unit: "luong",
  },
];

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

function parseBuySellByLabel(payload, label) {
  const rowMatches = String(payload || "").match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const normalizedLabel = normalizeText(label);

  for (const rowHtml of rowMatches) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]))
      .filter(Boolean);

    if (cells.length === 0) continue;

    const idx = cells.findIndex(
      (cell) => normalizeText(cell) === normalizedLabel,
    );
    if (idx < 0) continue;

    const buy = parseSilverPriceToThousand(cells[idx + 1] ?? "");
    const sell = parseSilverPriceToThousand(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  const text = stripHtmlToText(payload);

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    const nameCell = cells.find(
      (cell) => normalizeText(cell) === normalizedLabel,
    );
    if (!nameCell) continue;

    const idx = cells.indexOf(nameCell);
    const buy = parseSilverPriceToThousand(cells[idx + 1] ?? "");
    const sell = parseSilverPriceToThousand(cells[idx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );

  if (m) {
    const buy = parseSilverPriceToThousand(m[1]);
    const sell = parseSilverPriceToThousand(m[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const m = text.match(
    /Ngay\s*cap\s*nhat\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*Gio\s*cap\s*nhat\s*:\s*(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const ANH_MINH_SILVER_SOURCES = ANH_MINH_SILVER_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Vàng Anh Minh",
    url: "https://vanganhminh.com/",
    webUrl: "https://vanganhminh.com/",
    location: "Hà Nội",
    unit: product.unit,
    parse: (payload) => {
      const { buy, sell } = parseBuySellByLabel(payload, product.label);
      return {
        buy,
        sell,
        unit: product.unit,
        lastUpdateText: parseTime(payload),
      };
    },
  }),
);
