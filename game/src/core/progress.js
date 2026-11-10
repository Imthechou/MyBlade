/**
 * 核心玩法层 · 长期进度（V2.1 §23 / §26）
 *
 * 管理"跨局"的一切：CR、藏刀阁、断刀册、成就、图鉴、解锁、赛事进度、每日。
 * 它读写的对象就是存档本体 —— 存档结构在 saveSchema 定义，持久化交给 platform/storage。
 *
 * ★ 边界（V2.1 §23）：
 *   · 收藏数量**不**直接转换成无限叠加的战力；
 *   · 图鉴完成度不直接增加所有刀的基础六维；
 *   · 称号与装饰不提高基础六维。
 */

import * as Storage from '../platform/storage.js';
import { LEGACY_MODE } from '../platform/env.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { COMBOS } from '../data/combos.js';
import { CARDS } from '../data/cards.js';
import { KNIFE_TYPES } from '../data/knifeTypes.js';
import { BRANCHES, GRADIENTS } from '../data/arena/branches.js';
import * as Economy from './economy.js';
import * as Daily from './daily.js';
import * as RNG from '../platform/rng.js';
import { hasStructuralFailure, MATERIALS as CHALLENGE_MATERIALS } from './arenaChallenge.js';
import * as Team from './arenaTeam.js';
import { makeQuickRecords, normalizeQuickRecords, quickChallengeKey, updateQuickRecord } from './quickChallengeRecords.js';
import * as Arena from './arena.js';
import * as Events from './events.js';
import * as ForgeBonuses from './forgeBonuses.js';
import * as V41Growth from './arenaV41Growth.js';
import * as V41Specialties from './arenaV41Specialties.js';
import * as CareerV41 from './arenaCareerV41.js';
import { careerRewardPlan, isV41Match } from './arenaV41Rewards.js';
import * as CodexCatalog from '../data/codexCatalog.js';
import { COUNTED_CATEGORIES } from '../data/codexCatalog.js';
import { commitSave } from './saveTransaction.js';
import { HEAT } from '../v19/forge.js';

import { makeSave, defaultSettings, normalizeSettings, normalizeSave } from './saveSchema.js';
export { makeSave, defaultSettings, normalizeSettings, normalizeSave } from './saveSchema.js';

/* ── 读写 ───────────────────────────────────────────────── */

let cache = null;
// 仅保障当前页面持有的原 run 对象；不落档，不提供跨刷新恢复或历史收据账本。
let quickSettlementReceipts = new WeakMap();
let archiveReceipts = new WeakMap();

export function load() {
  if (cache) return cache;
  const raw = Storage.load();
  cache = normalizeSave(raw);
  // 专用赛事结构继续使用各自的版本和兼容边界。
  cache.teamArena = normalizeTeamArena(cache.teamArena);
  cache.quickChallengeRecords = normalizeQuickRecords(cache.quickChallengeRecords);
  cache.nationalRuns = normalizeNationalRuns(cache.nationalRuns);
  if (JSON.stringify(cache) !== JSON.stringify(raw)) Storage.backupCurrent();
  return cache;
}

export function get() {
  return load();
}

export function persist() {
  if (!cache) return false;
  return Storage.save(cache);
}

/** 锻造刷新只扣主档当前余额；沿用单份 JSON 先保存、后发布的原子边界。 */
export function spendForgeReroll(cost) {
  const original = load();
  if (original.cr < cost) return { ok: false, cost, reason: 'CR 不足', short: cost - original.cr };
  const draft = { ...original, cr: original.cr - cost };
  try {
    if (!Storage.save(draft)) return { ok: false, code: 'PERSIST_FAILED', reason: '保存失败，本次操作未生效，请重试' };
  } catch (_) { return { ok: false, code: 'PERSIST_FAILED', reason: '保存失败，本次操作未生效，请重试' }; }
  original.cr = draft.cr;
  return { ok: true, cr: original.cr };
}

export function resetAll() {
  const next = makeSave();
  if (!Storage.save(next, { overwrite: true })) return false;
  cache = next;
  quickSettlementReceipts = new WeakMap();
  archiveReceipts = new WeakMap();
  return cache;
}

Storage.setDefaultsFactory(makeSave);

const quickCopy = value => JSON.parse(JSON.stringify(value));

function quickSettlementResult(run, key, overrides = {}) {
  return {
    ok: false, code: 'INVALID_RUN', duplicate: false, duplicateReason: null,
    retryable: false,
    runId: typeof run?.id === 'string' && run.id.trim() ? run.id : null,
    challengeKey: key, settled: false, reward: 0, settledReward: null,
    cr: null, record: null, reason: '本局数据无效，无法结算',
    ...overrides,
  };
}

/**
 * 同步快赛唯一结算入口。完成事件只通知，不再独立持久化纪录。
 * best+last 与 CR 同一份隔离 draft、单次保存，严格 true 后才发布内存。
 * false/throw 均丢弃 draft；依赖存储后端的失败即未提交语义。
 * run 只借用、不修改/清空；UI 持有原对象直至结算完成或明确确认放弃。
 * pending 为 UI 调用期状态；失败后保留同对象重试，不自动启动新局或恢复刷新。
 */
export function settleQuickChallenge(run) {
  const key = quickChallengeKey(run);
  if (!run || typeof run !== 'object' || Array.isArray(run)
    || typeof run.id !== 'string' || !run.id.trim()
    || !Number.isSafeInteger(run.result?.reward) || run.result.reward < 0) {
    return quickSettlementResult(run, key);
  }
  // 复用现有纪录准入规则；暂存到全新对象，绝不先修改主档纪录。
  const candidate = makeQuickRecords();
  if (!updateQuickRecord(candidate, run)
    || (run.result.reason === 'time' && !Number.isFinite(run.elapsed))
    || (run.result.reason === 'wearout' && !Number.isFinite(run.health))) {
    return quickSettlementResult(run, key);
  }
  const fingerprint = JSON.stringify([key, run.id, run.result.score, run.result.grade,
    run.result.reward, run.result.reason, run.elapsed, run.health]);
  const original = load();
  const receipt = quickSettlementReceipts.get(run);
  if (receipt && receipt.fingerprint !== fingerprint) {
    return quickSettlementResult(run, key, { reason: '本局结算数据已变化，无法重复提交' });
  }
  const previous = original.quickChallengeRecords.byChallenge[key];
  const duplicate = (duplicateReason, settled, settledReward, reason = null) =>
    quickSettlementResult(run, key, {
      ok: true, code: 'DUPLICATE', duplicate: true, duplicateReason,
      settled, settledReward, cr: original.cr,
      record: previous ? quickCopy(previous) : null, reason,
    });
  if (receipt) return duplicate('CURRENT_PAGE_COMMITTED', true, receipt.reward);
  if (previous?.last?.runId === run.id) {
    if (previous.last.score !== run.result.score || previous.last.grade !== run.result.grade) {
      return quickSettlementResult(run, key, { reason: '相同局 ID 的纪录摘要不一致，无法结算' });
    }
    // 旧 last 仅能证明已有纪录，不能证明奖励已发；保守不补奖。
    return duplicate('EXISTING_RECORD', false, null, '已有本局纪录，奖励状态无法确认，本次不补发');
  }
  let draft, result;
  try {
    draft = quickCopy(original);
    updateQuickRecord(draft.quickChallengeRecords, run);
    const credited = Economy.addCr(draft, run.result.reward, 'arena-quick-challenge');
    const effectiveKills=Math.max(0,Number(run.result.kills)||0);
    if (effectiveKills>0 && run.result.reason==='time')
      V41Growth.awardWorkshopXp(draft,Math.min(10,4+Math.floor((Number(run.result.score)||0)/1200)), 'quick:'+run.id);
    /* ★ rework T10.1：快赛完成事件与 CR 同一次写盘。
       run.id 是稳定身份，同局重试不会二次计任务/成就。
       注意：快赛**永久安全**——事件只记录完成，不改永久属性、不触发断刀。 */
    const evt = (Number(run.result.kills)||0) === 0 ? {duplicate:true,cr:0,tasks:[]} : Events.settle(draft, Events.EVENT.QUICK_COMPLETED, { challengeId: run.id }, {
      score: run.result.score, grade: run.result.grade,
    });
    const taskCr = evt.duplicate ? 0 : evt.cr;
    result = quickSettlementResult(run, key, {
      ok: true, code: 'OK', settled: true, reward: credited.delta + taskCr,
      settledReward: credited.delta + taskCr, cr: draft.cr,
      record: quickCopy(draft.quickChallengeRecords.byChallenge[key]), reason: null,
      tasks: evt.tasks || [],
    });
    if (Storage.save(draft) !== true) throw new Error('Quick settlement was not saved');
  } catch (_) {
    return quickSettlementResult(run, key, {
      code: 'PERSIST_FAILED', retryable: true, reason: '保存失败，本局尚未结算，请重试',
    });
  }
  // 保留主档对象引用；所有嵌套变更与奖励只在保存成功后一起可见。
  Object.assign(original, draft);
  quickSettlementReceipts.set(run, { fingerprint, reward: result.reward });
  return result;
}

export const quickChallengeRecords = () => load().quickChallengeRecords;

/* ── 成刀与断刀 ─────────────────────────────────────────── */

/**
 * 归档一把刀。
 * ★ 每日挑战的成品**不入藏刀阁**（V2.1 §24）—— 由 mode 决定。
 */
export function archive(record, { mode = 'normal' } = {}) {
  const previous = archiveReceipts.get(record);
  if (previous) return { ...previous, duplicate: true };
  const result = commitSave(load(), s => archiveInto(s, record, { mode }));
  if (result.ok && !result.duplicate) archiveReceipts.set(record, result);
  return result;
}

