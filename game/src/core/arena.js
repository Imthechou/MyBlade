/**
 * 核心玩法层 · 赛事（V2.1 §15–§21）
 *
 * 赛事的任务是**验证成刀**，不是重新锻造。
 *
 * ★ 两项指标（V2.1 §15.2）：
 *   六维对抗分 = POWER / CONTROL / ART 三项标准化对抗值的平均值（0–100）
 *   评分对抗分 = 我方成刀评分 / (我方 + 对手) × 100
 *   比赛综合分 = 六维对抗分 × 70% + 评分对抗分 × 30%
 *
 * ★ 明确不做的（V2.1 §21 / §20.3）：
 *   · 不把锻造的 Risk / 峰值 Risk 套用到比赛里；
 *   · 普通落败不等于断刀；仅实际测试结构失效导致断刀；
 *   · 世界巅峰赛只用一把刀，不恢复三刀编队或 BO3；
 *   · 不建立第二套 RPG 职业、技能树或复杂 Combo Tree。
 *
 * 纯逻辑，随机数由外部注入。
 */

import {
  FACES, FACE_REF, MATCH_WEIGHTS, MOMENTUM, FIELD_TESTS,
  FIELD_TEST_MAX_INFLUENCE, FIELD_TEST_MOMENTUM, ARENA_CAN_DESTROY_BLADE,
  ARENA_EVENT_COUNT,
} from '../data/balance.js';
import * as Attr from './attributes.js';
import * as RNG from '../platform/rng.js';
import { pickEvents } from '../data/arena/events.js';
import { makeBranchOpponent, makeTournamentOpponent, faceScores } from '../data/arena/opponents.js';
import { hasStructuralFailure } from './arenaChallenge.js';

// 快速切割赛与正式赛事并列：纯规则模块，不改下方赛事树、进阶或结算。
export {
  createChallenge, tick as tickChallenge, swipe as challengeSwipe, beginSwipe as beginChallengeSwipe,
  chooseRoute as chooseChallengeRoute, chooseFinale as chooseChallengeFinale,
  finish as finishChallenge, setPaused as pauseChallenge,
  MATERIALS as CHALLENGE_MATERIALS, ROUTES as CHALLENGE_ROUTES,
  FINALES as CHALLENGE_FINALES, CHALLENGE_SECONDS,
} from './arenaChallenge.js';

/** 六维 → 对抗面：哪个对抗面用这两维 */
const FACE_OF_STAT = (() => {
  const m = {};
  for (const [face, def] of Object.entries(FACES)) for (const k of def.stats) m[k] = face;
  return m;
})();

/** 三种想法对当前对抗面的收益强度（V2.1 §17） */
const CHOICE_GAIN = Object.freeze({ press: 0.18, hold: 0.08, counter: 0.13 });

/** 现场测试成绩的中文（战报文案用，与渲染层同一套词） */
const FIELD_TEST_TIER_CN = Object.freeze({ perfect: '完美', near: '接近', fail: '失手', skip: '放弃' });

/** 标准化：两维均值 → 0–100（V2.1 §15.2 待补齐规则的落地定义） */
function normalizeFace(stats, faceStats) {
  const m = Attr.faceMean(stats, faceStats);
  return Math.max(0, Math.min(100, (m / FACE_REF) * 100));
}

export function baseFaces(stats) {
  const out = {};
  for (const [face, def] of Object.entries(FACES)) out[face] = normalizeFace(stats, def.stats);
  return out;
}

/* ── 创建一场比赛 ───────────────────────────────────────── */

/**
 * @param {object} opts
 *   blade      BladeRecord（必须 canEnterArena）
 *   tier       'school' | 'national' | 'apex'
 *   styleId    流派赛分支 id
 *   gradient   流派赛梯度 0–4
 *   seed
 *   theme      全球巅峰赛主题（可选）
 */
