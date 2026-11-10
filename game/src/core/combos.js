/**
 * 核心玩法层 · 隐藏 Combo 检测（V2.1 §8.3）
 *
 * Combo 是隐藏条件检测，不是新标签，也没有独立等级。
 *
 * 规则落地：
 *   · 条件首次满足 → 给克制的发现提示（只给 hint，不泄露完整配方）；
 *   · 鉴定时正式揭晓隐藏特性、实际作用与触发原因（由 appraise 读取 discoveries）；
 *   · 首次发现写入图鉴；再次命中只记录/给发现奖励，不无提示地重复叠加；
 *   · 奖励发生在特性、评分和图鉴层，**不新增专属模型视觉效果**。
 */

import { COMBOS } from '../data/combos.js';
import { conditionEval } from '../data/legacy/conditionEval.js';
import * as Attr from './attributes.js';
import * as Traits from './traits.js';

/**
 * @param {object} run RunState
 * @returns {string[]} 本次**首次**命中的 combo id
 */
export function evaluate(run) {
  const newly = [];
  if (!conditionEval || typeof conditionEval.evaluate !== 'function') return newly;

  const ctx = conditionEval.makeContext({
    tagLedger: (run.ledger?.entries || []).map((e) => ({
      stage: e.stage, cardId: e.cardId, tags: e.tags,
    })),
    stats: run.stats,
    risk: run.risk,
    combos: run.combos,
    completedStages: run.completedStages,
  });

  for (const c of COMBOS) {
    if (run.combos.includes(c.id)) continue;   // ★ 去重：不无提示地重复叠加
    if (!c.conditionSpec) continue;
    let hit = false;
    try { hit = conditionEval.evaluate(c.conditionSpec, ctx); } catch (_) { hit = false; }
    if (!hit) continue;

    run.combos.push(c.id);
    newly.push(c.id);
    // 首次发现记录（含命中阶段），供图鉴与鉴定揭晓使用
    if (!run.comboDiscoveries.some((d) => d.id === c.id)) {
      run.comboDiscoveries.push({ id: c.id, at: run.stage, stageId: run.stageId });
    }

    const rw = c.rewardSpec || {};
    // Combo 奖励特性走与卡牌特性**同样**的两道约束（去重 + 高阶限额）
    if (rw.traitId) Traits.grant(run, rw.traitId, 'combo');
    if (rw.statDelta && Object.keys(rw.statDelta).length) Attr.apply(run.stats, rw.statDelta);
    if (rw.riskDeltaPoints) run.risk.current = Math.max(0, Math.min(100, run.risk.current + rw.riskDeltaPoints));
  }
  return newly;
}

/** 已发现的 Combo（图鉴用） */
export const discovered = (run) => (run.comboDiscoveries || []).map((d) => d.id);

/** 命中提示（克制版：给 hint，不给完整条件） */
export function hintOf(id) {
  const c = COMBOS.find((x) => x.id === id);
  return c ? { id, name: c.name, hint: c.hint } : null;
}

export default { evaluate, discovered, hintOf };
