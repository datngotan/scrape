import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_PHU_THAI_PRODUCTS = [
  {
    id: "kim_phu_thai_nhan_tron_tron",
    name: "Kim Phú Thái (Nhẫn tròn trơn Kim Phú Thái)",
    label: "Nhẫn tròn trơn Kim Phú Thái",
  },
  {
    id: "kim_phu_thai_hat_dau_vang",
    name: "Kim Phú Thái (Hạt đậu vàng Kim Phú Thái)",
    label: "Hạt đậu vàng Kim Phú Thái",
  },
  {
    id: "kim_phu_thai_nhan_tron_btmc_9999",
    name: "Kim Phú Thái (Nhẫn tròn BTMC 9999)",
    label: "Nhẫn tròn BTMC 9999",
  },
  {
    id: "kim_phu_thai_trang_suc_9999",
    name: "Kim Phú Thái (Trang sức 9999)",
    label: "Trang sức 9999",
  },
  {
    id: "kim_phu_thai_trang_suc_999",
    name: "Kim Phú Thái (Trang sức 999)",
    label: "Trang sức 999",
  },
];

function escapeLabelForRegex(label) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
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

function normalizeAscii(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parsePriceToken(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  // Site occasionally emits malformed 4-decimal token like "16.4900".
  if (/^\d{2}\.\d{4}$/.test(s) && n >= 100_000 && n <= 300_000 && n % 10 === 0) {
    n = Math.round(n / 10);
  }

  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBuySellByLabel(payload, label) {
  const raw = String(payload || "");
  const text = stripHtmlToText(raw);
  const target = normalizeText(label);
  const escaped = escapeLabelForRegex(label);
  const token = "(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,6})";

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const cells = line
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const rowLabel = normalizeText(cells[0]);
    if (rowLabel !== target) continue;

    const buy = parsePriceToken(cells[cells.length - 2]);
    const sell = parsePriceToken(cells[cells.length - 1]);
    if (buy != null && sell != null) return { buy, sell };

    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const joinedCells = combined
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (joinedCells.length >= 3 && normalizeText(joinedCells[0]) === target) {
      const mergedBuy = parsePriceToken(joinedCells[joinedCells.length - 2]);
      const mergedSell = parsePriceToken(joinedCells[joinedCells.length - 1]);
      if (mergedBuy != null && mergedSell != null) {
        return { buy: mergedBuy, sell: mergedSell };
      }
    }
  }

  // Markdown pipe table: | Nhẫn tròn trơn Kim Phú Thái | 17.080 | 17.380 |
  let m = raw.match(
    new RegExp(
      `\\|\\s*${escaped}\\s*\\|\\s*${token}\\s*\\|\\s*${token}\\s*\\|`,
      "i",
    ),
  );

  // Fallback: flattened text without pipes
  if (!m) {
    m = text.match(
      new RegExp(`${escaped}[\\s\\S]{0,40}?${token}\\s+${token}`, "i"),
    );
  }

  if (!m) return { buy: null, sell: null };

  const buy = parsePriceToken(m[1]);
  const sell = parsePriceToken(m[2]);
  return { buy, sell };
}

function parseTime(payload) {
  const text = normalizeAscii(stripHtmlToText(payload));

  // "Cập nhật lúc : 18:00H" and "18/03/2026" (may appear on separate lines)
  const timeMatch = text.match(/Cap\s*nhat\s*luc\s*:?\s*(\d{1,2}):(\d{2})/i);
  const dateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);

  if (timeMatch && dateMatch) {
    const HH = timeMatch[1].padStart(2, "0");
    const MI = timeMatch[2];
    const dd = dateMatch[1];
    const mm = dateMatch[2];
    const yyyy = dateMatch[3];
    return `${HH}:${MI} ${dd}/${mm}/${yyyy}`;
  }

  if (dateMatch) {
    const dd = dateMatch[1];
    const mm = dateMatch[2];
    const yyyy = dateMatch[3];
    return `00:00 ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const KIM_PHU_THAI_SOURCES = KIM_PHU_THAI_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Phú Thái",
  url: "https://r.jina.ai/https://kimphuthai.vn/",
  webUrl: "https://kimphuthai.vn/",
  location: "Hà Nội",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
