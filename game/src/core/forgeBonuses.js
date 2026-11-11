/**
 * 核心层 · 有限锻造加成（rework T11）
 *
 * ★ 三条必须成立（T11 验收）：
 *   ① 只能装备**一项**（BONUS_SLOTS = 1），S1 开始后锁定不能换；
 *   ② 一次机会用后不能重复触发；未达解锁条件不能误消耗；
 *   ③ 解锁是**永久**的，存进存档；限制的是每局机会。
 *
 * ★ 本模块是纯规则：只读写「运行中本局」的 bonus 状态对象，
 *   永久解锁与装备选择由 progress / game 负责落档。
 */

import {
  BONUS_SLOTS, BONUS_BY_ID, availableBonuses, bonusById,
} from '../data/forgeBonuses.js';
import { COMBOS } from '../data/combos.js';

/** 本局加成状态（挂在 run.bonus 上） */
export function makeRunBonus(bonusId = null) {
  const def = bonusId ? bonusById(bonusId) : null;
  return {
    bonusId: def && !def.reserved ? def.id : null,
    name: def ? def.name : null,
    locked: false,       // S1 开始后置真
    used: 0,
    usesPerRun: def ? def.usesPerRun : 0,
    receipts: [],        // 生效回执（UI 展示「它真的生效了」）
  };
}

/* ── 永久解锁判定（纯函数，不落档） ─────────────────────── */

/**
 * @param {object} bonus  加成定义
 * @param {object} save   存档（读 codex / achievements / stats）
 * @returns {{unlocked:boolean, progress:{have:number,need:number}|null, text:string}}
 */
export function unlockStateOf(bonus, save) {
  if (!bonus || bonus.reserved) return { unlocked: false, progress: null, text: '尚未开放' };
  const u = bonus.unlock || { kind: 'never' };
  if (u.kind === 'always') return { unlocked: true, progress: null, text: bonus.unlockText };
  if (u.kind === 'codex') {
    const have = Object.keys(save?.codex?.[u.category] || {}).length;
    const need = Number(u.count) || 0;
    return { unlocked: have >= need, have, need, text: bonus.unlockText };
  }
  if (u.kind === 'school') {
    const cleared=new Set(save?.arena?.school?.[u.branchId]?.cleared || []);
    const unlocked=cleared.has(u.gradient||1);
    return {unlocked,progress:null,text:bonus.unlockText};
  }
  if (u.kind === 'achievement') {
    const unlocked = !!(save?.achievements || {})[u.id];
    return { unlocked, progress: null, text: bonus.unlockText };
  }
  return { unlocked: false, progress: null, text: bonus.unlockText };
}

/** 玩家可见的加成 + 解锁态（工坊 / 开锻前选择用） */
export function bonusListFor(save) {
  return availableBonuses().map((b) => ({
    ...b,
    ...unlockStateOf(b, save),
  }));
}

/** 装备（返回规范化后的 bonusId；未解锁或非法一律 null） */
export function equipBonus(save, bonusId) {
  const b = bonusId ? bonusById(bonusId) : null;
  if (!b || b.reserved) return { ok: true, bonusId: null };
  const st = unlockStateOf(b, save);
  if (!st.unlocked) return { ok: false, bonusId: null, reason: '尚未解锁该加成' };
  return { ok: true, bonusId: b.id };
}

/* ── 局内：锁定与消费 ─────────────────────────────────── */

/**
 * S1 开始后锁定（T11：S1 开始后不能换）。
 * 已在 run.bonus 上装备的那一项成为本局既成事实。
 */
export function lockBonus(run) {
  if (!run) return false;
  if (!run.bonus) run.bonus = makeRunBonus(null);
  run.bonus.locked = true;
  return true;
}

/** 还能不能用（次数未耗尽 + 已装备） */
export function canUse(run) {
  const b = run?.bonus;
  if (!b || !b.bonusId) return false;
  return b.used < b.usesPerRun;
}

/**
 * 使用加成。
 * @param {object} run
 * @returns {{ok:boolean, bonusId?:string, receipt?:string, effect?:object, reason?:string}}
 */
export function use(run) {
  const b = run?.bonus;
  if (!b || !b.bonusId) return { ok: false, reason: '本局没有装备加成' };
  if (!canUse(run)) return { ok: false, reason: '本局这次加成已经用掉了' };
  const def = bonusById(b.bonusId);
  if (!def) return { ok: false, reason: '未知加成' };

  b.used += 1;
  const effect = effectOf(def, run);
  const receipt = def.receipt || `${def.name}：已生效`;
  b.receipts.push({ at: Date.now(), bonusId: def.id, receipt });
  return { ok: true, bonusId: def.id, receipt, effect };
}

/**
 * 各加成的**实际**作用（不写虚假效果）。
 * ★ extra_reroll：免费重抽一次 —— 由调用方（game.reroll）以 effect.freeReroll 驱动，
 *   不要在这里直接动 CR。
 * ★ combo_insight：给线索，已发现的组合直接标明。
 */
export function effectOf(def, run) {
  if (def.id === 'extra_reroll') return { freeReroll: 1 };
  if (def.id === 'combo_insight') {
    const found = new Set(run?.comboDiscoveries?.map((d) => d.id) || []);
    const lines = COMBOS.map((c) => ({
      id: c.id,
      name: c.name,
      hint: found.has(c.id) ? (c.conditions || c.reward || c.name) : c.hint,
      discovered: found.has(c.id),
    }));
    return { comboHints: lines };
  }
  return {};
}

/** 快照（UI 展示装备态与生效回执） */
export function snapshot(run) {
  const b = run?.bonus;
  if (!b) return { bonusId: null, name: null, locked: false, used: 0, usesPerRun: 0, remaining: 0, receipts: [] };
  const def = bonusById(b.bonusId);
  return {
    bonusId: b.bonusId,
    name: b.name,
    desc: def ? def.desc : '',
    locked: !!b.locked,
    used: b.used,
    usesPerRun: b.usesPerRun,
    remaining: Math.max(0, b.usesPerRun - b.used),
    receipts: (b.receipts || []).slice(),
  };
}

export default {
  BONUS_SLOTS, makeRunBonus, unlockStateOf, bonusListFor, equipBonus,
  lockBonus, canUse, use, effectOf, snapshot,
};
