import { audio, bus, EVENTS } from '../platform/index.js';
import { LEGACY_MODE } from '../platform/env.js';
import * as Progress from '../core/progress.js';
import { hasLegacyCareer } from '../core/v19Progress.js';
import * as Settings from './settings.js';
import * as Home from '../ui/pages/home.js';
import * as Shell from '../ui/shell.js';
import * as Tutorial from '../ui/tutorial.js';
import router from '../ui/router.js';

function lazyPage(load) {
  let page;
  let loading;
  return {
    render() {
      if (page) return page.render();
      const route = router.currentKey();
      const host = document.querySelector(`.page[data-page="${route}"]`);
      delete host.dataset.loadError;
      host.setAttribute('aria-busy', 'true');
      loading ??= load().then(module => {
        page = module;
        page.create?.();
        return page;
      });
      loading.then(module => {
        if (router.currentKey() === route) module.render();
      }).catch(error => {
        console.error('[route]', error);
        loading = page = null;
        host.dataset.loadError = '页面载入失败，请返回后重试';
      }).finally(() => host.removeAttribute('aria-busy'));
    },
    leave() { page?.leave?.(); },
    pauseForSettings() { page?.pauseForSettings?.(); },
    back() { return page?.back?.(); },
  };
}

function start() {
  Progress.load();
  Progress.rolloverDaily();
  Settings.applyAll();
  globalThis.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  Home.create();
  const forge = lazyPage(() => import('../ui/pages/v19Forge.js'));
  const arena = lazyPage(() => import('../ui/pages/v19Arena.js'));
  Shell.create(document.getElementById('topbar'), {
    onBack: () => router.currentKey() === 'arena' && arena.back(),
    beforeSettings() {
      if (router.currentKey() === 'forge') forge.pauseForSettings();
      if (router.currentKey() === 'arena') arena.pauseForSettings();
    },
  });
  router.register('home', Home);
  router.register('forge', forge);
  router.register('arena', arena);
  router.register('legacy-arena', {
    ...lazyPage(() => import('../ui/pages/arena.js')), canEnter: hasLegacyCareer,
  });
  router.register('workshop', lazyPage(() => import('../ui/pages/workshop.js')));
  router.register('daily', lazyPage(() => import('../ui/pages/daily.js')));
  router.onNavigate(key => Shell.sync(key));
  bus.on(EVENTS.CR_CHANGED, () => Shell.sync(router.currentKey()));
  router.start();
  document.getElementById('boot')?.remove();
  // The first blade is the real tutorial. Let the forge stage paint one beat
  // before offering the four essentials, otherwise the sheet hides the payoff.
  setTimeout(() => Tutorial.maybeShowFirstRun(), 420);
}

/**
 * 旧版入口（?legacy）走的是浅色 V4 界面，很容易被误认成"主题坏了"。
 * 这里挂一个不依赖样式表的出口按钮，一键回新版暗色。
 */
function mountLegacyExit() {
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.textContent = '旧版界面 · 回到新版';
  Object.assign(exit.style, {
    position: 'fixed', right: '12px', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    zIndex: '9999', padding: '9px 13px', border: '1px solid #2A3350', borderRadius: '999px',
    background: '#1B2130', color: '#E8ECF7', font: '600 12px/1 system-ui, -apple-system, sans-serif',
    boxShadow: '0 6px 22px #00000055', cursor: 'pointer',
  });
  exit.addEventListener('click', () => { globalThis.location.href = globalThis.location.pathname; });
  const attach = () => (document.body || document.documentElement).appendChild(exit);
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });
}

export default async function main() {
  if (LEGACY_MODE) {
    delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F1F3FC');
    mountLegacyExit();
    await import('./bootstrapLegacy.js');
  } else {
    /* 兜底：data-theme 一旦丢失就会回落成浅色 token，这里强制回到暗色。 */
    document.documentElement.dataset.theme = 'dark';
    start();
  }
}

main().catch(error => {
  document.getElementById('bootNote').textContent = '启动失败：' + error.message;
  console.error('[boot]', error);
});
