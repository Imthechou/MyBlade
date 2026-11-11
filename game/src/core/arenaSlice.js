/**
 * 核心层 · 切割赛事（单刀 / 组队 / 全国赛共用一套"多局 + buff"引擎）
 *
 *   单刀赛   ：1 把刀 × 3 局 × 35 秒，逐局 buff，三局两胜
 *   组队赛   ：3 把刀 × 各 1 局，buff 绑刀（本命 + 自选），断刀可换刀继续，三局两胜
 *   全国赛   ：1 把刀 × 5 轮 × 35 秒，buff 跨轮累积但最多带 3 个（超出替换最早的），一败淘汰
 *
 * 切割本身仍由 core/arenaChallenge.js 跑；这里只管赛事结构与幽灵分。
 */
import { rollBuffChoices, BUFF_BY_ID } from '../data/arena/buffs.js';
import * as Arena from './arena.js';
import * as Challenge from './arenaChallenge.js';
import { deriveCutParams, deriveCutParamsForBlade } from './cutParams.js';
import { adaptBlade } from './bladeAdapter.js';

export const SLICE_SECONDS = 45;
export const GHOST_BASE = Object.freeze({ school: 4200, national: 5000, apex: 5800 });

/** 三种赛事的结构参数 */
const KINDS = Object.freeze({
  single: { runs: 3, base: null, mult: [0.85, 1.0, 1.2], cap: null, perBlade: false },
  team: { runs: 3, base: 3400, mult: [0.90, 1.0, 1.1], cap: null, perBlade: true },
  national: { runs: 5, base: 5200, mult: [0.85, 0.95, 1.05, 1.15, 1.3], cap: 3, perBlade: false },
});

/** 本命 buff：按这把刀最高的那项属性给一个开局强化（锻造的第二重意义） */
const SIGNATURE_BY_STAT = Object.freeze({
  strength: 'layerbreak',   // 破层
  sharpness: 'withgrain',   // 顺纹
  toughness: 'cladsteel',   // 包钢
  craft: 'sharpening',      // 开刃
  design: 'grindwheel',     // 砂轮
  spirit: 'bloodgroove',    // 血槽
});

/**
 * 连胜倍率上限（rework T03）。
 *
 * ★ 改造前：`finishRun` 无条件 `winStreak *= 1.15`，而 buff 表里的
 *   `artisansoul`（匠魂）又声明了 `winStreakMult: 1.15` ——
 *   同一个“赢一局就 +15%”有两个来源，但 buff 那个从头到尾没有消费者，
 *   玩家选它只有文案变化（审计问题 6 的第三条）。
 *
 * ★ 现在：连胜增长**只**由持有 `winStreakMult` 的 buff 驱动；没持有就恒为 1。
 *   `cutParams.winStreakMult` 是唯一配置入口，本文件是唯一消费者。
 */
export const WIN_STREAK_CAP = 1.32;

