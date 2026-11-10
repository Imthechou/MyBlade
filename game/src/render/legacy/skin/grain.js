/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/grain.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /**
   * 本局 seed → 图案种子（CSGO pattern index 0–1000）。
   * 用 state.js 的确定性 hash，保证同 seed 同结果。
   * @param {number} seed  本局 seed
   * @returns {number} 0–1000
   */
  function grainOf(seed) {
    const hash = K3D.bladeSkin.hashSeed('grain', seed >>> 0);
    // 0–1000 的 pattern index（CSGO 结构：8 模板 × 125 细节，这里全范围随机落）
    return hash % 1001;
  }

  /**
   * 把 Pattern Seed 应用到 BladeSkinState。
   *   - 显式写 state.patternSeed（不再走 state.js 的自动派生，结果可控可测）
   *   - "不同刀不同布局"：再叠一层按刀型 id 的 knifeSalt 偏移（CSGO Weapon UV Scale 语义）
   *     但**不改** state.seed / 相位 / 类别（约束 §5.4）
   * @param {object} state  BladeSkinState
   * @param {string} knifeType  刀型 id（如 'tangdao' / 'karambit'，用于刀型个体差异）
   * @returns {object}  修改后的 state（原地）
   */
  function applyTo(state, knifeType) {
    // 刀型个体差异：hash 刀型 id 出一个偏移，叠加到 patternSeed 上
    const knifeSalt = K3D.bladeSkin.hashSeed('knifetype', knifeType || 'default') % 127;
    const base = grainOf(state.seed);
    // 同刀同皮可复现（同 knifeType + 同 seed → 同结果），不同刀不同布局（刀型不同 → 偏移不同）
    state.patternSeed = ((base + knifeSalt) % 1001);
    // 注意：不改 state.seed / 纹理 phase / 类别 —— 符合 §5.4
    return state;
  }

  /** 取某 state 当前生效的 patternSeed（无则算） */
  function patternSeedOf(state, knifeType) {
    if (state && state.patternSeed != null) return state.patternSeed;
    return applyTo({ seed: state ? state.seed : 0, patternSeed: null }, knifeType).patternSeed;
  }

  K3D.grain = {
    grainOf,
    applyTo,
    patternSeedOf,
  };

export const grain = __reg.proxy.grain;
