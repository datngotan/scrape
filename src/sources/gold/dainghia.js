import { nowVnText, stripHtmlToText } from "../../utils.js";

const DAI_NGHIA_PRODUCTS = [
  {
    id: "dai_nghia_9999_vi",
    name: "Đại Nghĩa (9999 vĩ)",
    label: "9999 vĩ",
  },
  {
    id: "dai_nghia_nhan_tron_9999",
    name: "Đại Nghĩa (Nhẫn Tròn 9999 Đại Nghĩa)",
    label: "Nhẫn Tròn 9999 Đại Nghĩa",
  },
  {
    id: "dai_nghia_vang_98",
    name: "Đại Nghĩa (Vàng 98)",
    label: "Vàng 98",
  },
  {
    id: "dai_nghia_vang_96",
    name: "Đại Nghĩa (Vàng 96%)",
    label: "Vàng 96%",
  },
  {
    id: "dai_nghia_nu_trang_980",
    name: "Đại Nghĩa (Nữ trang 980)",
    label: "Nữ trang 980",
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

  // Keep unit as thousands when the page emits full VND amounts.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function parseBuySellFromPipeLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 3) return { buy: null, sell: null };

  const buy = parsePriceToken(cells[cells.length - 2]);
  const sell = parsePriceToken(cells[cells.length - 1]);
  return { buy, sell };
}

function parseBuySellByLabel(payload, label) {
  const normalizedLabel = normalizeText(label);
  const raw = String(payload || "");
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;
    if (!normalizeText(line).includes(normalizedLabel)) continue;

    const direct = parseBuySellFromPipeLine(line);
    if (direct.buy != null && direct.sell != null) return direct;

    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const merged = parseBuySellFromPipeLine(combined);
    if (merged.buy != null && merged.sell != null) return merged;
  }

  const text = stripHtmlToText(raw);
  const escapedLabel = normalizedLabel
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s*");
  const token = "(\\d[\\d.,]*)";
  const m = normalizeText(text).match(
    new RegExp(`${escapedLabel}\\s+${token}\\s+${token}`, "i"),
  );
  if (!m) return { buy: null, sell: null };

  const buy = parsePriceToken(m[1]);
  const sell = parsePriceToken(m[2]);
  return { buy, sell };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  let m = text.match(/Cập nhật lúc:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/i);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}`;
  }

  return nowVnText();
}

export const DAI_NGHIA_SOURCES = DAI_NGHIA_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Bạc Đại Nghĩa",
  location: "Nam Định",
  unit: "chi",
  url: "https://r.jina.ai/http://vangdainghia.com/",
  webUrl: "https://vangdainghia.com/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
