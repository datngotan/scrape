import { toNumberDigits } from "../../utils.js";

const URL = "https://www.kimphongthao.net/gia-vang";
const NEEDLE = "Nhẫn Trơn 999.9";

function escapeReg(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlLite(input) {
  return String(input || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getMetaContent(html, key) {
  const re1 = new RegExp(
    `<meta[^>]+name=["']${escapeReg(key)}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m1 = String(html || "").match(re1);
  if (m1?.[1]) return decodeHtmlLite(m1[1]);

  const re2 = new RegExp(
    `<meta[^>]+property=["']${escapeReg(key)}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m2 = String(html || "").match(re2);
  if (m2?.[1]) return decodeHtmlLite(m2[1]);

  return "";
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
  const raw = String(html || "");
  const keyIdx = raw.toLowerCase().indexOf("ngày");
  const win = keyIdx >= 0
    ? raw.slice(keyIdx, Math.min(raw.length, keyIdx + 600))
    : raw.slice(0, 1200);

  const text = decodeHtmlLite(win.replace(/<[^>]+>/g, " "));

  let m = text.match(
    /Ngày\s*:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s+([0-9]{1,2}:[0-9]{2})/i,
  );
  if (m) {
    const [dd, mm, yyyy] = m[1].trim().split("/");
    const hhmm = m[2].trim();
    if (dd && mm && yyyy) {
      return `${hhmm} ${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
    }
  }

  m = text.match(
    /Cập\s*nhật\s*(?:lúc|ngày)?\s*([0-9]{1,2}:[0-9]{2})\s*[-–]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i,
  );
  if (m) {
    const hhmm = m[1].trim();
    const [dd, mm, yyyy] = m[2].trim().split("/");
    if (dd && mm && yyyy) {
      return `${hhmm} ${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
    }
  }

  return nowVnText();
}

function parseBuySell(html) {
  const raw = String(html || "");
  const lowerHtml = raw.toLowerCase();
  const idx = lowerHtml.indexOf(NEEDLE.toLowerCase());

  if (idx >= 0) {
    const winHtml = raw.slice(Math.max(0, idx - 200), Math.min(raw.length, idx + 900));
    const winText = decodeHtmlLite(winHtml.replace(/<[^>]+>/g, " "));
    const needleIdx = winText.toLowerCase().indexOf(NEEDLE.toLowerCase());

    if (needleIdx >= 0) {
      const afterNeedle = winText.slice(needleIdx + NEEDLE.length);
      const nums = afterNeedle.match(/\d{1,3}(?:[.,]\d{3})+/g);
      if (nums && nums.length >= 2) {
        return { buy: toNumberDigits(nums[0]), sell: toNumberDigits(nums[1]) };
      }
    }
  }

  const meta =
    getMetaContent(raw, "description") ||
    getMetaContent(raw, "og:description");

  if (meta) {
    const m = meta.match(
      /Nhẫn\s*Trơn\s*999\.9\s+(\d{1,3}(?:[.,]\d{3})+)\s+(\d{1,3}(?:[.,]\d{3})+)/i,
    );
    if (m) {
      return { buy: toNumberDigits(m[1]), sell: toNumberDigits(m[2]) };
    }
  }

  return { buy: null, sell: null };
}

export const KIM_PHONG_THAO_SOURCES = [
  {
    id: "kim_phong_thao",
    name: "Kim Phong Thảo (Nhẫn Trơn 999.9)",
    storeName: "Kim Phong Thảo",
    url: URL,
    webUrl: URL,
    location: "Vĩnh Long",
    parse: (html) => {
      const { buy, sell } = parseBuySell(html);
      return { buy, sell, lastUpdateText: parseTime(html) };
    },
  },
];
