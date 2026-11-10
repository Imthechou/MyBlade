/**
 * 数据配置层 · 赛事事件（V2.1 §17）
 *
 * 事件内容沿用已交付的 40 条赛事事件（data/legacy/arenaEvents.js），
 * 本文件把每个选项按 V2.1 §17 的三种思路重新标注：
 *
 *   压制 press  —— 争取当下对抗面的高收益，但可能消耗优势或增加下一事件压力
 *   稳守 hold   —— 获取更可靠的收益、保护 Momentum
 *   反制 counter—— 根据对手意图与事件线索选择应对，判断正确时回报较高
 *
 * 映射依据：事件原表的 risk 字段（high→压制 / low→稳守 / medium→反制），
 * 保证"高风险选项确实对应高收益"的既有平衡不被改写。
 */

import { arenaEvents } from '../legacy/arenaEvents.js';

const KIND_BY_RISK = Object.freeze({
  high: { id: 'press', name: '压制', desc: '争取当下对抗面的高收益' },
  low: { id: 'hold', name: '稳守', desc: '更可靠的收益，保护 Momentum' },
  medium: { id: 'counter', name: '反制', desc: '针对对手意图，判断正确回报高' },
});

export const CHOICE_KINDS = Object.freeze(KIND_BY_RISK);

function normalizeChoice(rawChoice, rawDelta, rawRisk) {
  const kind = KIND_BY_RISK[rawChoice.risk] || KIND_BY_RISK.medium;
  return Object.freeze({
    id: rawChoice.id,
    title: rawChoice.title,
    kind: kind.id,
    kindName: kind.name,
    kindDesc: kind.desc,
    /** 该选项读取的六维（决定它在哪个对抗面上生效） */
    mainStat: rawChoice.mainStat,
    secondaryStat: rawChoice.secondaryStat,
    risk: rawChoice.risk,
    momentumDelta: Number(rawDelta) || 0,
    riskDelta: Number(rawRisk) || 0,
  });
}

export const EVENTS = Object.freeze(
  (arenaEvents.EVENTS || []).map((e) => Object.freeze({
    id: e.id,
    name: e.name,
    type: e.type,
    styleIds: Object.freeze((e.styleIds || []).slice()),
    choices: Object.freeze(
      (e.choices || []).map((c) => normalizeChoice(c, (e.momentumDelta || {})[c.id], (e.riskDelta || {})[c.id]))
    ),
  }))
);

export const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map((e) => [e.id, e])));

export const getEvent = (id) => EVENT_BY_ID[id] || null;

/**
 * 取一局比赛的事件序列。
 * @param {object} opts { count, styleId, rng }
 *   V2.1 §16：SCHOOL / NATIONAL 每场 3 个事件；GLOBAL APEX 每场 4 个
 *   （其中三个分别覆盖 POWER / CONTROL / ART，第四个为主题事件）。
 */
export function pickEvents({ count = 3, styleId = null, rng, apex = false }) {
  const pool = EVENTS.filter((e) => !styleId || !e.styleIds.length || e.styleIds.includes(styleId));
  const source = pool.length ? pool : EVENTS;
  if (apex) {
    // 三个对抗面各一个 + 一个主题事件
    const byFace = { POWER: [], CONTROL: [], ART: [] };
    const ART_STATS = ['design', 'spirit'];
    const CONTROL_STATS = ['toughness', 'craft'];
    for (const e of source) {
      const s = (e.choices[0] && e.choices[0].mainStat) || '';
      if (ART_STATS.includes(s)) byFace.ART.push(e);
      else if (CONTROL_STATS.includes(s)) byFace.CONTROL.push(e);
      else byFace.POWER.push(e);
    }
    const out = [];
    for (const face of ['POWER', 'CONTROL', 'ART']) {
      const arr = byFace[face].length ? byFace[face] : source;
      out.push(arr[Math.floor(rng() * arr.length) % arr.length]);
    }
    out.push(source[Math.floor(rng() * source.length) % source.length]);
    return out.slice(0, count);
  }
  const shuffled = source.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
  }
  return shuffled.slice(0, count);
}

export default EVENTS;
