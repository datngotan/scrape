import * as cheerio from "cheerio";

import { nowVnText, stripHtmlToText } from "../../utils.js";

export const KIM_TIN_SILVER_PRODUCTS = [
  {
    id: "kim_tin_bac_thoi_9999_1_luong",
    name: "Kim Tín (Bạc miếng, Bạc thỏi 999.9)",
    needle: "1 LUONG",
    purity: "999.9",
    unit: "luong",
  },
  {
    id: "kim_tin_bac_thoi_9999_1_kg",
    name: "Kim Tín (Bạc miếng, Bạc thỏi 999.9)",
    needle: "1 KILO",
    purity: "999.9",
    unit: "kg",
  },
  {
    id: "kim_tin_bac_thoi_999_1_luong",
    name: "Kim Tín (Bạc miếng, Bạc thỏi 99.9)",
    needle: "1 LUONG",
    purity: "99.9",
    unit: "luong",
  },
  {
    id: "kim_tin_bac_thoi_999_1_kg",
    name: "Kim Tín (Bạc miếng, Bạc thỏi 99.9)",
    needle: "1 KILO",
    purity: "99.9",
    unit: "kg",
  },
];

const KIM_TIN_FETCH_OPTIONS = {
  timeoutMs: 120_000,
  waitMs: 8_000,
  maxAttempts: 5,
  waitUntil: "commit",
};

const KIM_TIN_SHARED = {
  storeName: "Kim Tín",
  url: "https://kimtin.com.vn",
  webUrl: "https://kimtin.com.vn",
  location: "Hà Nội, Cao Bằng, Thái Nguyên",
  fetchOptions: KIM_TIN_FETCH_OPTIONS,
};

function normalizeLabelText(input) {
  return String(input || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9.]+/g, " ")
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
  const digits = String(cellText || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function matchesPurityCell(purityCell, targetPurity) {
  if (!targetPurity) return true;
  const p = normalizeLabelText(purityCell);
  const t = normalizeLabelText(targetPurity);
  if (t === "99.9") {
    return p.includes("99.9") && !p.includes("999.9");
  }
  return p.includes(t);
}

function parseBuySellFromMarkdownLine(line) {
  const cells = String(line || "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 3) return { buy: null, sell: null };

  const buy = parsePriceCell(cells[cells.length - 2]);
  const sell = parsePriceCell(cells[cells.length - 1]);
  if (buy == null || sell == null) return { buy: null, sell: null };

  return { buy, sell };
}

function parseBuySellFromMarkdown(payload, label, purity) {
  const targetLabel = normalizeLabelText(label);
  const lines = String(payload || "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("|")) continue;

    const normalized = normalizeLabelText(line);
    if (!normalized.includes(targetLabel)) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);

    if (cells.length >= 3 && purity) {
      const purityCell = cells[cells.length - 3] || "";
      if (!matchesPurityCell(purityCell, purity)) continue;
    }

    const direct = parseBuySellFromMarkdownLine(line);
    if (direct.buy != null && direct.sell != null) {
      return direct;
    }

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

export function parseSilverBuySell(payload, needle, purity) {
  const html = String(payload || "");
  const targetNeedle = normalizeLabelText(needle);

  // 1. Cheerio HTML parsing (Table 2: Silver table on kimtin.com.vn)
  try {
    const $ = cheerio.load(html);
    const silverTable = $("table").filter((_, t) => {
      const text = $(t).text();
      return (
        text.includes("Bạc rồng Kim Tín") ||
        text.includes("Bạc miếng") ||
        text.includes("Bạc tinh khiết")
      );
    });

    if (silverTable.length) {
      let result = null;
      silverTable.find("tr").each((_, tr) => {
        if (result) return;
        const tds = $(tr).find("td");
        if (tds.length < 3) return;

        const cellTexts = tds
          .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
          .get();
        const rowFullText = normalizeLabelText(cellTexts.join(" "));

        if (!rowFullText.includes(targetNeedle)) return;

        const purityCell = cellTexts[cellTexts.length - 3] || "";
        if (!matchesPurityCell(purityCell, purity)) return;

        const buy = parsePriceCell(cellTexts[cellTexts.length - 2]);
        const sell = parsePriceCell(cellTexts[cellTexts.length - 1]);
        if (buy != null && sell != null) {
          result = { buy, sell };
        }
      });

      if (result) return result;
    }
  } catch {
    // Fall back to markdown/regex parsers
  }

  // 2. Markdown table parsing fallback
  const markdown = parseBuySellFromMarkdown(html, needle, purity);
  if (markdown.buy != null && markdown.sell != null) {
    return markdown;
  }

  // 3. Raw HTML regex fallback
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const rowText = stripHtmlToText(row);
    if (!normalizeLabelText(rowText).includes(targetNeedle)) continue;

    const cells = row.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (cells.length >= 3 && purity) {
      const purityCell = stripHtmlToText(cells[cells.length - 3]);
      if (!matchesPurityCell(purityCell, purity)) continue;
    }

    const nums = numbersFromText(rowText);
    if (nums.length < 2) continue;

    return {
      buy: nums[nums.length - 2] ?? null,
      sell: nums[nums.length - 1] ?? null,
    };
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

export function parseTime(payload) {
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

export const KIM_TIN_SILVER_SOURCES = KIM_TIN_SILVER_PRODUCTS.map((product) => ({
  ...KIM_TIN_SHARED,
  id: product.id,
  name: product.name,
  unit: product.unit,
  parse: (payload) => {
    const { buy, sell } = parseSilverBuySell(
      payload,
      product.needle,
      product.purity,
    );
    return {
      buy,
      sell,
      unit: product.unit,
      lastUpdateText: parseTime(payload),
    };
  },
}));
