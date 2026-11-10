/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/temperIridescence.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 稀有度 → 基础档位（cover / bands / strength / flow） */
  const RARITY_TIER = {
    common: { cover: 0.30, bands: 1.10, strength: 0.34, flow: 0.25 },
    fine: { cover: 0.40, bands: 1.35, strength: 0.42, flow: 0.35 },
    rare: { cover: 0.55, bands: 1.75, strength: 0.52, flow: 0.50 },
    epic: { cover: 0.70, bands: 2.25, strength: 0.62, flow: 0.62 },
    legend: { cover: 0.85, bands: 2.85, strength: 0.74, flow: 0.78 },
    mythic: { cover: 1.00, bands: 3.50, strength: 0.88, flow: 0.92 },
  };

  /* 色系族：24 张卡各占色环 1/24 的一个槽位，互不重样。
   * 用 k→(k*7 mod 24) 的置换（7 与 24 互质 → 是 {0..23} 的一个排列），
   * 使得**相邻卡号的色系族也相隔 105°**，候选卡并排出现时一眼可分。
   * ⚠ 不要在这里叠任何"按稀有度漂移"的连续量：漂移会与槽位差相消，
   *   反而把两张卡撞到同一色相（cardVisuals.js 踩过同一个坑，见其色相注释）。 */
  const SLOTS = [0, 7, 14, 21, 4, 11, 18, 1, 8, 15, 22, 5, 12, 19, 2, 9, 16, 23, 6, 13, 20, 3, 10, 17];

  /* S6 24 张卡的稀有度（与 data/cardsV11.js 一致）。
   * 冗余写一份是为了让本文件可以独立运行（无 cardsV11 时也能生成配方），
   * 由下面的 SELF_CHECK 在加载时自检：若与 cardsV11 不一致会打印告警。 */
  const RARITY_OF = {
    S6_01: 'common', S6_02: 'common', S6_03: 'common', S6_05: 'common',
    S6_04: 'fine', S6_06: 'fine', S6_07: 'fine', S6_08: 'fine',
    S6_09: 'fine', S6_11: 'fine', S6_12: 'fine',
    S6_10: 'rare', S6_13: 'rare', S6_14: 'rare', S6_15: 'rare', S6_16: 'rare',
    S6_17: 'epic', S6_18: 'epic', S6_19: 'epic', S6_20: 'epic',
    S6_21: 'legend', S6_22: 'legend', S6_23: 'legend',
    S6_24: 'mythic',
  };

  /** 逐卡覆盖（family 之外的三项按稀有度给；个别卡做小幅个性化） */
  const TWEAK = {
    // 神话「余焰封纹」：最密的多色反射 + 最大相位漂移
    S6_24: { bands: 3.80, flow: 1.00 },
    // 传说「液彩幻界」：液态感 = 漂移最大
    S6_23: { flow: 0.95 },
    // 史诗「虹彩分段」：分段 → 色带更密
    S6_17: { bands: 2.55 },
    // 精良「双温分区」：双温 → 色带翻倍
    S6_08: { bands: 1.85 },
  };

  const IDS = [];
  const EFFECTS = {};
  for (let k = 0; k < 24; k++) {
    const id = 'S6_' + String(k + 1).padStart(2, '0');
    const rarity = RARITY_OF[id] || 'common';
    const base = RARITY_TIER[rarity] || RARITY_TIER.common;
    const tw = TWEAK[id] || {};
    EFFECTS[id] = Object.freeze({
      family: Number((SLOTS[k] / 24).toFixed(6)),
      cover: base.cover,
      bands: tw.bands != null ? tw.bands : base.bands,
      strength: base.strength,
      flow: tw.flow != null ? tw.flow : base.flow,
    });
    IDS.push(id);
  }

  /** 取某张卡的虹彩配方（无则 null）。 */
  function get(cardId) {
    const e = EFFECTS[cardId];
    return e ? Object.assign({}, e) : null;
  }

  /** 卡是否带彩虹虹彩。 */
  function has(cardId) { return !!EFFECTS[cardId]; }

  /** 按稀有度兜底（卡表将来增卡时用；S6 现有 24 张全部命中 EFFECTS）。 */
  function forRarity(rarity) {
    return Object.assign({}, RARITY_TIER[String(rarity || 'common').toLowerCase()] || RARITY_TIER.common);
  }

  /** 从运行时卡对象取配方（识别非 S6 卡并返回 null）。 */
  function forCard(card) {
    if (!card || !card.id) return null;
    const id = String(card.id);
    if (EFFECTS[id]) return Object.assign({}, EFFECTS[id]);
    if (String(card.stage || '').toUpperCase() !== 'S6') return null;
    const fb = forRarity(card.rarity);
    fb.family = Number((((Number(card.visualRank) || 1) % 24) / 24).toFixed(6));
    return fb;
  }

  K3D.temperIridescence = { EFFECTS, IDS, RARITY_TIER, get, has, forRarity, forCard };

  /* 自检（只在真实数据表已在场时生效）：本文件冗余的 RARITY_OF 必须与 cardsV11 一致。
   * 不一致只打印告警、不抛错 —— 数据表的权威方永远是 cardsV11.js，
   * 这里只是为了让"抄错的稀有度"不会静默地把 cover/bands 给错档。 */
  try {
    const V11 = K3D.cardsV11;
    if (V11 && V11.byId) {
      const bad = [];
      for (const id of IDS) {
        const c = V11.byId(id);
        if (c && String(c.rarity || '').toLowerCase() !== RARITY_OF[id]) bad.push(id);
      }
      if (bad.length && typeof console !== 'undefined' && console.warn) {
        console.warn('[temperIridescence] 稀有度副本与 cardsV11 不一致：', bad.join(', '));
      }
    }
  } catch (e) { /* 自检失败不影响运行 */ }

export const temperIridescence = __reg.proxy.temperIridescence;
