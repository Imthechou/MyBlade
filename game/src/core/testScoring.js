/**
 * 核心层 · 多项目测试计分（rework T06）
 *
 * ★ 要修什么（审计问题 4）：
 *   改造前主入口 `Game.startSliceMatch()` → `arenaSlice`，单刀赛是**三次 35 秒切割**
 *   加逐局 buff 三选一。六流派同刀同种子实验得到完全相同的目标分与首批靶具。
 *   `arenaSuite.js` 虽然存在切割/精度/强度编排，但主入口从没使用它，
 *   而且它的 aggregation 是空的（提交时沿用旧切割桥接分）。
 *
 * ★ 本文件解决「合成分」这一半：
 *   把每一项测试的**原始测量**规范化成 0–100+ 的项目分，再按赛事定义合成。
 *   · 鉴定分只作展示/匹配参考，**不能**直接替代测试成绩；
 *   · 权重集中在赛事定义里，并带版本号；
 *   · 每项都输出原始测量、规范化分、适配依据与临时状态，便于赛报解释胜负。
 *
 * ★ 明确不做（沿用 FORMAL_RISK_TBD）：
 *   不在这里套锻造 Risk 表，不补猜的永久断刀概率。
 *   这里只处理「临时失效 / 临时损伤」这一层，且结果可解释。
 */

import { TEST_PROJECTS, testScoreOfRatio, TEST_REF, TEST_WEIGHTS_DEFAULT } from '../data/balance.js';
import { projectCapabilityMean } from './bladeAdapter.js';

/** 计分规则版本：改公式/参考值/权重都要升版本，历史成绩标注旧版本 */
export const TEST_SCORING_VERSION = 'test-score-1';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 一次测试会话。
 * @param {object} o
 * @param {object} o.view    adaptBlade() 的结果
 * @param {string[]} o.tests 项目 id 序列（2–3 项）
 * @param {object} [o.weights] 项目权重，缺省等权
 */
export function createTestSession({ view, tests, weights = null, seed = null } = {}) {
  const list = Array.isArray(tests) ? tests.filter((t) => TEST_PROJECTS[t]) : [];
  if (!view || !list.length) return { ok: false, reason: '缺少成刀能力或测试项目' };
  const w = normalizeWeights(weights, list);
  return {
    ok: true,
    version: TEST_SCORING_VERSION,
    adapterVersion: view.version,
    effectVersion: view.effectVersion,
    bladeId: view.bladeId,
    seed: seed == null ? null : Number(seed) >>> 0,
    tests: list,
    weights: w,
    entries: list.map((kind) => ({
      kind,
      name: TEST_PROJECTS[kind].name,
      status: 'pending',
      result: null,
    })),
    index: 0,
    submitted: false,
  };
}

function normalizeWeights(weights, list) {
  const out = {};
  if (weights && typeof weights === 'object' && !Array.isArray(weights)) {
    let sum = 0;
    for (const k of list) sum += Math.max(0, num(weights[k]));
    if (sum > 0) {
      for (const k of list) out[k] = Math.max(0, num(weights[k])) / sum;
      return out;
    }
  }
  for (const k of list) out[k] = 1 / list.length;
  return out;
}

export const currentTest = (session) => session?.entries?.[session.index] || null;

/**
 * 结算一项测试。
 *
 * @param {object} session
 * @param {object} o
 * @param {string} o.kind        项目 id（必须等于当前项）
 * @param {number} o.measure     原始测量（0–1 的操作质量 / 或已归一的原始值）
 * @param {object} [o.detail]    原始测量明细（命中数、偏差、承载等）
 * @param {number} [o.temporaryDamage] 本项造成的临时损伤（0–1）
 * @param {boolean} [o.failed]   是否临时结构失效（不等于永久断刀）
 * @param {object} o.view        adaptBlade() 结果（用于适配依据）
 */
