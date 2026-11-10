/**
 * 平台服务层 · 减弱动效偏好（V2.1 §29「减少动态效果」）
 *
 * ★ 单一真源：所有"要不要动"的判断都走这里，不要再各处自己读
 *   `matchMedia('(prefers-reduced-motion: reduce)')` —— 那正是这个开关
 *   一直不生效的原因（设置里存了值，却没人消费）。
 *
 * 三态并存是必要的：
 *   · 'auto'    跟随系统（默认）。玩家没表态时不替他做决定。
 *   · 'reduced' 玩家显式要求"减少动效"，**覆盖**系统（系统说可以动也不动）。
 *   · 'full'    玩家显式要求"完整动效"，**覆盖**系统（系统说减少也照动）。
 *   只用一个布尔值无法区分"没表态"和"明确要完整"，所以用字符串三态。
 */

const QUERY = '(prefers-reduced-motion: reduce)';

/** 系统偏好（宿主可能没有 matchMedia） */
export function systemReduced() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia(QUERY).matches);
  } catch (_) { return false; }
}

/** null = 跟随系统；true/false = 玩家显式设定 */
let override = null;

const listeners = new Set();

/** 当前是否应当减弱动效（消费方唯一该调的 API） */
export function reduced() {
  return override === null ? systemReduced() : override;
}

/** 玩家是否显式表过态（UI 用来显示"跟随系统"状态） */
export const hasOverride = () => override !== null;

/** 当前三态 */
export function mode() {
  return override === null ? 'auto' : (override ? 'reduced' : 'full');
}

/**
 * 设定三态。
 * @param {'auto'|'reduced'|'full'} m
 */
export function setMode(m) {
  const next = m === 'reduced' ? true : (m === 'full' ? false : null);
  if (next === override) return reduced();
  override = next;
  const now = reduced();
  for (const fn of Array.from(listeners)) {
    try { fn(now); } catch (e) { console.error('[motion] 监听器出错', e); }
  }
  return now;
}

/** 从存档 settings 恢复（启动时调一次） */
export function syncFromSettings(settings) {
  return setMode((settings && settings.motion) || 'auto');
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 监听系统偏好变化：只有"跟随系统"时结果才会变，但订阅者仍会收到通知
 * （因为"当前是否减弱"这个值确实可能变了）。
 */
export function watchSystem() {
  try {
    const mql = globalThis.matchMedia && globalThis.matchMedia(QUERY);
    if (!mql || !mql.addEventListener) return () => {};
    const handler = () => {
      const now = reduced();
      for (const fn of Array.from(listeners)) {
        try { fn(now); } catch (e) { console.error('[motion] 监听器出错', e); }
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  } catch (_) { return () => {}; }
}

export default { reduced, systemReduced, setMode, mode, hasOverride, syncFromSettings, subscribe, watchSystem };