/** Archive in the caller's save transaction, including discovery and first-forge rewards. */
export function archiveInto(s, record, { mode = 'normal', discoveries = [] } = {}) {
  if (s.collection.some(blade => blade.id === record.id) || s.fractured.some(blade => blade.id === record.id)) {
    return { ok: true, duplicate: true, reward: 0, archived: !record.fractured, fresh: [] };
  }
  s.stats.forgeCount += 1;

  /* ★ 本局"新发现"（V2.1 §14.1「长期去向」要播报的就是这个）。
     unlockCodex 本来就返回"是不是首次添加"，直接拿它的返回值当真源 —— 不新造规则、
     不新造字段，重复锻造不会重复播报。顺序即播放顺序：刀型 → 特性 → 组合 → 标签 → 决策卡。 */
  const fresh = [];
  const note = (category, id) => { if (unlockCodex(s, category, id)) fresh.push({ category, id }); };

  if (record.fractured) {
    s.stats.fractureCount += 1;
    s.fractured.unshift(record);
    // 断刀册为永久历史：锻造与正式赛事断刀共存，禁止静默裁剪。
    note('fracture', record.id);
  } else {
    s.collection.unshift(record);
    /* ★ 2026-10-14（用户：首页「有刀的时候展示评分最高的刀」）：
       原来是 `if (!s.showcaseId) s.showcaseId = record.id` —— 把**第一把**刀永久钉成
       首页代表作品，之后锻造出再高的分也上不了首页。
       现在改成"自动跟随最高分"：只要玩家**没手动**指定过代表作（`showcasePinned`
       为假），`showcaseId` 每次归档后都重新指向当前最高分那把。
       玩家一旦在藏刀阁点过「设为代表作」，`showcasePinned` 置真 → 尊重玩家的选择。 */
    if (!s.showcasePinned) {
      const best = s.collection.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a), s.collection[0]);
      if (best) s.showcaseId = best.id;
    }
    s.stats.bestScore = Math.max(s.stats.bestScore, record.score || 0);
    s.stats.bestPeakRiskClear = Math.max(s.stats.bestPeakRiskClear, record.riskPeak || 0);
    note('knife', record.knifeTypeId);
    for (const id of record.traits) note('trait', id);
    for (const id of record.combos) note('combo', id);
    for (const t of Object.keys(record.tags || {})) note('tag', t);
    for (const cid of record.history) note('card', cid);

    /* ★ rework T12：补齐此前**从未写入**的三类图鉴。
       改造前只写 knife/trait/combo/tag/card，于是「材料 / 纹理与工艺 /
       赛事」三个目录永远是空的 —— 分母把它们算进完成度，玩家却永远开不完。
       这里只记录**已经真实出现过**的东西，不提前解锁。 */
    const skin = record.pendingSkin || {};
    if (skin.materialId) note('material', skin.materialId);
    if (skin.textureId) note('finish', skin.textureId);
    if (skin.finishId) note('finish', skin.finishId);
    if (record.knifeType && !record.v19Visual) note('finish', record.knifeType);
    for (const { category, id } of discoveries) note(category, id);

    s.stats.comboFound = CodexCatalog.foundCount(s.codex, 'combo');
  }

  // CR 奖励：断刀也给少量（V2.1 §1「失败也有记录」），成刀按稀有度
  let reward = record.fractured ? 10 : Economy.forgeReward(record.rarity);
  Economy.addCr(s, reward, 'forge');
  if (!record.fractured && mode !== 'daily') V41Growth.awardWorkshopXp(s,10,'forge:'+record.id);

  if (mode === 'daily') {
    // 挑战成绩只进 dailyScores，不入藏刀阁
    if (!record.fractured) Daily.recordScore(s, record.dayKey || Daily.dayKey(), record.score);
  }

  /* ★ rework T10.1/T10.2：行为事件在**同一次 commitSave 草稿**里兑现。
     · 锻造完成 / 断刀 → 每日任务「完成 1 次锻造」；
     · 新版良好精炼并成功成刀 → 工艺任务，图鉴完成后也能继续做。
     事件 ID 只由 bladeId 推导，重试 / 重进不会二次发放。
     注意：每日挑战（mode==='daily'）不推普通任务进度，它有自己的成绩口径。 */
  if (mode !== 'daily') {
    const eventType = record.fractured ? Events.EVENT.FORGE_FRACTURED : Events.EVENT.FORGE_COMPLETED;
    const settled = Events.settle(s, eventType, { bladeId: record.id }, {
      rarity: record.rarity || null, score: record.score || 0,
    });
    if (!settled.duplicate) reward += settled.cr;
    if (fresh.length) {
      const disc = Events.settle(s, Events.EVENT.DISCOVERY, { bladeId: record.id, itemKey: 'forge' }, {
        count: fresh.length,
      });
      if (!disc.duplicate) reward += disc.cr;
    }
    const refinement = record.v19Visual?.refinement;
    if (!record.fractured && refinement?.quality >= HEAT.good) {
      const craft = Events.settle(s, Events.EVENT.REFINEMENT_GOOD, { bladeId: record.id }, { quality: refinement.quality });
      if (!craft.duplicate) reward += craft.cr;
    }
  }

  checkAchievements(s);
  return { ok: true, reward, archived: !record.fractured && mode !== 'daily', fresh };
}

export const collection = () => load().collection;
export const fracturedList = () => load().fractured;
export const bladeById = (id) => load().collection.find((b) => b.id === id) || null;

/* ★ 2026-10-14：玩家**手动**点「设为代表作」→ 钉住（`showcasePinned = true`），
   此后 archive() 不再自动改 `showcaseId`。这是「手动指定」与「自动跟随最高分」
   两条通路的唯一分叉点，漏了这句玩家就永远改不动首页代表作品。 */
export function setShowcase(id) {
  const result = commitSave(load(), s => {
    if (!s.collection.some(blade => blade.id === id)) return { ok: false };
    s.showcaseId = id;
    s.showcasePinned = true;
    return { ok: true };
  });
  return result.ok;
}

export function renameBlade(id, name) {
  const result = commitSave(load(), s => {
    const b = s.collection.find((x) => x.id === id);
    if (!b) return { ok: false };
    b.bladeName = name;
    return { ok: true };
  });
  return result.ok;
}

/**
 * National/world V4.1 permanent checkpoints. Save after event start and
 * every attempted round. Saving a checkpoint never grants CR/XP.
 */
export function checkpointCareerV41(kind,match) {
  if (!CareerV41.validateCareerCheckpoint(kind,match))
    return {ok:false,reason:'赛事检查点无效'};
  return commitSave(load(),s=>{
    const slot=s.arenaCareerV41[kind];
    const existing=slot.active;
    if(existing?.id!==match.id&&existing&&!existing.done)
      return {ok:false,reason:'已有未结束赛事，请先恢复或退出'};
    slot.active=JSON.parse(JSON.stringify(match));
    return {ok:true,id:match.id};
  });
}
export function activeCareerV41(kind) {
  if(!['national','apex'].includes(kind))return null;
  return CareerV41.recoverCareerMatch(load().arenaCareerV41?.[kind]?.active);
}
export function clearCareerV41(kind,matchId) {
  if(!['national','apex'].includes(kind)||typeof matchId!=='string')
    return {ok:false,reason:'赛事身份无效'};
  return commitSave(load(),s=>{
    const slot=s.arenaCareerV41[kind];
    if(slot.active?.id!==matchId)return {ok:false,reason:'当前赛事已变化'};
    slot.active=null;return {ok:true};
  });
}
export function hasNationalCrownV41() {
  return load().arena.history.some(h=>h?.tier==='national'&&
    (h.champion===true||h.result?.champion===true||h.result?.reason==='champion'));
}

/* ── 图鉴 ──────────────────────────────────────────────── */

export function unlockCodex(s, category, id) {
  if (!s || !id) return false;
  if (!s.codex[category]) s.codex[category] = {};
  if (s.codex[category][id]) return false;
  s.codex[category][id] = Date.now();
  return true;
}

/**
 * 图鉴已发现数量。
 * ★ rework T12：只统计**真实目录内**的条目，避免旧存档里已废弃的
 *   分类键（如已不存在的 id）把完成度抬到分母之上。
 *   断裂记录是事件型，计入数量但不进百分比。
 */
export const codexCount = () => codexCountOf(load());

/**
 * 图鉴总量（完成度分母）。
 * ★ rework T12：由 `data/codexCatalog` 的**真实内容集合**推导。
 *   改造前是 `CARDS + COMBOS + KNIFE_TYPES + BRANCHES×GRADIENTS + 60`，
 *   最后那个写死的 60 不对应任何真实集合；同时 material/finish/arena
 *   三类从未写入过，玩家永远不可能把进度条走满。
 */
export const codexTotal = () => CodexCatalog.catalogTotal();

export const codexProgress = () => Math.min(1, codexCount() / Math.max(1, codexTotal()));

/* ── 成就 ───────────────────────────────────────────────── */

export function checkAchievements(s = load()) {
  const newly = [];
  const m = s.stats;
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    let hit = false;
    if (a.metric === 'forgeCount') hit = m.forgeCount >= a.goal;
    else if (a.metric === 'bestScore') hit = m.bestScore >= a.goal;
    else if (a.metric === 'bestPeakRiskClear') hit = m.bestPeakRiskClear >= a.goal;
    else if (a.metric === 'comboFound') hit = CodexCatalog.foundCount(s.codex, 'combo') >= a.goal;
    else if (a.metric === 'skinTier') hit = s.collection.some(blade =>
      Object.values(blade.v19Visual?.skin?.levels || {}).some(level => level >= a.goal));
    else if (a.metric === 'matchWins') hit = s.arena.matchWins >= a.goal;
    else if (a.metric === 'bladeCount') hit = s.collection.length >= a.goal;
    else if (a.metric === 'knifeTypeCount') {
      hit = new Set(s.collection.map((b) => b.knifeTypeId)).size >= a.goal;
    } else if (a.metric === 'codexCount') hit = codexCountOf(s) >= a.goal;
    else if (a.metric === 'dailyStreak') hit = s.dailyStreak >= a.goal;
    else if (a.id === 'AC_first_forge') hit = m.forgeCount >= 1;
    else if (a.id === 'AC_match_first') hit = (s.arena.matchWins + s.arena.matchLosses) >= 1;
    else if (a.rarity) hit = s.collection.some((b) => b.rarity === a.rarity);
    else if (a.id === 'AC_trait_master') hit = s.collection.some((b) => (b.tagTiers || []).some((t) => t.effectiveLayers >= 6));
    else if (a.id === 'AC_special_first') hit = s.collection.some((b) => Object.values(b.traitSources || {}).includes('specialTag'));
    else if (a.id === 'AC_combo_first') hit = Object.keys(s.codex.combo).length >= 1;
    else if (a.id === 'AC_branch_clear') hit = Object.values(s.arena.school).some((p) => (p.cleared || []).includes(GRADIENTS.length - 1));
    // national.wins 仍统计单场；全国冠军只认已完成并归档的整届冠军。
    else if (a.id === 'AC_national_win') hit = s.arena.history?.some(entry => entry.tier === 'national' && entry.champion === true) ||
      s.nationalRuns?.history?.some(run => run?.status === 'champion');
    else if (a.id === 'AC_apex_win') hit = s.arena.apex.wins >= 1;

    if (hit) {
      s.achievements[a.id] = Date.now();
      newly.push(a);
      if (a.reward?.cr) Economy.addCr(s, a.reward.cr, `achievement:${a.id}`);
      if (a.reward?.unlock) unlockFromAchievement(s, a.reward.unlock);
    }
  }
  return newly;
}

