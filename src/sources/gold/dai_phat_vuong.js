import { nowVnText, stripHtmlToText } from "../../utils.js";

const DAI_PHAT_VUONG_PRODUCTS = [
  {
    id: "dai_phat_vuong_nhan_tron_9999",
    name: "Đại Phát Vượng (Nhẫn Trơn 9999)",
    label: "Nhẫn Trơn Đại Phát Vượng 9999",
  },
  {
    id: "dai_phat_vuong_trang_suc_24k",
    name: "Đại Phát Vượng (Trang Sức 24K)",
    label: "TRANG SỨC Đại Phát Vượng 24K",
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

  // Keep stored unit as thousands when page outputs full VND.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellByLabel(payload, label) {
  const text = stripHtmlToText(payload);
  const normalizedLabel = normalizeText(label);

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    const nameCell = cells.find((cell) => normalizeText(cell) === normalizedLabel);
    if (!nameCell) continue;

    const idx = cells.indexOf(nameCell);
    const buy = parsePriceToken(cells[idx + 1] ?? "");
    const sell = parsePriceToken(cells[idx + 2] ?? "");
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
    const buy = parsePriceToken(m[1]);
    const sell = parsePriceToken(m[2]);
    if (buy != null && sell != null) return { buy, sell };
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

export const DAI_PHAT_VUONG_SOURCES = DAI_PHAT_VUONG_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Đại Phát Vượng",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-dai-phat-vuong-nam-dinh/",
  webUrl: "https://giavangmaothiet.com/gia-vang-dai-phat-vuong-nam-dinh/",
  location: "Nam Định",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));