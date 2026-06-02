import { nowVnText, stripHtmlToText } from "../../utils.js";

const TOAN_VUI_PRODUCTS = [
  {
    id: "toan_vui_vang_trang_suc_24k",
    name: "Toàn Vui (Vàng trang sức 24K)",
    label: "vang trang suc 24k",
  },
  {
    id: "toan_vui_vang_999_9",
    name: "Toàn Vui (Vàng 999.9)",
    label: "vang 999 9",
  },
  {
    id: "toan_vui_nhan_tron_24k",
    name: "Toàn Vui (Nhẫn tròn 24K)",
    label: "nhan tron 24k",
  },
  {
    id: "toan_vui_vang_10k_cn",
    name: "Toàn Vui (Vàng 10K CN)",
    label: "vang 10 k cn",
  },
];

const TOAN_VUI_URL = "https://pc.thietbinganhvang.vn/share/facebook/vbtoanvui";

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
  if (!raw) return null;

  const text = String(raw).trim();
  const match = text.match(/\d{1,3}(?:\.\d{3})+/);
  if (!match) return null;

  const digits = match[0].replace(/\./g, "");
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  if (n >= 1_000_000) {
    n = Math.round(n / 1000);
  }
  return n;
}

function parseBuySellByLabel(payload, normalizedLabel) {
  const raw = String(payload || "");
  if (!raw) return { buy: null, sell: null };

  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of rows) {
    const rowText = stripHtmlToText(rowHtml);
    const normalizedRow = normalizeText(rowText);

    let isMatch = false;

    // Main matching
    if (normalizedRow.includes(normalizedLabel)) {
      isMatch = true;
    }
    // Special case for first row: "V/ trang sức 24k"
    else if (normalizedLabel.includes("vang trang suc 24k")) {
      if (
        normalizedRow.includes("trang suc 24k") ||
        (normalizedRow.includes("trang suc") && normalizedRow.includes("24k"))
      ) {
        isMatch = true;
      }
    }

    if (!isMatch) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]).trim())
      .filter(Boolean);

    if (cells.length < 3) continue;

    // Find index of label cell
    const idx = cells.findIndex((cell) => {
      const norm = normalizeText(cell);
      return (
        norm.includes(normalizedLabel) ||
        (normalizedLabel.includes("vang trang suc 24k") &&
          (norm.includes("trang suc 24k") || norm.includes("24k")))
      );
    });

    if (idx < 0 || idx + 2 >= cells.length) continue;

    const buy = parsePriceToken(cells[idx + 1]);
    const sell = parsePriceToken(cells[idx + 2]);

    if (buy != null && sell != null) {
      return { buy, sell };
    }
  }

  // Markdown fallback
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const idx = cells.findIndex((c) =>
      normalizeText(c).includes(normalizedLabel),
    );
    if (idx < 0) continue;

    const buy = parsePriceToken(cells[idx + 1]);
    const sell = parsePriceToken(cells[idx + 2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  const m = text.match(
    /Ng[aà]y\s+(\d{1,2})\s+Th[aá]ng\s+(\d{1,2})\s+N[aă]m\s+(\d{4})[\s\S]{0,20}?(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    const HH = String(m[4]).padStart(2, "0");
    const MI = m[5];
    const SS = m[6] ? m[6] : "00";
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const TOAN_VUI_SOURCES = TOAN_VUI_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Toàn Vui",
  unit: "chi",
  url: TOAN_VUI_URL,
  webUrl: "https://www.facebook.com/vangtoanvui.gold/",
  location: "Phú Thọ",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
