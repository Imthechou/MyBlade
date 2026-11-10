/**
 * 核心玩法层 · 每日挑战（V2.1 §24）
 *
 * 「每天使用固定 Seed 和明确的挑战条件；所有玩家面对相同的初始挑战条件，
 *   但可以自由选择锻造路线。」
 *
 * ★ 边界（V2.1 §24，必须强制而非靠 UI 自律）：
 *   · 挑战成品**不进入普通藏刀阁**；
 *   · 挑战成品**不具备普通赛事参赛资格**；
 *   · 挑战不改变普通成刀的永久数值，也不重置普通存档；
 *   · Daily Score 只用于当日记录与成绩比较，不写入普通成刀档案；
 *   · 同一日的基础通关奖励只领取一次，重复尝试只刷新个人最佳。
 */

import { MODIFIERS } from '../data/daily.js';
import { DAILY_TASKS } from '../data/balance.js';
import { LEGACY_MODE } from '../platform/env.js';
import * as RNG from '../platform/rng.js';
import { HEAT } from '../v19/forge.js';
import { dayKey as tournamentDayKey } from '../v19/tournament.js';

/** 新版目标与每日赛使用北京时间。 */
export function dayKey(date = new Date()) {
  if (!LEGACY_MODE) return tournamentDayKey(date.valueOf());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 当日固定 Seed —— 同一天所有玩家一致 */
export function seedOfDay(key = dayKey()) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 当日挑战修饰器（确定性） */
export function modifierOfDay(key = dayKey()) {
  const rng = RNG.stream(seedOfDay(key), 'daily-modifier');
  const pool = MODIFIERS.filter((m) => m.id !== 'none');
  const m = pool[Math.floor(rng() * pool.length) % pool.length];
  return m;
}

/** 构造 daily 附加到 run 上的修饰参数 */
export function dailyPayload(key = dayKey()) {
  const mod = modifierOfDay(key);
  return {
    dayKey: key,
    modId: mod.id,
    modName: mod.name,
    modDesc: mod.desc,
    riskScale: mod.apply.riskScale ?? 1,
    breakScale: mod.apply.breakScale ?? 1,
    statBoost: mod.apply.statBoost || null,
    maxReroll: mod.apply.maxReroll ?? null,
  };
}

/* ── 每日任务（V2.1 §22.2 首页今日目标面板） ───────────────── */

const v19TaskNames = { match: '完成一场有效赛事', craft: `精炼质量达到 ${HEAT.good} 并完成鉴定` };
export const taskDefinitions = LEGACY_MODE ? DAILY_TASKS : DAILY_TASKS.map(task => ({
  ...task, name: v19TaskNames[task.id] || task.name,
}));

export function makeTaskState(key = dayKey()) {
  return {
    dayKey: key,
    tasks: taskDefinitions.map((t) => ({ id: t.id, done: false, claimed: false })),
    /* ★ 2026-10-24：不再写入 `allBonusClaimed`（全勤奖励已取消）。
       旧存档里残留的这个字段由 saveSchema.normalizeSave 直接丢弃，
       不报错、不影响任何已得权益（那 50 CR 本来就没领过，也不再有）。 */
  };
}

/**
 * 标记一项任务完成。
 * @param {string} taskId 'forge' | 'match' | 'craft'
 */
export function completeTask(state, taskId) {
  if (!state || state.dayKey !== dayKey()) return { ok: false, reason: '不是今天的任务' };
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t || t.done) return { ok: false, reason: '任务已完成或不存在' };
  t.done = true;
  const def = taskDefinitions.find((x) => x.id === taskId);
  return { ok: true, reward: def ? def.reward : 0 };
}

export function allDone(state) {
  return !!state && state.tasks.every((t) => t.done);
}

/* ★ 2026-10-24：`claimAllBonus` 已删除。
   它唯一的消费方是首页「今日目标」抽屉里的「领取全勤奖励」按钮，
   用户确认「50 CR 全勤奖励也不必要，删了一起」。
   单项任务奖励（40/40/50）不受影响，仍由 core/events.settle 自动发放。 */

/** 挑战成绩：只记录当日最佳，重复尝试不重复发首通奖励 */
export function recordScore(state, key, score) {
  if (!state.dailyScores) state.dailyScores = {};
  const prev = state.dailyScores[key];
  const best = prev == null ? score : Math.max(prev, score);
  state.dailyScores[key] = best;
  return { best, improved: prev == null || score > prev, firstClear: prev == null };
}

export default {
  dayKey, seedOfDay, modifierOfDay, dailyPayload,
  makeTaskState, completeTask, allDone, recordScore,
};
