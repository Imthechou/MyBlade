/**
 * 核心玩法层 · S4 自由锻打小游戏（V2.1 §10）
 *
 * 规则落地（逐条对应 §10.1–§10.4）：
 *   · 中央锻打区域任意位置点击都算一锤；点击位置与速度**不影响收益**（§10.1）；
 *   · 每次锤击推进强化成果并增加 Risk，Risk 增量随累计锤数递增（§10.3）；
 *   · Risk 增加后**立即**执行断裂判定（§10.2 第 3 条）；
 *   · 存活后自动更新锤数/进度/Risk/下一锤提示，不弹逐锤确认（§10.2 第 4 条）；
 *   · 随时可以"结束锻打"，按钮不属于锻打区域（§10.2 第 5 条）；
 *   · 不设锤击次数上限，Risk 到 100 仍可继续（§10.2 第 6 条）；
 *   · 一锤未打就结束时，仍需在离开 S4 时检查一次（§9.2）—— 由 forge.js 调度。
 *
 * 纯逻辑：不碰 DOM，不碰渲染。
 */

import { HAMMER_PROGRESS, HAMMER_TIERS, HAMMER_TIER_REWARD, hammerRiskDelta, HAMMER_GAIN_SCALE } from '../data/balance.js';
import { hammerTierOf } from '../data/balance.js';
import { HAMMER_TRAITS, hammerDirectionVector } from '../data/traits.js';
import * as Attr from './attributes.js';
import * as Risk from './risk.js';
import { effectiveRiskScale } from './arenaV41Growth.js';
import { noteSafeRisk } from './arenaV41Specialties.js';
import * as Tags from './tags.js';

export function makeState() {
  return {
    count: 0, progress: 0, tier: 0, ended: false,
    /* rework T04.3：本局锻打方向（由 S4 前积累的主导标签决定，锤击过程中不变） */
    direction: null,
    /* rework T04.2：逐锤成果累计写进六维的点数（UI 展示“已经拿到什么”） */
    statGained: 0,
  };
}

/**
 * 本锤的六维成果分配（rework T04.2 / T04.3）。
 *
 * ★ 改造前：成果只累加进 progress，没跨档的锤（如第 3–5 锤）**只加 Risk**，
 *   不留下任何有效收益 —— 中间锤变成纯亏损。
 *   现在每锤都把 `gain × HAMMER_GAIN_SCALE` 点按**方向向量**写进六维，
 *   档位只负责身份 / 评分倍率。
 *
 * ★ 改造前：九个方向共用完全相同的 statDelta 与 scoreMult，
 *   标签只换了特性名字。现在方向向量真的不同，所以锻造路线真的不同。
 *
 * @returns {{delta:object, total:number, vector:object}}
 */
export function statGainOf(gain, directionTagId) {
  const vector = { strength: 1 }; // S4 minigame specializes in Strength.
  const total = Math.max(0, Number(gain) || 0) * HAMMER_GAIN_SCALE;
  const delta = { strength: Math.round(total * 100) / 100 };
  return { delta, total: Math.round(total * 100) / 100, vector };
}

/** 第 n 锤（1-based）的成果：前期明确、后期递减（V2.1 §10.4） */
export function progressOf(strikeIndex) {
  // First tap +1, second +2, every subsequent strike +n.
  // No cap: late high-stakes hits retain a meaningful Strength reward.
  return Math.max(1, Math.floor(Number(strikeIndex) || 1));
}

/** 下一锤的 Risk 增量（UI 提示用，与 strike() 用同一函数） */
export const nextRiskDelta = (count) => hammerRiskDelta(count + 1);

/**
 * 锤一击。
 * @param {object} run RunState
 * @param {() => number} rng
 * @returns {{ok:boolean, fractured?:boolean, strike?:object}}
 */