export function settleTest(session, view, { kind, measure, detail = {}, temporaryDamage = 0, failed = false } = {}) {
  if (!session || session.submitted) return { ok: false, reason: '本场测试已结算' };
  const entry = currentTest(session);
  if (!entry) return { ok: false, reason: '没有待完成的测试项' };
  if (kind && kind !== entry.kind) return { ok: false, reason: '当前不是这个测试项' };
  if (!view) return { ok: false, reason: '缺少成刀能力' };

  /* ── 原始测量 → 能力利用率 ──
     measure 是操作质量（0–1），代表玩家把「这把刀的理论能力」发挥了多少。 */
  const utilization = clamp(num(measure), 0, 1);
  /* ── 适配依据：本项主判定六维的能力均值 + 项目适配系数 ── */
  const capability = projectCapabilityMean(view, entry.kind);
  const ref = TEST_REF[entry.kind] || 100;
  const factor = num(view.projectFactor?.[entry.kind]?.value) || 1;
  /** 有效能力 = 能力均值 × 项目适配系数 */
  const effective = capability * factor;
  /** 比值 → 项目分（0–100 软上限，允许少量溢出） */
  const ratioScore = testScoreOfRatio(effective / ref);
  /* ★ rework T06：操作利用率必须真的参与得分，且零操作必须为 0。
     初版写的是 `ratioScore × (0.35 + 0.65 × utilization)`，
     于是“一下都不操作”也能拿到能力分的 35%（实测 41.3 分），
     与“测试验证这把刀的表现”直接矛盾 —— 玩家不动手也能得分。
     现在改为 `ratioScore × utilization`，并保留一个极小的能力底线
     （utilization=0 → 0 分），使“不做”与“做得好”可区分。 */
  const score = failed ? 0 : round1(ratioScore * utilization);

  const result = {
    kind: entry.kind,
    name: entry.name,
    score,
    failed: !!failed,
    raw: {
      measure: round1(utilization * 1000) / 1000,
      capability: round1(capability),
      effective: round1(effective),
      ratio: round1(effective / Math.max(1e-6, ref) * 1000) / 1000,
      ratioScore: round1(ratioScore),
    },
    adaptation: {
      projectFactor: factor,
      knifeFactor: view.projectFactor?.[entry.kind]?.knife ?? 1,
      traitFactor: view.projectFactor?.[entry.kind]?.trait ?? 1,
      stats: [...(TEST_PROJECTS[entry.kind].stats || [])],
      effects: (view.effectSummary || []).filter((e) => e.project === entry.kind),
    },
    temporaryDamage: round1(clamp(num(temporaryDamage), 0, 1) * 1000) / 1000,
    detail: safe(detail),
    version: TEST_SCORING_VERSION,
  };

  entry.result = result;
  entry.status = 'complete';
  if (failed) {
    // 临时失效：本项 0 分，后续项标记未进行（不是永久断刀）
    for (const next of session.entries.slice(session.index + 1)) next.status = 'not-run';
    session.aborted = 'temporary-failure';
    return { ok: true, result, aborted: true };
  }
  return { ok: true, result };
}

function safe(v) {
  try { return JSON.parse(JSON.stringify(v || {})); } catch (_) { return {}; }
}

/** 推进到下一项（当前项必须已完成） */
export function advance(session) {
  const entry = currentTest(session);
  if (!session || session.submitted || !entry) return false;
  if (entry.status !== 'complete') return false;
  if (session.index >= session.entries.length - 1) return false;
  session.index += 1;
  return true;
}

export const allComplete = (session) =>
  !!session && session.entries.every((e) => e.status === 'complete');

/**
 * 赛事合成（T06.4）。
 *
 * ★ 只消费**有效项目结果**：缺项或临时失效项按 0 计，不能用其余项的分数冒充。
 * ★ 合成 = Σ(项目分 × 权重)，权重来自赛事定义并已归一。
 * ★ 明确不用旧的 70/10/20 或 70:30 —— 那是旧桥接口径。
 */
export function aggregate(session) {
  if (!session) return null;
  const done = session.entries.filter((e) => e.status === 'complete');
  const missing = session.entries.filter((e) => e.status !== 'complete');
  let composite = 0;
  for (const e of session.entries) {
    const w = session.weights[e.kind] ?? 0;
    composite += (e.result?.score || 0) * w;
  }
  const totalDamage = round1(session.entries.reduce(
    (a, e) => a + num(e.result?.temporaryDamage), 0) * 100) / 100;
  return {
    version: session.version,
    composite: round1(composite),
    completed: done.length,
    missing: missing.map((e) => ({ kind: e.kind, name: e.name, status: e.status })),
    aborted: session.aborted || null,
    projectScores: session.entries.map((e) => ({
      kind: e.kind, name: e.name, score: e.result?.score ?? null,
      failed: !!e.result?.failed, status: e.status,
    })),
    weights: { ...session.weights },
    temporaryDamage: totalDamage,
    /** 最强/最弱项 —— 赛报「不足对应哪类能力」的依据 */
    strongest: pick(done, (a, b) => (b.result.score - a.result.score)),
    weakest: pick(done, (a, b) => (a.result.score - b.result.score)),
  };
}

function pick(list, cmp) {
  if (!list.length) return null;
  const best = list.slice().sort(cmp)[0];
  return { kind: best.kind, name: best.name, score: best.result.score };
}

/**
 * 赛事判定：合成分 vs 目标分。
 * @param {object} agg   aggregate() 结果
 * @param {number} target 目标分（由赛事定义与梯度给）
 */
export function judge(agg, target) {
  if (!agg) return { ok: false, reason: '没有有效成绩' };
  const t = Math.max(1, num(target));
  const win = agg.composite >= t;
  return {
    ok: true,
    win,
    composite: agg.composite,
    target: t,
    margin: round1(agg.composite - t),
    ratio: round1((agg.composite / t) * 1000) / 1000,
  };
}

/** 标准化目标分：把「参考能力 × 难度」换算成合成分量级 */
export function targetScoreOf({ base = 60, gradient = 0, step = 6 } = {}) {
  return round1(Math.max(1, num(base) + Math.max(0, gradient | 0) * num(step)));
}

export default {
  TEST_SCORING_VERSION, createTestSession, currentTest, settleTest, advance,
  allComplete, aggregate, judge, targetScoreOf, TEST_WEIGHTS_DEFAULT,
};
