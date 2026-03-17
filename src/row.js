import { parseVnToIso } from "./time.js";

function isValidDbPrice(value) {
  return (
    value != null && Number.isFinite(value) && value >= 0 && value <= 1_000_000
  );
}

export function buildRowOrNull(source, parsed) {
  const buy = parsed.buy == null ? null : Math.round(parsed.buy);
  const sell = parsed.sell == null ? null : Math.round(parsed.sell);
  const lastUpdateIso = parsed.lastUpdateText
    ? (parseVnToIso(parsed.lastUpdateText) ?? new Date().toISOString())
    : new Date().toISOString();

  if (!isValidDbPrice(buy) || !isValidDbPrice(sell)) return null;

  return {
    id: source.id,
    unit: parsed.unit ?? source.unit,
    store_name: source.storeName,
    source_name: source.name,
    source_url: source.webUrl ?? source.url,
    location: source.location,
    buy_price: buy,
    sell_price: sell,
    last_update_at: lastUpdateIso,
    updated_at: new Date().toISOString(),
  };
}
