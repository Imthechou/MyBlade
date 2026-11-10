/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/cardEffectRecipes.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 卡 id → 光晕配方（色相按刀型气质给：青蓝 / 赤橙 / 紫 / 青绿 / 粉 / 琥珀…）。 */
  const EFFECTS = {
    /* 传说：光晕最强、外扩最厚 */
    K13: { glow: 1.00, spread: 0.030, speed: 1.00, tintHex: '#46c8ff' },
    K17: { glow: 0.95, spread: 0.034, speed: 0.80, tintHex: '#ff7a33' },
    K22: { glow: 1.00, spread: 0.028, speed: 1.20, tintHex: '#b070ff' },
    /* 史诗 */
    K19: { glow: 0.85, spread: 0.024, speed: 1.05, tintHex: '#2fe0b0' },
    K21: { glow: 0.88, spread: 0.022, speed: 1.25, tintHex: '#ff5f9e' },
    K14: { glow: 0.82, spread: 0.026, speed: 0.90, tintHex: '#ffb03c' },
    K23: { glow: 0.85, spread: 0.028, speed: 0.75, tintHex: '#4f8bff' },
    /* 稀有：光晕最克制 */
    K15: { glow: 0.72, spread: 0.019, speed: 1.10, tintHex: '#4aa8ff' },
    K18: { glow: 0.74, spread: 0.021, speed: 0.95, tintHex: '#5fd24a' },
    K16: { glow: 0.70, spread: 0.018, speed: 1.15, tintHex: '#8a6bff' },
    K20: { glow: 0.74, spread: 0.023, speed: 0.85, tintHex: '#ffc23c' },
    /* 神话：最深最沉 */
    K24: { glow: 0.92, spread: 0.026, speed: 0.70, tintHex: '#c04bff' },
  };

  const IDS = Object.keys(EFFECTS);

  /** 取某张卡的光晕配方（无则 null）。 */
  function get(cardId) {
    const e = EFFECTS[cardId];
    return e ? Object.assign({}, e) : null;
  }

  /** 卡是否带刀身光晕。 */
  function has(cardId) { return !!EFFECTS[cardId]; }

  /** 从一局的标签账本里取**当前生效**的光晕（取最近一次 S4 选卡）。 */
  function forLedger(ledger) {
    const arr = ledger || [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const id = arr[i] && arr[i].cardId;
      if (id && EFFECTS[id]) return Object.assign({}, EFFECTS[id]);
    }
    return null;
  }

  K3D.cardEffectRecipes = { EFFECTS, IDS, get, has, forLedger };

export const cardEffectRecipes = __reg.proxy.cardEffectRecipes;
