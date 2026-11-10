/**
 * 核心玩法层 · 锻造主流程（V2.1 §5 / §6 / §9）
 *
 * ★ 本文件是**唯一**的阶段推进与风险检查调度者。
 *   风险检查时机严格按 V2.1 §9.2：
 *     · S1 原料 —— 不检查；
 *     · S2/S3/S5/S6/S8/S9 —— 本阶段卡效果、Risk 增减、标签变化全部结算后检查一次；
 *     · S4 —— 每锤检查一次；**不再追加**阶段末检查；但一锤未打就结束时仍检查一次；
 *     · S7 —— 开刃卡 + 刃线模拟结算后检查一次；
 *     · S10 —— 鉴定，不检查。
 *   任何地方再自己写一份"什么时候掷断裂"都属于违规。
 *
 * 纯逻辑：不碰 DOM、不碰 Three.js。UI 只调用这里的方法并渲染返回的快照。
 */

import { STAGES, stageAt } from '../data/stages.js';
import { CR_START } from '../data/balance.js';
import * as RNG from '../platform/rng.js';
import * as Attr from './attributes.js';
import * as Risk from './risk.js';
import { noteSafeRisk } from './arenaV41Specialties.js';
import { effectiveRiskScale } from './arenaV41Growth.js';
import * as Tags from './tags.js';
import * as Cards from './cards.js';
import * as Traits from './traits.js';
import * as Combos from './combos.js';
import * as Hammer from './hammer.js';
import * as Edge from './edge.js';

export const PHASE = Object.freeze({
  SELECT: 'select',      // 选卡
  HAMMER: 'hammer',      // S4 自由锻打
  EDGE: 'edge',          // S7 刃线模拟
  APPRAISE: 'appraise',  // S10 鉴定
  FRACTURED: 'fractured',
  DONE: 'done',
});

/** 创建一局 */
export function createRun({
  seed = null,
  mode = 'normal',
  cr = CR_START,
  unlockedCardIds = null,
  workshopSnapshot = null,
  specialistSnapshot = null,
  daily = null,
} = {}) {
  const s = (seed != null ? (Number(seed) >>> 0) : ((Date.now() % 100000000) >>> 0));
  const run = {
    seed: s,
    mode,
    rng: RNG.stream(s, 'run'),
    stageIndex: 0,
    stageId: 'S1',
    phase: PHASE.SELECT,
    finished: false,
    fractured: false,
    fractureInfo: null,

    cr,
    rerollCountByStage: {},
    rerollTotal: 0,
    paidRerollsUsed: 0,
    workshop: workshopSnapshot ? {...workshopSnapshot} : null,
    specialist: specialistSnapshot ? JSON.parse(JSON.stringify(specialistSnapshot)) : null,

    candidates: [],
    history: [],

    stats: Attr.make(),
    risk: Risk.make(),
    peakRisk: 0,

    ledger: Tags.makeLedger(),
    completedStages: [],
    tagTiersCache: [],
    specialTagList: [],

    traits: [],
    traitSources: {},
    traitResonance: [],
    combos: [],
    comboDiscoveries: [],

    pendingSkin: {
      materialId: null, textureId: null, finishId: null,
      knifeType: null, handle: {}, wear: null, variants: {},
    },
    knifeTypeId: null,
    visualRecipe: [],

    hammer: Hammer.makeState(),
    edge: null,

    daily: daily ? { ...daily } : null,
    /* ★ rework T10.4：本局生效的内容解锁快照。
       必须存在 run 上，因为**重铸也会重抽候选**（core/cards.reroll），
       如果只在 createRun 时传一次，重铸后解锁权重就静默消失。
       只存 id 数组，不存 UI 状态，不写回存档。 */
    unlockedCardIds: Array.isArray(unlockedCardIds) ? unlockedCardIds.slice() : [],
    createdAt: Date.now(),
  };

  Traits.registerLegacyTraits();
  Cards.rollCandidates(run, { unlockedIds: unlockedCardIds });
  return run;
}

