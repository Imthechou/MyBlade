/**
 * 数据配置层 · 特性表（V2.1 §8）
 *
 * 四类特性，来源与职责严格分开（V2.1 §8.5：S10 后全部永久绑定在成刀上）：
 *
 *   ① BASE_TAG    基础标签 2/4/6 层成长特性（§8.1）—— 按标签 × 档位生成
 *   ② SPECIAL_TAG 特殊标签绑定特性（§8.2）—— 获得即登记，不累计层数
 *   ③ HAMMER      S4 额外锻打特性（§8.4）—— 类型由主要基础标签决定，等级由锤击成果决定
 *   ④ LEGACY      卡池原有的 50 条锻造特性 + 10 条隐藏 Combo 特性（保留已验证内容）
 *
 * ★ "避免同一种加成被重复计算"（§8.4）：
 *   ① 的收益是「六维 + 评分倍率」，② 是「六维 + 评分倍率 + 稀有度底线」，
 *   ③ 是「六维 + 评分倍率」，④ 只给六维与视觉，不进评分倍率。
 *   core/scoring.js 按 kind 分别汇总，任一条特性的倍率只被计入一次。
 */

import { TAG_TIERS, HAMMER_TIER_REWARD, HAMMER_TIERS } from './balance.js';

/* ── ① 基础标签成长特性 ────────────────────────────────────────── */

/**
 * 每个基础标签的三个成长档（对应 2 / 4 / 6 层）。
 * statDelta 走 CARD_STAT_SCALE 之后的量级（普通局六维均值 ≈90）。
 */
const BASE_TAG_GROWTH = {
  precision: {
    name: '精密',
    tiers: {
      2: { name: '精密共鸣', desc: '加工精度形成初步共鸣', statDelta: { craft: 8 } },
      4: { name: '精密层理', desc: '精度在表面形成可读层理', statDelta: { craft: 16, design: 6 } },
      6: { name: '精密极致', desc: '全程精度控制，工艺达到极致', statDelta: { craft: 26, design: 12 } },
    },
  },
  stable: {
    name: '稳态',
    tiers: {
      2: { name: '稳态基底', desc: '结构趋于稳定', statDelta: { toughness: 8 } },
      4: { name: '稳态强化', desc: '内部应力分布均匀', statDelta: { toughness: 16, craft: 6 } },
      6: { name: '稳态大成', desc: '整体结构高度稳定', statDelta: { toughness: 26, craft: 12 } },
    },
  },
  flow: {
    name: '流动',
    tiers: {
      2: { name: '流纹初现', desc: '纹路开始呈现流动感', statDelta: { design: 8 } },
      4: { name: '流纹延展', desc: '流动纹路贯穿刀身', statDelta: { design: 16, spirit: 6 } },
      6: { name: '流纹大成', desc: '纹路如水流般连贯', statDelta: { design: 26, spirit: 12 } },
    },
  },
  layer: {
    name: '层叠',
    tiers: {
      2: { name: '层积初成', desc: '折叠形成初步层积', statDelta: { toughness: 6, strength: 4 } },
      4: { name: '层积致密', desc: '层间结合致密', statDelta: { toughness: 12, strength: 10 } },
      6: { name: '层积大成', desc: '层积结构达到极致', statDelta: { toughness: 20, strength: 18 } },
    },
  },
  edge: {
    name: '刃线',
    tiers: {
      2: { name: '锋线初成', desc: '刃口初步成型', statDelta: { sharpness: 9 } },
      4: { name: '锋线锐化', desc: '刃口锐度显著提升', statDelta: { sharpness: 18, craft: 5 } },
      6: { name: '锋线大成', desc: '刃线贯通且极度锐利', statDelta: { sharpness: 28, craft: 12 } },
    },
  },
  heat: {
    name: '热相',
    tiers: {
      2: { name: '热相凝练', desc: '高温工艺开始改变组织', statDelta: { strength: 8 } },
      4: { name: '热相强化', desc: '热相组织更加均匀', statDelta: { strength: 16, spirit: 6 } },
      6: { name: '热相大成', desc: '热相工艺完全贯彻', statDelta: { strength: 26, spirit: 12 } },
    },
  },
  cold: {
    name: '冷相',
    tiers: {
      2: { name: '冷相凝练', desc: '低温处理提升韧性', statDelta: { toughness: 5, sharpness: 5 } },
      4: { name: '冷相强化', desc: '冷相与刃口互相加成', statDelta: { toughness: 11, sharpness: 11 } },
      6: { name: '冷相大成', desc: '冷相工艺完全贯彻', statDelta: { toughness: 18, sharpness: 20 } },
    },
  },
  oxide: {
    name: '氧化',
    tiers: {
      2: { name: '发色初现', desc: '表面开始形成发色', statDelta: { design: 5, spirit: 5 } },
      4: { name: '发色深沉', desc: '发色层次更加丰富', statDelta: { design: 11, spirit: 11 } },
      6: { name: '发色大成', desc: '发色成为这把刀的身份', statDelta: { design: 18, spirit: 20 } },
    },
  },
};

