/**
 * provisional v1：快速挑战个人纪录（与锻造 dailyScores、正式赛事完全隔离）。
 * 当前 quick 没有独立 challengeId/themeId；不使用每局 C-* ID 冒充挑战 ID。
 * 分组规则 provisional：自由快赛共用 quick:free；每日按现有固定 seed 分组。
 * 路线/压轴是局内选择，不另分榜；不按刀、随机 seed、分数或每局 ID 堆历史。
 * 每个挑战仅 bestScore + 最近一次紧凑摘要；将来有正式主题 ID 时再显式迁移。
 */
import { CHALLENGE_SECONDS } from './arenaChallenge.js';

export const makeQuickRecords = () => ({ version: 1, provisional: true, byChallenge: {} });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validKey = key => /^quick:(v3:|v41:)?free$/.test(key) || /^quick:(v3:|v41:)?daily:\d+$/.test(key);

/** 加法迁移：同版旧档缺字段/空字段补齐，不触碰其他存档数据，不捏造旧成绩。 */
export function normalizeQuickRecords(raw) {
  const out = makeQuickRecords();
  if (!object(raw) || !object(raw.byChallenge)) return out;
  for (const [key, entry] of Object.entries(raw.byChallenge)) {
    if (!validKey(key) || !object(entry) || !Number.isFinite(entry.bestScore) || entry.bestScore < 0) continue;
    const record = { bestScore: entry.bestScore };
    const last = entry.last;
    if (object(last) && Number.isFinite(last.score) && last.score >= 0
      && ['S', 'A', 'B', 'C'].includes(last.grade) && typeof last.runId === 'string') {
      record.last = { runId: last.runId, score: last.score, grade: last.grade };
    }
    out.byChallenge[key] = record;
  }
  return out;
}

export function quickChallengeKey(run) {
  if (!run || (run.mode != null && run.mode !== 'quick')) return null;
  const prefix=run.rulesVersion==='arena-v4.1'?'quick:v41:':run.version==='arena-3'?'quick:v3:':'quick:';
  if (!run.daily) return prefix+'free';
  return Number.isInteger(run.seed) && run.seed >= 0 && run.seed <= 0xffffffff
    ? `${prefix}daily:${run.seed}` : null;
}

export function updateQuickRecord(records, run) {
  const key = quickChallengeKey(run), result = run?.result;
  if (!key || !run.done || !result || (result.mode != null && result.mode !== 'quick')) return false;
  // V4.1 只在完整 45 秒结束后记纪录；旧版本仍能兼容读取。
  const completed = (result.reason === 'time' && run.elapsed >= CHALLENGE_SECONDS)
    || (run.rulesVersion !== 'arena-v4.1' && result.reason === 'wearout' && run.health <= 0);
  if (!completed || !Number.isFinite(result.score) || result.score < 0
    || !['S', 'A', 'B', 'C'].includes(result.grade) || typeof run.id !== 'string') return false;
  const previous = records.byChallenge[key];
  // 数据幂等但仍允许调用方 persist：上次后端写入可能失败。
  if (previous?.last?.runId === run.id) return true;
  records.byChallenge[key] = {
    bestScore: Math.max(previous?.bestScore ?? 0, result.score),
    last: { runId: run.id, score: result.score, grade: result.grade },
  };
  return true;
}
