import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_HANH_PRODUCTS = [
  {
    id: "kim_hanh_nhan_tron_99",
    name: "Kim Hạnh (Nhẫn Trơn Kim Hạnh 99)",
    label: "Nhẫn Trơn Kim Hạnh 99",
  },
  {
    id: "kim_hanh_trang_suc_99",
    name: "Kim Hạnh (Trang sức 99)",
    label: "TRANG SỨC Kim Hạnh 99",
  },
  {
    id: "kim_hanh_trang_suc_999",
    name: "Kim Hạnh (Trang sức 999)",
    label: "TRANG SỨC Kim Hạnh 999",
  },
  {
    id: "kim_hanh_trang_suc_9999",
    name: "Kim Hạnh (Trang sức 9999)",
    label: "TRANG SỨC Kim Hạnh 9999",
  },
  {
    id: "kim_hanh_trang_suc_98",
    name: "Kim Hạnh (Trang sức 98)",
    label: "TRANG SỨC Kim Hạnh 98",
  },
  {
    id: "kim_hanh_ep_vi_9999",
    name: "Kim Hạnh (Kim Hạnh Ép Vỉ 9999)",
    label: "Kim Hạnh Ép VỈ 9999",
  },
  {
    id: "kim_hanh_nhan_tron_999",
    name: "Kim Hạnh (Nhẫn Trơn Kim Hạnh 999)",
    label: "NHẪN TRƠN Kim Hạnh 999",
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
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Prices on this site are in full VND (e.g. 16800000). Divide to store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);
  const token = "(\\d[\\d.,]*)";

  // Walk pipe-table lines, normalize cell content for comparison
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // cells[0] may be empty (leading |), cells[1] = product, cells[2] = buy, cells[3] = sell
    const nameCell = cells.find((c) => normalizeText(c) === normalizedLabel);
    if (!nameCell) continue;
    const nameIdx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[nameIdx + 1] ?? "");
    const sell = parsePriceToken(cells[nameIdx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback: regex on flattened text
  const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );
  if (m) {
    const buy = parsePriceToken(m[1]);
    const sell = parsePriceToken(m[2]);
    if (buy != null && sell != null) return { buy, sell };
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  // Site format: "Cập nhật lúc: 2026-03-18 20:51:04" (YYYY-MM-DD HH:MM:SS)
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const yyyy = m[1];
    const mo = m[2];
    const dd = m[3];
    const HH = m[4];
    const MI = m[5];
    const SS = m[6];
    // Return in HH:MM:SS DD/MM/YYYY format that parseVnToIso accepts
    return `${HH}:${MI}:${SS} ${dd}/${mo}/${yyyy}`;
  }

  return nowVnText();
}

export const KIM_HANH_SOURCES = KIM_HANH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Kim Hạnh",
  url: "https://r.jina.ai/https://vangkimhanh.com/",
  webUrl: "https://vangkimhanh.com/",
  location: "TP.HCM",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
