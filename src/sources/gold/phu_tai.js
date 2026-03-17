const NEEDLE = "Nhẫn tròn trơn 999.9";

function decodeHtml(input) {
  let out = String(input || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  out = out
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    });

  return out.replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " "));
}

function nowVnText() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const s = fmt.format(d).replace(",", "");
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return "";
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  const HH = m[4];
  const MI = m[5];
  return `${HH}:${MI} ${dd}/${mm}/${yyyy}`;
}

function parseTime(html) {
  const text = stripTags(html);
  const m = text.match(
    /Cập\s*nhật\s*lúc\s*([0-9]{1,2}):([0-9]{2})\s*ngày\s*([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/i,
  );

  if (m) {
    const HH = m[1].padStart(2, "0");
    const MI = m[2];
    const dd = m[3].padStart(2, "0");
    const mm = m[4].padStart(2, "0");
    const yyyy = m[5];
    return `${HH}:${MI} ${dd}/${mm}/${yyyy}`;
  }

  return nowVnText();
}

function parseBuySell(html) {
  const text = stripTags(html);
  const escapedNeedle = NEEDLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");

  const token = "(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,6})";

  // Common markdown row from r.jina.ai: | Nhan tron tron 999.9 | 17,250 | 17,550 |
  let m = text.match(
    new RegExp(`\\|\\s*${escapedNeedle}\\s*\\|\\s*${token}\\s*\\|\\s*${token}\\s*\\|`, "i"),
  );

  // Fallback: flattened text without pipes.
  if (!m) {
    m = text.match(new RegExp(`${escapedNeedle}[\\s\\S]{0,40}?${token}\\s+${token}`, "i"));
  }

  if (!m) return { buy: null, sell: null };

  const buy = Number(String(m[1] || "").replace(/[^\d]/g, ""));
  const sell = Number(String(m[2] || "").replace(/[^\d]/g, ""));

  return {
    buy: Number.isFinite(buy) && buy > 0 ? buy : null,
    sell: Number.isFinite(sell) && sell > 0 ? sell : null,
  };
}

export const PHU_TAI_SOURCES = [
  {
    id: "phu_tai",
    name: "Phú Tài (Nhẫn tròn trơn 999.9)",
    storeName: "Vàng Phú Tài",
    url: "https://www.vangphutai.vn/",
    webUrl: "https://www.vangphutai.vn/",
    location: "Hà Nội",
    parse: (html) => {
      const { buy, sell } = parseBuySell(html);
      return {
        buy,
        sell,
        lastUpdateText: parseTime(html),
      };
    },
  },
];
