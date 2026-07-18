import * as cheerio from "cheerio";

const DOJI_GOLD_URL = "https://banggia.doji.vn/gold-price";

function normalizeLabel(input) {
  return String(input || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parsePriceCell(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTime(payload) {
  const text = String(payload || "").replace(/\s+/g, " ");
  const m = text.match(
    /C[aâ]p\s+nh[aâ]t\s+(\d{1,2}):(\d{2})\s+ng[aà]y\s+(\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (!m) return "";
  const HH = m[1].padStart(2, "0");
  const MI = m[2];
  const dd = m[3];
  const mm = m[4];
  const yyyy = m[5];
  return `${HH}:${MI}:00 ${dd}/${mm}/${yyyy}`;
}

function parseGoldRows(payload) {
  const $ = cheerio.load(String(payload || ""));
  const rows = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();

    if (cells.length < 3) return;
    const label = cells[1];
    if (!label) return;

    const buy = parsePriceCell(cells[2]);
    const sell = parsePriceCell(cells[3]);
    rows.push({ label, buy, sell: sell ?? null });
  });

  return rows;
}

function parseDojiHtml(payload, rowLabel) {
  const lastUpdateText = parseTime(payload);
  const target = normalizeLabel(rowLabel);
  const rows = parseGoldRows(payload);

  const row = rows.find((r) => normalizeLabel(r.label) === target);
  if (!row) return { buy: null, sell: null, lastUpdateText };

  return { buy: row.buy, sell: row.sell, lastUpdateText };
}

function createDojiSource(id, name, rowLabel) {
  return {
    id,
    name,
    storeName: "DOJI",
    location: "Toàn quốc",
    url: DOJI_GOLD_URL,
    webUrl: DOJI_GOLD_URL,
    parse: (payload) => parseDojiHtml(payload, rowLabel),
  };
}

export const DOJI_SOURCES = [
  createDojiSource(
    "doji",
    "DOJI (Nhẫn Tròn 9999 Hưng Thịnh Vượng)",
    "NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG",
  ),
  createDojiSource("doji_kim_tt_avpl", "DOJI (Kim TT/AVPL)", "KIM TT/AVPL"),
  createDojiSource(
    "doji_sjc_ban_le",
    "DOJI (Vàng Miếng SJC)",
    "VÀNG MIẾNG SJC",
  ),
  createDojiSource(
    "doji_nu_trang_9999_ban_le",
    "DOJI (Nữ trang 9999)",
    "NỮ TRANG 9999",
  ),
  createDojiSource(
    "doji_nu_trang_999_ban_le",
    "DOJI (Nữ trang 999)",
    "NỮ TRANG 999",
  ),
  createDojiSource(
    "doji_nu_trang_99_ban_le",
    "DOJI (Nữ trang 99)",
    "NỮ TRANG 99",
  ),
];
