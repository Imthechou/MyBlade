/**
 * 每日快速赛事的兼容入口。
 * 每日挑战统一位于赛事页：使用每日固定种子，但每天首次有效出战结算奖励。
 */
import { el, $, clear, mount } from '../dom.js';
import * as Core from '../../core/index.js';
import { LEGACY_MODE } from '../../platform/env.js';
import { openTournament } from './v19Arena.js';

let root = null;
let body = null;
export function create() {
  root = $('.page[data-page="daily"]');
  if (!root) return;
  root.innerHTML = '';
  body = el('div', { class: 'stack', style: { padding: '16px' } });
  root.appendChild(body);
}
export function render() {
  if (!root) create();
  if (!body) return;
  const daily = Core.progress.rolloverDaily();
  clear(body);
  mount(body, [
    el('section', { class: 'card' }, [
      el('div', { class: 'section-title', text: '每日挑战' }),
      el('div', { class: 'forge-question', text: daily.dayKey }),
      el('div', { class: 'report-line', text: '相同靶序，挑战今天的最高分。每局 45 秒，收藏刀具不会受损。' }),
    ]),
    el('button', { class: 'btn btn--primary btn--block', text: '开始每日挑战 →', onclick: () => {
      if (LEGACY_MODE) return import('./arena.js').then(arena => arena.openDailyChallenge());
      openTournament({ mode: 'daily' });
    } }),
    !LEGACY_MODE && el('section', { class: 'card stack' }, [
      el('div', { class: 'section-title', text: '今日目标' }),
      ...Core.daily.taskDefinitions.map(task => {
        const done = daily.tasks.find(item => item.id === task.id)?.done;
        return el('div', { class: 'report-line', text: `${task.name} · ${done ? '已入账' : '待完成'} ${task.reward} CR` });
      }),
    ]),
  ]);
}
export default { create, render };
