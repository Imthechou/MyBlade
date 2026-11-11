/**
 * 平台服务层 · 运行环境探测
 *
 * 目标：让上层**只问能力**、不判断宿主。未来接入微信小游戏 / 抖音小游戏 /
 * iOS App / Cocos 时，只需在这里补充分支，业务代码不动。
 *
 * 只暴露只读快照，不提供 setters —— 防止某处偷偷改平台导致行为分叉。
 */

/** 存储后端能力探测（localStorage 在隐私模式/小游戏里可能抛错） */
function probeLocalStorage() {
  try {
    const k = '__bf_probe__';
    const ls = globalThis.localStorage;
    if (!ls) return false;
    ls.setItem(k, '1');
    ls.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}

function detectHost() {
  const nav = globalThis.navigator;
  const ua = (nav && nav.userAgent) || '';
  if (typeof globalThis.wx !== 'undefined' && globalThis.wx.getSystemInfoSync) return 'wechat';
  if (typeof globalThis.tt !== 'undefined') return 'douyin';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (typeof globalThis.__bf_host__ === 'string') return globalThis.__bf_host__;
  return 'web';
}

/**
 * 旧版界面走**独立入口** legacy.html，不再用 ?legacy 查询参数触发。
 * 原因：旧版会在启动时删除 data-theme 以切回浅色 token，只要参数还在，
 * 主入口就会出现“先暗后白”的闪烁，且用户很难意识到是参数造成的。
 */
export const LEGACY_MODE = /\/legacy(\.html)?\/?$/.test(globalThis.location?.pathname ?? '');

export const env = Object.freeze({
  host: detectHost(),
  hasLocalStorage: probeLocalStorage(),
  hasWebAudio: typeof globalThis.AudioContext !== 'undefined'
    || typeof globalThis.webkitAudioContext !== 'undefined',
  hasVibration: typeof globalThis.navigator !== 'undefined'
    && typeof globalThis.navigator.vibrate === 'function',
  hasWebGL: (() => {
    try {
      const c = globalThis.document && globalThis.document.createElement('canvas');
      return !!(c && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (_) { return false; }
  })(),
  /** 触屏优先（移动端优先设计，见设定文档 §0） */
  isTouch: (() => {
    try {
      return (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches)
        || ('ontouchstart' in globalThis);
    } catch (_) { return false; }
  })(),
  prefersReducedMotion: (() => {
    try {
      return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  })(),
});

export default env;