/** 当前这局应携带的连胜倍率（只看**当前出战刀**持有的 buff） */
export function winStreakFactorOf(buffs = []) {
  const m = deriveCutParams({}, buffs).winStreakMult;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rngOf(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function signatureOf(stats) {
  let best = 'sharpness';
  for (const k of Object.keys(SIGNATURE_BY_STAT)) if ((Number(stats?.[k]) || 0) > (Number(stats?.[best]) || 0)) best = k;
  return SIGNATURE_BY_STAT[best];
}

function bladeView(blade) {
  const view = adaptBlade(blade);
  return {
    id: view.bladeId || blade.id,
    name: blade.bladeName || blade.name || blade.id,
    score: Number(blade.score) || 0,
    stats: { ...view.permanentStats },
    capabilities: { ...view.capabilities },
    knifeTypeId: view.knifeTypeId,
    knifeTypeName: view.knifeTypeName,
    knifeProfileLabel: view.knifeProfileLabel,
    projectFactor: { ...view.projectFactor },
    traits: Array.isArray(blade.traits) ? blade.traits.slice() : [],
    combos: Array.isArray(blade.combos) ? blade.combos.slice() : [],
    effectSummary: view.effectSummary.map((e) => ({ ...e })),
    adapterVersion: view.version,
    effectVersion: view.effectVersion,
    rarityName: blade.rarityName || null,
    fractured: false,
  };
}

/**
 * @param {object} o
 * @param {object|object[]} o.blade    单刀：一把；组队：三把（或用 o.blades）
 * @param {'single'|'team'|'national'} o.kind
 */
export function createSliceMatch({ blade = null, blades = null, kind = 'single', tier = 'school', styleId = null, gradient = 0, theme = null, seed = null } = {}) {
  const list = Array.isArray(blades) ? blades : (blade ? [blade] : []);
  if (!list.length) return { ok: false, reason: '找不到这把刀' };
  const bad = list.find((b) => !b || b.fractured || b.canEnterArena === false);
  if (bad) return { ok: false, reason: '有刀已失去参赛资格' };
  if (kind === 'team' && list.length < 3) return { ok: false, reason: '组队赛需要三把不同的刀' };
  const conf = KINDS[kind] || KINDS.single;

  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  // 对手仍走原来的生成器（纯函数），只取对手对象
  const probe = Arena.createMatch({ blade: list[0], tier, styleId, gradient, seed: actualSeed, theme });
  const opponent = probe?.ok ? probe.match.opponent : { name: '轮空对手', score: 250 };
  const oppScore = Number(opponent?.score) || 250;
  const oppFactor = clamp(1 + (oppScore - 250) / 500, 0.85, 1.15);
  const base = conf.base ?? (GHOST_BASE[tier] ?? GHOST_BASE.school);
  const ghosts = conf.mult.map((k) => Math.round(base * k * oppFactor));

  const roster = list.map((b) => {
    const view = bladeView(b);
    view.signature = signatureOf(view.stats);
    view.buffs = conf.perBlade ? [view.signature] : [];
    return view;
  });

  const match = {
    id: `M-${actualSeed.toString(36)}-${Date.now().toString(36)}`,
    kind, tier, styleId, gradient, theme,
    blades: roster,
    blade: roster[0],                 // 当前这局用的刀（UI 直接读这个）
    opponent: { name: opponent?.name || '对手', score: oppScore },
    seed: actualSeed, rngState: actualSeed || 1,
    runs: [], ghosts,
    runIndex: 0,
    buffs: conf.perBlade ? roster[0].buffs : [],   // 指向当前刀的数组（组队）或本场数组
    offers: [], phase: conf.perBlade ? 'dispatch' : 'buff',
    done: false, result: null, fractured: false,
    wins: 0, losses: 0, winStreak: 1,
    bladeOrder: [],
    startedAt: Date.now(),
  };
  if (match.phase === 'buff') match.offers = rollBuffChoices(rngOf(match.rngState++), match.buffs, 3);
  return { ok: true, match };
}

/** 当前这一局该打的幽灵分 */
export function ghostOf(match, index = match.runIndex) {
  return match.ghosts[Math.min(index, match.ghosts.length - 1)];
}

/** 组队赛：还没被打断的刀 */
export function availableBlades(match) {
  if (!match) return [];
  const used = new Set(match.bladeOrder);
  return match.blades.filter((b) => !b.fractured && !used.has(b.id));
}

/** 组队赛：派这一局出战的刀 */
export function dispatchBlade(match, bladeId) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  if (match.kind !== 'team' || match.phase !== 'dispatch') return { ok: false, reason: '现在不能派刀' };
  const pool = availableBlades(match);
  const picked = pool.find((b) => b.id === bladeId) || pool[0];
  if (!picked) return { ok: false, reason: '没有可出战的刀' };
  match.blade = picked;
  match.buffs = picked.buffs;
  match.bladeOrder.push(picked.id);
  match.phase = 'buff';
  match.offers = rollBuffChoices(rngOf(match.rngState++), match.buffs, 3);
  return { ok: true, blade: picked, offers: match.offers };
}

/** 选一个 buff（组队：绑到当前刀；全国：跨轮累积，超过 3 个替换最早的） */
export function pickBuff(match, id) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  if (match.phase !== 'buff') return { ok: false, reason: '现在不能选强化' };
  const pick = id || match.offers[0];
  if (!pick || !match.offers.includes(pick)) return { ok: false, reason: '这个强化不在本次候选里' };
  const cap = KINDS[match.kind]?.cap;
  let replaced = null;
  if (cap && match.buffs.length >= cap) replaced = match.buffs.shift();
  match.buffs.push(pick);
  match.lastPick = pick;
  match.phase = 'run';
  return { ok: true, buff: BUFF_BY_ID[pick] || null, owned: [...match.buffs], replaced };
}