export function strike(run, rng) {
  if (run.hammer.ended) return { ok: false, reason: '已结束锻打' };

  const index = run.hammer.count + 1;
  const delta = hammerRiskDelta(index);
  const gain = progressOf(index);

  /* 方向在第一次锤击时锁定（S4 前的标签账本不再变化） */
  if (!run.hammer.direction) {
    const dom = Tags.dominantBaseTag(run.ledger);
    run.hammer.direction = dom.mixed ? 'mixed' : dom.tagId;
  }

  Risk.apply(run.risk, delta);
  run.peakRisk = run.risk.peak;
  run.hammer.count = index;
  run.hammer.progress = Math.round((run.hammer.progress + gain) * 100) / 100;

  /* ★ rework T04.2：逐锤成果即时写进六维 —— 中间锤也有有效收益。
     这是一份**永久六维**，与档位评分倍率分工，不重复计算。 */
  const statGain = statGainOf(gain, run.hammer.direction);
  if (Object.keys(statGain.delta).length) Attr.apply(run.stats, statGain.delta);
  run.hammer.statGained = Math.round((run.hammer.statGained + statGain.total) * 100) / 100;

  // ★ Risk 增加后立即判定（V2.1 §10.2）
  // Ten safe strikes even when prior-stage card risk is nonzero.
  const check = index <= 10
    ? { risk: run.risk.current, chance: 0, roll: null, fractured: false, protected: true }
    : Risk.check(run.risk.current,rng,effectiveRiskScale(run.workshop,
        run.specialist?.id==='press' ? run.specialist.boost : 0,
        run.daily?.breakScale || 1));

  if(index>10 && !check.fractured)noteSafeRisk(run,check.chance);
  const tierBefore = run.hammer.tier;
  run.hammer.tier = hammerTierOf(run.hammer.progress).id;

  const result = {
    ok: true,
    fractured: check.fractured,
    check,
    strike: {
      index,
      riskDelta: delta,
      riskAfter: run.risk.current,
      progressGain: Math.round(gain * 100) / 100,
      progress: run.hammer.progress,
      tier: run.hammer.tier,
      tierUp: run.hammer.tier > tierBefore ? run.hammer.tier : null,
      breakChance: check.chance,
      /** rework T04.2：本锤实际拿到的六维成果（UI 必须展示，否则玩家看不到中间锤的收益） */
      statDelta: statGain.delta,
      statGain: statGain.total,
      statGained: run.hammer.statGained,
      direction: run.hammer.direction,
      /** 下一锤的风险提示（V2.1 §10.2 第 4 条） */
      nextRiskDelta: nextRiskDelta(run.hammer.count),
      nextBreakChance: run.hammer.count < 10 ? 0 : Risk.breakChance(
        Math.min(100, run.risk.current + nextRiskDelta(run.hammer.count)),
        run.daily?.breakScale || 1,
      ),
      /** 下一档距离与收手保留内容（rework T04.4：不泄露隐藏精确六维） */
      nextTier: toNextTier(run.hammer.progress),
      keepOnStop: {
        tier: run.hammer.tier,
        tierName: tierName(run.hammer.tier),
        scoreMult: tierReward(run.hammer.tier).scoreMult,
        statGained: run.hammer.statGained,
      },
    },
  };
  return result;
}

/** 结束锻打（锁定当前成果，进入 S5） */
export function end(run) {
  run.hammer.ended = true;
  return { count: run.hammer.count, progress: run.hammer.progress, tier: run.hammer.tier };
}

/**
 * S4 额外锻打特性的类型（V2.1 §8.4）：
 * 「由此前积累的主要基础标签决定；混合路线使用已定义的混合特性」
 * @returns {{tagId:string|null, mixed:boolean, traitId:string, name:string}}
 */
export function traitFor(run) {
  const dom = Tags.dominantBaseTag(run.ledger);
  const key = dom.mixed ? 'mixed' : dom.tagId;
  const def = HAMMER_TRAITS[key] || HAMMER_TRAITS.mixed;
  return { tagId: dom.tagId, mixed: dom.mixed, traitId: def.id, name: def.name, desc: def.desc };
}

/** 强化档位的六维与倍率奖励（V2.1 §8.4：与标签特性分工，不重复计算同一效果） */
export const tierReward = (tierId) => HAMMER_TIER_REWARD[tierId] || HAMMER_TIER_REWARD[0];

export const tierName = (tierId) => (HAMMER_TIERS.find((t) => t.id === tierId) || HAMMER_TIERS[0]).name;

/** 距离下一强化档还差多少成果（UI 进度条用） */
export function toNextTier(progress) {
  for (const t of HAMMER_TIERS) {
    if (progress < t.need) return { need: t.need, remain: Math.round((t.need - progress) * 10) / 10, id: t.id, name: t.name };
  }
  return null;
}

export default {
  makeState, strike, end, traitFor, tierReward, tierName,
  progressOf, nextRiskDelta, toNextTier, statGainOf,
};