/** 刷新派生状态（标签档位 / 特殊标签）—— 每次写账本后调用 */
function refreshDerived(run) {
  run.tagTiersCache = Tags.baseTagTiers(run.ledger);
  run.specialTagList = Tags.specialTags(run.ledger);
}

/** 当前阶段定义 */
export const stageDef = (run) => stageAt(run.stageIndex);

/* ── 提交一张卡 ─────────────────────────────────────────── */

/**
 * 确认选卡（唯一提交点）。
 * @returns {{ok:boolean, phase:string, riskCheck?:object, fractured?:boolean}}
 */
export function confirmCard(run, card) {
  if (run.phase !== PHASE.SELECT) return { ok: false, reason: '当前不在选卡阶段' };

  const r = Cards.commit(run, card);
  if (!r.ok) return { ok: false, reason: r.reason };

  refreshDerived(run);
  Traits.settleSpecialTags(run);      // §8.2：特殊标签获得即登记
  Combos.evaluate(run);               // §8.3：隐藏 Combo 检测
  Traits.evaluateConditional(run);    // 卡池原有特性

  const def = stageDef(run);
  run.peakRisk = run.risk.peak;

  // S4 → 进入自由锻打（检查交给每锤）
  if (def.minigame === 'hammer') {
    run.phase = PHASE.HAMMER;
    return { ok: true, phase: run.phase };
  }
  // S7 → 进入刃线模拟（检查在提交后）
  if (def.minigame === 'edge') {
    run.phase = PHASE.EDGE;
    return { ok: true, phase: run.phase };
  }

  // S1 不检查（§9.2）
  if (!def.riskCheck) {
    advance(run);
    return { ok: true, phase: run.phase };
  }

  const check = checkRisk(run, def.id);
  if (check.fractured) return { ok: true, phase: run.phase, riskCheck: check, fractured: true };
  advance(run);
  return { ok: true, phase: run.phase, riskCheck: check };
}

/* ── S4 自由锻打 ───────────────────────────────────────── */

export function hammerStrike(run) {
  if (run.phase !== PHASE.HAMMER) return { ok: false, reason: '当前不在锻打阶段' };
  const res = Hammer.strike(run, run.rng);
  if (!res.ok) return res;
  run.peakRisk = run.risk.peak;
  if (res.fractured) {
    /* ★ 断刀记录必须记「这一锤实际用掉的概率」。
       每锤的判定发生在 Hammer.strike 内部（唯一判定入口），以前没有回写
       lastRiskCheck，markFractured 读到的还是上一个阶段的风险检查 ——
       断刀页于是出现「当时风险 30 / 断裂概率 5.6%」这种自相矛盾的组合。
       res.check 就是这一次 Risk.check 的原样结果，直接落账。 */
    run.lastRiskCheck = { stageId: 'S4', ...res.check };
    markFractured(run, 'S4', '额外锻打');
    return { ok: true, phase: run.phase, ...res };
  }
  return { ok: true, phase: run.phase, ...res };
}

export function endHammer(run) {
  if (run.phase !== PHASE.HAMMER) return { ok: false, reason: '当前不在锻打阶段' };
  const summary = Hammer.end(run);
  /* ★ V2.1 §9.2：「若 S4 一锤未打便直接结束锻打，仍在离开 S4 时进行一次风险检查，
       避免绕过该阶段的检查规则」 —— 打过锤的已经在每锤检查过，不再追加。 */
  if (run.hammer.count === 0) {
    const check = checkRisk(run, 'S4');
    if (check.fractured) {
      return { ok: true, phase: run.phase, hammer: summary, riskCheck: check, fractured: true };
    }
    advance(run);
    return { ok: true, phase: run.phase, hammer: summary, riskCheck: check };
  }
  advance(run);
  return { ok: true, phase: run.phase, hammer: summary };
}

/* ── S7 刃线模拟 ───────────────────────────────────────── */