function codexCountOf(s) {
  return COUNTED_CATEGORIES.reduce((sum, id) => sum + CodexCatalog.foundCount(s.codex, id), 0);
}

function unlockFromAchievement(s, token) {
  /* ★ rework T10.4：改用统一的 token 处理器。
     改造前这里只处理 `title:`，`edgeSkin:七日`（「七日不辍」的奖励）被静默忽略。
     现在 edgeSkin / card / bladeCard 都有处理器；未知类型记入 unknown 而不是消失。 */
  const ledger = s.__unlockOut || (s.__unlockOut = { unlocks: [], unknown: [] });
  Events.applyUnlockToken(s, token, ledger);
}

/** 取出并清空本次 commitSave 期间记录的 token 处理结果（跨草稿使用时会被丢弃） */
export function takeUnlockOut(s) {
  const out = s && s.__unlockOut ? s.__unlockOut : null;
  if (s) delete s.__unlockOut;
  return out;
}

/* ── 赛事进度 ───────────────────────────────────────────── */

/**
 * 追加信用点（赛事按轮补发用；与 recordMatch 的奖励互不覆盖）。
 */
export function addCr(amount, tag = 'arena') {
  return commitSave(load(), s => {
    Economy.addCr(s, Math.max(0, Number(amount) || 0), tag);
    return { ok: true, cr: s.cr };
  });
}

/**
 * 把一把刀移入断刀册（赛事切割等新流程用）。
 * 与 recordMatch 的迁移分支同语义：外观、履历、工艺全部保留，只换存放位置。
 */
export function fractureBlade(bladeId, info = null) {
  return commitSave(load(), s => {
    const blade = s.collection.find((b) => b.id === bladeId);
    if (!blade) return { ok: false, reason: '找不到这把刀' };
    if (blade.fractured) return { ok: false, reason: '这把刀已在断刀册' };
    blade.fractured = true;
    blade.canEnterArena = false;
    blade.fractureInfo = info ? JSON.parse(JSON.stringify(info)) : {
      stageId: 'arena', stageName: '赛事切割', risk: 100, peakRisk: 100, chance: 1, cause: '结构失效',
    };
    s.collection.splice(s.collection.indexOf(blade), 1);
    s.fractured.unshift(blade);
    s.stats.fractureCount = (s.stats.fractureCount || 0) + 1;
    unlockCodex(s, 'fracture', blade.id);
    if (s.showcaseId === blade.id) {
      s.showcaseId = s.collection.reduce((best, item) => !best || (item.score || 0) > (best.score || 0) ? item : best, null)?.id || null;
      s.showcasePinned = false;
    }
    return { ok: true, blade: JSON.parse(JSON.stringify(blade)) };
  });
}

export function recordMatch(tier, { win, styleId = null, gradient = 0, score = 0, matchId = null, bladeId = null, matchRecord = null, rewardTarget = null }) {
  return commitSave(load(), s => {
    const result = recordMatchInto(s, tier, { win, styleId, gradient, score, matchId, bladeId, matchRecord });
    if (result.error || result.duplicate) return result;
    // 逐轮补奖与整场记录一同写入，重试不会发生部分到账。
    if (Number.isFinite(rewardTarget)) {
      const extra = Math.max(0, rewardTarget - result.cr);
      Economy.addCr(s, extra, 'match:national:rounds');
      result.cr += extra;
      const entry = s.arena.history.find(item => item.id === matchId);
      if (entry) entry.reward = result.cr;
      const bladeEntry = s.collection.find(item => item.id === bladeId)?.arenaHistory?.find(item => item.id === matchId);
      if (bladeEntry) bladeEntry.reward = result.cr;
    }
    return result;
  });
}

// 内部纯存档变更：旧单刀仍沿用原接口，全国赛将结算和 run 游标一次性落档。
function recordMatchInto(s, tier, { win, styleId = null, gradient = 0, score = 0, matchId = null, bladeId = null, matchRecord = null }) {
  const a = s.arena;
  // 存档级幂等，切页、重复回调和读取存档后都不会二次奖励或二次断刀。
  const history = (a.history ||= []);
  const previous = matchId && history.find((entry) => entry.id === matchId);
  if (previous) return { cr: previous.reward, duplicate: true };
  const blade = bladeId ? s.collection.find((b) => b.id === bladeId) : null;
  if (bladeId && (!blade || blade.fractured || blade.canEnterArena === false)) return { cr: 0, error: '参赛刀已失去资格' };
  // V4.1: arena exhaustion is a per-round outcome, never a mutation of a forged collectible.
  // Legacy incident evidence may remain in match history for diagnostics.
  const destroyed = false;
  if (matchRecord?.result?.bladeDestroyed) win = false;
  // V4.1 CR and XP derive from the SAME ledger of verifiable milestones.
  // Event receipts are stored in the workshop journal and committed atomically.
  const v41=!!matchId&&isV41Match(matchRecord);
  const grantSummary = v41 ? applyCareerGrants(s, careerRewardPlan(tier, win, gradient, matchRecord, matchId, styleId).events) : [];
  const v41Cr = grantSummary.reduce((sum, grant) => sum + grant.cr, 0);
  if (win) a.matchWins += 1; else a.matchLosses += 1;

  if (tier === 'school' && styleId) {
    const p = (a.school[styleId] = a.school[styleId] || { cleared: [] });
    if (win && !p.cleared.includes(gradient)) p.cleared.push(gradient);
  } else if (tier === 'national') {
    a.national.wins += win ? 1 : 0;
    a.national.best = Math.max(a.national.best, score || 0);
  } else if (tier === 'apex') {
    a.apex.wins += win ? 1 : 0;
    a.apex.best = Math.max(a.apex.best, score || 0);
  }

  const idx = tier === 'school' ? 0 : (tier === 'national' ? 1 : 2);
  const reward=v41?v41Cr:Economy.matchReward(idx,win);
  Economy.addCr(s,reward,`match:${tier}`);
  if (matchId) {
    const entry = JSON.parse(JSON.stringify({ ...matchRecord, id: matchId, bladeId, tier,
      styleId, gradient, win, reward, grants:grantSummary, recordedAt: Date.now() }));
    history.push(entry);
    if (blade) recordBladeMatch(blade, entry, matchRecord?.projectScores);
  }
  if (destroyed && blade) {
    // 原档整体转移：外观配方、锻造过程、荣誉和全部赛事履历不裁剪、不重算。
    blade.fractured = true;
    blade.canEnterArena = false;
    blade.fractureInfo = JSON.parse(JSON.stringify(matchRecord.result.fractureInfo));
    s.collection.splice(s.collection.indexOf(blade), 1);
    s.fractured.unshift(blade);
    s.stats.fractureCount += 1;
    unlockCodex(s, 'fracture', blade.id);
    if (s.showcaseId === blade.id) {
      s.showcaseId = s.collection.reduce((best, b) => !best || (b.score || 0) > (best.score || 0) ? b : best, null)?.id || null;
      s.showcasePinned = false;
    }
  }
  /* ★ rework T10.1：正式赛事完成事件在同一个草稿里兑现。
     matchId 是稳定身份 → 重进战报 / 重试结算不会二次计任务。 */
  if (matchId) {
    Events.settle(s, Events.EVENT.FORMAL_COMPLETED, { matchId, tier, bladeId }, {
      win, score: score || 0, destroyed,
    });
    if (win) Events.settle(s, Events.EVENT.HONOR_EARNED, { matchId, tier, bladeId, itemKey: 'win' }, { win });
  }
  checkAchievements(s);
  return { cr: reward, bladeDestroyed: destroyed };
}

/** Common idempotent career ledger for both rulesets. The caller credits CR in the same draft. */
export function applyCareerGrants(s, events) {
  const grants = [];
  for (const { key, xp, cr } of events) {
    if (s.workshopV41.receipts[key] || (!xp && !cr)) continue;
    if (xp) V41Growth.awardWorkshopXp(s, xp, key);
    else s.workshopV41.receipts[key] = 1;
    grants.push({ id: key, xp, cr });
  }
  return grants;
}

export function recordBladeMatch(blade, entry, scores = []) {
  (blade.arenaHistory ||= []).push(structuredClone(entry));
  if (!Array.isArray(scores) || !scores.length) return;
  blade.projectRecords ||= {};
  for (const { kind, name, score } of scores.filter(Boolean)) {
    if (typeof kind !== 'string' || !Number.isFinite(score)) continue;
    const prior = blade.projectRecords[kind];
    if (!prior || score > prior.score) {
      blade.projectRecords[kind] = { kind, name: name || kind, score, at: entry.recordedAt, matchId: entry.id };
    }
  }
}

export const schoolProgress = (branchId) => {
  const s = load();
  return (s.arena.school[branchId] || { cleared: [] }).cleared.slice();
};

export const isGradientUnlocked = (branchId, gradient) => {
  if (gradient === 0) return true;
  return schoolProgress(branchId).includes(gradient - 1);
};

/* ── 可选 Apex team3（独立存档；不调用 recordMatch 的逐刀奖励） ── */
const teamCopy = value => JSON.parse(JSON.stringify(value));
const teamError = (code, reason) => ({ ok: false, code, reason });

export function normalizeTeamArena(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { version: 1, active: null, history: [] };
  // 不覆盖未来版本；有损/未知数据不能被当成空场重新发名额。
  return { ...raw, version: raw.version ?? 1, active: raw.active ?? null,
    history: Array.isArray(raw.history) ? raw.history : [] };
}

/** 快照可用于 UI；不能直接修改它来绕过落档。规则在开赛时冻结进 team.policy。 */
export function activeTeamMatch() {
  const active = load().teamArena.active;
  return active ? teamCopy(active) : null;
}

export function isTeamApexUnlocked() {
  // The existing Global Apex tier has no separate unlock flag or win gate.
  // Team3 follows that same availability instead of inventing a new threshold.
  return true;
}

