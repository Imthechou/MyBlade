/**
 * 核心玩法层 · Risk 风险与断裂（V2.1 §9）
 *
 * ★★ 与 V1 的关键差异 ★★
 * V1 的公式是 `2.5% + max(0, 0.65×current + 0.35×peak − 20) × 0.35%，clamp(1%, 35%)`，
 * 它引入了「peak 参与有效风险」这一文档里不存在的机制，且上限 35% 与
 * V2.1 §9.3「最高档 60%」冲突。本实现只保留文档写明的规则：
 *
 *   · 概率只由**当前 Risk** 决定（§9.3 锚点表的自变量就是"当前 Risk"）；
 *   · 锚点之间**线性插值**，不跳变；
 *   · Risk 100 时为 60%，中间按锚点插值；
 *   · 每次检查独立判定，不叠加隐藏的阶段惩罚（§9.2）。
 *
 * ★ 单一判定入口（V2.1 §9.3）：
 *   「系统展示的概率预览必须与正式随机判定使用同一个计算结果，
 *     不能只显示档位却偷偷应用另一套数值。」
 *   → breakChance() 是唯一实现；预览、风险条、正式判定全部转调它。
 *
 * 无渲染依赖，随机数由调用方注入（保证可复现）。
 */

import { RISK_MAX, BREAK_ANCHORS, bandOfRisk } from '../data/balance.js';

export const clamp = (v) => Math.min(RISK_MAX, Math.max(0, Number(v) || 0));

export function make() {
  return { current: 0, peak: 0 };
}

/**
 * 应用一次风险变化。
 * ★ peak 只升不降（V2.1 §9）：「降低当前 Risk 不会清除历史峰值」。
 */
export function apply(risk, deltaPoints) {
  risk.current = clamp((Number(risk.current) || 0) + (Number(deltaPoints) || 0));
  risk.peak = Math.max(Number(risk.peak) || 0, risk.current);
  return risk;
}

/** 选卡后的即时风险值（预览与结算共用同一口径） */
export const after = (risk, deltaPoints) => clamp((Number(risk?.current) || 0) + (Number(deltaPoints) || 0));

/**
 * ★★★ 唯一断裂概率函数 ★★★（V2.1 §9.3）
 *
 * 锚点：0→2% / 20→8% / 40→16% / 60→30% / 80→45% / 95→60% / 100→60%
 * 锚点之间线性插值；≥95 恒为 60%。
 *
 * @param {number} risk 当前 Risk（0–100）
 * @param {number} [scale=1] 挑战修饰器的倍率（每日挑战「脆弱钢坯」用）
 * @returns {number} 0–1 的单次断裂概率
 */
export function breakChance(risk, scale = 1) {
  const v = clamp(risk);
  const anchors = BREAK_ANCHORS;
  if (v <= anchors[0].risk) return 0;
  for (let i = 1; i < anchors.length; i++) {
    const hi = anchors[i], lo = anchors[i - 1];
    if (v <= hi.risk) {
      const p = lo.p + (hi.p - lo.p) * ((v - lo.risk) / (hi.risk - lo.risk));
      return Math.min(1, p * (Number.isFinite(Number(scale)) ? Math.max(0, Number(scale)) : 1));
    }
  }
  return Math.min(1, anchors[anchors.length - 1].p * (Number.isFinite(Number(scale)) ? Math.max(0, Number(scale)) : 1));
}

/** 百分比形式（UI 展示用，与 breakChance 同源） */
export const breakPercent = (risk, scale = 1) => Math.round(breakChance(risk, scale) * 1000) / 10;

/**
 * 一次风险检查。
 * @param {number} risk 当前 Risk
 * @param {() => number} rng 随机源
 * @param {number} [scale]
 * @returns {{risk:number, chance:number, roll:number, fractured:boolean}}
 */
export function check(risk, rng, scale = 1) {
  const chance = breakChance(risk, scale);
  const roll = typeof rng === 'function' ? rng() : Math.random();
  return { risk: clamp(risk), chance, roll, fractured: roll < chance };
}

/** 风险状态分档（V2.1 §9.1） */
export const band = (risk) => bandOfRisk(risk);

/**
 * 概率阶梯（供 UI 画风险曲线/文档校验）。
 * @returns {{risk:number, chance:number, percent:number}[]}
 */
export function ladder(step = 5, scale = 1) {
  const out = [];
  for (let v = 0; v <= RISK_MAX; v += step) {
    out.push({ risk: v, chance: breakChance(v, scale), percent: breakPercent(v, scale) });
  }
  return out;
}

export default { make, apply, after, breakChance, breakPercent, check, band, ladder, clamp, RISK_MAX };