export function createMatch({ blade, tier = 'school', styleId = null, gradient = 0, seed = null, theme = null }) {
  if (!blade || blade.fractured || blade.canEnterArena === false) {
    return { ok: false, reason: '只能使用完整成刀参赛' };
  }
  const s = (seed != null ? Number(seed) >>> 0 : ((Date.now() % 100000000) >>> 0));
  const rng = RNG.stream(s, 'match', tier);

  const opponent = tier === 'school'
    ? makeBranchOpponent(styleId, gradient, s)
    : makeTournamentOpponent(tier === 'apex' ? 4 : Math.min(3, 1 + (gradient | 0)), s, styleId);
  if (!opponent) return { ok: false, reason: '对手生成失败' };

  const isApex = tier === 'apex';
  const count = ARENA_EVENT_COUNT[tier] ?? 3;
  const events = pickEvents({ count, styleId, rng, apex: isApex });

  /* 每场正式赛事固定一次2D切割：单局主玩法，上层赛事/事件/70-30结算不变。 */
  const testTypes = Object.keys(FIELD_TESTS);
  const fieldTest = {
    type: testTypes[Math.floor(rng() * testTypes.length) % testTypes.length],
    used: false, result: null,
  };

  return {
    ok: true,
    match: {
      id: `M-${s.toString(36)}-${Date.now().toString(36)}`,
      tier, styleId, gradient, theme: theme ? { ...theme } : null,
      seed: s,
      rng,
      blade: {
        id: blade.id, name: blade.bladeName || blade.id,
        stats: Attr.clone(blade.stats), score: blade.score,
        rarity: blade.rarity, traits: (blade.traits || []).slice(),
      },
      opponent,
      faces: baseFaces(blade.stats),
      oppFaces: faceScores(opponent.stats),
      faceMods: { POWER: 0, CONTROL: 0, ART: 0 },
      momentum: 0,
      events,
      eventIndex: 0,
      fieldTest,
      log: [],
      done: false,
      result: null,
    },
  };
}

/* ── 事件三选一 ─────────────────────────────────────────── */

export function currentEvent(match) {
  return match.events[match.eventIndex] || null;
}

/**
 * 选择一个事件选项。
 * @returns {{ok:boolean, detail?:object, done?:boolean}}
 */
export function choose(match, choiceId) {
  if (match.done) return { ok: false, reason: '本场已结束' };
  const ev = currentEvent(match);
  if (!ev) return { ok: false, reason: '没有待处理事件' };
  const choice = ev.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: '选项不存在' };

  const face = FACE_OF_STAT[choice.mainStat] || 'POWER';
  const gain = CHOICE_GAIN[choice.kind] || 0.1;
  const statValue = match.blade.stats[choice.mainStat] || 0;
  const delta = (statValue / FACE_REF) * 100 * gain;
  match.faceMods[face] += delta;

  const before = match.momentum;
  match.momentum = clampMomentum(match.momentum + Math.round((choice.momentumDelta || 0) / 2));

  match.log.push({
    eventId: ev.id, eventName: ev.name, choiceId, choiceTitle: choice.title,
    kind: choice.kind, face, faceDelta: Math.round(delta * 10) / 10,
    momentumFrom: before, momentumTo: match.momentum,
  });

  match.eventIndex += 1;

  // 现场测试插入点：最后一个事件之前（V2.1 §19「是否出现及出现时机由赛事和事件规则决定」）
  if (match.fieldTest && !match.fieldTest.used && match.eventIndex === match.events.length - 1) {
    return { ok: true, detail: { event: ev, choice }, needFieldTest: true };
  }
  if (match.eventIndex >= match.events.length) {
    if (match.fieldTest && !match.fieldTest.used) return { ok: true, detail: { event: ev, choice }, needFieldTest: true };
    finish(match);
    return { ok: true, detail: { event: ev, choice }, done: true };
  }
  return { ok: true, detail: { event: ev, choice } };
}

/* ── 现场测试 ───────────────────────────────────────────── */

/** 生成测试题目（确定性） */
export function fieldTestTask(match) {
  if (!match.fieldTest || match.fieldTest.used) return null;
  const rng = RNG.stream(match.seed, 'fieldtest', match.fieldTest.type);
  const width = Math.max(0.08, 0.30 - (match.tier === 'apex' ? 2 : match.tier === 'national' ? 1 : 0) * 0.05);
  const center = 0.20 + rng() * 0.60;
  const def = FIELD_TESTS[match.fieldTest.type];
  return { type: def.id, name: def.name, face: def.face, center, width };
}

/**
 * 提交时机（0–1）。
 * ★ 只修正六维对抗分，不改永久六维 / 成刀评分 / 特性（V2.1 §19）。
 */
export function submitFieldTest(match, timing) {
  if (match.done) return { ok: false, reason: '本场已结束' };
  const task = fieldTestTask(match);
  if (!task) return { ok: false, reason: '本场没有待完成的现场测试' };
  const dist = Math.abs((Number(timing) || 0) - task.center);
  const tier = dist <= task.width * 0.5 ? 'perfect' : (dist <= task.width ? 'near' : 'fail');

  const MOD = { perfect: 15, near: 6, fail: -10 };
  const add = MOD[tier] * FIELD_TEST_MAX_INFLUENCE / FIELD_TEST_MAX_INFLUENCE; // 明确以常量为上限
  match.faceMods[task.face] += Math.max(-15, Math.min(FIELD_TEST_MAX_INFLUENCE * 100, add));

  const before = match.momentum;
  match.momentum = clampMomentum(match.momentum + (FIELD_TEST_MOMENTUM[tier] > 0 ? 1 : -1));

  match.fieldTest.used = true;
  match.fieldTest.result = { tier, task: { type: task.type, name: task.name, face: task.face }, timing: Number(timing) || 0 };
  match.log.push({ fieldTest: match.fieldTest.result, momentumFrom: before, momentumTo: match.momentum });

  if (match.eventIndex >= match.events.length) {
    finish(match);
    return { ok: true, result: match.fieldTest.result, done: true };
  }
  return { ok: true, result: match.fieldTest.result };
}

