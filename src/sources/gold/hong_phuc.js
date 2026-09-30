import { nowVnText } from "../../utils.js";

const HONG_PHUC_PRODUCTS = [
  { id: "hong_phuc", targetId: 36, name: "Hồng Phúc (99.99%)" },
  {
    id: "hong_phuc_nhan_tron_99_99_ep_vi",
    targetId: 50,
    name: "Hồng Phúc (Nhẫn Trơn 99.99 Ép Vỉ)",
  },
  { id: "hong_phuc_99_9", targetId: 16, name: "Hồng Phúc (99.9%)" },
  { id: "hong_phuc_99", targetId: 41, name: "Hồng Phúc (99%)" },
  { id: "hong_phuc_98", targetId: 39, name: "Hồng Phúc (98%)" },
];

function vndToThousand(raw) {
  const n = parseFloat(String(raw || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 1000);
}

function parseBuySellById(payload, targetId) {
  const raw = String(payload || "");
  // fetchHtml() renders JSON API responses via Playwright, which wraps the
  // raw body in "<html>...<pre>{...}</pre></html>"; extract the embedded JSON.
  const embeddedMatch = raw.match(/\{[\s\S]*\}/);
  const jsonText = embeddedMatch ? embeddedMatch[0] : raw;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { buy: null, sell: null };
  }

  if (!parsed?.status) return { buy: null, sell: null };

  const rows = parsed.data?.gold_types;
  if (!Array.isArray(rows)) return { buy: null, sell: null };

  const item = rows.find((row) => row?.id === targetId);
  if (!item) return { buy: null, sell: null };

  return {
    buy: vndToThousand(item.price_buy),
    sell: vndToThousand(item.price),
  };
}

export const HONG_PHUC_SOURCES = HONG_PHUC_PRODUCTS.map((product) => ({
  id: product.id,
  name: product.name,
  storeName: "Hồng Phúc Gold",
  url: "https://hongphucgold.halozend.com/api/mobile-customer-app/materials/get-gold-price-list",
  webUrl: "https://hongphucapp.halozend.com/#/price-list",
  location: "Đồng Tháp",
  // hongphucgold.halozend.com currently serves an expired TLS certificate;
  // bypass cert validation until the vendor renews it.
  fetchOptions: {
    ignoreHTTPSErrors: true,
  },
  parse: (payload) => {
    const { buy, sell } = parseBuySellById(payload, product.targetId);
    return {
      buy,
      sell,
      // API response has no last-updated timestamp field.
      lastUpdateText: nowVnText(),
    };
  },
}));
