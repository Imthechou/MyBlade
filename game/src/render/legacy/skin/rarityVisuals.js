/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/rarityVisuals.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
const K3D = __reg.proxy;

  'use strict';
  const TIERS = Object.freeze({ common: 0, fine: 1, rare: 2, epic: 3, legend: 4, mythic: 5,
    '普通': 0, '精良': 1, '稀有': 2, '史诗': 3, '传说': 4, '神话': 5 });
  const COLORS = Object.freeze(['#b9c4d2', '#c5d7e8', '#69c9ee', '#c18aff', '#ffd27a', '#e7f5ff']);
  const FEATURES = Object.freeze([
    'base', 'micrograin', 'secondary-flow', 'view-rim', 'etched-geometry', 'star-glints',
  ]);
  function level(rarity) { return TIERS[String(rarity || '').toLowerCase()] ?? 0; }
  function resolve(value) {
    const tier = Math.max(0, Math.min(5, Number.isFinite(Number(value)) ? Math.round(Number(value)) : level(value)));
    return { tier, color: COLORS[tier], feature: FEATURES[tier] };
  }
  K3D.rarityVisuals = { TIERS, COLORS, FEATURES, level, resolve };

export const rarityVisuals = __reg.proxy.rarityVisuals;
