/**
 * 数据配置层 · 赛事分支与梯度（V2.1 §20.1 SCHOOL TRIALS）
 *
 * 六个正式分支：**锻压、锋刃、精密、淬彩、复合、过载**；
 * 每个分支五个梯度：**学徒、能手、专家、大师、传奇**。
 *
 * 内容沿用已交付的赛事风格表（data/legacy/arenaStyles.js），
 * 这里只补上 V2.1 要求的两条语义：
 *   · 每个梯度独立挑战、失败可重打（不降级）→ canRetry / noDemotion
 *   · 赛事分支不是锻造职业，不限制锻刀路线 → freeEntry
 */

import { arenaStyles } from '../legacy/arenaStyles.js';
import { arenaOpponents } from '../legacy/arenaOpponents.js';

/** 五个梯度（名称沿用已交付的梯度表） */
export const GRADIENTS = Object.freeze(
  (arenaOpponents.TIERS || []).map((t) => Object.freeze({
    id: t.tier, name: t.name, budget: t.budget, eventLevel: t.event,
  }))
);

/** 六个分支 */
export const BRANCHES = Object.freeze(
  (arenaStyles.STYLES || []).map((s) => Object.freeze({
    id: s.id,
    name: s.name,
    tag: s.tag,
    desc: s.desc,
    /** 该分支的六维权重（决定对手画像与对抗面倾向） */
    statWeights: Object.freeze({ ...s.statWeights }),
    /** 该分支偏好的对抗面（由权重最大的两维推出，供 UI 展示） */
    emphasis: emphasisOf(s.statWeights),
    hue: s.hue,
  }))
);

function emphasisOf(weights) {
  const FACE_STATS = {
    POWER: ['strength', 'sharpness'],
    CONTROL: ['toughness', 'craft'],
    ART: ['design', 'spirit'],
  };
  let best = 'POWER';
  let bestV = -1;
  for (const [face, keys] of Object.entries(FACE_STATS)) {
    const v = keys.reduce((a, k) => a + (weights[k] || 0), 0);
    if (v > bestV) { bestV = v; best = face; }
  }
  return best;
}

export const branchById = (id) => BRANCHES.find((b) => b.id === id) || null;
export const gradientAt = (tier) => GRADIENTS[Math.max(0, Math.min(GRADIENTS.length - 1, tier | 0))] || null;

/** V2.1 §20.1：失败可以重打，不因单次失败直接降级 */
export const SCHOOL_RULES = Object.freeze({
  canRetry: true,
  noDemotion: true,
  /** 赛事分支不限制玩家的锻刀路线 */
  freeEntry: true,
  /** 低阶赛事信息更透明（V2.1 §18） */
  infoTransparency: 'high',
});

export default BRANCHES;
