/**
 * 核心层 · 统一结算事件管线（rework T10）
 *
 * ★ 要修什么（审计问题 12）：
 *   改造前 `Daily.completeTask()` 有实现，但锻造 / 发现 / 赛事结算从来没调用它。
 *   实玩完成一把刀、拿到新特性、跑完一次快赛，首页仍是 0/3。
 *   而 `dailyStreak`（“七日不辍”）却在换日 / 登录逻辑里自增 —— 只登录不做事也能涨。
 *   成就奖励里 `edgeSkin:七日` 这类 token 也没有处理器，被静默忽略。
 *
 * ★ 本文件的三条硬规则（T10.1 / T10.2）：
 *   ① 事件只在**业务结算成功时**发布 —— 由 progress.archive / recordMatch /
 *     settleQuickChallenge 在 commitSave 的草稿里调用，不从 DOM 点击直接领奖；
 *   ② 每个事件有**稳定 ID**（由业务身份推导，不含时间戳），重放不会二次发放；
 *   ③ 归档、CR、任务计数、成就、解锁、刀履历在**同一次** commitSave 草稿里兑现，
 *     写盘失败就整体不发布。
 *
 * ★ 幂等状态存在 `save.eventLedger[eventId] = { type, at }`。
 *   这是存档内的持久事实，刷新后仍然有效（与 WeakMap 收据互补：
 *   WeakMap 防同对象重复，eventLedger 防跨刷新重复）。
 */

import * as Daily from './daily.js';
import * as Economy from './economy.js';
import { LEGACY_MODE } from '../platform/env.js';

/** 事件类型（T10.1 的推荐命名，可按业务调整） */
export const EVENT = Object.freeze({
  FORGE_COMPLETED: 'forge_completed',
  FORGE_FRACTURED: 'forge_fractured',
  DISCOVERY: 'discovery',
  REFINEMENT_GOOD: 'refinement_good',
  QUICK_COMPLETED: 'quick_completed',
  FORMAL_COMPLETED: 'formal_completed',
  HONOR_EARNED: 'honor_earned',
});

/** 每日任务 ↔ 事件的映射（任务 id 见 data/balance.DAILY_TASKS） */
const TASK_OF_EVENT = Object.freeze({
  [EVENT.FORGE_COMPLETED]: 'forge',
  [EVENT.FORGE_FRACTURED]: 'forge',
  [EVENT.DISCOVERY]: LEGACY_MODE ? 'craft' : null,
  [EVENT.REFINEMENT_GOOD]: 'craft',
  [EVENT.QUICK_COMPLETED]: 'match',
  [EVENT.FORMAL_COMPLETED]: 'match',
});

export function makeEventLedger() {
  return {};
}

/**
 * 稳定事件 ID。
 * ★ 必须只由业务身份决定；绝不含 Date.now()、随机数或自增序号，
 *   否则“同一件事重试一次”就会变成两件不同的事，幂等失效。
 */
export function eventIdOf(type, identity = {}) {
  const parts = [type];
  if (identity.bladeId) parts.push(`b:${identity.bladeId}`);
  if (identity.matchId) parts.push(`m:${identity.matchId}`);
  if (identity.challengeId) parts.push(`c:${identity.challengeId}`);
  if (identity.dayKey) parts.push(`d:${identity.dayKey}`);
  if (identity.itemKey) parts.push(`i:${identity.itemKey}`);
  if (identity.round !== undefined && identity.round !== null) parts.push(`r:${identity.round}`);
  if (identity.tier) parts.push(`t:${identity.tier}`);
  return parts.join('|');
}

/**
 * 在**草稿存档** `s` 上兑现一个事件。
 *
 * @param {object} s          存档草稿（commitSave 传入，不是 load() 的活对象）
 * @param {string} type       EVENT.*
 * @param {object} identity   业务身份（见 eventIdOf）
 * @param {object} [detail]   展示用附加信息，不参与幂等判断
 * @returns {{ok:boolean, eventId:string, duplicate:boolean, cr:number, tasks:object[], achievements:object[], unlocks:string[]}}
 */