/** 开局：交给 arenaChallenge 跑一局 35 秒 */
export function startRun(match, { seed = null } = {}) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  if (match.phase !== 'run') return { ok: false, reason: '请先完成赛前强化' };
  if (match.activeRun && !match.activeRun.done) return { ok: true, run: match.activeRun, ghost: match.activeRun.ghost };
  const ghost = ghostOf(match);
  const created = Challenge.createChallenge(match.blade, {
    seed: seed == null ? (match.seed + match.runIndex * 7919) >>> 0 : seed,
    mode: 'formal',
    buffs: match.buffs,
    ghost,
    winStreak: match.winStreak,
    matchId: match.id,
  });
  if (!created.ok) return created;
  created.run.runIndex = match.runIndex;
  created.run.runBladeName = match.blade.name;
  match.activeRun = created.run;
  return { ok: true, run: created.run, ghost };
}

/** 一局打完：记账、判单局胜负、决定下一步 */
export function finishRun(match, performance) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  if (!performance) return { ok: false, reason: '缺少本局成绩' };
  const C = KINDS[match.kind] || KINDS.single;
  const index = match.runIndex;
  const ghost = ghostOf(match, index);
  const score = Math.floor(Number(performance.score) || 0);
  const win = !performance.fractured && score >= ghost;
  const run = {
    index, score, ghost, win,
    bladeId: match.blade.id, bladeName: match.blade.name,
    grade: performance.grade, kills: performance.kills, maxCombo: performance.maxCombo,
    bestSwipe: performance.bestSwipe, health: performance.health, maxHealth: performance.maxHealth,
    misses: performance.misses, frenzy: performance.frenzy,
    fractured: !!performance.fractured, buffs: [...(performance.buffs || [])],
  };
  match.runs.push(run);
  match.activeRun = null;
  match.runIndex = index + 1;
  if (win) {
    match.wins += 1;
    /* ★ rework T03：连胜倍率只由 buff 驱动。
       未持有「匠魂」（winStreakMult）时保持 1 ——
       不要再无条件 ×1.15，否则 buff 文案与结算无关，且玩家无法从结果学习规则。 */
    const factor = winStreakFactorOf(performance.buffs || match.buffs || []);
    match.winStreak = factor > 1
      ? Math.min(WIN_STREAK_CAP, (match.winStreak || 1) * factor)
      : 1;
  } else { match.losses += 1; match.winStreak = 1; }

  if (run.fractured) {
    match.fractured = true;
    const blade = match.blades.find((b) => b.id === run.bladeId);
    // V4.1: do not mutate the roster or permanent blade after a round failure.
    match.fracturedBlades = [...(match.fracturedBlades || []), run.bladeId];
  }
  match.phase = 'runResult';
  match.lastRun = run;

  const finished = C.perBlade
    ? match.runIndex >= C.runs                                  // 组队：三局都打完
    : (match.runIndex >= C.runs || (match.kind === 'national' && !win));  // 全国：一败即淘汰
  match.pendingOffers = finished ? null : rollBuffChoices(rngOf(match.rngState++), match.buffs, 3);
  match.finishedRuns = finished;
  return { ok: true, run, done: false };
}

