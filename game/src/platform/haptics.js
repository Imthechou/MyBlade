/**
 * 平台服务层 · 震动反馈
 *
 * 设定文档 §29 要求"震动反馈开关"。无震动能力的宿主（桌面浏览器）静默降级。
 */

import { env } from './env.js';

const state = { enabled: true };

export function setEnabled(v) { state.enabled = !!v; }
export const isEnabled = () => state.enabled;

/** @param {number|number[]} pattern 毫秒；数组表示 振-停-振 */
export function vibrate(pattern) {
  if (!state.enabled || !env.hasVibration) return;
  try { globalThis.navigator.vibrate(pattern); } catch (_) {}
}

/** 常用语义 */
export const HAPTIC = Object.freeze({
  tap: 8,
  select: 12,
  confirm: [10, 30, 16],
  hammer: 26,
  fracture: [40, 60, 40, 60, 90],
  trait: [12, 24, 20],
  win: [16, 40, 16, 40, 30],
});

export function feedback(kind) {
  const p = HAPTIC[kind];
  if (p != null) vibrate(p);
}

export default { vibrate, feedback, setEnabled, isEnabled, HAPTIC };
