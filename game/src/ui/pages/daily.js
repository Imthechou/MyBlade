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
      el('div', { class: 'daily-date-row' }, [
        el('div', { class: 'forge-question', text: daily.dayKey }),
        (Core.progress.get().dailyStreak || 0) > 0
          ? el('span', { class: 'daily-streak', text: `连续 ${Core.progress.get().dailyStreak} 天` })
          : null,
      ]),
      el('div', { class: 'report-line', text: '相同靶序，挑战今天的最高分。每局 45 秒，收藏刀具不会受损。' }),
    ]),
    el('button', { class: 'btn btn--primary btn--block', text: '开始每日挑战 →', onclick: () => {
      if (LEGACY_MODE) return import('./arena.js').then(arena => arena.openDailyChallenge());
      openTournament({ mode: 'daily' });
    } }),
    !LEGACY_MODE && (() => {
      const tasks = Core.daily.taskDefinitions.map(task => ({
        ...task, done: !!daily.tasks.find(item => item.id === task.id)?.done,
      }));
      const doneCount = tasks.filter(task => task.done).length;
      const pct = Math.round((doneCount / Math.max(1, tasks.length)) * 100);
      return el('section', { class: 'card stack', 'aria-label': '今日目标' }, [
        el('div', { class: 'daily-head' }, [
          el('div', { class: 'section-title', text: '今日目标' }),
          el('b', { class: 'daily-count', text: `${doneCount} / ${tasks.length}` }),
        ]),
        el('div', { class: 'bar daily-bar' }, [el('i', { style: { width: (pct === 0 ? 0 : Math.max(4, pct)) + '%' } })]),
        el('ul', { class: 'daily-tasks' }, tasks.map(task => el('li', {
          class: 'daily-task' + (task.done ? ' is-done' : ''),
        }, [
          el('span', { class: 'daily-check', text: task.done ? '✓' : '○', 'aria-hidden': 'true' }),
          el('span', { class: 'daily-task-name', text: task.name }),
          el('b', { class: 'daily-reward', text: '+' + task.reward }),
        ]))),
        el('p', { class: 'daily-note', text: doneCount === tasks.length ? '今天的三个目标都已完成，奖励已入账。' : '每项奖励在条件达成时自动入账，不需要领取。' }),
      ]);
    })(),
  ]);
}
export default { create, render };
