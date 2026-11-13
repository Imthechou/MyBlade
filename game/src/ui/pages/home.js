/** 首页：以真实刀具展台为中心，开始锻刀是唯一主行动。 */
import { el, $, clear, toast } from '../dom.js';
import { ICONS } from '../components.js';
import { icon } from '../icons.js';
import * as Progress from '../../core/progress.js';
import router from '../router.js';
import { FITS, freshRun } from '../../v19/forge.js';
import { hasLiveFurnace, openFurnace } from '../../core/v19Progress.js';

let root, body, stageHost, legacy, hero, heroSequence = 0;
let inspectCtl = null;
const sampleRun = freshRun(314);
const sample = {
  model: 'tangdao', ore: { family: 'meteor', material: 'meteor_nickel', tint: 'silver', figure: .32, clarity: 84, vein: 36 },
  purity: 92, refinement: { quality: 86 },
  skin: { ...sampleRun.skin, metal: 'silver', pattern: 'damascus', levels: { ...sampleRun.skin.levels, metal: 2, pattern: 1 } },
};
const sampleFitting = { ...FITS.find(fit => fit.id === 'ink'), color: '#302d2e', accent: '#947955' };
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
  root.classList.toggle('home-gallery', !legacy);
  inspectCtl = legacy?.createStageInspect() ?? null;
  stageHost = el('div', { class: 'stage home-showcase', id: 'homeStage' }, [
    legacy ? el('div', { class: 'showcase-label' }, [el('i'), el('span')]) :
      el('div', { class: 'home-gallery-label' }, [
        el('span', { class: 'home-gallery-kind' }),
        el('strong', { class: 'home-gallery-name' }),
        el('small', { class: 'home-gallery-score', hidden: true }),
      ]),
    legacy ? null : el('span', { class: 'home-stage-status', role: 'status', hidden: true }),
    inspectCtl?.bar,
  ]);
  body = el('div', { id: 'homeBody', class: 'home-dashboard' });
  root.append(stageHost, body);
}

export function render() {
  if (!root || !body) create();
  if (!body) return;
  Progress.rolloverDaily();
  const summary = Progress.homeSummary();
  clear(body);
  const canResume = legacy ? !!(legacy.Game.run && !legacy.Game.run.finished) : hasLiveFurnace();
  const label = stageHost.querySelector('.showcase-label span');
  if (label) label.textContent = summary.showcase ? '代表作' : '唐刀 · 待你锻造';
  else {
    const record = summary.showcase;
    stageHost.querySelector('.home-gallery-kind').textContent = record ? '代表作' : '样刀';
    stageHost.querySelector('.home-gallery-name').textContent = record ? record.bladeName || record.name || '成刀' : '唐刀';
    const score = stageHost.querySelector('.home-gallery-score');
    score.hidden = !Number.isFinite(record?.score);
    score.textContent = score.hidden ? '' : `${record.score} 分`;
  }

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
      legacy ? ICONS.forge(true) : icon('hammer'),
      el('div', { class: 'home-start-copy' }, [
        el('span', { class: 'home-start-title', text: canResume ? '继续锻刀' : '开始锻刀' }),
        legacy ? el('small', { text: canResume ? '接续工序 · 保留当前构筑' : '十道工序 · 自由构筑' }) : null,
      ]),
      legacy ? el('b', { text: '→', 'aria-hidden': 'true' }) : null,
    ]),
    ...(legacy ? [nextGoalRow(summary.nextGoal)] : []),
    el('nav', { class: 'home-entry', 'aria-label': '游戏主导航' }, ENTRIES.map((entry) => el('button', {
      class: 'home-entry-btn',
      type: 'button',
      'aria-label': entry.label,
      onclick: entry.go,
    }, [ICONS[entry.icon](false), el('span', { text: entry.label })]))),
  );
  if (legacy) {
    body.append(el('div', { class: 'home-stats', 'aria-label': '长期进度' }, [
      summaryItem('最高评分', summary.bestScore),
      summaryItem('赛事胜场', summary.matchWins),
      summaryItem('藏刀', `${summary.collectionCount} 把`),
      summaryItem('图鉴', `${Math.round(summary.codexProgress * 100)}%`),
    ]));
  }

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

/**
 * 首页唯一的“下一目标”行（计划 E1 / 8.3：主作品、主行动、一个下一目标）。
 * 数据来自 Progress.nextGoal()，点击后跳到它指定的路由与子页。
 */
function nextGoalRow(goal) {
  if (!goal) return el('div', { class: 'home-next-goal', hidden: true });
  return el('button', {
    type: 'button',
    class: 'home-next-goal',
    'aria-label': `下一目标：${goal.title}。${goal.action}`,
    onclick: () => openGoal(goal),
  }, [
    el('span', { class: 'home-next-kicker', text: '下一目标' }),
    el('span', { class: 'home-next-title', text: goal.title }),
    el('span', { class: 'home-next-action', text: goal.action + ' →', 'aria-hidden': 'true' }),
  ]);
}

function openGoal(goal) {
  if (goal.route === 'workshop') {
    import('./workshop.js').then(m => m.openTab(goal.tab || null));
  } else {
    router.go(goal.route);
  }
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
  const status = stageHost.querySelector('.home-stage-status');
  status.textContent = '正在载入展台…';
  status.hidden = false;
  try {
    if (!record || record.v19Visual) {
      const { showForgedBlade } = await import('../../v19/sharedStage.js');
      if (!current()) return;
      hero = showForgedBlade(stageHost, record?.v19Visual || sample, { gallery: true, fitting: record ? undefined : sampleFitting });
      if (!await hero.ready) throw new Error('展示刀具载入失败');
    } else {
      const [{ default: game }, { getStage }, { createStageInspect }] = await Promise.all([
        import('../../app/game.js'), import('../../render/index.js'), import('../stageControls.js'),
      ]);
      if (!current()) return;
      const stage = getStage();
      const mounted = stage.viewer ? { ok: true } : await stage.mount(stageHost);
      if (!current()) return;
      if (!mounted?.ok) throw new Error('旧档案展台载入失败');
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
    if (current()) status.hidden = true;
  } catch {
    if (current()) {
      hero?.close();
      hero = null;
      status.textContent = '3D 展台暂不可用';
    }
  }
}

export function leave() {
  heroSequence++;
  hero?.close();
  hero = null;
}

export default { create, render, leave };
