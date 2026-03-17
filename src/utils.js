export function parseSilverPriceToThousand(raw) {
  const cleaned = String(raw || "").replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const sepCount = (cleaned.match(/[.,]/g) ?? []).length;
  const digits = cleaned.replace(/[.,]/g, "");
  if (!digits) return null;
  if (digits.length > 12) return null;

  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (n > 999_999_999_999) return null;

  if (sepCount >= 2) return Math.round(n / 1000);
  if (sepCount === 1) return n;

  return n >= 1_000_000 ? Math.round(n / 1000) : n;
}

export function toNumberDigits(raw) {
  const cleaned = String(raw || "").replace(/[^\d]/g, "");
  if (!cleaned) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeNeedleText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isReasonableSilverPrice(price) {
  return Number.isFinite(price) && price > 0 && price <= 1_000_000;
}

function normalizeDateParts(raw) {
  const m = String(raw || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  let a = Number(m[1]);
  let b = Number(m[2]);
  const yyyy = m[3];

  if (a <= 12 && b > 12) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  if (a < 1 || a > 31 || b < 1 || b > 12) return null;
  return {
    dd: String(a).padStart(2, "0"),
    mm: String(b).padStart(2, "0"),
    yyyy,
  };
}

export function nowVnText() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const s = fmt.format(d).replace(",", "");
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return "";
  const [, dd, mm, yyyy, HH, MI, SS] = m;
  return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
}

export function parseSilverLastUpdateText(payload) {
  const input = String(payload || "");

  let m = input.match(
    /(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  );
  if (m) {
    const time = m[1].length === 5 ? `${m[1]}:00` : m[1];
    const date = normalizeDateParts(m[2]);
    if (date) return `${time} ${date.dd}/${date.mm}/${date.yyyy}`;
  }

  m = input.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (m) {
    const date = normalizeDateParts(m[1]);
    const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
    if (date) return `${time} ${date.dd}/${date.mm}/${date.yyyy}`;
  }

  return nowVnText();
}

export function stripHtmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSilverBuySellByNeedle(payload, needle) {
  const rows = String(payload || "").match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const target = normalizeNeedleText(needle);

  for (const rowHtml of rows) {
    const rowText = stripHtmlToText(rowHtml);
    if (!normalizeNeedleText(rowText).includes(target)) continue;

    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlToText(m[1]))
      .filter(Boolean);

    const foundIdx = cells.findIndex((c) =>
      normalizeNeedleText(c).includes(target),
    );
    const prices = [];

    for (const c of cells.slice(foundIdx >= 0 ? foundIdx + 1 : 0)) {
      const price = parseSilverPriceToThousand(c);
      if (price != null && isReasonableSilverPrice(price)) prices.push(price);
    }

    if (prices.length >= 2) {
      return { buy: prices[0], sell: prices[1] };
    }

    const inlinePrices = (rowText.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? [])
      .map(parseSilverPriceToThousand)
      .filter((n) => n != null && isReasonableSilverPrice(n));

    if (inlinePrices.length >= 2) {
      return { buy: inlinePrices[0], sell: inlinePrices[1] };
    }
  }

  return { buy: null, sell: null };
}
