/**
 * 表现层 · 路由
 *
 * 一级页面（V2.1 §2）：锻刀 / 赛事 / 工坊 / 每日挑战，外加鉴定（由锻刀页跳转）。
 * 首页是导航与状态摘要，是默认页。
 *
 * ★ 2026-10-14（UI 整改 B2）：**删除底部标签栏**（buildTabbar / TABS / .tab）。
 *   导航收归首页 —— 首页主 CTA + 一行快捷导航；子页靠顶栏返回键回首页。
 *   与原项目 2026-10-03 的决定一致。PAGES 保留为**页面注册表的单一真源**，
 *   供 home.js 生成快捷导航（名称 / 图标不再两处各写一遍）。
 *
 * ★ 激活态由本文件**全量重算**（syncActive），
 *   V1 曾因页面硬编码 is-active + 路由只清理"上一页"，
 *   导致深链刷新时两个 .page.is-active 同时 display（串台）。
 */

import { $$ } from './dom.js';

/** 页面注册表：key / 中文名 / 六边形图标。导航入口由此生成。 */
export const PAGES = [
  { key: 'home', name: '首页', icon: 'daily' },
  { key: 'forge', name: '锻刀', icon: 'forge' },
  { key: 'arena', name: '赛事', icon: 'arena' },
  { key: 'workshop', name: '工坊', icon: 'workshop' },
  { key: 'daily', name: '每日', icon: 'daily' },
];

const registry = new Map();
let current = 'home';
const listeners = [];

export function register(key, { render, enter, leave, canEnter }) {
  registry.set(key, { render, enter, leave, canEnter });
}

export function onNavigate(fn) { listeners.push(fn); }

/** 全量重算激活态 —— 不依赖"上一页" */
function syncActive(key) {
  $$('.page').forEach((p) => {
    const on = p.dataset.page === key;
    p.classList.toggle('is-active', on);
  });
}

export function go(key, opts = {}) {
  // 失效的 #/forge 深链直接回首页并同步 URL，避免刷新进入唐刀空态。
  if (!registry.has(key) || (registry.get(key).canEnter && !registry.get(key).canEnter())) {
    key = 'home';
    opts = { ...opts, silent: false };
  }
  const prev = current;
  const prevPage = registry.get(prev);
  if (prevPage && prevPage.leave && prev !== key) prevPage.leave();

  current = key;
  if (!opts.silent && location.hash !== `#/${key}`) {
    history.replaceState(null, '', `#/${key}`);
  }
  syncActive(key);

  const page = registry.get(key);
  if (page && page.render) page.render();
  if (page && page.enter) page.enter();
  for (const fn of listeners) fn(key, prev);
  return key;
}

export const currentKey = () => current;

export function start() {
  const hash = (location.hash || '').replace(/^#\/?/, '');
  go(registry.has(hash) ? hash : 'home', { silent: true });
  globalThis.addEventListener('hashchange', () => {
    const k = (location.hash || '').replace(/^#\/?/, '');
    if (k && k !== current) go(k, { silent: true });
  });
}

export default { register, go, start, currentKey, onNavigate, PAGES };
