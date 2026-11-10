/**
 * 核心玩法层 · 特性授予（V2.1 §8）
 *
 * 四类特性全部汇入成刀的永久特性体系（V2.1 §8.5），不再另设特性货币或职业系统：
 *   ① BASE_TAG    基础标签 2/4/6 层 → 在 S10 一次性结算（§8.1「待鉴定结算」）
 *   ② SPECIAL_TAG 特殊标签 → 获得时立刻登记，效果在鉴定时结算（§8.2）
 *   ③ HAMMER      S4 锻打特性 → 强化等级由锤击成果决定（§8.4）
 *   ④ LEGACY      卡池原有特性 → 由条件树在锻造过程中逐阶段判定（保留已验证内容）
 *
 * ★ 去重规则（延续用户已确认的规则 + rework T02.3 修正）：
 *   · 同一特性一把刀只结算一次，重复触发记为"共鸣"而不是静默丢弃；
 *   · **同一基础标签只取最高档**（2/4/6 层不会各发一条），6 层后不再升档；
 *   · ★ 已取消「所有高阶特性每局只能 1 条」的全局限额 ——
 *     最新基线 §3.2 只规定「同一标签取最高档」，没有全局配额。
 *     旧限额会让「两个六层标签」里的第二条静默进共鸣，
 *     而评分又按所有达档标签计算 —— 显示、授予、评分三套口径互相矛盾（T02.3）。
 */

import * as TraitsData from '../data/traits.js';
import { traitsV11 } from '../data/legacy/traitsV11.js';
import { conditionEval } from '../data/legacy/conditionEval.js';
import { SPECIAL_TAG_TRAITS } from '../data/traits.js';
import * as Attr from './attributes.js';

/** 把卡池原有特性表注册进统一查询入口（data/traits.js 只存引用，避免重复定义） */
let legacyRegistered = false;
export function registerLegacyTraits() {
  if (legacyRegistered) return;
  TraitsData.setLegacyTraits((traitsV11.TRAITS || []).map((t) => ({
    id: t.id,
    kind: 'LEGACY',
    name: t.name,
    desc: t.trigger || '',
    statDelta: { ...(t.statDelta || {}) },
    tier: t.tier || 'normal',
    rarityBonus: Number(t.rarityBonus) || 0,
    visualEffect: t.visualEffect || '',
    triggerSpec: t.triggerSpec || null,
    /** LEGACY 特性只给六维与视觉，**不进评分倍率**（避免与 ①②③ 重复计算，§8.4） */
    scoreMult: 1,
    rarityFloor: null,
  })));
  legacyRegistered = true;
}

export const isHighTrait = (id) => {
  const t = TraitsData.getTrait(id);
  if (!t) return false;
  if (t.kind === 'BASE_TAG') return t.layers >= 6;
  if (t.kind === 'LEGACY') return t.tier === 'high';
  return false;
};

/**
 * 同一基础标签是否已有更高（或同档）的特性被授予。
 * 保证「同一标签只结算最高档」：先授 6 层后，2/4 层不再重复发。
 */
export function hasSameTagTrait(run, def) {
  if (!def || def.kind !== 'BASE_TAG' || !def.tagId) return false;
  return run.traits.some((tid) => {
    const other = TraitsData.getTrait(tid);
    return !!other && other.kind === 'BASE_TAG' && other.tagId === def.tagId
      && (other.layers || 0) >= (def.layers || 0);
  });
}

/**
 * 授予一条特性（去重 + 同标签最高档 + 共鸣记录）。
 *
 * ★ rework T02.3：**取消全局「高阶特性每局 1 条」限额**。
 *   最新基线没有这个全局配额，它会让第二个六层标签静默丢失，
 *   而评分侧却按全部达档标签计算 → 显示 / 授予 / 评分三套口径不一致。
 *   同 ID 去重与同标签取最高档保留（这两条才是真实的防重复规则）。
 *
 * @returns {boolean} 是否真的授予
 */