// 单次持久化事务：名额/当前局/断刀/CR/幂等凭据同一份 JSON 写入。
// 写入失败不发布内存状态，UI 必须显示 PERSIST_FAILED，不得继续播放成功动画。
function teamTransaction(action) {
  const original = load();
  if (original.teamArena.version !== 1) return teamError('UNSUPPORTED_TEAM_VERSION', '此版本无法操作该团队赛存档');
  const draft = teamCopy(original);
  let result;
  try { result = action(draft); }
  catch (_) { return teamError('TEAM_UPDATE_FAILED', '团队赛更新失败，存档未更改'); }
  if (!result?.ok) return result;
  try {
    if (!Storage.save(draft)) return teamError('PERSIST_FAILED', '保存失败，本次操作未生效，请重试');
  } catch (_) { return teamError('PERSIST_FAILED', '保存失败，本次操作未生效，请重试'); }
  Object.assign(original, draft);
  return result;
}

function findActiveTeam(save, teamId) {
  const team = save.teamArena.active;
  return team && team.id === teamId ? team : null;
}

export function startTeamMatch({ bladeIds, seed = null, theme = null, styleId = null, policy = Team.TEAM_POLICY } = {}) {
  return teamTransaction(save => {
    if (save.teamArena.active) return teamError('TEAM_ACTIVE', '请先完成并结算当前团队赛');
    if (!Array.isArray(bladeIds) || bladeIds.length !== 3) return teamError('INVALID_ROSTER_SIZE', '请选择恰好三把成刀');
    const blades = bladeIds.map(id => save.collection.find(blade => blade.id === id));
    const created = Team.createTeam({ blades, seed, theme, styleId, policy });
    if (!created.ok) return created;
    // 即使同毫秒刷新导致模块计数器重置，也不复用任何已结算场次 ID。
    while (save.teamArena.history.some(team => team.id === created.team.id)) created.team.id += '-next';
    save.teamArena.active = created.team;
    return { ok: true, team: teamCopy(created.team) };
  });
}

export function dispatchTeamBlade(teamId, bladeId) {
  return teamTransaction(save => {
    const team = findActiveTeam(save, teamId);
    if (!team) return teamError('TEAM_NOT_FOUND', '找不到当前团队赛');
    // 已消耗检查优先于 live 资格检查：当前断刀仍清楚提示本场已使用。
    if (team.usedBladeIds.includes(bladeId)) return teamError('BLADE_ALREADY_USED', '每把刀在本场团队赛中只能出战一次');
    const live = save.collection.find(blade => blade.id === bladeId);
    if (!live || live.fractured || live.canEnterArena === false) return teamError('INELIGIBLE_BLADE', '所选成刀已失去参赛资格');
    const dispatched = Team.dispatchBlade(team, bladeId);
    if (!dispatched.ok) return dispatched;
    return { ok: true, team: teamCopy(team), match: teamCopy(dispatched.match) };
  });
}

/**
 * 同步的受信 core 操作适配器：mutator(match) 可调用 Arena / arenaSuite / arenaPerformance，
 * 或将进行中的操作存入 match.teamOperation；返回 {ok:false,...} / false 时不提交。
 * 每次成功都落档；mutator 不得操作 DOM、音效、CR 或外部对象，不支持 Promise。
 * 不会自动结轮：done 后调用 completeTeamRound；下一轮必须再次手动派刀。
 */
export function updateTeamRound(teamId, mutator) {
  return teamTransaction(save => {
    const team = findActiveTeam(save, teamId);
    if (!team) return teamError('TEAM_NOT_FOUND', '找不到当前团队赛');
    const match = Team.currentMatch(team);
    if (!match) return teamError('NO_ACTIVE_ROUND', '请先手动派刀');
    if (match.done) return teamError('ROUND_FINISHED', '本轮已结束，请确认本轮结果');
    if (typeof mutator !== 'function') return teamError('INVALID_OPERATION', '需要同步的核心操作');
    const identity = { id: match.id, blade: teamCopy(match.blade), tier: match.tier, seed: match.seed };
    const value = mutator(match);
    if (value && typeof value.then === 'function') return teamError('ASYNC_OPERATION', '团队赛更新必须是同步操作');
    if (value === false) return teamError('ROUND_UPDATE_REJECTED', '当前状态不允许此操作');
    if (value?.ok === false) return { ...value, code: value.code || 'ROUND_UPDATE_REJECTED' };
    if (match.id !== identity.id || match.tier !== identity.tier || match.seed !== identity.seed
      || JSON.stringify(match.blade) !== JSON.stringify(identity.blade)) return teamError('ROUND_IDENTITY_CHANGED', '不能更换本轮参赛刀或赛事身份');
    return { ok: true, team: teamCopy(team), value: value === undefined ? null : teamCopy(value) };
  });
}

export function completeTeamRound(teamId) {
  return teamTransaction(save => {
    const team = findActiveTeam(save, teamId);
    if (!team) return teamError('TEAM_NOT_FOUND', '找不到当前团队赛');
    const active = Team.currentMatch(team);
    const external = active && save.fractured.find(item => item.id === active.blade.id);
    if (active?.done && external && !save.collection.some(item => item.id === active.blade.id)) {
      // 单刀路径完全不变；同刀若已在独立流程断裂，本轮只能计负，不二次迁移。
      active.result.win = false;
      active.result.unavailableBlade = { provisional: true, source: 'already-fractured', bladeId: external.id };
    }
    const completed = Team.completeRound(team);
    if (!completed.ok) return completed;
    const { round } = completed;
    const match = round.match;
    const live = save.collection.find(item => item.id === round.bladeId);
    const blade = live || external;
    if (!blade || (live && (blade.fractured || blade.canEnterArena === false))) return teamError('INELIGIBLE_BLADE', '当前参赛刀已失去资格，不能重复迁移');
    // 履历保留，但每轮不记录单刀胜负进度、不解锁成就、不发 CR。
    const history = teamCopy({ ...match, teamId, mode: 'team3', reward: 0, recordedAt: Date.now() });
    (blade.arenaHistory ||= []).push(history);
    // V4.1: the roster stays in the collection even if this round failed.
    return { ok: true, team: teamCopy(team), round: teamCopy(round), result: team.result ? teamCopy(team.result) : null };
  });
}

/**
 * 仅用于已由独立流程移入断刀册的阵容刀：玩家手动确认该名额不出场、按轮负。
 * 不复活、不再次迁移、不抹去已完成的队伍轮次；不允许拿健康刀走此入口。
 * 活跃轮次也可显式确认弃权，避免并发单刀断裂造成永久卡场。
 */
export function forfeitUnavailableTeamBlade(teamId, bladeId) {
  return teamTransaction(save => {
    const team = findActiveTeam(save, teamId);
    if (!team) return teamError('TEAM_NOT_FOUND', '找不到当前团队赛');
    const broken = save.fractured.find(item => item.id === bladeId);
    if (!broken?.fractured || save.collection.some(item => item.id === bladeId)) return teamError('BLADE_STILL_ELIGIBLE', '只有已经移入断刀册的阵容刀才能确认缺席');
    if (team.activeMatch && team.activeMatch.blade.id !== bladeId) return teamError('ROUND_ACTIVE', '请先完成当前轮次');
    if (!team.activeMatch) {
      const dispatched = Team.dispatchBlade(team, bladeId); // 开场快照；只消耗名额，不让断刀实际参赛
      if (!dispatched.ok) return dispatched;
    }
    const match = team.activeMatch;
    if (!match.done) {
      match.done = true;
      match.result = { win: false, bladeDestroyed: false, fractureInfo: null };
      delete match.fractureInfo;
    }
    match.result.win = false;
    match.result.unavailableBlade = { provisional: true, source: 'already-fractured', bladeId, notRun: !match.fieldTest.used };
    const completed = Team.completeRound(team);
    if (!completed.ok) return completed;
    (broken.arenaHistory ||= []).push(teamCopy({ ...match, teamId, mode: 'team3', reward: 0, recordedAt: Date.now() }));
    return { ok: true, team: teamCopy(team), round: teamCopy(completed.round), result: team.result ? teamCopy(team.result) : null };
  });
}

export function settleTeamMatch(teamId) {
  return teamTransaction(save => {
    const previous = save.teamArena.history.find(team => team.id === teamId);
    if (previous) return { ok: true, team: teamCopy(previous), result: teamCopy(previous.result),
      reward: { cr: previous.settlement.cr, duplicate: true } };
    const team = findActiveTeam(save, teamId);
    if (!team) return teamError('TEAM_NOT_FOUND', '找不到当前团队赛');
    const result = Team.teamResult(team);
    if (team.status !== 'complete' || team.activeMatch || !result) return teamError('TEAM_NOT_FINISHED', '请完成所有轮次后再结算');
    // 重放轮次结构校验（含实际断刀证据），不信任独立写入的 team.result。
    const replay = { ...teamCopy(team), rounds: [], activeMatch: null, result: null, status: 'ready' };
    for (const round of team.rounds) {
      replay.activeMatch = teamCopy(round.match);
      replay.status = 'round';
      const checked = Team.completeRound(replay);
      if (!checked.ok) return checked;
    }
    const reward = Economy.matchReward(2, result.win); // 原有 Apex 120 / 30；绝不逐轮奖励
    Economy.addCr(save, reward, 'match:apex:team3');
    if (result.win) save.arena.matchWins += 1; else save.arena.matchLosses += 1;
    save.arena.apex.wins += result.win ? 1 : 0;
    // 没有队伍合成评分，不更新 apex.best，不将各刀 score 相加。
    team.result = result;
    team.status = 'settled';
    team.settlement = { cr: reward, recordedAt: Date.now() };
    save.teamArena.history.push(team);
    save.teamArena.active = null;
    checkAchievements(save); // 延续现有成就奖励口径，仅整场调用一次
    return { ok: true, team: teamCopy(team), result: teamCopy(result), reward: { cr: reward, duplicate: false } };
  });
}

/* ── 每日 ───────────────────────────────────────────────── */

export function rolloverDaily() {
  const original = load();
  const key = Daily.dayKey();
  if (original.daily?.dayKey !== key) {
    commitSave(original, s => {
      /* ★ rework T10.3：换日**不再**自增 dailyStreak。
         改造前这里无条件 `dailyStreak += 1`，于是“只打开页面什么都不做”
         也会让「七日不辍」增长，与成就文案（连续七天完成每日目标）不符。
         连续天数现在只由 core/events.bumpDailyStreak 在**当日三个目标全完成**时推进。
         `lastDailyDay` 仅作为“上次活跃日”记录保留，旧存档的已得权益
         （dailyStreak 现值）不归零，只是今后不再因登录而增长。 */
      s.lastDailyDay = key;
      s.daily = Daily.makeTaskState(key);
      return { ok: true };
    });
  }
  return original.daily;
}

