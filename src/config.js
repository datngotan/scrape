import { BAC_MAT_TRANG_SOURCES } from "./sources/silver/bac_mat_trang.js";
import { HUONG_CHI_SILVER_SOURCES } from "./sources/silver/huong_chi.js";
import { SACOMBANK_SBJ_SILVER_SOURCES } from "./sources/silver/sacombank_sbj.js";
import { BAO_TIN_MINH_CHAU_SILVER_SOURCES } from "./sources/silver/bao_tin_minh_chau.js";
import { DOJI_SILVER_SOURCES } from "./sources/silver/doji.js";
import { KIM_TIN_SILVER_SOURCES } from "./sources/silver/kim_tin.js";
import { CHIEN_MINH_SOURCES } from "./sources/gold/chien_minh.js";
import { KIM_TIN_SOURCES } from "./sources/gold/kim_tin.js";
import { SACOMBANK_SBJ_SOURCES } from "./sources/gold/sacombank_sbj.js";
import { NGOC_VAN_KHOA_SOURCES } from "./sources/gold/ngoc_van_khoa.js";
import { HIEN_BINH_SOURCES } from "./sources/gold/hien_binh.js";
import { HAI_TUYEN_SOURCES } from "./sources/gold/hai_tuyen.js";
import { BAO_TIN_BN_SOURCES } from "./sources/gold/bao_tin_bn.js";
import { BTLV_SOURCES } from "./sources/gold/btlv.js";
import { HIEU_VANG_TRU_SOURCES } from "./sources/gold/hieu_vang_tru.js";
import { HIEU_VANG_VAN_SOURCES } from "./sources/gold/hieu_vang_van.js";
import { PHUC_THANH_SOURCES } from "./sources/gold/phuc_thanh.js";
import { DOJI_SOURCES } from "./sources/gold/doji.js";
import { BAO_TIN_KK_SOURCES } from "./sources/gold/bao_tin_kk.js";
import { TIN_THANH_DUY_MONG_SOURCES } from "./sources/gold/tinthanhduymong.js";

export const SILVER_SOURCES = [
  ...BAC_MAT_TRANG_SOURCES,
  ...HUONG_CHI_SILVER_SOURCES,
  ...BAO_TIN_MINH_CHAU_SILVER_SOURCES,
  ...DOJI_SILVER_SOURCES,
  // ...ANH_MINH_SILVER_SOURCES,
  ...SACOMBANK_SBJ_SILVER_SOURCES,
  // ...CHAT_VE_SILVER_SOURCES,
  ...KIM_TIN_SILVER_SOURCES,
];
export const GOLD_SOURCES = [
  ...KIM_TIN_SOURCES,
  ...CHIEN_MINH_SOURCES,
  ...SACOMBANK_SBJ_SOURCES,
  ...HIEN_BINH_SOURCES,
  ...HAI_TUYEN_SOURCES,
  ...BAO_TIN_BN_SOURCES,
  ...BTLV_SOURCES,
  ...HIEU_VANG_TRU_SOURCES,
  ...HIEU_VANG_VAN_SOURCES,
  ...PHUC_THANH_SOURCES,
  ...NGOC_VAN_KHOA_SOURCES,
  ...DOJI_SOURCES,
  ...BAO_TIN_KK_SOURCES,
  ...TIN_THANH_DUY_MONG_SOURCES,
];
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
