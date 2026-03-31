import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_TAI_NGOC_DIAMOND_PRODUCTS = [
  {
    id: "kim_tai_ngoc_diamond_9999",
    name: "Kim Tài Ngọc Diamond (Vàng 9999)",
    labels: ["9999"],
  },
  {
    id: "kim_tai_ngoc_diamond_980",
    name: "Kim Tài Ngọc Diamond (Vàng 980)",
    labels: ["980"],
  },
  {
    id: "kim_tai_ngoc_diamond_680",
    name: "Kim Tài Ngọc Diamond (Vàng 680)",
    labels: ["680"],
  },
  {
    id: "kim_tai_ngoc_diamond_610",
    name: "Kim Tài Ngọc Diamond (Vàng 610)",
    labels: ["610"],
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

function parsePriceToThousand(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (value >= 1_000_000) value = Math.round(value / 1000);
  return value;
}

function parseBuySellFromPipeLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 3) return { buy: null, sell: null };

  const buy = parsePriceToThousand(cells[cells.length - 2]);
  const sell = parsePriceToThousand(cells[cells.length - 1]);
  return { buy, sell };
}

function parseBuySellByLabels(payload, labels) {
  const normalizedLabels = labels.map((label) => normalizeText(label));
  const raw = String(payload || "");
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const normalizedFirstCell = normalizeText(line.split("|")[0]);
    if (
      !normalizedLabels.some((label) => normalizedFirstCell.includes(label))
    ) {
      continue;
    }

    const direct = parseBuySellFromPipeLine(line);
    if (direct.buy != null && direct.sell != null) return direct;

    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const merged = parseBuySellFromPipeLine(combined);
    if (merged.buy != null && merged.sell != null) return merged;
  }

  const text = stripHtmlToText(raw);
  for (const normalizedLabel of normalizedLabels) {
    const labelIndex = normalizeText(text).indexOf(normalizedLabel);
    if (labelIndex < 0) continue;

    const scope = text.slice(
      labelIndex,
      Math.min(text.length, labelIndex + 220),
    );
    const grouped = scope.match(/\d{1,3}([.,\s])\d{3}\1\d{3}/g) ?? [];

    const prices = grouped
      .map((chunk) => parsePriceToThousand(chunk))
      .filter((value) => value != null && value >= 1000);

    if (prices.length >= 2) {
      return {
        buy: prices[0],
        sell: prices[1],
      };
    }
  }

  const normalizedText = normalizeText(text);
  const token = "(\\d[\\d.,]*)";

  for (const normalizedLabel of normalizedLabels) {
    const escapedLabel = normalizedLabel
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/ /g, "\\s*");
    const m = normalizedText.match(
      new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
    );
    if (!m) continue;

    const buy = parsePriceToThousand(m[1]);
    const sell = parsePriceToThousand(m[2]);
    if (buy != null && sell != null && buy >= 1000 && sell >= 1000)
      return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const dmy = text.match(
    /GIA\s+VANG\s+HOM\s+NAY\s+(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/i,
  );
  const hm = text.match(/\b(\d{1,2}):(\d{2})\b/);

  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    const HH = hm ? hm[1].padStart(2, "0") : "00";
    const MI = hm ? hm[2] : "00";
    return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const KIM_TAI_NGOC_DIAMOND_SOURCES = KIM_TAI_NGOC_DIAMOND_PRODUCTS.map(
  (product) => ({
    id: product.id,
    name: product.name,
    storeName: "Kim Tài Ngọc Diamond",
    location: "Bảo Lộc, Lâm Đồng",
    unit: "chi",
    url: "https://kimtaingocdiamond.com/",
    webUrl: "https://kimtaingocdiamond.com/",
    parse: (payload) => {
      const { buy, sell } = parseBuySellByLabels(payload, product.labels);
      return {
        buy,
        sell,
        lastUpdateText: parseTime(payload),
      };
    },
  }),
);
