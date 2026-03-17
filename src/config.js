import { BAC_MAT_TRANG_SOURCES } from "./sources/silver/bac_mat_trang.js";
import { CHIEN_MINH_SOURCES } from "./sources/gold/chien_minh.js";
import { KIM_TIN_SOURCES } from "./sources/gold/kim_tin.js";

export const SILVER_SOURCES = [...BAC_MAT_TRANG_SOURCES];
export const GOLD_SOURCES = [...KIM_TIN_SOURCES, ...CHIEN_MINH_SOURCES];
export const SILVER_TABLE = "silver_prices_9999";
export const GOLD_TABLE = "gold_prices_999";

// Keep backward compatibility for existing callers.
export const SOURCES = [...SILVER_SOURCES, ...GOLD_SOURCES];

const SILVER_SOURCE_IDS = new Set(SILVER_SOURCES.map((source) => source.id));
const GOLD_SOURCE_IDS = new Set(GOLD_SOURCES.map((source) => source.id));

export function tableForSourceId(sourceId) {
  if (GOLD_SOURCE_IDS.has(sourceId)) return GOLD_TABLE;
  if (SILVER_SOURCE_IDS.has(sourceId)) return SILVER_TABLE;
  return SILVER_TABLE;
}