/** 展开成 { 'precision@4': {...} } 的扁平表 */
export const BASE_TAG_TRAITS = Object.freeze(
  (() => {
    const out = {};
    for (const [tagId, def] of Object.entries(BASE_TAG_GROWTH)) {
      for (const tier of TAG_TIERS) {
        if (!tier.grantsTrait) continue;
        const t = def.tiers[tier.layers];
        if (!t) continue;
        const id = `BT_${tagId}_${tier.layers}`;
        out[id] = {
          id, kind: 'BASE_TAG', tagId, layers: tier.layers, tierId: tier.id,
          name: t.name, desc: t.desc, statDelta: t.statDelta,
          scoreMult: tier.scoreMult,
          // 高阶（6 层）特性给一条收藏稀有度底线（V2.1 §13.4）
          rarityFloor: tier.layers >= 6 ? 'epic' : null,
        };
      }
    }
    return out;
  })()
);

export const baseTagTraitId = (tagId, layers) => `BT_${tagId}_${layers}`;

/* ── ② 特殊标签绑定特性（§8.2） ───────────────────────────────── */

export const SPECIAL_TAG_TRAITS = Object.freeze({
  signature: {
    id: 'ST_signature', kind: 'SPECIAL_TAG', tagId: 'signature',
    name: '签名工艺', desc: '锻刀师的签名手法，意义大于数值',
    statDelta: { design: 10, spirit: 14 }, scoreMult: 1.18, rarityFloor: 'epic',
  },
  void: {
    id: 'ST_void', kind: 'SPECIAL_TAG', tagId: 'void',
    name: '暗域', desc: '低反射暗面，沉静而危险',
    statDelta: { spirit: 12, toughness: 6 }, scoreMult: 1.12, rarityFloor: 'rare',
  },
  spectral: {
    id: 'ST_spectral', kind: 'SPECIAL_TAG', tagId: 'spectral',
    name: '偏相', desc: '异常相变，难以复现的表面',
    statDelta: { spirit: 14, design: 8 }, scoreMult: 1.15, rarityFloor: 'epic',
  },
  resonance: {
    id: 'ST_resonance', kind: 'SPECIAL_TAG', tagId: 'resonance',
    name: '共鸣', desc: '共振工艺放大既有倾向',
    statDelta: { spirit: 10, craft: 8 }, scoreMult: 1.10, rarityFloor: null,
  },
  mirror: {
    id: 'ST_mirror', kind: 'SPECIAL_TAG', tagId: 'mirror',
    name: '镜面', desc: '极致抛光，反射优先',
    statDelta: { design: 14, craft: 6 }, scoreMult: 1.12, rarityFloor: 'rare',
  },
});

/* ── ③ S4 额外锻打特性（§8.4） ───────────────────────────────── */

/**
 * 类型由 S4 前积累的**主要基础标签**决定；混合路线用 'mixed'。
 * 强化等级（1–4）由累计锤击成果决定，倍率见 balance.HAMMER_TIER_REWARD。
 */
export const HAMMER_TRAITS = Object.freeze({
  precision: { id: 'HT_precision', name: '致密锻打', desc: '锤击让组织更致密' },
  stable: { id: 'HT_stable', name: '稳固锻打', desc: '锤击消除内部应力' },
  flow: { id: 'HT_flow', name: '流锻', desc: '锤击形成流动锻纹' },
  layer: { id: 'HT_layer', name: '叠锻', desc: '锤击强化层积结构' },
  edge: { id: 'HT_edge', name: '锐锻', desc: '锤击强化刃口' },
  heat: { id: 'HT_heat', name: '热锻', desc: '锤击在高温相区完成' },
  cold: { id: 'HT_cold', name: '冷锻', desc: '锤击在低温相区完成' },
  oxide: { id: 'HT_oxide', name: '彩锻', desc: '锤击形成彩色发色层' },
  mixed: { id: 'HT_mixed', name: '综合锻打', desc: '多路线并进的锻打成果' },
});

export const hammerTraitId = (tagId) => (HAMMER_TRAITS[tagId] ? HAMMER_TRAITS[tagId].id : HAMMER_TRAITS.mixed.id);