/* ★ 2026-10-24：`claimDailyBonus` 已删除（用户：「50 CR 全勤奖励也不必要，删了一起」）。
   它是「今日目标」抽屉里全勤按钮的唯一入口；界面已一并移除，避免留下
   永远无法触发的死代码。单项任务奖励仍由 core/events.settle 自动发放。 */

function isConsecutive(prevKey, key) {
  const p = new Date(prevKey + 'T00:00:00');
  const c = new Date(key + 'T00:00:00');
  return Math.round((c - p) / 86400000) === 1;
}

export const dailyState = () => load().daily;

/* ── 锻造加成（rework T11） ────────────────────────────────── */

/**
 * 装备一项锻造加成。
 * ★ 只能装一项（BONUS_SLOTS=1）；未解锁或预留项一律拒绝，不会误消耗。
 * ★ 写入走 commitSave：写盘失败就不发布，不会“免费复制次数”。
 * @param {string|null} bonusId
 */
export function equipForgeBonus(bonusId) {
  const original = load();
  return commitSave(original, (s) => {
    if (!bonusId) {
      s.forgeBonus.equippedId = null;
      return { ok: true, bonusId: null };
    }
    const check = ForgeBonuses.equipBonus(s, bonusId);
    if (!check.ok) return { ok: false, reason: check.reason || '无法装备该加成' };
    s.forgeBonus.equippedId = check.bonusId;
    return { ok: true, bonusId: check.bonusId };
  });
}

/** Validate and save a specialty's pre-forge choices without mutating a running forge. */
export function setSpecialtyOptions(bonusId,options={}) {
  if(!V41Specialties.BY_BONUS[bonusId])return {ok:false,reason:'未知专精'};
  const original=load();
  return commitSave(original,s=>{
    const existing=s.forgeBonus.specialtyOptions || {};
    const merged={...(existing[bonusId]||{}),...(options||{})};
    const normalized=V41Specialties.normalizeSpecialtyOptions(bonusId,merged);
    s.forgeBonus.specialtyOptions={...existing,[bonusId]:normalized};
    return {ok:true,options:normalized};
  });
}

/** 当前的可装备加成列表 + 解锁态 + 已装备项（工坊 / 开锻前读取） */
export function forgeBonusView() {
  const s = load();
  const list = ForgeBonuses.bonusListFor(s);
  const equippedId = s.forgeBonus?.equippedId || null;
  const equipped = list.find((b) => b.id === equippedId && b.unlocked) || null;
  return { list, equippedId: equipped ? equippedId : null, equipped,
    specialty:equipped ? V41Specialties.specialtySnapshot(s,equipped.id) : null };
}

/* ── 设置 ───────────────────────────────────────────────── */

export function updateSettings(patch) {
  const original = load();
  commitSave(original, s => {
    s.settings = normalizeSettings({ ...s.settings, ...patch });
    return { ok: true };
  });
  return original.settings;
}

/**
 * 「下一个目标」（rework T12）。
 *
 * ★ 要修什么：改造前首页只有静态的“最高评分 / 赛事胜场 / 藏刀 / 图鉴”数字，
 *   玩家赢下一场、锻出一把刀之后看不到“接下来干吗”，只能自己翻菜单。
 *
 * ★ 原则：只给**一个**具体、可执行的目标，并给出明确去处；
 *   不做复杂委托分支，不改写存档。
 *
 * 优先级（从近到远）：
 *   ① 全局一次都没锻过 → 锻出第一把
 *   ② 有可装备加成却没装 → 去工坊装一项
 *   ③ 有刀但一场也没打过 → 带刀进场
 *   ④ 未摸过的流派学徒档 → 去那个流派
 *   ⑤ 图鉴缺口最大的分类 → 去对应玩法
 *   ⑥ 已很完整 → 推高梯度
 *
 * @returns {{id:string, title:string, desc:string, route:string, tab?:string, action:string}}
 */
export function nextGoal() {
  const s = load();
  const collection = s.collection || [];
  const eligible = collection.filter((b) => !b.fractured && b.canEnterArena !== false);

  /* ① 第一把刀 */
  if (!collection.length) {
    return {
      id: 'first-forge', title: '锻出第一把刀',
      desc: LEGACY_MODE ? '十道工序，三选一。第一把不必完美，先把循环跑通。' : '选料、控温、锻打、装配，把第一把成刀带回藏刀阁。',
      route: 'forge', action: '去锻刀',
    };
  }

  /* ② 有了加成却没用上 —— T11 最容易“被忽略”的一步 */
  const bonusList = ForgeBonuses.bonusListFor(s);
  const unlockedBonus = bonusList.filter((b) => b.unlocked);
  if (unlockedBonus.length && !s.forgeBonus?.equippedId) {
    return {
      id: 'equip-bonus', title: '装备一项锻造加成',
      desc: `你已解锁 ${unlockedBonus.map((b) => b.name).join('、')}，但这次开锻还没有装备。`,
      route: 'workshop', tab: 'bonuses', action: '去工坊',
    };
  }

  /* ③ 有刀从未参赛 */
  const anyMatch = ((s.arena?.matchWins || 0) + (s.arena?.matchLosses || 0)) > 0;
  if (eligible.length && !anyMatch) {
    return {
      id: 'first-match', title: '带一把刀上场',
      desc: '赛事会验证这把刀到底强在哪 —— 同一把刀在不同流派表现不同。',
      route: 'arena', action: '去赛事',
    };
  }

  /* ④ 还没通关学徒档的流派 */
  const untouched = BRANCHES.find((b) => {
    const cleared = s.arena?.school?.[b.id]?.cleared || [];
    return !cleared.includes(0);
  });
  if (untouched && eligible.length) {
    return {
      id: `branch-${untouched.id}`, title: `试试「${untouched.name}」流派`,
      desc: `${untouched.tag || untouched.desc || '不同项目组合'}。换流派就是换考法，不是单纯提高目标分。`,
      route: 'arena', action: '去赛事',
    };
  }

  /* ⑤ 图鉴缺口最大的分类 */
  const view = CodexCatalog.codexProgressView(s.codex);
  const gap = view.groups
    .filter((g) => !g.eventOnly && g.total > 0)
    .map((g) => ({ id: g.id, name: g.name, missing: g.total - g.found }))
    .sort((a, b) => b.missing - a.missing)[0];
  if (gap && gap.missing > 0) {
    return {
      id: `codex-${gap.id}`, title: `补齐${gap.name}图鉴`,
      desc: `还有 ${gap.missing} 项未发现。图鉴只记录真实出现过的东西。`,
      route: 'workshop', tab: 'codex', action: '看图鉴',
    };
  }

  /* ⑥ 已很完整：推高难度 */
  return {
    id: 'push-higher', title: '挑战更高梯度',
    desc: '学徒档已通关。更高档的靶具更硬、操作窗口更窄。',
    route: 'arena', action: '去赛事',
  };
}

/* ── 首页摘要（V2.1 §22.1） ─────────────────────────────── */

export function homeSummary() {
  const s = load();
  /* 评分最高的一把（空藏刀阁时是 null） */
  const best = s.collection.reduce(
    (a, b) => ((b.score || 0) > (a.score || 0) ? b : a), s.collection[0]) || null;

  /* ★ 2026-10-14（用户：「首页……有刀的时候展示**评分最高**的刀」）：
     代表作品在这里**每次重算**，不依赖 archive() 那次赋值 ——
     于是老存档（`showcasePinned` 字段还不存在）、外部改档都能自愈。
     · 玩家手动点过「设为代表作」→ 尊重指定；指定的那把不在了 → 回落最高分。
     · 没手动指定过 → 恒取评分最高（不再是"第一把/最新那把"）。 */
  const showcase = s.showcasePinned
    ? (s.collection.find((b) => b.id === s.showcaseId) || best)
    : best;

  return {
    cr: s.cr,
    showcase,
    collectionCount: s.collection.length,
    fractureCount: s.fractured.length,
    bestScore: s.stats.bestScore,
    forgeCount: s.stats.forgeCount,
    matchWins: s.arena.matchWins,
    matchLosses: s.arena.matchLosses,
    codexProgress: codexProgress(),
    daily: s.daily,
    achievementCount: Object.keys(s.achievements).length,
    achievementTotal: ACHIEVEMENTS.length,
    /** ★ rework T12：首页要能直接指向“下一件可做的事” */
    nextGoal: nextGoal(),
  };
}


/* ── provisional 全国赛：同刀 32 强 → 冠军，独立于旧单刀入口 ── */
export const NATIONAL_RUN_POLICY = Object.freeze({
  provisional: true, roundCount: 5,
  // Arena national 对手档 = min(3, 1 + gradient)，后两轮沿用现有上限；不新增 tier4。
  gradients: Object.freeze([0, 1, 2, 2, 2]), championCr: 0,
});
const nationalCopy = value => JSON.parse(JSON.stringify(value));
const nationalError = (code, reason) => ({ ok: false, code, reason });

export function normalizeNationalRuns(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { version: 1, nextSerial: 1, active: null, history: [] };
  // 未知版本完全透传；不能用 v1 规则清理未来游标或修改其不透明字段。
  if (raw.version != null && raw.version !== 1) return raw;
  const active = raw.active;
  const validActive = active && typeof active === 'object' && !Array.isArray(active)
    && typeof active.id === 'string' && active.id.trim().length > 0;
  return { ...raw, version: 1,
    nextSerial: Number.isSafeInteger(raw.nextSerial) && raw.nextSerial > 0 ? raw.nextSerial : 1,
    active: validActive ? active : null, history: Array.isArray(raw.history) ? raw.history : [] };
}

export function activeNationalRun() {
  const run = load().nationalRuns.active;
  return run ? nationalCopy(run) : null;
}
export function nationalRunById(runId) {
  const runs = load().nationalRuns;
  const run = runs.active?.id === runId ? runs.active : runs.history.find(item => item.id === runId);
  return run ? nationalCopy(run) : null;
}

