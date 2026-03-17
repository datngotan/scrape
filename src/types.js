export const SILVER_UNITS = ["luong", "kg"];

export function isSilverUnit(value) {
  return SILVER_UNITS.includes(value);
}

export function validateSource(source) {
  return Boolean(
    source &&
    typeof source.id === "string" &&
    typeof source.name === "string" &&
    typeof source.storeName === "string" &&
    typeof source.url === "string" &&
    typeof source.location === "string" &&
    isSilverUnit(source.unit) &&
    typeof source.parse === "function",
  );
}