export function grant(run, traitId, source = 'legacy') {
  if (!traitId) return false;
  const def = TraitsData.getTrait(traitId);
  if (!def) return false;

  if (run.traits.includes(traitId)) {
    noteResonance(run, traitId);
    return false;
  }
  // 同一基础标签只留最高档：已有同档或更高档 → 记共鸣，不再发低档
  if (hasSameTagTrait(run, def)) {
    noteResonance(run, traitId);
    return false;
  }

  run.traits.push(traitId);
  run.traitSources[traitId] = source;
  if (def.statDelta && Object.keys(def.statDelta).length) {
    Attr.apply(run.stats, def.statDelta);
  }
  return true;
}

function noteResonance(run, traitId) {
  if (!run.traitResonance.includes(traitId)) run.traitResonance.push(traitId);
}

/* ── ① 基础标签特性：锻造期只标记"待鉴定结算"，S10 才真正授予 ── */

/**
 * 刷新"待鉴定结算"的基础标签特性（V2.1 §8.1）。
 * 锻造期间只用于 UI 展示进度，不写 run.stats、不写 run.traits。
 */
export function pendingBaseTraits(run) {
  const tiers = run.tagTiersCache || [];
  const out = [];
  for (const t of tiers) {
    if (!t.tier || !t.tier.grantsTrait) continue;
    const id = TraitsData.baseTagTraitId(t.tagId, t.tier.layers);
    const def = TraitsData.getTrait(id);
    if (!def) continue;
    out.push({
      id, name: def.name, desc: def.desc,
      tagId: t.tagId, layers: t.effectiveLayers,
      need: nextTierNeed(t.effectiveLayers),
      scoreMult: def.scoreMult,
    });
  }
  return out;
}

function nextTierNeed(layers) {
  if (layers < 2) return 2;
  if (layers < 4) return 4;
  if (layers < 6) return 6;
  return null;
}

/** S10：正式授予基础标签特性 */
export function settleBaseTraits(run) {
  const granted = [];
  for (const p of pendingBaseTraits(run)) {
    if (grant(run, p.id, 'baseTag')) granted.push(p.id);
  }
  return granted;
}

/* ── ② 特殊标签特性：获得时立刻登记 ── */

export function settleSpecialTags(run) {
  const granted = [];
  for (const tagId of run.specialTagList || []) {
    const def = SPECIAL_TAG_TRAITS[tagId];
    if (!def) continue;
    if (grant(run, def.id, 'specialTag')) granted.push(def.id);
  }
  return granted;
}

/* ── ④ 卡池原有特性 + Combo：逐阶段条件求值 ── */

/**
 * 用条件树求值（幂等：同一 id 一局只结算一次）。
 * @returns {{traits:string[], combos:string[]}} 本次**新**授予的 id
 */
export function evaluateConditional(run) {
  registerLegacyTraits();
  const newlyTraits = [];
  if (!conditionEval || typeof conditionEval.evaluate !== 'function') return { traits: newlyTraits, combos: [] };

  const ctx = conditionEval.makeContext({
    tagLedger: (run.ledger?.entries || []).map((e) => ({
      stage: e.stage, cardId: e.cardId, tags: e.tags,
    })),
    stats: run.stats,
    risk: run.risk,
    combos: run.combos,
    completedStages: run.completedStages,
  });

  for (const t of (traitsV11.TRAITS || [])) {
    if (run.traits.includes(t.id)) continue;
    if (!t.triggerSpec) continue;
    let hit = false;
    try { hit = conditionEval.evaluate(t.triggerSpec, ctx); } catch (_) { hit = false; }
    if (hit && grant(run, t.id, 'legacy')) newlyTraits.push(t.id);
  }
  return { traits: newlyTraits, combos: [] };
}

export default {
  registerLegacyTraits, grant, isHighTrait, hasSameTagTrait,
  pendingBaseTraits, settleBaseTraits, settleSpecialTags, evaluateConditional,
};