/** Convert the 2D field-test performance into the legacy timing input, preserving the established field-test influence and tournament settlement. */
export function submitFieldTestChallenge(match, performance) {
  if (match.done) return { ok: false, reason: '本场已结束' };
  const task = fieldTestTask(match);
  if (!task) return { ok: false, reason: '本场没有待完成的现场测试' };
  const evidence = performance?.risk;
  // 不信任旧快速局的 fractured/reason 标志，也不以低评级或低分替代结构证据。
  const fractured = hasStructuralFailure(performance);
  if (fractured) match.fractureInfo = {
    stageName: task.name, source: 'arena', matchId: match.id, bladeId: match.blade.id,
    reason: evidence.message, risk: '结构失效（非锻造Risk）',
    evidence: JSON.parse(JSON.stringify(evidence)),
  };
  const grade = String(performance?.grade || 'C').toUpperCase();
  const tier = ['S', 'A'].includes(grade) ? 'perfect' : grade === 'B' ? 'near' : 'fail';
  const deviation = tier === 'perfect' ? 0 : tier === 'near' ? task.width * .72 : task.width * 1.18;
  const direction = task.center + deviation <= 1 ? 1 : -1;
  const timing = Math.max(0, Math.min(1, task.center + direction * deviation));
  const submitted = submitFieldTest(match, timing);
  if (submitted.ok) {
    submitted.result.performance = {
      score: Math.max(0, Math.floor(Number(performance?.score) || 0)),
      grade, kills: Math.max(0, Math.floor(Number(performance?.kills) || 0)),
      maxCombo: Math.max(0, Math.floor(Number(performance?.maxCombo) || 0)),
      health: Math.max(0, Math.min(100, Math.floor(Number(performance?.health) || 0))),
      mode: performance?.mode || 'quick', fractured,
      risk: evidence ? JSON.parse(JSON.stringify(evidence)) : null,
      log: JSON.parse(JSON.stringify(performance?.log || [])),
    };
    const entry = match.log[match.log.length - 1];
    if (entry?.fieldTest) entry.fieldTest.performance = { ...submitted.result.performance };
    // submitFieldTest 可能已按事件进度完成；附加完整测试记录后统一重建结果。
    if (fractured || match.done) { finish(match); submitted.done = true; }
  }
  return submitted;
}

/** 跳过现场测试（玩家可放弃，按 miss 处理，不额外惩罚） */
export function skipFieldTest(match, performance = null) {
  if (match.done || !match.fieldTest || match.fieldTest.used) return { ok: false };
  if (performance?.fractured) return submitFieldTestChallenge(match, performance);
  match.fieldTest.used = true;
  match.fieldTest.result = { tier: 'skip', performance: performance ? JSON.parse(JSON.stringify(performance)) : null };
  match.log.push({ fieldTest: match.fieldTest.result });
  if (match.eventIndex >= match.events.length) { finish(match); return { ok: true, done: true }; }
  return { ok: true };
}

/* ── 结算 ───────────────────────────────────────────────── */

function clampMomentum(v) {
  return Math.max(-2, Math.min(2, v));
}

export function finalFaces(match) {
  const out = {};
  for (const face of Object.keys(FACES)) {
    const base = match.faces[face] || 0;
    const mod = match.faceMods[face] || 0;
    // Momentum 影响后续事件的收益窗口（V2.1 §18）：每档 ±2 分
    const mom = match.momentum * 2;
    out[face] = Math.max(0, Math.min(100, base + mod + mom));
  }
  return out;
}

