/**
 * 核心玩法层 · 成刀评分与稀有度（V2.1 §13）
 *
 * ★★ 与 V1 的关键差异 ★★
 * V1：`鉴定分 = 六维均值 + 特性数 × 4`，标尺 0–180；
 *     稀有度由「属性/风险/特性/组合/天命」五维加权 + 种子彩票决定。
 * V2.1 §13.1：`成刀评分 = 六维均值 × 基础特性倍率 × 特殊特性倍率 × 峰值风险倍率`，
 *     不设硬性上限，设计目标让极优秀成刀接近 999。
 * 两套公式并存会让 V2.1 §13.4 的稀有度区间（120/250/450/700）永远对不上，
 * 因此本文件只实现 V2.1 一套。
 *
 * ★ 不重复计算（V2.1 §13.1 末段 / §8.4）：
 *   已经影响六维的特性仍可按定义贡献评分倍率，
 *   但**同一个效果不能在同一项计算中重复叠加** ——
 *   每个基础标签只取最高档位，每条特性的倍率只被乘一次。
 */

import {
  STAT_KEYS, peakRiskMult, rarityOfScore, qualityOfMean,
  COMBO_SCORE_MULT, PEAK_RISK_MULT, RARITY_THRESHOLDS, HAMMER_TIER_REWARD,
} from '../data/balance.js';
import * as TraitsData from '../data/traits.js';
import * as Attr from './attributes.js';

/**
 * 稀有度的**档位顺序（低 → 高）与中文名**，从 `RARITY_THRESHOLDS` 派生。
 *
 * ⚠ 2026-10-14：这里原先手写了两份副本 ——
 *   `const ORDER = ['common','rare','epic','legend','mythic']`
 *   `const NAME  = { legend: '传奇', ... }`
 *   而 `RARITY_THRESHOLDS` 里 legend 写的是「传说」。**同一个 `legend` 档、两个中文名**，
 *   且两者印在同一枚 `.rarity--legend` 徽标上（卡片轴走 RARITY_CN，成刀轴走这里）
 *   → 决策卡读「传说」、藏刀阁/印章读「传奇」，玩家会当成两档。
 *
 *   根因不是"拼错一个字"，而是**同一个概念有两份手写副本**。
 *   所以修法是把它变成派生量（单一真源）—— `RARITY_THRESHOLDS` 是唯一的档位表；
 *   它按 **min 从高到低**声明（700 神话在最前），所以 `.reverse()` 才是低→高的 ORDER。
 *   以后谁改档位名，这里自动跟着走，不会再漂移。
 *
 * ⚠ 只含 5 档（无 `fine`）：成刀稀有度由评分算出，不存在「精良」。
 *   卡片轴的 6 档见 `data/cards.RARITY_CN`，两者共用 `rarityBadge()` 但**不是同一张表**。
 */
const RARITY_ORDER = Object.freeze(RARITY_THRESHOLDS.map((r) => r.id).reverse());
const RARITY_NAME = Object.freeze(
  Object.fromEntries(RARITY_THRESHOLDS.map((r) => [r.id, r.name])),
);

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * 计算成刀评分。
 * @param {object} input { stats, baseTagTiers, traits, combos, hammerTier, peakRisk }
 * @returns {{score, mean, baseMult, specialMult, peakMult, breakdown}}
 */