// 游标、单场 matchId 凭据、CR、成就和断刀迁移属于同一份 JSON 事务。
function nationalTransaction(action) {
  const original = load();
  if (original.nationalRuns.version !== 1) return nationalError('UNSUPPORTED_NATIONAL_VERSION', '此版本无法操作该全国赛存档');
  const draft = nationalCopy(original);
  let result;
  try { result = action(draft); }
  catch (_) { return nationalError('NATIONAL_UPDATE_FAILED', '全国赛更新失败，存档未更改'); }
  if (!result?.ok || result.duplicate) return result;
  try {
    if (!Storage.save(draft)) return nationalError('PERSIST_FAILED', '保存失败，本次操作未生效，请重试');
  } catch (_) { return nationalError('PERSIST_FAILED', '保存失败，本次操作未生效，请重试'); }
  Object.assign(original, draft);
  return result;
}
function currentNational(save, runId) {
  const run = save.nationalRuns.active;
  return run?.id === runId ? run : null;
}
function eligibleNationalBlade(save, bladeId) {
  const blade = save.collection.find(item => item.id === bladeId);
  return blade && !blade.fractured && blade.canEnterArena !== false ? blade : null;
}

export function startNationalRun({ bladeId, seed = null, styleId = null } = {}) {
  return nationalTransaction(save => {
    const runs = save.nationalRuns;
    if (runs.active) return nationalError('NATIONAL_RUN_ACTIVE', '请先完成当前全国赛');
    const blade = eligibleNationalBlade(save, bladeId);
    if (!blade) return nationalError('INELIGIBLE_BLADE', '只能使用完整成刀参赛');
    if (!Number.isFinite(blade.score) || blade.score < 0
      || !['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'].every(key => Number.isFinite(blade.stats?.[key]) && blade.stats[key] >= 0)) {
      return nationalError('INELIGIBLE_BLADE', '成刀数据不完整，不能参赛');
    }
    let id;
    do { id = `N-${runs.nextSerial++}`; }
    while (runs.history.some(item => item.id === id) || (save.arena.history || []).some(item => item.id?.startsWith(`${id}:`)));
    const run = { id, provisional: true, policy: nationalCopy(NATIONAL_RUN_POLICY), bladeId,
      // 冻结开赛成刀，后续五轮不换刀、不重新锻造。
      blade: nationalCopy(blade), seed: seed == null ? (Date.now() >>> 0) : (Number(seed) >>> 0),
      styleId, roundIndex: 0, status: 'ready', activeMatch: null, rounds: [], createdAt: Date.now() };
    runs.active = run;
    return { ok: true, run: nationalCopy(run) };
  });
}

/**
 * 退出/归档旧的（v1 三局切割）进行中全国赛。
 *
 * ★ rework T09：新链路（core/arenaFormal 五轮多项目）与旧 nationalRuns 并存时，
 *   旧存档若有 `nationalRuns.active`，`startNationalRun` 会永远返回
 *   `NATIONAL_RUN_ACTIVE`，而新链路又无退出入口 → 玩家被永久卡住。
 *
 * ★ 语义：**不伪造成绩**、**不扣已得奖励**、**不断刀**。
 *   已完成的轮次与奖励保留在 history 条目里；未完成的轮标记为 not-run。
 */
export function abandonNationalRun() {
  return nationalTransaction(save => {
    const runs = save.nationalRuns;
    const run = runs.active;
    if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '当前没有进行中的全国赛');

    const archived = nationalCopy(run);
    archived.status = 'abandoned';
    archived.completedAt = Date.now();
    archived.abandonedAt = archived.completedAt;
    /* 未开赛/未打完的轮次明确记为 not-run，不伪装成胜利或失败 */
    archived.rounds = Array.isArray(archived.rounds) ? archived.rounds : [];
    archived.roundIndex = archived.rounds.length;
    archived.activeMatch = null;

    runs.history.push(archived);
    runs.active = null;
    return { ok: true, run: nationalCopy(archived), rewarded: false };
  });
}

/**
 * 旧全国赛的数据结构是否仍在占用入口（新链路需要它为空才能开赛）。
 * 供 UI 决定是否展示「退出旧赛」按钮。
 */
export function hasLegacyNationalActive() {
  const runs = load().nationalRuns;
  return !!(runs && runs.version === 1 && runs.active);
}

/** expectedRoundIndex 必传；旧回调不能误开下一轮。开始和确认结果分离，不自动打比赛。 */
export function beginNationalRound(runId, expectedRoundIndex) {
  return nationalTransaction(save => {
    const run = currentNational(save, runId);
    if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到当前全国赛');
    if (expectedRoundIndex !== run.roundIndex) return nationalError('STALE_NATIONAL_CURSOR', '轮次游标已变化，请读取最新全国赛');
    if (run.activeMatch) return { ok: true, duplicate: true, run: nationalCopy(run), match: nationalCopy(run.activeMatch) };
    if (run.status !== 'ready' || run.roundIndex >= run.policy.roundCount) return nationalError('NATIONAL_RUN_FINISHED', '本届全国赛已结束');
    if (!eligibleNationalBlade(save, run.bladeId)) return nationalError('INELIGIBLE_BLADE', '参赛刀已失去资格');
    const seed = RNG.hashSeed(run.seed, 'national', run.roundIndex);
    const made = Arena.createMatch({ blade: run.blade, tier: 'national', styleId: run.styleId,
      gradient: run.policy.gradients[run.roundIndex], seed });
    if (!made.ok) return made;
    made.match.id = `${run.id}:round:${run.roundIndex}`;
    // 目前 Arena 随机流只在创建事件时消费；操作阶段均由 seed 派生，无需序列化函数。
    delete made.match.rng;
    // reset 后 N-1 等身份可能复用；即使物理旧槽未清理也不复用它的 epoch。
    const stored = Storage.readNationalCheckpoint();
    if (!stored.ok && stored.code !== 'CHECKPOINT_CORRUPT') return nationalError(stored.code, '无法确认旧检查点身份，请重试');
    const old = stored.value;
    const reused = old?.runId === run.id && old?.matchId === made.match.id && old?.bladeId === run.bladeId && Number.isSafeInteger(old.epoch) && old.epoch >= 1;
    if (reused && old.epoch >= Number.MAX_SAFE_INTEGER) return nationalError('STALE_CHECKPOINT', '操作代次已用尽');
    made.match.nationalCheckpoint = { version: 1, epoch: reused ? old.epoch + 1 : 1, appliedSeq: 0 };
    run.activeMatch = nationalCopy(made.match);
    run.status = 'round';
    return { ok: true, run: nationalCopy(run), match: nationalCopy(run.activeMatch) };
  });
}

/** 可调的前台目标，不是数据丢失硬上限；核心不创建定时器。 */
export const NATIONAL_CHECKPOINT_POLICY = Object.freeze({ provisional: true, intervalMs: 250 });
const checkpointMeta = match => match.nationalCheckpoint ?? { version: 1, epoch: 1, appliedSeq: 0 };
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validCheckpointMeta = meta => isObject(meta) && meta.version === 1 && Number.isSafeInteger(meta.epoch) && meta.epoch >= 1
  && Number.isSafeInteger(meta.appliedSeq) && meta.appliedSeq >= 0;
