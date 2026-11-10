/** 首页：以真实刀具展台为中心，开始锻刀是唯一主行动。 */
import { el, $, clear, toast } from '../dom.js';
import { ICONS } from '../components.js';
import * as Progress from '../../core/progress.js';
import router from '../router.js';
import { freshRun, offers } from '../../v19/forge.js';
import { hasLiveFurnace, openFurnace } from '../../core/v19Progress.js';

let root, body, stageHost, legacy, hero, heroSequence = 0;
/* ★ 首页鉴赏控制（图标版，与锻造页共用 stageControls 模块）。
   · 默认 **关**：舞台不吃指针、页面可正常滚动、也不持续重绘（性能）；
   · 打开后才允许拖拽/缩放看细节（可玩性）。 */
let inspectCtl = null;
const ENTRIES = [
  { label: '赛事', icon: 'arena', go: () => router.go('arena') },
  { label: '藏刀阁', icon: 'collection', go: () => import('./workshop.js').then(m => m.openTab('collection')) },
  { label: '工坊', icon: 'workshop', go: () => import('./workshop.js').then(m => m.openTab(legacy ? 'bonuses' : null)) },
];

export function create({ legacy: old = null } = {}) {
  legacy = old;
  root = $('.page[data-page="home"]');
  if (!root) return;
  clear(root);
  inspectCtl = legacy?.createStageInspect() ?? null;
  stageHost = el('div', { class: 'stage home-showcase', id: 'homeStage' }, [
    el('div', { class: 'showcase-label' }, [el('i'), el('span', { text: '待你锻造' })]),
    /* 右下角两个图标：四向箭头（开/关拖动）+ 回转箭头（复原）。 */
    inspectCtl?.bar,
  ]);
  body = el('div', { id: 'homeBody', class: 'home-dashboard' });
  root.append(stageHost, body);
}

/** 首页保留展台、开锻、三个入口和生涯统计；图鉴在工坊内。 */
export function render() {
  if (!root || !body) create();
  if (!body) return;
  Progress.rolloverDaily();
  const summary = Progress.homeSummary();
  clear(body);
  const canResume = legacy ? !!(legacy.Game.run && !legacy.Game.run.finished) : hasLiveFurnace();
  const label = stageHost.querySelector('.showcase-label span');
  if (label) label.textContent = summary.showcase ? '代表作' : '唐刀 · 待你锻造';

  body.append(
    el('button', {
      class: 'btn btn--primary btn--block home-start',
      'aria-label': canResume ? '继续锻刀' : '开始锻刀',
      onclick: async (event) => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        const title = button.querySelector('.home-start-title');
        if (title) title.textContent = '正在准备工艺…';
        try {
          if (legacy) {
            if (!canResume) legacy.Game.startForge({ mode: 'normal' });
            await legacy.Game.prewarmCandidates();
          } else {
            const result = openFurnace({ restart: true });
            if (!result.ok) return toast(result.error, 'warn');
          }
          router.go('forge');
        } catch (error) {
          console.warn('[forge] preparation', error);
          toast('工艺准备未完成，请重试', 'warn');
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          if (title) title.textContent = canResume ? '继续锻刀' : '开始锻刀';
        }
      },
    }, [
      ICONS.forge(true),
      el('div', { class: 'home-start-copy' }, [
        el('span', { class: 'home-start-title', text: canResume ? '继续锻刀' : '开始锻刀' }),
        legacy ? el('small', { text: canResume ? '接续工序 · 保留当前构筑' : '十道工序 · 自由构筑' }) : null,
      ]),
      el('b', { text: '→', 'aria-hidden': 'true' }),
    ]),
    el('nav', { class: 'home-entry', 'aria-label': '游戏主导航' }, ENTRIES.map((entry) => el('button', {
      class: 'home-entry-btn',
      type: 'button',
      'aria-label': entry.label,
      onclick: entry.go,
    }, [ICONS[entry.icon](false), el('span', { text: entry.label })]))),
    (legacy || summary.collectionCount || summary.matchWins) ? el('div', { class: 'home-stats', 'aria-label': '长期进度' }, [
      summaryItem('最高评分', summary.bestScore),
      summaryItem('赛事胜场', summary.matchWins),
      summaryItem('藏刀', `${summary.collectionCount} 把`),
      summaryItem('图鉴', `${Math.round(summary.codexProgress * 100)}%`),
    ]) : document.createDocumentFragment(),
  );

  if (!legacy) {
    void showHero(summary.showcase);
  } else if (stageHost) {
    const stage = legacy.getStage();
    stage.attachTo(stageHost);
    stage.resize();
    /* ★ attachTo 会把控件重置回本页默认值（首页默认关），
       按钮必须跟着回读，否则会“亮着但拖不动”。 */
    inspectCtl?.syncFromStage?.();
    if (summary.showcase) legacy.Game.showRecord(summary.showcase);
    else legacy.Game.showDefault();
  }
}

/**
 * 供 bootstrap 在切页后调用：把鉴赏按钮对齐到画布真实状态。
 * ★ 必需：切页时 bootstrap 的 attachTo 发生在 page.render() 之后，
 *   页面自己那一次同步回读是早的，需要在这里再校一次。
 */
export function syncInspect() {
  inspectCtl?.syncFromStage?.();
}

function summaryItem(label, value) {
  return el('div', {}, [el('span', { text: label }), el('b', { text: String(value) })]);
}

async function showHero(record) {
  const sequence = ++heroSequence;
  hero?.close();
  hero = null;
  const current = () => router.currentKey() === 'home' && sequence === heroSequence;
  if (inspectCtl) inspectCtl.bar.hidden = true;
  stageHost.classList.toggle('v19-ghost', !record);
  try {
    if (!record || record.v19Visual) {
      const { showForgedBlade } = await import('../../v19/sharedStage.js');
      if (!current()) return;
      const ghost = freshRun(135);
      hero = showForgedBlade(stageHost, record?.v19Visual || { ...ghost, model: 'tangdao', ore: offers(ghost)[0] });
    } else {
      const [{ default: game }, { getStage }, { createStageInspect }] = await Promise.all([
        import('../../app/game.js'), import('../../render/index.js'), import('../stageControls.js'),
      ]);
      if (!current()) return;
      const stage = getStage();
      const mounted = stage.viewer ? { ok: true } : await stage.mount(stageHost);
      if (!current() || !mounted?.ok) return;
      stage.attachTo(stageHost);
      stage.resize();
      if (!inspectCtl) {
        inspectCtl = createStageInspect();
        stageHost.append(inspectCtl.bar);
      }
      inspectCtl.bar.hidden = false;
      inspectCtl.syncFromStage();
      stage.loadEnvironment();
      game.showRecord(record);
    }
  } catch {
    if (current()) stageHost.querySelector('.showcase-label span').textContent = '3D 展台暂不可用';
  }
}

export function leave() {
  heroSequence++;
  hero?.close();
  hero = null;
}

export default { create, render, leave };
