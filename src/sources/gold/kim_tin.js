import { nowVnText, stripHtmlToText } from "../../utils.js";

const KIM_TIN_PRODUCTS = [
  {
    id: "kim_tin",
    name: "Kim Tín (Nhẫn tròn trơn 999.9)",
    label: "NHAN TRON TRON",
  },
  {
    id: "kim_tin_nhan_tron_ep_vi",
    name: "Kim Tín (Nhẫn tròn ép vỉ 999.9)",
    label: "NHAN TRON EP VI",
  },
  {
    id: "kim_tin_qua_mung_vang",
    name: "Kim Tín (Quà mừng vàng 999.9)",
    label: "QUA MUNG VANG",
  },
];

function normalizeLabelText(input) {
  return String(input || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function numbersFromText(text) {
  const nums = String(text || "").match(/\b\d{4,6}\b/g) ?? [];
  return nums
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseBuySellByLabel(payload, label) {
  const targetLabel = normalizeLabelText(label);
  const html = String(payload || "");
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const rowText = stripHtmlToText(row);
    if (!normalizeLabelText(rowText).includes(targetLabel)) continue;

    const cells = row.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    const content =
      cells.length >= 5
        ? `${stripHtmlToText(cells[3])} ${stripHtmlToText(cells[4])}`
        : rowText;
    const nums = numbersFromText(content);
    if (nums.length < 2) continue;

    return {
      buy: nums[nums.length - 2] ?? null,
      sell: nums[nums.length - 1] ?? null,
    };
  }

  // r.jina.ai may return markdown table lines like: | product | buy | sell |
  const lines = html.split(/\r?\n/);
  for (const line of lines) {
    const upper = normalizeLabelText(line);
    if (!line.includes("|") || !upper.includes(targetLabel)) continue;
    const nums = numbersFromText(line);
    if (nums.length < 2) continue;

    return {
      buy: nums[nums.length - 2] ?? null,
      sell: nums[nums.length - 1] ?? null,
    };
  }

  const plain = normalizeLabelText(stripHtmlToText(html));
  const idx = plain.indexOf(targetLabel);
  if (idx >= 0) {
    const slice = plain.slice(idx, Math.min(plain.length, idx + 320));
    const nums = numbersFromText(slice);
    if (nums.length >= 2) {
      return {
        buy: nums[nums.length - 2] ?? null,
        sell: nums[nums.length - 1] ?? null,
      };
    }
  }

  return { buy: null, sell: null };
}

function parseTime(payload) {
  const text = stripHtmlToText(payload);

  let m = text.match(
    /(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})[\s\S]{0,100}?(\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = m[3];
    const dd = m[4];
    const mm = m[5];
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(
    /(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})\s*(?:Thu\s*\d,\s*)?(\d{2})\/(\d{2})\/(\d{4})/i,
  );
  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const SS = m[3];
    const dd = m[4];
    const mm = m[5];
    const yyyy = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/i,
  );
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

export const KIM_TIN_SOURCES = KIM_TIN_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Tin",
  unit: "luong",
  url: "https://r.jina.ai/https://kimtin.com.vn/bieu-do-gia-vang",
  webUrl: "https://kimtin.com.vn/bieu-do-gia-vang",
  location: "Hà Nội, Cao Bằng, Thái Nguyên",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);
    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
