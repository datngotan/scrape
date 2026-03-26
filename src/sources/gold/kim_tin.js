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

function parsePriceCell(cellText) {
  const match = String(cellText || "").match(/\b(\d{4,6})\b/);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseBuySellFromMarkdownLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 4) return { buy: null, sell: null };

  const buy = parsePriceCell(cells[cells.length - 2]);
  const sell = parsePriceCell(cells[cells.length - 1]);
  if (buy == null || sell == null) return { buy: null, sell: null };

  return { buy, sell };
}

function parseBuySellFromMarkdown(payload, label) {
  const targetLabel = normalizeLabelText(label);
  const lines = String(payload || "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const normalized = normalizeLabelText(line);
    if (!normalized.includes(targetLabel)) continue;

    const direct = parseBuySellFromMarkdownLine(line);
    if (direct.buy != null && direct.sell != null) {
      return direct;
    }

    // Handle cases where one logical table row is wrapped across lines.
    const combined = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter((part) => part.includes("|"))
      .join(" ");
    const merged = parseBuySellFromMarkdownLine(combined);
    if (merged.buy != null && merged.sell != null) {
      return merged;
    }
  }

  return { buy: null, sell: null };
}

function parseBuySellByLabel(payload, label) {
  const html = String(payload || "");

  const markdown = parseBuySellFromMarkdown(html, label);
  if (markdown.buy != null && markdown.sell != null) {
    return markdown;
  }

  const targetLabel = normalizeLabelText(label);
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

  // Some sources can return markdown table lines like: | product | buy | sell |
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

function timeCandidatesFromRegex(text) {
  const candidates = [];

  const patterns = [
    /(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})[\s\S]{0,100}?(\d{2})\/(\d{2})\/(\d{4})/gi,
    /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,100}?(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/gi,
    /Thu\s*\d\s*,\s*(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,60}?(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let dd;
      let mm;
      let yyyy;
      let HH;
      let MI;
      let SS;

      if (pattern === patterns[1] || pattern === patterns[2]) {
        dd = match[1];
        mm = match[2];
        yyyy = match[3];
        HH = match[4];
        MI = match[5];
        SS = match[6];
      } else {
        HH = match[1];
        MI = match[2];
        SS = match[3];
        dd = match[4];
        mm = match[5];
        yyyy = match[6];
      }

      const key = `${yyyy}${mm}${dd}${HH.padStart(2, "0")}${MI}${SS}`;
      candidates.push({
        key,
        text: `${HH.padStart(2, "0")}:${MI}:${SS} ${dd}/${mm}/${yyyy}`,
      });
    }
  }

  return candidates;
}

function parseTime(payload) {
  const html = String(payload || "");
  const text = stripHtmlToText(payload);
  const candidates = [
    ...timeCandidatesFromRegex(html),
    ...timeCandidatesFromRegex(text),
  ];

  if (candidates.length > 0) {
    candidates.sort((a, b) => (a.key > b.key ? -1 : a.key < b.key ? 1 : 0));
    return candidates[0].text;
  }

  return nowVnText();
}

export const KIM_TIN_SOURCES = KIM_TIN_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Kim Tin",
  unit: "luong",
  url: "https://kimtin.com.vn",
  webUrl: "https://kimtin.com.vn",
  fetchOptions: {
    timeoutMs: 120_000,
    waitMs: 8_000,
    maxAttempts: 5,
    waitUntil: "commit",
  },
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
