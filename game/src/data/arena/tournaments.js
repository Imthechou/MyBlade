/**
 * 数据配置层 · 赛事结构（V2.1 §20.2 / §20.3）
 *
 *   NATIONAL CHAMPIONSHIP 全国大赛：32 → 16 → 8 → 4 → 决赛，每轮重新抽签
 *   GLOBAL APEX 全球巅峰赛：主题单刀终局赛事，每场四个事件
 *
 * ⚠ 明确删除的旧规则（V2.1 §20.3）：三刀编队、BO3 —— 「只使用一把参赛刀」。
 */

import { arenaThemes } from '../legacy/arenaThemes.js';

/** 全国大赛轮次（V2.1 §20.2） */
export const NATIONAL_ROUNDS = Object.freeze([
  { id: 'r32', name: '32 强', size: 32, tier: 1 },
  { id: 'r16', name: '16 强', size: 16, tier: 2 },
  { id: 'r8', name: '8 强', size: 8, tier: 3 },
  { id: 'r4', name: '4 强', size: 4, tier: 3 },
  { id: 'final', name: '决赛', size: 2, tier: 4 },
]);

/** 三个赛事层级 */
export const TIERS = Object.freeze({
  school: {
    id: 'school', name: '流派试炼', en: 'SCHOOL TRIALS',
    events: 3, entry: 'single', desc: '六个分支 × 五个梯度，逐档晋级，失败可重打',
    infoTransparency: 'high',
  },
  national: {
    id: 'national', name: '全国大赛', en: 'NATIONAL CHAMPIONSHIP',
    events: 3, entry: 'single', desc: '32 强淘汰，每轮重新抽签',
    infoTransparency: 'partial',
  },
  apex: {
    id: 'apex', name: '全球巅峰赛', en: 'GLOBAL APEX',
    events: 4, entry: 'single', desc: '主题单刀终局，POWER/CONTROL/ART 各一事件 + 主题事件',
    infoTransparency: 'low',
  },
});

export const tierById = (id) => TIERS[id] || null;

/** 全球巅峰赛主题（沿用已交付的主题表） */
export const THEMES = Object.freeze(
  (arenaThemes.THEMES || []).map((t) => Object.freeze({
    id: t.id, name: t.name, desc: t.desc,
    stats: Object.freeze({ ...(t.stats || {}) }),
    styleBoost: Object.freeze((t.styleBoost || []).slice()),
    testBias: t.testBias || null,
  }))
);

export const themeById = (id) => THEMES.find((t) => t.id === id) || null;

export function rollTheme(rng) {
  if (!THEMES.length) return null;
  const i = Math.floor(rng() * THEMES.length) % THEMES.length;
  return THEMES[i];
}

export default TIERS;