export function computeScore(input) {
  const stats = input.stats || {};
  const mean = Attr.mean(stats);

  /* ── ① 基础特性倍率：每个基础标签只取最高档（V2.1 §13.1） ── */
  let baseMult = 1;
  const baseParts = [];
  const seenTag = new Set();
  for (const t of (input.baseTagTiers || [])) {
    if (!t.tier || !t.tier.grantsTrait || seenTag.has(t.tagId)) continue;
    seenTag.add(t.tagId);
    baseMult *= t.tier.scoreMult;
    baseParts.push({ tagId: t.tagId, layers: t.effectiveLayers, name: t.tier.name, mult: t.tier.scoreMult });
  }

  /* ── ② 特殊特性倍率：特殊标签特性 + S4 锻打特性 + 隐藏 Combo（§13.1） ── */
  let specialMult = 1;
  const specialParts = [];
  for (const id of (input.traits || [])) {
    const def = TraitsData.getTrait(id);
    if (!def) continue;
    if (def.kind === 'BASE_TAG') continue;          // 已在 ① 计过
    if (def.kind === 'LEGACY') continue;            // LEGACY 只给六维，不进倍率（§8.4）
    /* ★ rework T02.2：S4 锻打特性的倍率**不由特性表出**。
       它的六维在授予时已写进永久 stats，倍率由下方 hammerTierReward 唯一结算；
       若这里再乘一次 def.scoreMult，同一效果被计算两次
       （改造前一档 110 分、四档 169 分，而单次应为 105 / 130）。 */
    if (def.kind === 'HAMMER') continue;
    const m = Number(def.scoreMult) || 1;
    if (m === 1) continue;
    specialMult *= m;
    specialParts.push({ id, name: def.name, mult: m, kind: def.kind });
  }
  /* S4 锻打强化档位 —— **唯一**锻打倍率结算来源（T02.2） */
  const ht = Number(input.hammerTier) || 0;
  if (ht > 0) {
    const reward = input.hammerTierReward
      || (HAMMER_TIER_REWARD[ht] || HAMMER_TIER_REWARD[0]);
    const rw = Number(reward.scoreMult) || 1;
    if (rw > 1) {
      specialMult *= rw;
      specialParts.push({
        id: 'hammer',
        name: reward.name || `S4 锻打 ${input.hammerTierName || ''}`.trim(),
        mult: rw, kind: 'HAMMER', source: 'hammerTierReward',
      });
    }
  }
  // 隐藏 Combo：每条一份
  for (const cid of (input.combos || [])) {
    specialMult *= COMBO_SCORE_MULT;
    specialParts.push({ id: cid, name: `隐藏组合 ${cid}`, mult: COMBO_SCORE_MULT, kind: 'COMBO' });
  }

  /* ── ③ 峰值风险倍率（V2.1 §13.2） ── */
  const peakMult = peakRiskMult(input.peakRisk);

  const score = Math.round(mean * baseMult * specialMult * peakMult);

  return {
    score,                                   // ★ 不截断，超过 999 照常显示（§13.4）
    mean: round2(mean),
    baseMult: round2(baseMult),
    specialMult: round2(specialMult),
    peakMult,
    breakdown: {
      mean: round2(mean),
      base: baseParts,
      special: specialParts,
      peak: { peakRisk: input.peakRisk || 0, mult: peakMult },
    },
  };
}

/** 峰值风险倍率档位说明（UI 展示"为什么是这个倍率"） */
export function peakBandOf(peak) {
  for (const r of PEAK_RISK_MULT) if (peak <= r.max) return r;
  return PEAK_RISK_MULT[PEAK_RISK_MULT.length - 1];
}

/**
 * 稀有度（V2.1 §13.4）：
 * 「最终稀有度取『评分对应的基础稀有度』与『已满足的特性稀有度底线』中较高者」
 * → 低六维但发现罕见组合的刀仍可能具有高收藏稀有度，而不虚增六维或评分。
 */
export function resolveRarity(score, traits = []) {
  const base = rarityOfScore(score);
  const ORDER = RARITY_ORDER;
  let floorIdx = -1;
  for (const id of traits) {
    const f = TraitsData.traitRarityFloor(id);
    if (!f) continue;
    const i = ORDER.indexOf(f);
    if (i > floorIdx) floorIdx = i;
  }
  const baseIdx = ORDER.indexOf(base.id);
  const finalIdx = Math.max(baseIdx, floorIdx);
  const finalId = ORDER[finalIdx];
  return {
    id: finalId,
    name: RARITY_NAME[finalId] || finalId,
    fromScore: base.id,
    raisedByFloor: finalIdx > baseIdx,
  };
}

export const qualityOf = (mean) => qualityOfMean(mean);

/** 六维简要画像（藏刀阁/赛前面板用） */
export function statProfile(stats) {
  return STAT_KEYS.map((k) => ({ key: k, value: Math.round(Number(stats[k]) || 0) }));
}

export default { computeScore, resolveRarity, qualityOf, peakBandOf, statProfile };