/**
 * S4 锻打方向 — 六维分配向量（rework T04.3）。
 *
 * ★ 审计问题 8：改造前九个方向在同档下的 statDelta 与 scoreMult **完全一致**，
 *   标签只改了特性名字，没有改变这份强化收益的方向。
 *
 * 现在每个方向有自己的分配向量（每项之和 = 1），逐锤成果按它分到六维：
 *   精密 → 工艺为主；稳态 → 韧性；流动 → 设计；层叠 → 强度/韧性；
 *   刃线 → 锋利；热相 → 强度/灵性；冷相 → 韧性/锋利；氧化 → 设计/灵性；
 *   混合 → 均匀。
 * 混合路线（top 与第二差距 <2 层，见 tags.dominantBaseTag）用 mixed 向量。
 */
export const HAMMER_DIRECTION_VECTORS = Object.freeze({
  precision: Object.freeze({ craft: 0.62, design: 0.20, spirit: 0.08, toughness: 0.10 }),
  stable:    Object.freeze({ toughness: 0.58, craft: 0.22, strength: 0.20 }),
  flow:      Object.freeze({ design: 0.50, spirit: 0.30, sharpness: 0.20 }),
  layer:     Object.freeze({ strength: 0.42, toughness: 0.40, craft: 0.18 }),
  edge:      Object.freeze({ sharpness: 0.66, craft: 0.20, strength: 0.14 }),
  heat:      Object.freeze({ strength: 0.48, spirit: 0.34, toughness: 0.18 }),
  cold:      Object.freeze({ toughness: 0.44, sharpness: 0.40, craft: 0.16 }),
  oxide:     Object.freeze({ design: 0.44, spirit: 0.40, craft: 0.16 }),
  mixed:     Object.freeze({ strength: 0.18, toughness: 0.18, sharpness: 0.16, craft: 0.18, design: 0.15, spirit: 0.15 }),
});

export const hammerDirectionVector = (tagId) => HAMMER_DIRECTION_VECTORS[tagId] || HAMMER_DIRECTION_VECTORS.mixed;

/**
 * S4 锻打特性 × 强化档位展开表。
 * 类型由主要基础标签决定（§8.4），强化等级由累计锤击成果决定；
 * 六维与评分倍率取自 balance.HAMMER_TIER_REWARD —— 数值仍只有一个真源。
 */
export const HAMMER_TIER_TRAITS = Object.freeze(
  (() => {
    const out = {};
    for (const [tagId, base] of Object.entries(HAMMER_TRAITS)) {
      for (const t of HAMMER_TIERS) {
        if (t.id === 0) continue;
        const rw = HAMMER_TIER_REWARD[t.id] || HAMMER_TIER_REWARD[0];
        const id = `${base.id}_${t.id}`;
        out[id] = Object.freeze({
          id, kind: 'HAMMER', tagId, tier: t.id,
          name: `${base.name}·${t.name}`,
          desc: `${base.desc}（第 ${t.id} 档强化）`,
          statDelta: Object.freeze({ ...rw.statDelta }),
          scoreMult: rw.scoreMult,
          rarityFloor: t.id >= 3 ? 'rare' : null,
        });
      }
    }
    return out;
  })()
);

export const hammerTierTraitId = (tagId, tier) => {
  const base = HAMMER_TRAITS[tagId] || HAMMER_TRAITS.mixed;
  return tier > 0 ? `${base.id}_${tier}` : null;
};

/* ── ④ 卡池原有特性（保留已验证内容） ────────────────────────── */

/** 由 data/legacy/traitsV11.js 提供，这里只做统一访问入口 */
export function legacyTraits() {
  return (globalThis.__BF_LEGACY_TRAITS__ || []);
}

export function setLegacyTraits(list) {
  globalThis.__BF_LEGACY_TRAITS__ = list || [];
}

/* ── 统一查询 ─────────────────────────────────────────────────── */

const INDEX = new Map();
for (const t of Object.values(BASE_TAG_TRAITS)) INDEX.set(t.id, t);
for (const t of Object.values(SPECIAL_TAG_TRAITS)) INDEX.set(t.id, t);
for (const t of Object.values(HAMMER_TIER_TRAITS)) INDEX.set(t.id, t);

export function getTrait(id) {
  if (INDEX.has(id)) return INDEX.get(id);
  return legacyTraits().find((t) => t.id === id) || null;
}

/** 特性名（找不到时回落 id，绝不返回 undefined 污染 UI） */
export function traitName(id) {
  const t = getTrait(id);
  return t ? t.name : id;
}

/** 该特性提供的"收藏稀有度底线"（V2.1 §13.4） */
export function traitRarityFloor(id) {
  const t = INDEX.get(id);
  return t ? t.rarityFloor : null;
}

export default BASE_TAG_TRAITS;
