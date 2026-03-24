import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_BAO_TRI_PRODUCTS = [
  {
    id: "kim_bao_tri_nhan_tron_9999",
    name: "Kim Bảo Trí (Vàng Nhẫn Trơn 9999)",
    label: "Vàng Nhẫn Trơn 9999 KIM BẢO TRÍ",
  },
  {
    id: "kim_bao_tri_trang_suc_24k",
    name: "Kim Bảo Trí (Vàng Trang Sức 24K)",
    label: "Vàng Trang Sức 24K",
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

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const escapedRawLabel = label
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const compactPrice = "(\\d{1,3}(?:\\s*\\d{1,2})?[.,]\\d{3})";
  const rawMatch = text.match(
    new RegExp(`${escapedRawLabel}\\s+${compactPrice}\\s+${compactPrice}`, "i"),
  );
  if (rawMatch) {
    const buy = parsePriceToken(rawMatch[1]);
    const sell = parsePriceToken(rawMatch[2]);
    if (buy != null && sell != null && buy >= 1000 && sell >= 1000) {
      return { buy, sell };
    }
  }

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const normalizedLine = normalizeText(line);
    if (!normalizedLine.includes(normalizedLabel)) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const buy = parsePriceToken(cells[cells.length - 2]);
    const sell = parsePriceToken(cells[cells.length - 1]);
    if (buy != null && sell != null && buy >= 1000 && sell >= 1000) {
      return { buy, sell };
    }

    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const comboCells = combined
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (comboCells.length < 3) continue;

    const buyMerged = parsePriceToken(comboCells[comboCells.length - 2]);
    const sellMerged = parsePriceToken(comboCells[comboCells.length - 1]);
    if (
      buyMerged != null &&
      sellMerged != null &&
      buyMerged >= 1000 &&
      sellMerged >= 1000
    ) {
      return { buy: buyMerged, sell: sellMerged };
    }
  }

  const sentenceMatch = text.match(
    new RegExp(
      `${escapedRawLabel}[\\s\\S]{0,180}?đang\\s+là\\s*([\\d.,\\s]+?)\\s*K[\\s\\S]{0,80}?và\\s*([\\d.,\\s]+?)\\s*K`,
      "i",
    ),
  );
  if (sentenceMatch) {
    const buy = parsePriceToken(sentenceMatch[1]);
    const sell = parsePriceToken(sentenceMatch[2]);
    if (buy != null && sell != null && buy >= 1000 && sell >= 1000) {
      return { buy, sell };
    }
  }

  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );
  if (m) {
    const buy = parsePriceToken(m[1]);
    const sell = parsePriceToken(m[2]);
    if (buy != null && sell != null && buy >= 1000 && sell >= 1000) {
      return { buy, sell };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const KIM_BAO_TRI_SOURCES = KIM_BAO_TRI_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Bảo Trí",
  location: "TP.HCM",
  unit: "chi",
  url: "https://giavangmaothiet.com/gia-vang-kim-bao-tri-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-kim-bao-tri-hom-nay/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
