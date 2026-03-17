import {
  parseSilverBuySellByNeedle,
  parseSilverLastUpdateText,
} from "../../utils.js";

function parseTime(html) {
  return parseSilverLastUpdateText(html);
}

function parse(html, needle, unit) {
  const { buy, sell } = parseSilverBuySellByNeedle(html, needle);
  return {
    buy,
    sell,
    unit,
    lastUpdateText: parseTime(html),
  };
}

const SHARED = {
  storeName: "Bạc Mặt Trăng",
  url: "https://bacmattrang.com/bac_mat_trang/default/index",
  webUrl: "https://bacmattrang.com/bac_mat_trang/default/index",
  location: "TP.HCM",
};

export const BAC_MAT_TRANG_SOURCES = [
  {
    ...SHARED,
    id: "bac_mat_trang_bac_khoi_1_luong",
    name: "Bạc Mặt Trăng - Bạc Khối",
    unit: "luong",
    parse: (html) => parse(html, "1 Lượng", "luong"),
  },
  {
    ...SHARED,
    id: "bac_mat_trang_bac_khoi_1_kg",
    name: "Bạc Mặt Trăng - Bạc Khối",
    unit: "kg",
    parse: (html) => parse(html, "1 Kg", "kg"),
  },
];
