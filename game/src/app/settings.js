/**
 * 应用层 · 设置应用器（V2.1 §29）
 *
 * 这是"设置值"与"平台服务"之间**唯一**的接缝：
 *   · 存档里的 settings 只有经过 applyAll() 才会真正生效；
 *   · UI 的任何改动都必须走 update()，它会一并入档 + 立即生效 + 持久化。
 *
 * ★ 为什么需要这一层：之前 `settings.reducedMotion` 存了值却没人消费，
 *   开关点了没反应 —— 问题不在存档，而在"没人负责把值送下去"。
 *   把这条通路收敛成一个模块，就不会再散落各处各读各的。
 */

import { audio, haptics, motion } from '../platform/index.js';
import * as Progress from '../core/progress.js';

/** 把当前存档设置施加到各平台服务（启动时调一次，之后每次改动后调） */
export function applyAll() {
  const s = Progress.get().settings;

  audio.setEnabled(s.sound !== false);
  audio.setVolume(s.volume ?? 0.6);
  haptics.setEnabled(s.haptics !== false);
  // 动效三态交给 motion 单一真源；它会通知渲染门面把结果推给 viewer
  motion.syncFromSettings(s);

  return s;
}

/**
 * 改动一项或多项设置：入档 → 立即生效 → 持久化。
 * @param {object} patch 例：{ sound:false } / { motion:'reduced' }
 */
export function update(patch) {
  const s = Progress.updateSettings(patch);
  applyAll();
  return s;
}

/** 当前设置（只读快照） */
export const get = () => Progress.get().settings;

/**
 * 拖动中的实时预览：只改运行时，**不落盘**。
 * 音量滑块一次拖动会触发几十个 input 事件，逐个 persist 会反复写存档；
 * 松手时再走 update() 落盘，才是正确节奏。
 */
export function preview(patch) {
  if ('volume' in patch) audio.setVolume(patch.volume);
  if ('sound' in patch) audio.setEnabled(patch.sound !== false);
  return patch;
}

export default { applyAll, update, get, preview };
