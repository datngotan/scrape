const CHIEN_MINH_PRODUCTS = [
  {
    id: "chien_minh_nhan_cm_9999",
    name: "Chiến Minh (Vàng nhẫn CM 99.99)",
    label: "VÀNG NHẪN CM 99.99",
    aliases: ["VÀNG NHẪN CM 99.99", "VANG NHAN CM 99.99", "NHAN CM 99.99"],
  },
  {
    id: "chien_minh_vang_cm_9999",
    name: "Chiến Minh (Vàng CM 99.99)",
    label: "VÀNG CM 99.99",
    aliases: ["VÀNG CM 99.99", "VANG CM 99.99", "CM 99.99"],
  },
];

function decodeHtml(input) {
  const s = String(input || "");

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(
        `<body>${s}</body>`,
        "text/html",
      );
      const text = doc?.body?.textContent;
      if (text) return text.replace(/\s+/g, " ").trim();
    } catch {
      // Fall through to lightweight replacements.
    }
  }

  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " "));
}

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

function toNumber(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isAliasMatch(label, aliases) {
  const normalizedLabel = normalizeText(label);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return (
      normalizedLabel === normalizedAlias ||
      normalizedLabel.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedLabel)
    );
  });
}

function isProductIdMatch(label, productId) {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return false;

  if (productId === "chien_minh_nhan_cm_9999") {
    return (
      normalizedLabel.includes("nhan cm") && normalizedLabel.includes("99 99")
    );
  }

  if (productId === "chien_minh_vang_cm_9999") {
    return (
      normalizedLabel.includes("vang cm") && normalizedLabel.includes("99 99")
    );
  }

  return false;
}

function nowVnText() {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replace(",", "");

  const m = s.match(/^(\d{2}):(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const HH = m[1];
  const MI = m[2];
  const SS = m[3];
  const dd = m[4];
  const mm = m[5];
  const yyyy = m[6];
  return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
}

function parseTime(payload) {
  const text = stripTags(payload);

  let m = text.match(
    /Ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const HH = m[4].padStart(2, "0");
    const MI = m[5];
    const SS = m[6];
    return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
  }

  m = text.match(
    /Ngày\s*(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (!m) return "";

  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  const HH = m[4].padStart(2, "0");
  const MI = m[5];
  const SS = m[6] ?? "00";
  return `${HH}:${MI}:${SS} ${dd}/${mm}/${yyyy}`;
}

function parseBuySellByLabel(payload, product) {
  const aliases = [product.label, ...(product.aliases ?? [])];
  const target = normalizeText(product.label);
  const raw = String(payload || "");

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;

    const parts = line
      .split("|")
      .map((part) => stripTags(part))
      .filter((part) => part.length > 0);
    if (parts.length < 4) continue;
    if (!normalizeText(parts[0]).includes(target)) continue;

    return {
      buy: toNumber(parts[2]),
      sell: toNumber(parts[3]),
    };
  }

  const rows = raw.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const rowText = stripTags(row);
    const normalizedRowText = normalizeText(rowText);
    if (
      !isAliasMatch(rowText, aliases) &&
      !normalizedRowText.includes(target) &&
      !isProductIdMatch(rowText, product.id)
    ) {
      continue;
    }

    const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
    if (cells.length >= 4) {
      return {
        buy: toNumber(stripTags(cells[2])),
        sell: toNumber(stripTags(cells[3])),
      };
    }

    const nums = rowText.match(/\d{1,3}(?:[.,]\d{3})*/g) ?? [];
    if (nums.length >= 2) {
      return {
        buy: toNumber(nums[nums.length - 2]),
        sell: toNumber(nums[nums.length - 1]),
      };
    }
  }

  const text = stripTags(raw);
  const escaped = product.label
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*");
  const re = new RegExp(
    `${escaped}[\\s\\S]{0,120}?(\\d{1,3}(?:[.,]\\d{3})*)[\\s\\S]{0,40}?(\\d{1,3}(?:[.,]\\d{3})*)`,
    "i",
  );
  const m = text.match(re);
  if (!m) return { buy: null, sell: null };

  return {
    buy: toNumber(m[1]),
    sell: toNumber(m[2]),
  };
}

export const CHIEN_MINH_SOURCES = CHIEN_MINH_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Vàng Chiến Minh",
  unit: "luong",
  url: "https://www.vangchienminh.vn/",
  webUrl: "https://www.vangchienminh.vn/",
  fetchOptions: {
    timeoutMs: 90_000,
    waitMs: 8_000,
    maxAttempts: 6,
    waitUntil: "commit",
  },
  location: "Hà Nội",
  parse: (payload) => {
    const row = parseBuySellByLabel(payload, product);
    const lastUpdateText = parseTime(payload) || nowVnText();
    return {
      buy: row.buy,
      sell: row.sell,
      lastUpdateText,
    };
  },
}));
