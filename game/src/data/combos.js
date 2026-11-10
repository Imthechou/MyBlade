/**
 * 数据配置层 · 隐藏 Combo（V2.1 §8.3）
 *
 * Combo 是**隐藏条件检测**，不是新标签，也没有独立等级。
 * 规则要点（V2.1 §8.3）：
 *   · 条件首次满足时给克制的发现提示，不直接泄露完整配方；
 *   · 鉴定时正式揭晓隐藏特性、实际作用和触发原因；
 *   · 首次发现写入图鉴；再次发现按规则记录/强化/给发现奖励，不无提示地重复叠加；
 *   · 奖励发生在交互、成刀特性、评分和图鉴层，**不新增专属模型视觉效果**。
 *
 * 10 条 Combo 的条件树沿用已交付内容（data/legacy/combosV11.js），
 * 由 core/conditionEval（已迁移）统一求值。
 */

import { combosV11 } from './legacy/combosV11.js';

export const COMBOS = Object.freeze(
  (combosV11.COMBOS || []).map((c) => Object.freeze({
    id: c.id,
    name: c.name,
    rarity: c.rarity || '稀有',
    /** 面向玩家的**线索**（不泄露完整配方，V2.1 §8.3） */
    hint: c.discover || '',
    /** 已发现后才展示的完整条件 */
    conditions: c.conditions || '',
    reward: c.reward || '',
    conditionSpec: c.conditionSpec || null,
    rewardSpec: Object.freeze({
      traitId: (c.rewardSpec || {}).traitId || null,
      statDelta: Object.freeze({ ...((c.rewardSpec || {}).statDelta || {}) }),
      riskDeltaPoints: Number((c.rewardSpec || {}).riskDeltaPoints) || 0,
      /** Combo 特性可以给一条收藏稀有度底线（V2.1 §13.4） */
      rarityFloor: (c.rewardSpec || {}).rarityFloor || 'rare',
    }),
    /** 目标命中率（设计标注，供验收比对） */
    targetRate: c.targetRate || '',
  }))
);

export const COMBO_BY_ID = Object.freeze(Object.fromEntries(COMBOS.map((c) => [c.id, c])));
export const getCombo = (id) => COMBO_BY_ID[id] || null;

export default COMBOS;
