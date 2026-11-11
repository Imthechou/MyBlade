/** 正式单刀赛多类型原型。只编排操作，不定义新的合成分、权重或风险规则。 */
import * as Arena from './arena.js';
import { hasStructuralFailure } from './arenaChallenge.js';

export const DEFAULT_FORMAL_TESTS = Object.freeze(['cutting', 'precision', 'strength']);
export const FORMAL_TEST_NAMES = Object.freeze({ cutting: '切割', precision: '精度／技巧', strength: '结构／强度' });
export const SUITE_POLICY = Object.freeze({
  provisional: true, defaultCount: 3, scoreSource: 'existing-cutting-bridge',
  aggregation: null, crossTestDamage: null, probabilityCurve: null, withdrawalPolicy: null,
});
const copy = value => JSON.parse(JSON.stringify(value));

// Keep the legacy suite-only APIs without serializing a circular match reference.
// Match-taking entry points also bind suites restored from JSON.
const owners = new WeakMap();
function bindSuite(match) {
  const suite = match?.formalPerformance;
  if (suite) owners.set(suite, match);
  return suite;
}
function isClosed(suite) {
  const match = suite && owners.get(suite);
  return !suite || suite.submitted || suite.abandoned
    || !!(match && (match.done || match.fieldTest?.used || match.formalPerformance !== suite));
}

export function createSuite(match, { tests = DEFAULT_FORMAL_TESTS } = {}) {
  if (bindSuite(match)) return { ok: false, reason: '本场已有正式测试记录' };
  if (!match || match.done || !match.fieldTest || match.fieldTest.used) return { ok: false, reason: '没有待完成的正式测试' };
  if (!Array.isArray(tests) || tests.length < 2 || tests.length > 3 || tests[0] !== 'cutting'
    || new Set(tests).size !== tests.length || tests.some(kind => !DEFAULT_FORMAL_TESTS.includes(kind))) {
    return { ok: false, reason: '暂定原型支持切割在前的 2–3 个不同项目' };
  }
  const suite = { version: 1, policy: { ...SUITE_POLICY }, started: false, index: 0,
    bladeId: match.blade.id, entries: tests.map(kind => ({ kind, name: FORMAL_TEST_NAMES[kind], status: 'pending', result: null })),
    cutPerformance: null, cutDiagnostics: [], operation: null, submitted: false, abandoned: false };
  match.formalPerformance = suite;
  bindSuite(match);
  return { ok: true, suite };
}
export function currentSuiteTest(suite) { return suite?.entries?.[suite.index] || null; }
export function startSuite(match) {
  const suite = bindSuite(match);
  if (isClosed(suite) || suite.bladeId !== match.blade.id || Arena.currentEvent(match)) return false;
  suite.started = true; return true;
}
export function addCutDiagnostic(suite, diagnostic) {
  if (isClosed(suite) || suite.cutPerformance || !diagnostic) return false;
  suite.cutDiagnostics.push(copy(diagnostic));
  if (suite.cutDiagnostics.length > 80) suite.cutDiagnostics.shift();
  return true;
}
export function captureCut(suite, performance) {
  const entry = currentSuiteTest(suite);
  if (isClosed(suite) || !suite.started || suite.cutPerformance || entry?.kind !== 'cutting'
    || entry.status !== 'pending' || !performance || performance.mode !== 'formal') return false;
  suite.cutPerformance = copy(performance);
  entry.status = 'complete';
  entry.result = { grade: performance.grade, kills: performance.kills, score: performance.score,
    health: performance.health, diagnostics: copy(suite.cutDiagnostics),
    message: `切断 ${performance.kills} 个靶具；切割评级 ${performance.grade}。${performance.risk?.message || ''}` };
  if (hasStructuralFailure(performance)) for (const next of suite.entries.slice(1)) next.status = 'not-run';
  return true;
}
export function recordSuiteOperation(suite, result) {
  const entry = currentSuiteTest(suite);
  if (isClosed(suite) || !suite.started || entry?.kind === 'cutting' || entry?.status !== 'pending'
    || !result || result.type !== entry.kind || result.submitted !== true) return false;
  entry.result = copy(result); entry.status = 'complete'; return true;
}
export function advanceSuite(suite) {
  const entry = currentSuiteTest(suite);
  if (isClosed(suite) || !entry || entry.status !== 'complete' || suite.index >= suite.entries.length - 1) return false;
  suite.index++; suite.operation = null; return true;
}
export function suiteSummary(suite) {
  return { version: suite.version, policy: copy(suite.policy), bladeId: suite.bladeId,
    entries: copy(suite.entries), cutDiagnostics: copy(suite.cutDiagnostics), abandoned: !!suite.abandoned };
}
/** 唯一一次旧桥接：旧切割分档/现场修正/70:30/CR 全不动。新增两项不凭空折算成分数。 */
export function submitSuite(match) {
  const suite = bindSuite(match);
  if (isClosed(suite) || suite.bladeId !== match.blade.id || !suite.cutPerformance || Arena.currentEvent(match)) return { ok: false, reason: '参赛刀不一致，或尚未完成赛前策略与实际测试' };
  const fracture = hasStructuralFailure(suite.cutPerformance);
  if (!fracture && !suite.entries.every(entry => entry.status === 'complete')) return { ok: false, reason: '请完成全部原型测试' };
  const submitted = Arena.submitFieldTestChallenge(match, suite.cutPerformance);
  if (submitted.ok) {
    suite.submitted = true;
    submitted.result.performance.tests = suiteSummary(suite);
  }
  return submitted;
}
/** 放弃沿用既有 skip；这里只附履历，不加罚、不抹除已经发生的本项受力。 */
export function annotateAbandonedSuite(match) {
  const suite = bindSuite(match);
  // skipFieldTest may already have ended the match; its first annotation is valid.
  if (!suite || suite.submitted || suite.abandoned) return;
  if ((match.done || match.fieldTest?.used) && match.fieldTest?.result?.tier !== 'skip') return;
  suite.abandoned = true;
  for (const entry of suite.entries) if (entry.status === 'pending') entry.status = 'not-run';
  const performance = match.fieldTest?.result?.performance;
  if (performance) performance.tests = suiteSummary(suite);
}
