import { nowVnText, toNumberDigits } from "../../utils.js";

const KIM_LONG_BASE_URL = "https://bg2.kimlongdongthap.vn";

const KIM_LONG_PRODUCTS = [
  {
    id: "kim_long_dong_thap_nhan_tron_ep_vi_9999",
    name: "Kim Long Đồng Tháp (Nhẫn trơn & ép vỉ 9999)",
    infoId: 1,
    unit: "luong",
  },
  {
    id: "kim_long_dong_thap_nu_trang_kim_long_24k",
    name: "Kim Long Đồng Tháp (Nữ trang Kim Long 24K)",
    infoId: 2,
    unit: "luong",
  },
  {
    id: "kim_long_dong_thap_nu_trang_sap_24k",
    name: "Kim Long Đồng Tháp (Nữ trang sáp 24K)",
    infoId: 8,
    unit: "luong",
  },
  {
    id: "kim_long_dong_thap_nu_trang_cao_cap_18k",
    name: "Kim Long Đồng Tháp (Nữ trang cao cấp 18K)",
    infoId: 3,
    unit: "luong",
  },
  {
    id: "kim_long_dong_thap_nu_trang_cong_ty_610",
    name: "Kim Long Đồng Tháp (Nữ trang công ty 610)",
    infoId: 4,
    unit: "luong",
  },
  {
    id: "kim_long_dong_thap_nu_trang_cong_ty_600",
    name: "Kim Long Đồng Tháp (Nữ trang công ty 600)",
    infoId: 5,
    unit: "luong",
  },
];

let lastPayloadKey = "";
let lastRowsPromise = null;

function parsePriceToThousand(raw) {
  const value = toNumberDigits(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 1_000_000 ? Math.round(value / 1000) : value;
}

function parseBoardDate(payload) {
  const m = String(payload || "").match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return null;

  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return { dd, mm, yyyy };
}

function buildLastUpdateText(payload) {
  const boardDate = parseBoardDate(payload);
  if (!boardDate) return nowVnText();

  const now = nowVnText();
  const time = now.match(/^(\d{2}:\d{2}:\d{2})\s+/)?.[1] ?? "00:00:00";
  return `${time} ${boardDate.dd}/${boardDate.mm}/${boardDate.yyyy}`;
}

async function fetchInfoRow(infoId) {
  const response = await fetch(`${KIM_LONG_BASE_URL}/_info.aspx?ID=${infoId}`);
  if (!response.ok) {
    throw new Error(`_info.aspx?ID=${infoId} failed with status ${response.status}`);
  }

  const text = await response.text();
  const parts = text.replace(/\r/g, "").split("\n");

  if (parts.length < 9) {
    throw new Error(`Unexpected _info.aspx payload for ID=${infoId}`);
  }

  return {
    id: parts[0] ?? String(infoId),
    productName: parts[2] ?? "",
    buy: parsePriceToThousand(parts[7]),
    sell: parsePriceToThousand(parts[8]),
    raw: text,
  };
}

async function loadAllRows(payload) {
  const rows = new Map();
  await Promise.all(
    KIM_LONG_PRODUCTS.map(async (product) => {
      const info = await fetchInfoRow(product.infoId);
      rows.set(product.infoId, info);
    }),
  );

  return {
    rows,
    lastUpdateText: buildLastUpdateText(payload),
  };
}

function getRowsPromise(payload) {
  const key = String(payload || "").slice(0, 2000);
  if (lastRowsPromise && key === lastPayloadKey) return lastRowsPromise;

  lastPayloadKey = key;
  lastRowsPromise = loadAllRows(payload);
  return lastRowsPromise;
}

export const KIM_LONG_DONG_THAP_SOURCES = KIM_LONG_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Long Đồng Tháp",
  location: "Đồng Tháp",
  unit: product.unit,
  url: "https://bg2.kimlongdongthap.vn/BangGiaWEB.aspx",
  webUrl: "https://www.kimlongdongthap.vn/",
  parse: async (payload) => {
    const board = await getRowsPromise(payload);
    const row = board.rows.get(product.infoId);

    return {
      buy: row?.buy ?? null,
      sell: row?.sell ?? null,
      unit: product.unit,
      lastUpdateText: board.lastUpdateText,
    };
  },
}));
