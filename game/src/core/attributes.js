/**
 * 核心玩法层 · 六维属性（V2.1 §12）
 *
 * 纯函数、无渲染依赖、无随机数 —— 可在 Node 下直接单测。
 * 只负责"六维怎么算"，不负责"六维从哪来"（那是 cards / traits / hammer 的事）。
 */

import { STAT_KEYS, STAT_SOFT_CAP } from '../data/balance.js';

export function make() {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

/** 应用一次增减（原地修改并返回同一对象） */
export function apply(stats, delta = {}) {
  for (const k of STAT_KEYS) {
    const d = Number(delta[k]) || 0;
    if (d === 0) continue;
    stats[k] = Math.max(0, Math.min(STAT_SOFT_CAP, (Number(stats[k]) || 0) + d));
  }
  return stats;
}

/** 六维均值（V2.1 §13.1 的成刀评分基数） */
export function mean(stats) {
  let s = 0;
  for (const k of STAT_KEYS) s += Number(stats[k]) || 0;
  return s / STAT_KEYS.length;
}

export function total(stats) {
  let s = 0;
  for (const k of STAT_KEYS) s += Number(stats[k]) || 0;
  return s;
}

export function clone(stats) {
  const s = {};
  for (const k of STAT_KEYS) s[k] = Number(stats[k]) || 0;
  return s;
}

/** 三个对抗面的两维均值（V2.1 §15.1） */
export function faceMean(stats, faceStats) {
  let s = 0;
  for (const k of faceStats) s += Number(stats[k]) || 0;
  return s / faceStats.length;
}

export default { STAT_KEYS, make, apply, mean, total, clone, faceMean };
