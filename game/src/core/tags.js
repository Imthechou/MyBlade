/**
 * 核心玩法层 · 工艺标签账本（V2.1 §8.1）
 *
 * ★ 标签累计的**唯一来源**：只有"确认选卡"才写账本。
 *   V2.1 §7：「切换候选必须能撤销上一张卡的预览结果」——
 *   预览走的是独立的一次性计算，绝不碰账本，刷新重抽也不重复计数。
 *
 * 成长档位（V2.1 §8.1）：1 层记录倾向 / 2 层基础特性 / 4 层强化 / 6 层高阶；
 * 超过 6 层不再无限升级。
 */

import { isBaseTag, isSpecialTag } from '../data/tags.js';
import { TAG_MAX_EFFECTIVE_LAYERS, tagTierOf } from '../data/balance.js';

export function makeLedger() {
  return { entries: [] };
}

/**
 * 记录一次确认选卡。
 * @param {object} ledger
 * @param {{stage:string, cardId:string, tags:string[]}} pick
 */
export function record(ledger, pick) {
  if (!ledger || !pick || !pick.cardId) return ledger;
  ledger.entries.push({
    stage: pick.stage,
    cardId: pick.cardId,
    tags: (pick.tags || []).slice(),
  });
  return ledger;
}

/** 撤销最后一次记录（V2.1 §7：切换候选必须能撤销上一张卡的预览结果） */
export function undo(ledger) {
  if (ledger && ledger.entries.length) ledger.entries.pop();
  return ledger;
}

/**
 * 各标签累计层数。
 * 口径：一张卡对同一个标签最多贡献 1 层（与 V1 的条件求值器一致）。
 */
export function counts(ledger) {
  const out = {};
  for (const e of (ledger?.entries || [])) {
    for (const t of (e.tags || [])) out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/** 标签出现在多少个不同阶段（Combo 条件用） */
export function stageSpread(ledger) {
  const out = {};
  for (const e of (ledger?.entries || [])) {
    for (const t of (e.tags || [])) {
      out[t] = out[t] || new Set();
      out[t].add(e.stage);
    }
  }
  const res = {};
  for (const k of Object.keys(out)) res[k] = out[k].size;
  return res;
}

/**
 * 基础标签的成长结果（V2.1 §8.1：只取最终达到的最高档位）。
 * @returns {{tagId, layers, effectiveLayers, tier:{id,layers,name,scoreMult,grantsTrait}|null}[]}
 */
export function baseTagTiers(ledger) {
  const c = counts(ledger);
  const out = [];
  for (const [tagId, layers] of Object.entries(c)) {
    if (!isBaseTag(tagId)) continue;
    const effective = Math.min(TAG_MAX_EFFECTIVE_LAYERS, layers);
    out.push({ tagId, layers, effectiveLayers: effective, tier: tagTierOf(effective) });
  }
  return out.sort((a, b) => b.effectiveLayers - a.effectiveLayers);
}

/** 本局拿到的特殊标签（V2.1 §8.2：获得即登记，不需累计） */
export function specialTags(ledger) {
  const seen = new Set();
  for (const e of (ledger?.entries || [])) {
    for (const t of (e.tags || [])) if (isSpecialTag(t)) seen.add(t);
  }
  return Array.from(seen);
}

/**
 * 主要基础标签（供 S4 锻打特性选型，V2.1 §8.4）。
 * 「额外锻打特性的类型由此前积累的主要基础标签决定；混合路线使用已定义的混合特性。」
 * 判定：最高层数的标签若与第二名差距 <2 层，视为混合路线。
 */
export function dominantBaseTag(ledger) {
  const tiers = baseTagTiers(ledger);
  if (!tiers.length) return { tagId: null, mixed: true, top: null, second: null };
  const top = tiers[0];
  const second = tiers[1] || null;
  const mixed = !second || (top.effectiveLayers - second.effectiveLayers) < 2;
  return { tagId: mixed ? null : top.tagId, mixed, top, second };
}

export default {
  makeLedger, record, undo, counts, stageSpread,
  baseTagTiers, specialTags, dominantBaseTag,
};
