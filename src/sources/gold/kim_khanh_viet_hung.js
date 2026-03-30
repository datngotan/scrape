import * as cheerio from "cheerio";

import { nowVnText } from "../../utils.js";

const PAGE_URL = "https://kimkhanhviethung.vn/tra-cuu-gia-vang.html";

const PRODUCTS = [
  {
    id: "kkvh",
    name: "Kim Khánh Việt Hùng (Vàng 999.9)",
    label: "Vàng 999.9",
  },
  {
    id: "kkvh_nhan_khau_98",
    name: "Kim Khánh Việt Hùng (Vàng Nhẫn Khâu 98)",
    label: "Vàng Nhẫn Khâu 98",
  },
  {
    id: "kkvh_nhan_khau_97",
    name: "Kim Khánh Việt Hùng (Vàng Nhẫn Khâu 97)",
    label: "Vàng Nhẫn Khâu 97 ( Quảng Nam )",
  },
  {
    id: "kkvh_nhan_khau_96",
    name: "Kim Khánh Việt Hùng (Vàng Nhẫn Khâu 96)",
    label: "Vàng Nhẫn Khâu 96",
  },
  {
    id: "kkvh_nu_trang_980",
    name: "Kim Khánh Việt Hùng (Nữ Trang 980)",
    label: "Nữ trang 980",
  },
];

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toVndThousand(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) value = Math.round(value / 1000);
  return value;
}

function parseTime(html) {
  const match = String(html || "").match(
    /Ngày\s*cập\s*nhật:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})/i,
  );
  if (match) {
    const [date, time] = match[1].trim().split(/\s+/);
    return `${time} ${date}`;
  }

  return nowVnText();
}

function parseRows(html) {
  const $ = cheerio.load(String(html || ""));
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    const buy = toVndThousand(cells[1]);
    const sell = toVndThousand(cells[2]);
    if (buy == null || sell == null) return;

    rows.push({
      label: cells[0],
      buy,
      sell,
    });
  });

  return rows;
}

function parseBuySellByLabel(html, label) {
  const target = normalizeText(label);

  for (const row of parseRows(html)) {
    if (normalizeText(row.label) === target) {
      return { buy: row.buy, sell: row.sell };
    }
  }

  return { buy: null, sell: null };
}

export const KIM_KHANH_VIET_HUNG_SOURCES = PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Khánh Việt Hùng",
  location: "Đà Nẵng",
  unit: "chi",
  url: PAGE_URL,
  webUrl: PAGE_URL,
  fetchOptions: {
    ignoreHTTPSErrors: true,
  },
  parse: (html) => {
    const { buy, sell } = parseBuySellByLabel(html, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(html),
    };
  },
}));
