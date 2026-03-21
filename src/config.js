import { BAC_MAT_TRANG_SOURCES } from "./sources/silver/bac_mat_trang.js";
import { HUONG_CHI_SILVER_SOURCES } from "./sources/silver/huong_chi.js";
import { ANH_MINH_SILVER_SOURCES } from "./sources/silver/anh_minh.js";
import { SACOMBANK_SBJ_SILVER_SOURCES } from "./sources/silver/sacombank_sbj.js";
import { CHAT_VE_SILVER_SOURCES } from "./sources/silver/chat_ve.js";
import { CHIEN_MINH_SOURCES } from "./sources/gold/chien_minh.js";
import { HUONG_CHI_SOURCES } from "./sources/gold/huong_chi.js";
import { HUONG_SON_SOURCES } from "./sources/gold/huong_son.js";
import { KIM_HANH_SOURCES } from "./sources/gold/kim_hanh.js";
import { KIM_PHU_THAI_SOURCES } from "./sources/gold/kim_phu_thai.js";
import { MAO_THIET_SOURCES } from "./sources/gold/mao_thiet.js";
import { LAM_NGOC_THANH_SOURCES } from "./sources/gold/lam_ngoc_thanh.js";
import { KIM_TIN_SOURCES } from "./sources/gold/kim_tin.js";
import { NGOC_MAI_SOURCES } from "./sources/gold/ngoc_mai.js";
import { NGOC_CUA_NHA_BE_SOURCES } from "./sources/gold/ngoc_cua_nha_be.js";
import { PHU_TAI_SOURCES } from "./sources/gold/phu_tai.js";
import { PHUONG_NAM_GOLD_SOURCES } from "./sources/gold/phuong_nam_gold.js";
import { VIET_A_GOLD_SOURCES } from "./sources/gold/viet_a_gold.js";
import { DA_PHUC_SOURCES } from "./sources/gold/da_phuc.js";
import { HANH_AN_SOURCES } from "./sources/gold/hanh_an.js";
import { DAI_NGHIA_SOURCES } from "./sources/gold/dainghia.js";
import { DAI_PHAT_VUONG_SOURCES } from "./sources/gold/dai_phat_vuong.js";
import { ANH_MINH_GOLD_SOURCES } from "./sources/gold/anh_minh.js";
import { SACOMBANK_SBJ_SOURCES } from "./sources/gold/sacombank_sbj.js";
import { THANH_THANH_BINH_SOURCES } from "./sources/gold/thanh_thanh_binh.js";
import { CHAT_VE_GOLD_SOURCES } from "./sources/gold/chat_ve.js";

export const SILVER_SOURCES = [
  ...BAC_MAT_TRANG_SOURCES,
  ...HUONG_CHI_SILVER_SOURCES,
  ...ANH_MINH_SILVER_SOURCES,
  ...SACOMBANK_SBJ_SILVER_SOURCES,
  // ...CHAT_VE_SILVER_SOURCES,
];
export const GOLD_SOURCES = [
  ...KIM_TIN_SOURCES,
  ...CHIEN_MINH_SOURCES,
  ...HUONG_CHI_SOURCES,
  ...HUONG_SON_SOURCES,
  ...NGOC_MAI_SOURCES,
  ...NGOC_CUA_NHA_BE_SOURCES,
  ...PHU_TAI_SOURCES,
  ...KIM_PHU_THAI_SOURCES,
  ...KIM_HANH_SOURCES,
  ...MAO_THIET_SOURCES,
  ...LAM_NGOC_THANH_SOURCES,
  ...VIET_A_GOLD_SOURCES,
  ...PHUONG_NAM_GOLD_SOURCES,
  ...DA_PHUC_SOURCES,
  ...HANH_AN_SOURCES,
  ...DAI_NGHIA_SOURCES,
  ...DAI_PHAT_VUONG_SOURCES,
  ...ANH_MINH_GOLD_SOURCES,
  ...SACOMBANK_SBJ_SOURCES,
  ...THANH_THANH_BINH_SOURCES,
  // ...CHAT_VE_GOLD_SOURCES,
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
