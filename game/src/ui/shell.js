/** App shell navigation: page title, currency balance, settings, and one back route. */
import { el, mount, toast } from './dom.js';
import * as Progress from '../core/progress.js';
import router from './router.js';
import { icon } from './icons.js';
import * as SettingsSheet from './settingsSheet.js';
import { motion, bus, EVENTS, env } from '../platform/index.js';
import { LEGACY_MODE } from '../platform/env.js';

let lastSaveWarning = 0;
bus.on(EVENTS.SAVE_FAILED, ({ stale } = {}) => {
  const now = Date.now();
  if (now - lastSaveWarning < 2000) return;
  lastSaveWarning = now;
  toast(stale ? '另一标签页更新了存档。请刷新后继续。' :
    '保存失败，本次操作未保存。请检查浏览器存储空间后重试。', 'warn', 6000);
});

const syncMotion = reduced => { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; };
syncMotion(motion.reduced());
motion.subscribe(syncMotion);

const TITLES = {
  home: '锻刀大赛',
  forge: LEGACY_MODE ? '锻刀' : '锻造',
  appraise: '鉴定',
  arena: '赛事',
  'legacy-arena': '旧赛程',
  workshop: '工坊',
  daily: '每日挑战',
};

let titleEl = null;
let crEl = null;
let backEl = null;

export function create(host, { beforeSettings } = {}) {
  if (!env.hasLocalStorage) toast('当前浏览器无法持久保存，进度仅在本次页面有效。请允许本地存储后重新打开。', 'warn', 8000);
  backEl = el('button', {
    class: 'topbar-back',
    title: '返回首页', 'aria-label': '返回首页',
    onclick: () => router.go('home'),
  }, [icon('back')]);
  backEl.hidden = true;

  titleEl = el('div', { class: 'topbar-title', text: TITLES.home });
  crEl = el('div', { class: 'topbar-cr', role: 'status', 'aria-label': '信用点余额' }, [
    el('span', { class: 'muted', text: 'CR' }),
    el('b', { text: '0' }),
  ]);
  mount(host, [
    backEl,
    el('div', { class: 'topbar-mid' }, [titleEl]),
    crEl,
    el('button', {
      class: 'topbar-gear',
      title: '设置', 'aria-label': '设置',
      onclick: () => { beforeSettings?.(); SettingsSheet.open(); },
    }, [icon('settings')]),
  ]);
}

export function sync(pageKey) {
  if (titleEl) titleEl.textContent = TITLES[pageKey] || TITLES.home;
  if (backEl) backEl.hidden = pageKey === 'home';
  const state = Progress.get();
  if (crEl) {
    const value = crEl.querySelector('b');
    if (value) value.textContent = String(state.cr);
  }
}

export default { create, sync };