export function settle(s, type, identity = {}, detail = {}) {
  if (!s || !type) return { ok: false, eventId: '', duplicate: true, cr: 0, tasks: [], achievements: [], unlocks: [] };
  s.eventLedger = s.eventLedger && typeof s.eventLedger === 'object' && !Array.isArray(s.eventLedger)
    ? s.eventLedger : {};

  const eventId = eventIdOf(type, identity);
  const out = { ok: true, eventId, duplicate: false, cr: 0, tasks: [], achievements: [], unlocks: [] };

  /* ── ② 幂等：同一稳定 ID 只兑现一次 ── */
  if (s.eventLedger[eventId]) {
    return { ...out, duplicate: true };
  }

  /* ── 每日任务：事件 → 任务计数（真实行为驱动，不靠登录） ── */
  const dayKey = identity.dayKey || Daily.dayKey();
  ensureDailyDay(s, dayKey);
  const taskId = TASK_OF_EVENT[type];
  if (taskId) {
    const res = Daily.completeTask(s.daily, taskId);
    if (res.ok) {
      out.tasks.push({ id: taskId, reward: res.reward });
      /* 单个任务完成也给 CR（V2.1 §22.2 的任务奖励口径） */
      if (res.reward > 0) {
        Economy.addCr(s, res.reward, `daily:${taskId}`);
        out.cr += res.reward;
      }
    }
  }

  /* ── 每日目标全清 → 连续天数由**真实完成**驱动（T10.3） ── */
  if (Daily.allDone(s.daily)) {
    const next = bumpDailyStreak(s, dayKey);
    if (next) out.streak = next;
  }

  /* ── 发现类事件：图鉴已由 archive 记录，这里只保证任务/成就口径 ── */

  /* ── ③ 落台账，声明本次已兑现 ── */
  s.eventLedger[eventId] = { type, at: Date.now(), detail: safeDetail(detail) };
  pruneLedger(s.eventLedger);

  return out;
}

function safeDetail(detail) {
  try {
    return JSON.parse(JSON.stringify(detail || {}));
  } catch (_) {
    return {};
  }
}

/** 台账上限：保留最近 400 条，避免存档无限膨胀 */
function pruneLedger(ledger) {
  const keys = Object.keys(ledger);
  if (keys.length <= 400) return;
  keys.sort((a, b) => (ledger[a].at || 0) - (ledger[b].at || 0));
  for (const k of keys.slice(0, keys.length - 400)) delete ledger[k];
}

/** 保证 s.daily 是当日的任务状态（跨日时重置，但不加连续天数） */
function ensureDailyDay(s, dayKey) {
  if (!s.daily || s.daily.dayKey !== dayKey) {
    s.daily = Daily.makeTaskState(dayKey);
  }
  return s.daily;
}

/**
 * 连续完成天数 +1（每个自然日至多一次）。
 *
 * ★ 改造前的缺陷：`rolloverDaily()` 在换日时无条件 `dailyStreak += 1`，
 *   于是「只打开页面、什么都不做」也会让“七日不辍”增长。
 *   现在只有**当日三个目标全部完成**才会推进，并且用 `lastDailyCompleteDay` 防止同日重复。
 */
export function bumpDailyStreak(s, dayKey = Daily.dayKey()) {
  if (s.lastDailyCompleteDay === dayKey) return null;
  const prev = s.lastDailyCompleteDay;
  s.dailyStreak = prev && isConsecutive(prev, dayKey) ? (Number(s.dailyStreak) || 0) + 1 : 1;
  s.lastDailyCompleteDay = dayKey;
  s.lastDailyDay = dayKey;
  return s.dailyStreak;
}

function isConsecutive(prevKey, key) {
  const p = new Date(`${prevKey}T00:00:00`);
  const c = new Date(`${key}T00:00:00`);
  if (Number.isNaN(p.getTime()) || Number.isNaN(c.getTime())) return false;
  return Math.round((c - p) / 86400000) === 1;
}

/**
 * 兑现成就奖励 token 的解码表（T10.4）。
 *
 * ★ 改造前 `unlockFromAchievement` 只处理 `title:`，`edgeSkin:七日` 被静默忽略。
 *   现在每种 token 都有明确处理器；未知类型**记录到 out.unknown** 而不是消失，
 *   这样“未实现”是可见的，不会假装已发放。
 */
export function applyUnlockToken(s, token, out = { unlocks: [], unknown: [] }) {
  const [kind, value] = String(token || '').split(':');
  if (!kind || !value) return out;
  if (kind === 'title') {
    if (!s.unlockedTitles.includes(value)) {
      s.unlockedTitles.push(value);
      out.unlocks.push(token);
    }
    return out;
  }
  if (kind === 'edgeSkin') {
    s.unlockedEdgeSkins = Array.isArray(s.unlockedEdgeSkins) ? s.unlockedEdgeSkins : [];
    if (!s.unlockedEdgeSkins.includes(value)) {
      s.unlockedEdgeSkins.push(value);
      out.unlocks.push(token);
    }
    return out;
  }
  if (kind === 'card') {
    s.unlockedCardIds = Array.isArray(s.unlockedCardIds) ? s.unlockedCardIds : [];
    if (!s.unlockedCardIds.includes(value)) {
      s.unlockedCardIds.push(value);
      out.unlocks.push(token);
    }
    return out;
  }
  if (kind === 'bladeCard') {
    s.unlockedBladeCards = Array.isArray(s.unlockedBladeCards) ? s.unlockedBladeCards : [];
    if (!s.unlockedBladeCards.includes(value)) {
      s.unlockedBladeCards.push(value);
      out.unlocks.push(token);
    }
    return out;
  }
  out.unknown.push(token);
  return out;
}

export default {
  EVENT, makeEventLedger, eventIdOf, settle, bumpDailyStreak, applyUnlockToken,
};