Storage.setImportBoundary(save => {
  save = normalizeSave(save);
  save.teamArena = normalizeTeamArena(save.teamArena);
  save.quickChallengeRecords = normalizeQuickRecords(save.quickChallengeRecords);
  save.nationalRuns = normalizeNationalRuns(save.nationalRuns);
  const run = save?.nationalRuns?.version === 1 ? save.nationalRuns.active : null;
  if (!run?.activeMatch) return save;
  const stored = Storage.readNationalCheckpoint();
  if (!stored.ok && stored.code !== 'CHECKPOINT_CORRUPT') throw new Error(stored.code);
  const meta = checkpointMeta(run.activeMatch), old = stored.value;
  if (!validCheckpointMeta(meta)) throw new Error('CHECKPOINT_CORRUPT');
  const same = old?.runId === run.id && old?.matchId === run.activeMatch.id && old?.bladeId === run.bladeId && Number.isSafeInteger(old.epoch);
  const epoch = Math.max(meta.epoch, same ? old.epoch : 0) + 1;
  if (!Number.isSafeInteger(epoch)) throw new Error('STALE_CHECKPOINT');
  run.activeMatch.nationalCheckpoint = { version: 1, epoch, appliedSeq: 0 };
  return save;
});
function jsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  seen.add(value);
  const ok = Object.keys(value).every(key => !['__proto__', 'constructor', 'prototype'].includes(key) && jsonValue(value[key], seen));
  seen.delete(value);
  return ok;
}
function sameJSON(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameJSON(a[key], b[key]));
}
function validOperation(match, operation) {
  const base = match.nationalOperation;
  const suite = match.formalPerformance;
  const entry = suite?.entries?.[suite.index];
  if (!isObject(base) || !isObject(operation) || !jsonValue(operation) || match.fieldTest?.used
    || !suite?.started || suite.submitted || suite.abandoned || entry?.status !== 'pending') return false;
  // 完整快照：顶层字段不能缺失、插入整场身份/结果或夹带任意主档字段。
  if (!sameJSON(Object.keys(base).sort(), Object.keys(operation).sort())) return false;
  if (typeof operation.paused !== 'boolean' || typeof operation.done !== 'boolean'
    || !Number.isFinite(operation.elapsed) || operation.elapsed < 0
    || (base.done && !sameJSON({ ...base, paused: operation.paused }, operation))) return false;
  if (base.mode === 'formal') {
    if (entry.kind !== 'cutting' || !['id', 'seed', 'daily', 'mode', 'blade', 'route', 'finale'].every(key => sameJSON(base[key], operation[key]))) return false;
    const phases = { warmup: ['warmup', 'route-choice', 'result'], 'route-choice': ['route-choice', 'result'],
      route: ['route', 'speed', 'finale-choice', 'result'], speed: ['speed', 'finale-choice', 'result'],
      'finale-choice': ['finale-choice', 'result'], finale: ['finale', 'result'], result: ['result'] };
    if (!phases[base.phase]?.includes(operation.phase) || operation.elapsed < base.elapsed
      || operation.done !== (operation.phase === 'result')) return false;
    if (!['remaining', 'score', 'kills', 'combo', 'maxCombo', 'bestSwipe', 'gestureKills', 'health', 'damage', 'fractureChecks', 'wave', 'nextWaveAt', 'lastKillAt', 'rngState'].every(key => Number.isFinite(operation[key]))) return false;
    if (operation.remaining < 0 || operation.health < 0 || operation.health > base.health
      || operation.damage < base.damage || operation.fractureChecks < base.fractureChecks
      || !['riskStop', 'fractured'].every(key => typeof operation[key] === 'boolean')
      || !['targets', 'carry', 'hitIds', 'log'].every(key => Array.isArray(operation[key]))
      || !isObject(operation.risk) || !isObject(operation.typeCounts)) return false;
    const target = t => isObject(t) && typeof t.id === 'string' && Object.hasOwn(CHALLENGE_MATERIALS, t.type)
      && Number.isSafeInteger(t.slot) && t.slot >= 0 && t.slot <= 2 && typeof t.alive === 'boolean'
      && ['x', 'y', 'progress'].every(key => Number.isFinite(t[key]) && t[key] >= 0 && t[key] <= 1)
      && Array.isArray(t.cuts) && t.cuts.every(c => isObject(c) && ['angle', 'y', 'progress'].every(key => Number.isFinite(c[key])));
    if (!operation.targets.every(target) || !operation.carry.every(target)
      || !operation.hitIds.every(id => typeof id === 'string') || !operation.log.every(isObject)
      || !Object.values(operation.typeCounts).every(n => Number.isFinite(n) && n >= 0)) return false;
    const guide = operation.guide;
    if (guide !== null && (!isObject(guide) || typeof guide.done !== 'boolean' || typeof guide.title !== 'string'
      || !Number.isFinite(guide.reward) || ['slots', 'types'].some(key => guide[key] !== undefined && !Array.isArray(guide[key])))) return false;
    if (operation.done && (!isObject(operation.result) || operation.result.mode !== 'formal'
      || !sameJSON(operation.result.risk, operation.risk) || !sameJSON(operation.result.log, operation.log)
      || operation.result.fractured !== operation.fractured || operation.result.score !== Math.floor(operation.score))) return false;
    if (!operation.done && operation.result !== null) return false;
  } else {
    if (!['precision', 'strength'].includes(base.kind) || entry.kind !== base.kind
      || !['kind', 'config', 'prototypeInput'].every(key => sameJSON(base[key], operation[key]))
      || typeof operation.active !== 'boolean' || !Number.isFinite(operation.load) || operation.load < 0
      || !Array.isArray(operation.trace)) return false;
    const point = p => p === null || (isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    if (!['pointer', 'current', 'origin'].every(key => point(operation[key])) || !operation.trace.every(p => p !== null && point(p))) return false;
    if (operation.result !== null && (!isObject(operation.result)
      || ![base.kind, 'interruption', 'start_out_of_range'].includes(operation.result.type))) return false;
    if (operation.done && (operation.active || operation.result?.type !== base.kind || operation.result?.submitted !== true)) return false;
    if (!operation.done && operation.result?.submitted === true) return false;
  }
  return true;
}
function checkCheckpoint(save, runId, matchId, checkpoint) {
  if (save.nationalRuns.version !== 1) return nationalError('UNSUPPORTED_NATIONAL_VERSION', '此版本无法操作该全国赛存档');
  const run = currentNational(save, runId);
  if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到当前全国赛');
  const match = run.activeMatch;
  if (!match || match.id !== matchId) return nationalError('STALE_NATIONAL_MATCH', '本轮身份已变化');
  if (match.done) return nationalError('ROUND_FINISHED', '本轮已结束，请结算结果');
  if (!eligibleNationalBlade(save, run.bladeId)) return nationalError('INELIGIBLE_BLADE', '参赛刀已失去资格');
  if (!isObject(checkpoint)) return nationalError('CHECKPOINT_CORRUPT', '检查点损坏，未恢复未保存进度');
  if (checkpoint.version !== 1) return nationalError('UNSUPPORTED_CHECKPOINT_VERSION', '检查点版本未知，未恢复未保存进度');
  if (checkpoint.mode !== 'national' || checkpoint.runId !== runId || checkpoint.matchId !== matchId
    || checkpoint.bladeId !== run.bladeId) return nationalError('CHECKPOINT_IDENTITY_MISMATCH', '检查点身份不匹配');
  const meta = checkpointMeta(match);
  if (!validCheckpointMeta(meta)) return nationalError('CHECKPOINT_CORRUPT', '主档检查点标记损坏');
  if (!sameJSON(Object.keys(checkpoint).sort(), ['version', 'mode', 'runId', 'matchId', 'bladeId', 'epoch', 'seq', 'savedAt', 'operation'].sort())) return nationalError('CHECKPOINT_CORRUPT', '检查点字段不完整或包含未知字段');
  if (!Number.isSafeInteger(checkpoint.epoch) || checkpoint.epoch < 1 || !Number.isSafeInteger(checkpoint.seq)
    || checkpoint.seq < 1 || !Number.isFinite(checkpoint.savedAt) || checkpoint.savedAt < 0 || !jsonValue(checkpoint)) return nationalError('CHECKPOINT_CORRUPT', '检查点结构损坏');
  if (checkpoint.epoch !== meta.epoch || checkpoint.seq <= meta.appliedSeq) return nationalError('STALE_CHECKPOINT', '检查点已过期');
  if (!validOperation(match, checkpoint.operation)) return nationalError('INVALID_CHECKPOINT_OPERATION', '检查点不属于当前操作或包含非法状态');
  return { ok: true, checkpoint: nationalCopy(checkpoint) };
}
export function validateNationalCheckpoint(runId, matchId, checkpoint) {
  try { return checkCheckpoint(load(), runId, matchId, checkpoint); }
  catch (_) { return nationalError('CHECKPOINT_CORRUPT', '检查点结构损坏'); }
}
function checkpointSelector(checkpoint) {
  return { runId: checkpoint.runId, matchId: checkpoint.matchId, bladeId: checkpoint.bladeId,
    epoch: checkpoint.epoch, throughSeq: checkpoint.seq };
}
function cleanupCheckpoint(checkpoint) {
  return checkpoint ? !Storage.clearNationalCheckpoint(checkpointSelector(checkpoint)).ok : false;
}
function guardCheckpointSequence(next) {
  const previous = Storage.readNationalCheckpoint();
  if (!previous.ok && previous.code !== 'CHECKPOINT_CORRUPT') return nationalError(previous.code, '无法读取检查点，当前操作尚未保存');
  const old = previous.value;
  if (old && old.version === 1 && old.runId === next.runId && old.matchId === next.matchId
    && old.bladeId === next.bladeId && old.epoch === next.epoch
    && validateNationalCheckpoint(next.runId, next.matchId, old).ok) {
    if (old.seq > next.seq) return nationalError('STALE_CHECKPOINT', '不能覆盖更新的检查点');
    if (old.seq === next.seq && !sameJSON(old.operation, next.operation)) return nationalError('CHECKPOINT_SEQUENCE_CONFLICT', '同一序号不能保存不同操作');
    if (old.seq === next.seq) return { ok: true, old, durability: previous.durability };
  }
  return { ok: true };
}
export function checkpointNationalRound(runId, matchId, checkpoint) {
  const checked = validateNationalCheckpoint(runId, matchId, checkpoint);
  if (!checked.ok) return checked;
  const next = checked.checkpoint;
  const guarded = guardCheckpointSequence(next);
  if (!guarded.ok) return guarded;
  if (guarded.old) return { ok: true, savedSeq: guarded.old.seq, savedAt: guarded.old.savedAt, durability: guarded.durability };
  next.savedAt = Date.now();
  const written = Storage.writeNationalCheckpoint(next);
  return written.ok ? { ok: true, savedSeq: next.seq, savedAt: next.savedAt, durability: written.durability }
    : nationalError(written.code, '检查点写入失败，已保留最后一次成功检查点');
}
function mergeOperation(match, checkpoint) {
  match.nationalOperation = nationalCopy(checkpoint.operation);
  if (match.nationalOperation.mode !== 'formal' && match.formalPerformance) match.formalPerformance.operation = match.nationalOperation;
  match.nationalCheckpoint = { version: 1, epoch: checkpoint.epoch, appliedSeq: checkpoint.seq };
}
function pauseNationalOperation(match, reason) {
  const op = match.nationalOperation;
  if (!op) return;
  op.paused = true;
  if (op.mode !== 'formal' && !op.done) {
    op.active = false;
    op.interruption = { reason, elapsed: op.elapsed, load: op.load };
    op.result = { type: 'interruption', status: 'interrupted', reason, submitted: false, done: false };
  }
  if (op.mode !== 'formal' && match.formalPerformance) match.formalPerformance.operation = op;
}
export function restoreNationalRound(runId, matchId) {
  const save = load();
  if (save.nationalRuns.version !== 1) return nationalError('UNSUPPORTED_NATIONAL_VERSION', '此版本无法操作该全国赛存档');
  const live = currentNational(save, runId);
  if (!live) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到当前全国赛');
  if (!live.activeMatch || live.activeMatch.id !== matchId) return nationalError('STALE_NATIONAL_MATCH', '本轮身份已变化');
  if (!eligibleNationalBlade(save, live.bladeId)) return nationalError('INELIGIBLE_BLADE', '参赛刀已失去资格');
  if (!validCheckpointMeta(checkpointMeta(live.activeMatch))) return nationalError('CHECKPOINT_CORRUPT', '主档检查点标记损坏');
  // 旧档的隐式初始代次须先成为权威元数据；UI 不补档，也不能只修恢复副本。
  // 只迁移标记，不持久化下面恢复/暂停的 operation；失败不发布缓存、不读取/清理小槽。
  if (live.activeMatch.nationalCheckpoint == null) {
    const migrated = nationalTransaction(draft => {
      const current = currentNational(draft, runId);
      current.activeMatch.nationalCheckpoint = nationalCopy(checkpointMeta(current.activeMatch));
      return { ok: true };
    });
    if (!migrated.ok) return migrated;
  }
  // nationalTransaction 在主档保存成功后替换缓存里的 run，不能再用迁移前的 live。
  const authoritative = currentNational(save, runId);
  const run = nationalCopy(authoritative), match = run.activeMatch;
  const stored = Storage.readNationalCheckpoint();
  let checkpointStatus = stored.ok ? 'none' : 'discarded', code = stored.code;
  let savedSeq = checkpointMeta(match).appliedSeq, savedAt = null, cleanupPending = stored.cleanupPending || false;
  if (stored.ok && stored.value) {
    const checked = validateNationalCheckpoint(runId, matchId, stored.value);
    if (checked.ok) {
      mergeOperation(match, checked.checkpoint);
      checkpointStatus = 'restored'; savedSeq = checked.checkpoint.seq; savedAt = checked.checkpoint.savedAt;
    } else {
      checkpointStatus = 'discarded'; code = checked.code;
      cleanupPending = cleanupCheckpoint(stored.value);
    }
  }
  const operation = match.nationalOperation;
  if (operation) {
    operation.paused = true;
    if (operation.mode !== 'formal' && !operation.done) {
      operation.active = false;
      operation.interruption = { reason: 'restored', elapsed: operation.elapsed, load: operation.load };
      operation.result = { type: 'interruption', status: 'interrupted', reason: 'restored', submitted: false, done: false };
    }
    if (operation.mode !== 'formal' && match.formalPerformance) match.formalPerformance.operation = operation;
  }
  return { ok: true, run, checkpointStatus, savedSeq, savedAt, durability: stored.durability || (Storage.driver.name === 'memory' ? 'memory' : 'persistent'),
    paused: true, interrupted: true, cleanupPending, ...(code ? { code } : {}) };
}
export function flushNationalRound(runId, matchId, { checkpoint, reason } = {}) {
  if (!['pause', 'leave', 'hidden', 'operation-complete'].includes(reason)) return nationalError('INVALID_OPERATION', '需要明确的检查点刷新原因');
  let selected = checkpoint;
  if (selected === undefined) {
    const stored = Storage.readNationalCheckpoint();
    if (!stored.ok) return nationalError(stored.code, '无法恢复检查点，当前操作尚未保存');
    selected = stored.value;
  }
  let appliedSeq = 0;
  const result = nationalTransaction(save => {
    const run = currentNational(save, runId);
    if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到当前全国赛');
    const match = run.activeMatch;
    if (!match || match.id !== matchId) return nationalError('STALE_NATIONAL_MATCH', '本轮身份已变化');
    if (!eligibleNationalBlade(save, run.bladeId)) return nationalError('INELIGIBLE_BLADE', '参赛刀已失去资格');
    if (!validCheckpointMeta(checkpointMeta(match))) return nationalError('CHECKPOINT_CORRUPT', '主档检查点标记损坏');
    if (selected) {
      const checked = checkCheckpoint(save, runId, matchId, selected);
      if (!checked.ok) {
        const meta = checkpointMeta(match);
        // 主档已成功、仅清理失败：原候选与同 reason 可重试，不再合并/写主档。
        if (checked.code !== 'STALE_CHECKPOINT' || selected.seq !== meta.appliedSeq || selected.epoch !== meta.epoch) return checked;
        const candidate = nationalCopy(match);
        candidate.nationalOperation = nationalCopy(selected.operation);
        if (['pause', 'leave', 'hidden'].includes(reason)) pauseNationalOperation(candidate, reason);
        if (!sameJSON(candidate.nationalOperation, match.nationalOperation)) return nationalError('CHECKPOINT_SEQUENCE_CONFLICT', '已应用序号不能替换为不同操作');
        return { ok: true, duplicate: true, run: nationalCopy(run), appliedSeq: meta.appliedSeq };
      }
      const guarded = guardCheckpointSequence(checked.checkpoint);
      if (!guarded.ok) return guarded;
      mergeOperation(match, checked.checkpoint);
    }
    appliedSeq = checkpointMeta(match).appliedSeq;
    if (['pause', 'leave', 'hidden'].includes(reason)) pauseNationalOperation(match, reason);
    return { ok: true, run: nationalCopy(run), appliedSeq };
  });
  if (result.ok) result.cleanupPending = cleanupCheckpoint(selected);
  return result;
}

/** 受信同步 core 操作；现场测试的进行中状态也须放在 match.nationalOperation 内按动作落档。 */
export function updateNationalRound(runId, matchId, mutator, { checkpoint } = {}) {
  let cleanup = checkpoint;
  const result = nationalTransaction(save => {
    const run = currentNational(save, runId);
    if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到当前全国赛');
    const match = run.activeMatch;
    if (!match || match.id !== matchId) return nationalError('STALE_NATIONAL_MATCH', '本轮身份已变化，请读取最新全国赛');
    if (match.done) return nationalError('ROUND_FINISHED', '本轮已结束，请结算结果');
    if (!eligibleNationalBlade(save, run.bladeId)) return nationalError('INELIGIBLE_BLADE', '参赛刀已失去资格');
    if (typeof mutator !== 'function') return nationalError('INVALID_OPERATION', '需要同步的核心操作');
    if (checkpoint !== undefined) {
      const checked = checkCheckpoint(save, runId, matchId, checkpoint);
      if (!checked.ok) return checked;
      const guarded = guardCheckpointSequence(checked.checkpoint);
      if (!guarded.ok) return guarded;
      mergeOperation(match, checked.checkpoint);
    }
    const oldMeta = checkpointMeta(match);
    if (!validCheckpointMeta(oldMeta)) return nationalError('CHECKPOINT_CORRUPT', '主档检查点标记损坏');
    if (oldMeta.epoch >= Number.MAX_SAFE_INTEGER) return nationalError('STALE_CHECKPOINT', '操作代次已用尽');
    if (!cleanup) cleanup = { runId, matchId, bladeId: run.bladeId, epoch: oldMeta.epoch, seq: Number.MAX_SAFE_INTEGER };
    const identity = nationalCopy({ id: match.id, tier: match.tier, seed: match.seed, blade: match.blade,
      gradient: match.gradient, styleId: match.styleId, opponent: match.opponent });
    const value = mutator(match);
    if (value && typeof value.then === 'function') return nationalError('ASYNC_OPERATION', '全国赛更新必须是同步操作');
    if (value === false) return nationalError('ROUND_UPDATE_REJECTED', '当前状态不允许此操作');
    if (value?.ok === false) return { ...value, code: value.code || 'ROUND_UPDATE_REJECTED' };
    if (JSON.stringify(identity) !== JSON.stringify({ id: match.id, tier: match.tier, seed: match.seed, blade: match.blade,
      gradient: match.gradient, styleId: match.styleId, opponent: match.opponent })) {
      return nationalError('ROUND_IDENTITY_CHANGED', '不能更换本轮参赛刀、对手或赛事身份');
    }
    match.nationalCheckpoint = { version: 1, epoch: oldMeta.epoch + 1, appliedSeq: 0 };
    return { ok: true, run: nationalCopy(run), value: value === undefined ? null : nationalCopy(value) };
  });
  if (result.ok) result.cleanupPending = cleanupCheckpoint(cleanup);
  return result;
}

/** matchId 必传。单场奖励仍由 recordMatchInto 唯一结算，national.wins 仍是单场胜数。 */
export function completeNationalRound(runId, matchId) {
  const result = nationalTransaction(save => {
    const runs = save.nationalRuns;
    const run = currentNational(save, runId) || runs.history.find(item => item.id === runId);
    if (!run) return nationalError('NATIONAL_RUN_NOT_FOUND', '找不到该全国赛');
    const previous = run.rounds.find(round => round.match.id === matchId);
    if (previous) return { ok: true, duplicate: true, run: nationalCopy(run), round: nationalCopy(previous),
      reward: { cr: previous.reward, duplicate: true } };
    const match = run.activeMatch;
    if (!match || match.id !== matchId) return nationalError('STALE_NATIONAL_MATCH', '本轮身份已变化，请读取最新全国赛');
    if (!match.done || !match.result) return nationalError('ROUND_NOT_FINISHED', '请先完成本轮比赛');
    const reward = recordMatchInto(save, 'national', {
      win: match.result.win, styleId: match.styleId, gradient: match.gradient, score: match.blade.score,
      matchId: match.id, bladeId: run.bladeId, matchRecord: {
        seed: match.seed, opponent: match.opponent, theme: match.theme, log: match.log,
        fieldTest: match.fieldTest, result: match.result, nationalRunId: run.id, nationalRoundIndex: run.roundIndex,
      },
    });
    if (reward.error) return nationalError('NATIONAL_SETTLEMENT_REJECTED', reward.error);
    // 若兼容单刀接口已结算同一个 matchId，沿用存档凭据，不再发 CR 或迁移断刀。
    const receipt = save.arena.history.find(entry => entry.id === matchId);
    if (receipt.bladeId !== run.bladeId || receipt.tier !== 'national') return nationalError('MATCH_RECEIPT_CONFLICT', '单场结算身份冲突');
    const round = { index: run.roundIndex, match: nationalCopy(match), reward: receipt.reward, win: receipt.win };
    run.rounds.push(round);
    run.roundIndex += 1;
    run.activeMatch = null;
    run.status = !receipt.win || receipt.result?.bladeDestroyed ? 'eliminated'
      : run.roundIndex === run.policy.roundCount ? 'champion' : 'ready';
    if (run.status === 'eliminated' || run.status === 'champion') {
      run.completedAt = Date.now();
      runs.history.push(run);
      runs.active = null;
      if (run.status === 'champion') checkAchievements(save);
    }
    return { ok: true, run: nationalCopy(run), round: nationalCopy(round), reward };
  });
  if (result.ok) {
    const stored = Storage.readNationalCheckpoint();
    const cp = stored.value;
    result.cleanupPending = !stored.ok;
    if (cp && cp.runId === runId && cp.matchId === matchId && cp.bladeId === result.run.bladeId) result.cleanupPending = cleanupCheckpoint(cp);
  }
  return result;
}

export default {
  load, get, persist, resetAll, makeSave, defaultSettings, normalizeSettings,
  spendForgeReroll,
  archive, collection, fracturedList, bladeById, setShowcase, renameBlade,
  settleQuickChallenge, quickChallengeRecords,
  unlockCodex, codexCount, codexProgress,
  checkAchievements, recordMatch, schoolProgress, isGradientUnlocked,
  normalizeTeamArena, activeTeamMatch, isTeamApexUnlocked, startTeamMatch,
  dispatchTeamBlade, updateTeamRound, completeTeamRound, forfeitUnavailableTeamBlade, settleTeamMatch,
  rolloverDaily, dailyState, updateSettings, homeSummary,
  normalizeNationalRuns, activeNationalRun, nationalRunById, startNationalRun,
  beginNationalRound, updateNationalRound, completeNationalRound,
  NATIONAL_CHECKPOINT_POLICY, validateNationalCheckpoint, checkpointNationalRound, restoreNationalRound, flushNationalRound,
};
