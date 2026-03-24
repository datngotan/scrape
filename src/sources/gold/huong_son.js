import { nowVnText, stripHtmlToText } from "../../utils.js";

const HUONG_SON_PRODUCTS = [
  {
    id: "huong_son_vang_999_lan_7",
    name: "Hương Sơn (Vàng 99.9)",
    label: "Vàng 9999 Hương Sơn",
  },
  {
    id: "huong_son_vang_950",
    name: "Hương Sơn (Vàng 950)",
    label: "Vàng 950 Hương Sơn",
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

function buildLabelPrefix(label) {
  const normalized = normalizeText(label)
    .replace(/\bvang\s+9999\b/g, "vang 99 9")
    .replace(/\bvang\s+99\s*9\b/g, "vang 99 9")
    .replace(/\blan\s+\d+\b/g, " ")
    .replace(/\bhuong\s+son\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized;
}

function normalizeProductCell(input) {
  return normalizeText(input)
    .replace(/\blan\s+\d+\b/g, " ")
    .trim();
}

function isMarkdownSeparatorRow(cells) {
  if (!Array.isArray(cells) || cells.length < 3) return false;
  return cells.every((cell) => /^[:\-\s]+$/.test(cell));
}

function splitMarkdownRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return [];

  return trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, idx, arr) => {
      if (idx === 0 && cell === "") return false;
      if (idx === arr.length - 1 && cell === "") return false;
      return true;
    });
}

function matchProductName(cells, labelPrefix, normalizedLabel) {
  const normalizedPrefix = normalizeProductCell(labelPrefix);
  const normalizedTarget = normalizeProductCell(normalizedLabel);

  for (let idx = 0; idx < cells.length; idx++) {
    const normalizedCell = normalizeProductCell(cells[idx]);
    if (!normalizedCell) continue;

    if (
      normalizedCell === normalizedTarget ||
      normalizedCell === normalizedPrefix ||
      normalizedCell.startsWith(`${normalizedPrefix} `) ||
      normalizedCell.startsWith(`${normalizedTarget} `)
    ) {
      return idx;
    }
  }

  return -1;
}

function parsePriceToken(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Prices are presented in full VND (e.g. 16650000); store as thousands.
  if (n >= 1_000_000) n = Math.round(n / 1000);
  return n;
}

function buildRawLabelCandidates(label) {
  const candidates = [String(label || "").trim()];
  const raw = String(label || "");

  if (/99\.?9/.test(raw)) {
    candidates.push(raw.replace(/99\.?9/g, "9999"));
  }

  if (/hương\s*sơn/i.test(raw)) {
    candidates.push(raw.replace(/\s*hương\s*sơn/gi, "").trim());
  } else {
    candidates.push(`${raw} Hương Sơn`.trim());
  }

  return [...new Set(candidates.filter(Boolean))];
}

function parseBuySellNearLabel(text, label) {
  const rawText = String(text || "");
  const haystack = rawText.toLowerCase();

  for (const candidate of buildRawLabelCandidates(label)) {
    const idx = haystack.indexOf(candidate.toLowerCase());
    if (idx < 0) continue;

    const scope = rawText.slice(idx, Math.min(rawText.length, idx + 260));
    const tokens = scope.match(/\d{1,3}(?:\s*[.,]\s*\d{3}){1,2}/g) ?? [];
    const prices = tokens
      .map((token) => parsePriceToken(token))
      .filter((n) => n != null && n >= 1000);

    if (prices.length >= 2) {
      return { buy: prices[0], sell: prices[1] };
    }
  }

  return { buy: null, sell: null };
}

function parseBuySellByLabel(payload, label) {
  const raw = String(payload || "");
  const text = stripHtmlToText(payload);

  const nearLabel = parseBuySellNearLabel(text, label);
  if (nearLabel.buy != null && nearLabel.sell != null) {
    return nearLabel;
  }

  const normalizedLabel = normalizeText(label);
  const labelPrefix = buildLabelPrefix(label) || normalizedLabel;

  // Parse markdown table rows from raw payload so wrapped labels like
  // "Vàng 950 (lần\n20)" can still be reconstructed.
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const first = String(lines[i] || "").trim();
    if (!first.includes("|")) continue;

    let mergedRow = first;
    let next = i + 1;
    while ((mergedRow.match(/\|/g) ?? []).length < 4 && next < lines.length) {
      const candidate = String(lines[next] || "").trim();
      if (!candidate) {
        next++;
        continue;
      }

      mergedRow += ` ${candidate}`;
      next++;
    }

    i = next - 1;
    const cells = splitMarkdownRow(mergedRow);
    if (cells.length < 3 || isMarkdownSeparatorRow(cells.slice(0, 3))) continue;

    const nameIdx = matchProductName(cells, labelPrefix, normalizedLabel);
    if (nameIdx < 0) continue;

    const buy = parsePriceToken(cells[nameIdx + 1] ?? "");
    const sell = parsePriceToken(cells[nameIdx + 2] ?? "");
    if (buy != null && sell != null) return { buy, sell };
  }

  // Fallback for flattened content.
  const escapedLabel = labelPrefix
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

  // Last-resort fallback: locate nearest two price tokens after the label.
  const compact = normalizeText(raw);
  const idx = compact.indexOf(labelPrefix);
  if (idx >= 0) {
    const tailRaw = raw.slice(
      Math.max(0, Math.floor((idx / compact.length) * raw.length)),
    );
    const tokens = tailRaw.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? [];
    const prices = tokens.map(parsePriceToken).filter((n) => n != null);
    if (prices.length >= 2) {
      return { buy: prices[0], sell: prices[1] };
    }
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

export const HUONG_SON_SOURCES = HUONG_SON_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Tiệm Vàng Hương Sơn",
  url: "https://r.jina.ai/https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  webUrl: "https://giavangmaothiet.com/gia-vang-huong-son-hom-nay/",
  location: "Ninh Bình",
  parse: (payload) => {
    const { buy, sell } = parseBuySellByLabel(payload, product.label);

    if (buy == null || sell == null) {
      throw new Error(
        `Unable to parse Hương Sơn prices for \"${product.label}\"`,
      );
    }

    return {
      buy,
      sell,
      lastUpdateText: parseTime(payload),
    };
  },
}));
