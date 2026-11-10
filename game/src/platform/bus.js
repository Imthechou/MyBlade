/**
 * 平台服务层 · 事件总线
 *
 * 用途：让 core（纯逻辑）向 ui / audio / haptics 广播"发生了什么"，
 * 而不必 import 它们 —— 这是表现层与玩法层解耦的关键接缝。
 *
 * 约定：事件名用 '域:动作' 小写，例如 'forge:confirmed' / 'risk:checked'。
 */

const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  const set = listeners.get(name);
  if (set) set.delete(fn);
}

export function emit(name, payload) {
  const set = listeners.get(name);
  if (set) for (const fn of Array.from(set)) {
    try { fn(payload); } catch (e) { console.error(`[bus] ${name} 监听器出错`, e); }
  }
  // '*' 通配监听（调试/录制用）
  const all = listeners.get('*');
  if (all) for (const fn of Array.from(all)) {
    try { fn({ name, payload }); } catch (e) { console.error('[bus] * 监听器出错', e); }
  }
}

export function clear(name) {
  if (name) listeners.delete(name); else listeners.clear();
}

/** 事件名常量表 —— 避免各处手写字符串拼错 */
export const EVENTS = Object.freeze({
  RUN_START: 'forge:run-start',
  STAGE_ENTER: 'forge:stage-enter',
  CARD_PREVIEW: 'forge:card-preview',
  CARD_CONFIRMED: 'forge:card-confirmed',
  REROLL: 'forge:reroll',
  RISK_CHECKED: 'risk:checked',
  HAMMER: 'forge:hammer',
  HAMMER_END: 'forge:hammer-end',
  EDGE_DONE: 'forge:edge-done',
  FRACTURE: 'forge:fractured',
  APPRAISED: 'forge:appraised',
  MATCH_START: 'arena:match-start',
  MATCH_END: 'arena:match-end',
  QUICK_CHALLENGE_FINISHED: 'arena:quick-challenge-finished',
  CR_CHANGED: 'economy:cr-changed',
  UNLOCKED: 'progress:unlocked',
  CODEX_FOUND: 'progress:codex-found',
  SAVED: 'save:persisted',
  SAVE_FAILED: 'save:failed',
});

export default { on, off, emit, clear, EVENTS };
