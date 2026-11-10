import { audio, bus, EVENTS } from '../platform/index.js';
import { LEGACY_MODE } from '../platform/env.js';
import * as Progress from '../core/progress.js';
import { hasLegacyCareer } from '../core/v19Progress.js';
import * as Settings from './settings.js';
import * as Home from '../ui/pages/home.js';
import * as Shell from '../ui/shell.js';
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
}

export default async function main() {
  if (LEGACY_MODE) {
    delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F1F3FC');
    await import('./bootstrapLegacy.js');
  } else {
    start();
  }
}

main().catch(error => {
  document.getElementById('bootNote').textContent = '启动失败：' + error.message;
  console.error('[boot]', error);
});
