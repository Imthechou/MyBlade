/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/render/cardEffects.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const RARITY_POWER = {
    common: 0.48, fine: 0.62, rare: 0.78, epic: 0.94, legend: 1.08, mythic: 1.2,
    '普通': 0.48, '精良': 0.62, '稀有': 0.78, '史诗': 0.94, '传说': 1.08, '神话': 1.2,
  };
  const STAGE_KIND = {
    0: 'ore', 1: 'melt', 2: 'hammer', 3: 'shape', 4: 'quench',
    5: 'temper', 6: 'edge', 7: 'assemble', 8: 'tune',
  };

  function hexColor(value) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    return '#' + h.toLowerCase();
  }

  function hashHue(value) {
    let h = 2166136261;
    for (const c of String(value || 'card')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    // Keep sub-degree precision so neighboring card ids retain distinct hue/rotation
    // combinations instead of collapsing onto the same one-degree bucket.
    return (((h >>> 0) % 360000) / 1000);
  }

  function explicitCardColor(card) {
    const w = (card && card.write) || {};
    const layers = Object.assign({}, (card && card.variants) || {}, w.variants || {});
    for (const layer of Object.values(layers)) {
      if (layer && layer.tintHex) return hexColor(layer.tintHex);
    }
    if (w.handle) {
      const h = K3D.handleMaterials && K3D.handleMaterials.get(w.handle.metalId);
      const color = hexColor(w.handle.tintHex || w.handle.tint || (h && h.tintHex));
      if (color) return color;
    }
    if (w.materialId && K3D.materials24 && K3D.materials24.get) {
      const m = K3D.materials24.get(w.materialId);
      const color = hexColor(m && (m.baseColor || m.color));
      if (color) return color;
    }
    if (w.finishId && K3D.finishes12 && K3D.finishes12.get) {
      const f = K3D.finishes12.get(w.finishId);
      const color = hexColor(f && f.defaults && f.defaults.tintHex);
      if (color) return color;
    }
    return null;
  }

  function resolve(card, stageIdx) {
    if (!card || !card.id || !Number.isInteger(Number(stageIdx)) || stageIdx < 0 || stageIdx > 8) return null;
    const color = explicitCardColor(card);
    const power = RARITY_POWER[card.rarity] || 0.48;
    // Tempering is intentionally restrained so its overlay does not overpower the finish.
    const stageGain = Number(stageIdx) === 5 ? 0.56 : 1;
    const duration = Math.round((460 + power * 300) * (Number(stageIdx) === 5 ? 0.82 : 1));
    const rgb = color
      ? color.slice(1).match(/.{2}/g).map((x) => parseInt(x, 16)).join(' ')
      : null;
    return {
      id: String(card.id), stage: Number(stageIdx) + 1,
      kind: STAGE_KIND[stageIdx], rarity: String(card.rarity || 'common'),
      power: Number((power * stageGain).toFixed(2)), duration, angle: hashHue(card.id),
      color: color || `hsl(${hashHue(card.id)} 78% 66%)`, rgb,
    };
  }

  K3D.cardEffects = { resolve };

export const cardEffects = __reg.proxy.cardEffects;
