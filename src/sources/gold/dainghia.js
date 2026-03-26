import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

const DAI_NGHIA_PRODUCTS = [
  {
    id: "dai_nghia_9999_vi",
    name: "Đại Nghĩa (9999 vĩ)",
    labels: ["9999 vĩ", "9999"],
  },
  {
    id: "dai_nghia_nhan_tron_9999",
    name: "Đại Nghĩa (Nhẫn Tròn 9999 Đại Nghĩa)",
    labels: ["Nhẫn Tròn 9999 Đại Nghĩa", "9999"],
  },
  {
    id: "dai_nghia_vang_98",
    name: "Đại Nghĩa (Vàng 98)",
    labels: ["Vàng 98", "980"],
  },
  {
    id: "dai_nghia_vang_96",
    name: "Đại Nghĩa (Vàng 96%)",
    labels: ["Vàng 96%", "960"],
  },
  {
    id: "dai_nghia_nu_trang_980",
    name: "Đại Nghĩa (Nữ trang 980)",
    labels: ["Nữ trang 980", "980"],
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

function parseTableRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("table.goldbox-table tbody tr, table tbody tr, tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;
    const buy = parsePriceToken(cells[1]);
    const sell = parsePriceToken(cells[2]);
    if (buy == null || sell == null) return;

    rows.push({ label: cells[0], buy, sell });
  });

  return rows;
}

function parseBuySellByLabel(payload, labels) {
  const normalizedLabels = labels.map((label) => normalizeText(label));
  const raw = String(payload || "");

  // Primary: parse structured table cells from direct HTML.
  const tableRows = parseTableRows(raw);
  for (const row of tableRows) {
    const normalizedRowLabel = normalizeText(row.label);
    if (
      normalizedLabels.some((normalizedLabel) =>
        normalizedRowLabel.includes(normalizedLabel),
      )
    ) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;
    const normalizedLine = normalizeText(line);
    if (
      !normalizedLabels.some((normalizedLabel) =>
        normalizedLine.includes(normalizedLabel),
      )
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
  const plainLines = text.split(/\r?\n/);
  for (const line of plainLines) {
    const normalizedLine = normalizeText(line);
    if (
      !normalizedLabels.some((normalizedLabel) =>
        normalizedLine.includes(normalizedLabel),
      )
    ) {
      continue;
    }

    const tokens = line.match(/\d{1,3}(?:[.,]\d{3}){1,2}|\d{4,6}/g) ?? [];
    const prices = tokens.map(parsePriceToken).filter((n) => n != null);
    if (prices.length >= 2) {
      return { buy: prices[0], sell: prices[1] };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  let m = text.match(
    /Cập nhật lúc:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/i,
  );
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
  url: "https://giavangmaothiet.com/gia-vang-dai-nghia-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-dai-nghia-hom-nay/",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.labels);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