/**
 * S7 刃线提交。
 * ★ rework T05：`opts.skipped` 允许玩家主动跳过（记 MISS），不强制描画卡住流程；
 *   真实采样由 UI 传入（未绘制的 index 不得被当成有效轨迹）。
 */
export function submitEdge(run, path, opts = {}) {
  if (run.phase !== PHASE.EDGE) return { ok: false, reason: '当前不在开刃阶段' };
  const edge = Edge.submit(run, path, { skipped: !!opts.skipped, projected: !!opts.projected, attemptsUsed: opts.attemptsUsed });
  run.peakRisk = run.risk.peak;
  const check = checkRisk(run, 'S7');
  if (check.fractured) {
    return { ok: true, phase: run.phase, edge, riskCheck: check, fractured: true };
  }
  advance(run);
  return { ok: true, phase: run.phase, edge, riskCheck: check };
}

/* ── 风险检查与阶段推进 ────────────────────────────────── */

function checkRisk(run, stageId) {
  const check = Risk.check(run.risk.current, run.rng, (run.daily?.breakScale || 1) * (1 - (run.workshop?.riskReduction || 0)));
  if (!check.fractured) noteSafeRisk(run,check.chance);
  run.lastRiskCheck = { stageId, ...check };
  if (check.fractured) markFractured(run, stageId, '风险检查失败');
  return check;
}

function markFractured(run, stageId, cause) {
  run.fractured = true;
  run.phase = PHASE.FRACTURED;
  run.finished = true;
  run.fractureInfo = {
    stageId,
    stageName: (STAGES.find((s) => s.id === stageId) || {}).name || stageId,
    risk: run.risk.current,
    peakRisk: run.risk.peak,
    chance: run.lastRiskCheck ? run.lastRiskCheck.chance : 0,
    cause,
  };
}

function advance(run) {
  run.stageIndex += 1;
  if (run.stageIndex >= STAGES.length - 1) {
    run.stageIndex = STAGES.length - 1;
    run.stageId = 'S10';
    run.phase = PHASE.APPRAISE;
    run.finished = true;
    run.candidates = [];
    return;
  }
  run.stageId = STAGES[run.stageIndex].id;
  run.phase = PHASE.SELECT;
  Cards.rollCandidates(run);
}

/* ── 只读快照（给 UI / 渲染用，不含可变引用） ────────────── */

export function snapshot(run) {
  return {
    seed: run.seed,
    mode: run.mode,
    stageIndex: run.stageIndex,
    stageId: run.stageId,
    stageName: stageDef(run).name,
    stageQuestion: stageDef(run).question,
    phase: run.phase,
    finished: run.finished,
    fractured: run.fractured,
    fractureInfo: run.fractureInfo ? { ...run.fractureInfo } : null,
    cr: run.cr,
    candidates: run.candidates.slice(),
    stats: Attr.clone(run.stats),
    statMean: Math.round(Attr.mean(run.stats) * 10) / 10,
    risk: { current: run.risk.current, peak: run.risk.peak },
    riskBand: Risk.band(run.risk.current),
    breakChance: Risk.breakChance(run.risk.current, effectiveRiskScale(run.workshop,
      run.stageId==='S4'&&run.specialist?.id==='press'?run.specialist.boost:0,run.daily?.breakScale||1)),
    breakPercent: Risk.breakPercent(run.risk.current, effectiveRiskScale(run.workshop,
      run.stageId==='S4'&&run.specialist?.id==='press'?run.specialist.boost:0,run.daily?.breakScale||1)),
    tags: Tags.counts(run.ledger),
    tagTiers: run.tagTiersCache.slice(),
    pendingTraits: Traits.pendingBaseTraits(run),
    traits: run.traits.slice(),
    combos: run.combos.slice(),
    hammer: { ...run.hammer },
    edge: run.edge ? { ...run.edge } : null,
    knifeTypeId: run.knifeTypeId,
    rerollCost: Cards.nextRerollCost(run),
  };
}

export default {
  PHASE, createRun, confirmCard, hammerStrike, endHammer, submitEdge, snapshot, stageDef,
};