function buildResult(match, reason) {
  const runs = match.runs;
  const wins = runs.filter((r) => r.win).length;
  const losses = runs.length - wins;
  const total = runs.reduce((a, r) => a + r.score, 0);
  const totalGhost = runs.reduce((a, r) => a + r.ghost, 0);
  let win;
  if (match.kind === 'national') win = runs.length > 0 && runs.every((r) => r.win) && runs.length >= KINDS.national.runs;
  else win = wins > losses || (wins === losses && total >= totalGhost);
  if (reason === 'fracture' && match.kind === 'national') win = false;
  const best = runs.slice().sort((a, b) => b.score - a.score)[0] || null;
  return {
    win, wins, losses, reason,
    score: total, ghost: totalGhost,
    runs: runs.slice(),
    buffs: [...(match.buffs || [])],
    allBuffs: match.blades.map((b) => ({ bladeId: b.id, bladeName: b.name, buffs: [...b.buffs] })),
    bestRun: best ? best.index : null,
    bestSwipe: runs.reduce((a, r) => Math.max(a, r.bestSwipe || 0), 0),
    maxCombo: runs.reduce((a, r) => Math.max(a, r.maxCombo || 0), 0),
    fractured: !!match.fractured,
    fracturedBlades: [...(match.fracturedBlades || [])],
    opponent: match.opponent,
  };
}

/** 单局结算看完 → 下一局（组队回派刀，其余回强化） */
export function nextRun(match) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  if (match.phase !== 'runResult') return { ok: false, reason: '还没看完本局结算' };
  if (match.finishedRuns) {
    match.done = true;
    match.phase = 'done';
    const reason = match.kind === 'national' && match.losses > 0 ? 'eliminated'
      : match.fractured ? 'fracture' : 'complete';
    match.result = buildResult(match, reason);
    return { ok: true, done: true, result: match.result };
  }
  if (match.kind === 'team') {
    // 还有刀能用 → 回派刀；全断了 → 剩下的轮次按缺席负直接收场
    const pool = availableBlades(match);
    if (!pool.length) {
      match.done = true;
      match.phase = 'done';
      match.result = buildResult(match, 'no-blades');
      return { ok: true, done: true, result: match.result };
    }
    match.phase = 'dispatch';
    match.offers = [];
    return { ok: true, dispatch: true, blades: pool };
  }
  match.phase = 'buff';
  match.offers = match.pendingOffers || rollBuffChoices(rngOf(match.rngState++), match.buffs, 3);
  match.pendingOffers = null;
  return { ok: true, offers: match.offers };
}

/** 组队赛：本轮没有可用刀 → 记为缺席负并跳过 */
export function forfeitRound(match) {
  if (!match || match.kind !== 'team' || match.phase !== 'dispatch') return { ok: false, reason: '现在不能记缺席' };
  const index = match.runIndex;
  const ghost = ghostOf(match, index);
  const run = { index, score: 0, ghost, win: false, bladeId: null, bladeName: '缺席', grade: 'C',
    kills: 0, maxCombo: 0, bestSwipe: 0, health: 0, maxHealth: 0, misses: 0, frenzy: 0,
    fractured: false, buffs: [], forfeit: true };
  match.runs.push(run);
  match.runIndex = index + 1;
  match.losses += 1;
  match.winStreak = 1;
  match.phase = 'runResult';
  match.lastRun = run;
  match.finishedRuns = match.runIndex >= KINDS.team.runs;
  match.pendingOffers = null;
  return { ok: true, run };
}

/** 当前这一局的实际手感参数（UI 的「本刀参数」卡用） */
export function currentParams(match) {
  const caps = match?.blade?.capabilities || match?.blade?.stats || {};
  return deriveCutParams(caps, match?.buffs || []);
}

export default {
  createSliceMatch, ghostOf, pickBuff, startRun, finishRun, nextRun, dispatchBlade,
  availableBlades, forfeitRound, currentParams, winStreakFactorOf, WIN_STREAK_CAP,
  SLICE_SECONDS, GHOST_BASE, SIGNATURE_BY_STAT,
};
