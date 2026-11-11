/** 赛事展示组件；不持有赛事状态，不执行结算。 */
import { el } from './dom.js';
import { MOMENTUM } from '../data/balance.js';

export function momentumChip(v) {
  const def = MOMENTUM.find((x) => x.value === v) || MOMENTUM[2];
  const tone = v > 0 ? 'me' : v < 0 ? 'opp' : 'even';
  return el('div', { class: `mom-chip mom-chip--${tone}` }, [
    el('i', { class: 'mom-dot' }),
    el('span', { text: def.name }),
  ]);
}

export function momentumLadder(v) {
  // 从"大幅落后"到"大幅领先"排成一条阶梯，当前档点亮
  const order = [...MOMENTUM].sort((a, b) => a.value - b.value);
  return el('div', { class: 'mom-ladder' }, order.map((x) => el('div', {
    class: 'mom-step'
      + (x.value === v ? ' is-on' : '')
      + (x.value > 0 ? ' is-ahead' : x.value < 0 ? ' is-behind' : ' is-even'),
  }, [
    el('i', {}),
    el('span', { text: x.name }),
  ])));
}


export function momentumHint(delta) {
  const v = Number(delta) || 0;
  if (!v) return el('span', { class: 'mom-hint', text: '局势 →' });
  return el('span', {
    class: 'mom-hint ' + (v > 0 ? 'is-up' : 'is-down'),
    text: v > 0 ? '局势 ↑' : '局势 ↓',
  });
}


/** Momentum 走势条：初始均势起，逐个事件画台阶 */
export function momentumTrail(m) {
  const pts = [{ label: '开局', v: 0 }];
  for (const l of m.log) {
    if (l.momentumTo == null) continue;
    pts.push({ label: l.choiceTitle || (l.fieldTest ? '现场测试' : ''), v: l.momentumTo });
  }
  const max = 2;
  return el('div', { class: 'trail' }, pts.map((p) => {
    const h = ((p.v + max) / (max * 2)) * 100;
    return el('div', { class: 'trail-col' }, [
      el('div', { class: 'trail-bar-wrap' }, [
        el('i', {
          class: 'trail-bar' + (p.v > 0 ? ' is-up' : p.v < 0 ? ' is-down' : ''),
          style: { height: Math.max(6, h) + '%' },
        }),
      ]),
      el('span', { class: 'trail-v mono', text: p.v > 0 ? `+${p.v}` : String(p.v) }),
      el('span', { class: 'trail-label', text: (p.label || '').slice(0, 4) }),
    ]);
  }));
}

/* ══ 共用小件 ══════════════════════════════════════════════════ */

export const FACE_CN = Object.freeze({ POWER: '力量', CONTROL: '控制', ART: '表现' });
export const STAT_CN = Object.freeze({
  strength: '强度', toughness: '韧性', sharpness: '锋利',
  craft: '工艺', design: '设计', spirit: '灵性',
});
export const FACE_STATS = Object.freeze({
  POWER: ['strength', 'sharpness'],
  CONTROL: ['toughness', 'craft'],
  ART: ['design', 'spirit'],
});

export function faceOfStat(stat) {
  for (const [face, keys] of Object.entries(FACE_STATS)) if (keys.includes(stat)) return face;
  return 'POWER';
}

/**
 * 一侧对抗条：我方实心 / 对手描边，谁高一眼看得出。
 * ★ mine / theirs 都可以传 null —— 表示"这一面不公开"。
 *   传 null 时必须画成 `?` 且不打条，不能退化成 0：
 *   0 分和"不知道"在视觉上是两件完全不同的事（§18 信息透明度）。
 */
export function faceCompareRow(face, mine, theirs) {
  const meHidden = mine == null;
  const opHidden = theirs == null;
  const me = meHidden ? null : Math.round(mine);
  const op = opHidden ? null : Math.round(theirs);
  const lead = !meHidden && !opHidden && me > op;
  return el('div', { class: 'face-row' }, [
    el('div', { class: 'face-row-head' }, [
      el('span', { class: `chip chip--face chip--face-${face.toLowerCase()}`, text: FACE_CN[face] }),
      el('span', { class: 'face-legend' }, [
        meHidden
          ? el('b', { class: 'mono muted', text: '?' })
          : el('b', { class: 'mono ' + (lead ? 'is-lead' : ''), text: String(me) }),
        el('span', { class: 'muted', text: ' / ' }),
        opHidden
          ? el('b', { class: 'mono muted', text: '?' })
          : el('b', { class: 'mono is-opp', text: String(op) }),
      ]),
    ]),
    el('div', { class: 'face-dual' }, [
      el('div', { class: 'face-dual-me' }, [
        meHidden ? el('i', { class: 'is-unknown' }) : el('i', { style: { width: me + '%' } }),
      ]),
      el('div', { class: 'face-dual-opp' }, [
        opHidden ? el('i', { class: 'is-unknown' }) : el('i', { style: { width: op + '%' } }),
      ]),
    ]),
  ]);
}



