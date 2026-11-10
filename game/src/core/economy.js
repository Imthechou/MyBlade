/**
 * 核心玩法层 · 经济（V2.1 §25）
 *
 * CR 是**唯一**的普通游戏货币，不设第二套复杂货币。
 * 新存档从 50 CR 开始；不设体力、不设次数上限。
 *
 * 设计意图（V2.1 §25.3）：重铸的意义是"偶尔赌一把、尝试不同路线"，
 * 不能让玩家玩数局后因为持续重铸而永久失去高风险路线的尝试能力。
 */

import { CR_START, CR_REWARD, rerollCost } from '../data/balance.js';

export const startCr = () => CR_START;

export function addCr(state, amount, reason = '') {
  const v = Math.max(0, Math.round(Number(amount) || 0));
  state.cr = Math.max(0, (Number(state.cr) || 0) + v);
  return { cr: state.cr, delta: v, reason };
}

export function canAfford(state, cost) {
  return (Number(state.cr) || 0) >= (Number(cost) || 0);
}

/** 鉴定奖励（V2.1 §25.1） */
export const forgeReward = (rarity) => CR_REWARD.forgeFinish(rarity);

/** 赛事奖励 */
export function matchReward(tierIndex, win) {
  const i = Math.max(0, Math.min(2, tierIndex | 0));
  return win ? CR_REWARD.matchWin(i) : CR_REWARD.matchLose(i);
}

/** 重铸价格（与 core/cards.reroll 用同一个函数，避免两处口径不一致） */
export const rerollPrice = (stageRerollCount) => rerollCost(stageRerollCount);

export default { startCr, addCr, canAfford, forgeReward, matchReward, rerollPrice };
