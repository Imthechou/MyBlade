/**
 * 表现层 · 新手引导与首遇短提示（V2.1 §27 / §28）
 *
 * §27 的两条硬约束：
 *   ① "首次进入游戏时，先让玩家完成一把刀，而不是先阅读大段规则" ——
 *      所以引导只有 **四件事**，且是可随时关掉的抽屉，不是阻断式教程。
 *   ② "基础概念在玩家第一次遇到时用短提示说明" ——
 *      所以规则解释被拆成 hint()，在概念**真正出现的那一刻**才弹一次。
 *
 * 入口有两处：
 *   · 首次启动自动弹一次（maybeShowFirstRun）；
 *   · 设置面板「新手说明重看」（helpSheet）—— 用户明确要求的常驻入口。
 */

import { el, sheet, toast } from './dom.js';
import * as Progress from '../core/progress.js';

/** §27 的四件事（与文档逐条对应，不要随手加第 5 条） */
export const GUIDE = [
  {
    title: '每阶段三选一',
    desc: '每个工艺阶段从三张工艺卡里选一张。点卡片预览刀具与数值变化，点「确认工艺」才写入本局。右上角三点可查看详情。',
  },
  {
    title: '选工艺，也选构筑',
    desc: '卡面显示工艺路线与层数；同一路线累积到 2 / 4 / 6 层会强化刀技。上方数值条预览真实六维增量、风险与断裂概率。',
  },
  {
    title: 'S4 自由锻打',
    desc: '第四阶段可以持续锤击来强化，也可以随时收手。锤得越多、强化档越高，Risk 也越高。',
  },
  {
    title: '鉴定后带刀试炼',
    desc: '鉴定会先亮成刀，再揭晓六维、永久特性与评分倍率。成刀会自动收入藏刀阁，可以立即带刀试炼。',
  },
];

const V19_GUIDE = [
  { title: '先看矿，再付信用点', desc: '转动原石、打灯或敲石观察。擦窗花费 3 CR，切开后矿芯会留下自己的颜色和纹样。' },
  { title: '稳住炉温', desc: '按住鼓风，松手散热。在绿区积累精炼质量。达到成坯线即可浇注，继续控温能换取更干净的刀面。' },
  { title: '从六锤起可以收手', desc: '刀腹偏纹，刃侧偏膜，刀尖偏特效。锤数增加会提高断率，收锤后试装刀柄。' },
  { title: '用藏刀打比赛', desc: '鉴定会揭晓六维和评分。成刀自动入藏，可带去快赛、流派试炼与更高阶比赛。' },
];

/**
 * 打开新手引导抽屉。
 * @param {() => void} [onClose] 关闭后回调（首次启动用来记 tutorialSeen）
 */
export function guideSheet(onClose) {
  const guide = new URLSearchParams(location.search).has('legacy') ? GUIDE : V19_GUIDE;
  const body = el('div', { class: 'guide' }, [
    el('div', { class: 'guide-intro', text: '只需要知道这四件事，就可以开始锻第一把刀了。' }),
    ...guide.map((g, i) => el('div', { class: 'guide-item' }, [
      el('div', { class: 'guide-n', text: String(i + 1) }),
      el('div', {}, [
        el('div', { class: 'guide-title', text: g.title }),
        el('div', { class: 'guide-desc', text: g.desc }),
      ]),
    ])),
    el('div', { class: 'muted tiny', text: '错过也没关系：随时可以从右上角设置里重看。' }),
  ]);
  return sheet({ title: '新手引导', body, onClose });
}

/** 设置面板的「新手说明重看」入口 */
export const helpSheet = () => guideSheet();

/**
 * 首次启动自动弹一次。看完（或关掉）就落 tutorialSeen，之后不再自动弹。
 * @returns {boolean} 是否弹了
 */
export function maybeShowFirstRun() {
  const s = Progress.get().settings;
  if (s.tutorialSeen) return false;
  guideSheet(() => Progress.updateSettings({ tutorialSeen: true }));
  return true;
}

/**
 * 首遇短提示：同一个 key 一辈子只弹一次（记在 settings.hintsSeen）。
 * @param {string} key  语义键，例：'hammerS4'
 * @param {string} text 一句话说明
 * @param {'info'|'good'|'warn'} [tone]
 * @returns {boolean} 是否真的弹了（没弹说明早就见过）
 */
export function hint(key, text, tone = 'info') {
  const s = Progress.get().settings;
  if (!s.hintsSeen) s.hintsSeen = {};
  if (s.hintsSeen[key]) return false;
  Progress.updateSettings({ hintsSeen: { ...s.hintsSeen, [key]: true } });
  toast(text, tone, 1900);
  return true;
}

/** 是否已经看过某个提示（UI 想自己决定怎么展示时用） */
export const hasSeenHint = (key) => !!Progress.get().settings.hintsSeen?.[key];

export default { GUIDE, guideSheet, helpSheet, maybeShowFirstRun, hint, hasSeenHint };