function finish(match) {
  const mine = finalFaces(match);
  const theirs = match.oppFaces;
  const faceScore = (mine.POWER + mine.CONTROL + mine.ART) / 3;
  const oppFaceScore = (theirs.POWER + theirs.CONTROL + theirs.ART) / 3;

  const myScore = Math.max(0, match.blade.score || 0);
  const opScore = Math.max(0, match.opponent.score || 0);
  const scoreFace = (myScore + opScore) === 0 ? 50 : (myScore / (myScore + opScore)) * 100;

  const composite = faceScore * MATCH_WEIGHTS.face + scoreFace * MATCH_WEIGHTS.score;
  const oppComposite = oppFaceScore * MATCH_WEIGHTS.face + (100 - scoreFace) * MATCH_WEIGHTS.score;

  // V2.1 §15.2：综合分相同 → 先比六维对抗分；再相同 → 比 Momentum
  let win = composite > oppComposite;
  let tieBreak = null;
  if (Math.abs(composite - oppComposite) < 1e-9) {
    if (Math.abs(faceScore - oppFaceScore) > 1e-9) {
      win = faceScore > oppFaceScore;
      tieBreak = 'face';
    } else {
      win = match.momentum >= 0;
      tieBreak = 'momentum';
    }
  }

  if (match.fractureInfo) { win = false; tieBreak = null; }
  match.done = true;
  /* ★ 先四舍五入再分发给"结果"和"战报"。
     ⚠ 原来 result.composite 是 `Math.round(×10)/10`，而传给 buildReport 的是
       未圆的原值 —— 于是同一场比赛，大标题显示 70、战报正文写
       "综合分领先：69.53670261941448 对 18.88572162300976"。
       同一个数在两处不一致，比多一位小数更难解释。 */
  const r1 = (x) => Math.round(x * 10) / 10;

  match.result = {
    win,
    tieBreak,
    composite: r1(composite),
    oppComposite: r1(oppComposite),
    faceScore: r1(faceScore),
    oppFaceScore: r1(oppFaceScore),
    scoreFace: r1(scoreFace),
    faces: mine,
    oppFaces: theirs,
    momentum: match.momentum,
    momentumName: momentumName(match.momentum),
    /** 普通落败不触发断刀，实际结构失效才失去参赛资格。 */
    bladeDestroyed: false, // V4.1 match failure is temporary; never consume a collectible.
    fractureInfo: match.fractureInfo || null,
    canDestroy: ARENA_CAN_DESTROY_BLADE,
    report: buildReport(match, {
      win,
      composite: r1(composite),
      oppComposite: r1(oppComposite),
      faceScore: r1(faceScore),
      oppFaceScore: r1(oppFaceScore),
      scoreFace: r1(scoreFace),
      faces: mine,
    }),
  };
  return match.result;
}

export function momentumName(v) {
  const m = MOMENTUM.find((x) => x.value === v);
  return m ? m.name : '均势';
}

/** 战报（V2.1 §21.1）：回答为什么赢/输，不编造与计算无关的解释 */
function buildReport(match, r) {
  const faces = Object.entries(r.faces).sort((a, b) => b[1] - a[1]);
  const strongest = faces[0];
  const weakest = faces[faces.length - 1];

  const swing = match.log
    .filter((l) => l.momentumFrom !== l.momentumTo)
    .sort((a, b) => Math.abs(b.momentumTo - b.momentumFrom) - Math.abs(a.momentumTo - a.momentumFrom))[0] || null;

  /* ★ 战报是给玩家读的，对抗面一律出**中文名**（FACES[].name）。
     这里原来是裸的 face id（POWER / CONTROL / ART）—— 与页面上其余
     中文标签（力量 / 控制 / 表现）对不上，玩家看到的是"主要优势：POWER（88）"。
     纯文案修正，不改任何判定。 */
  const faceCn = (id) => (FACES[id] && FACES[id].name) || id;

  return {
    headline: match.fractureInfo ? '结构失效 · 断刀退赛' : r.win ? '取胜' : '失利',
    lines: [
      match.fractureInfo ? `结构失效退赛：${match.fractureInfo.reason}；综合分 ${r.composite} 对 ${r.oppComposite}`
        : `${r.win ? '综合分领先' : '综合分落后'}：${r.composite} 对 ${r.oppComposite}`,
      `主要优势：${faceCn(strongest[0])}（${Math.round(strongest[1])}）｜主要短板：${faceCn(weakest[0])}（${Math.round(weakest[1])}）`,
      `成刀评分带来的相对优势：${Math.round(r.scoreFace)} / 100`,
      swing ? `改变 Momentum 的关键选择：${swing.choiceTitle || swing.eventName || '现场测试'}` : '本场 Momentum 未出现明显转折',
      match.fieldTest && match.fieldTest.result
        ? `现场测试：${(FIELD_TESTS[match.fieldTest.result.task?.type] || {}).name || '测试'} — ${FIELD_TEST_TIER_CN[match.fieldTest.result.tier] || match.fieldTest.result.tier}`
        : '本场未出现现场测试',
    ],
    strongest: faceCn(strongest[0]),
    weakest: faceCn(weakest[0]),
    scoreAdvantage: Math.round(r.scoreFace),
  };
}

export default {
  createMatch, choose, currentEvent, fieldTestTask, submitFieldTest, submitFieldTestChallenge, skipFieldTest,
  finalFaces, baseFaces, momentumName,
};
