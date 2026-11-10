/** 存档默认值与字段归一化；不读写存储，不依赖 UI 或渲染。 */
import { SAVE_VERSION } from '../platform/storage.js';
import { CR_START, STAT_KEYS } from '../data/balance.js';
import * as Daily from './daily.js';
import { makeQuickRecords } from './quickChallengeRecords.js';
import { makeWorkshopV41, normalizeWorkshopV41, migrateVerifiedLegacyGrowth } from './arenaV41Growth.js';
import { normalizeV19 } from './v19Save.js';
import { makeCareerV41, normalizeCareerV41 } from './arenaCareerV41.js';

/**
 * 设置项默认值（唯一真源）。
 * ★ 新增设置项必须同时改这里和 normalizeSettings —— makeSave 只覆盖新档，
 *   旧档可能只包含部分设置字段，
 *   不补齐就会出现"设置面板里某个开关读出来是 undefined"。
 */
export function defaultSettings() {
  return {
    sound: true,             // 音效开关（§29）
    volume: 0.6,             // 音量 0–1
    haptics: true,           // 震动反馈开关（§29；无震动能力的宿主会自动降级）
    motion: 'auto',          // 减少动态效果：'auto' 跟随系统 / 'reduced' 减少 / 'full' 完整
    reducedMotion: false,    // ⚠ 旧字段，仅为旧档兼容保留；真实取值一律以 motion 为准
    tutorialSeen: false,     // 是否已看过完整新手引导（看完仍可从设置重看，§27）
    hintsSeen: {},           // 首遇短提示记录 { [hintKey]: true }（§28）
  };
}

/**
 * 把任意来源（旧档 / 手改档）的 settings 归一成合法形状。
 * 只做"补默认 + 纠非法值 + 迁移旧字段"，不改变玩家已明确表过的态度。
 */
export function normalizeSettings(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = { ...defaultSettings(), ...src };

  // 旧档迁移：只有"从没写过 motion"的情况下，才用旧的布尔值推断态度
  if (src.motion === undefined && src.reducedMotion === true) out.motion = 'reduced';
  if (out.motion !== 'auto' && out.motion !== 'reduced' && out.motion !== 'full') out.motion = 'auto';
  out.reducedMotion = out.motion === 'reduced';   // 写回旧字段，保持两个视角一致

  if (typeof out.sound !== 'boolean') out.sound = true;
  if (typeof out.haptics !== 'boolean') out.haptics = true;
  if (typeof out.tutorialSeen !== 'boolean') out.tutorialSeen = false;

  const v = Number(out.volume);
  out.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;

  if (!out.hintsSeen || typeof out.hintsSeen !== 'object' || Array.isArray(out.hintsSeen)) out.hintsSeen = {};

  return out;
}

/** 存档骨架（新增字段必须在这里给默认值，旧档由 normalize* 补齐） */
export function makeSave() {
  return {
    version: SAVE_VERSION,
    cr: CR_START,
    createdAt: Date.now(),

    collection: [],        // 完整成刀 BladeRecord[]
    fractured: [],         // 断刀册
    showcaseId: null,      // 首页代表作品（自动跟随最高分；玩家手动指定后不再自动改）
    showcasePinned: false, // ★ 玩家是否**手动**点过「设为代表作」（false = 首页自动用最高分那把）
    teamArena: { version: 1, active: null, history: [] }, // 可选原型，独立于旧单刀记录
    workshopV41: makeWorkshopV41(),
    arenaCareerV41: makeCareerV41(), // V4.1 workshop XP and idempotent rewards
    quickChallengeRecords: makeQuickRecords(), // provisional：紧凑个人纪录，不保存逐局日志
    nationalRuns: { version: 1, nextSerial: 1, active: null, history: [] }, // provisional 全国赛连赛游标

    achievements: {},      // { id: unlockedAt }
    /* ★ rework T10：稳定事件台账 { [eventId]: {type, at, detail} }。
       用于跨刷新幂等：同一件事（同一把刀归档 / 同一场比赛结算）只能兑现一次。 */
    eventLedger: {},
    /* ★ rework T10.3：连续天数只由**真实完成每日目标**驱动。
       lastDailyCompleteDay 是“今天已经推进过连续天数”的防重标记。 */
    lastDailyCompleteDay: null,
    /* ★ rework T10.4：成就奖励 token 的处理器（之前 edgeSkin 被静默忽略） */
    unlockedEdgeSkins: [],
    unlockedBladeCards: [],
    /* ★ rework T11：有限锻造加成的永久解锁态与开锻前装备选择 */
    forgeBonus: { unlocked: [], equippedId: null, usesTotal: 0, specialtyOptions: {}, knowledgeMigrated: false },
    codex: {               // 图鉴发现
      material: {}, card: {}, tag: {}, trait: {}, combo: {},
      knife: {}, finish: {}, texture: {}, fitting: {}, arena: {}, fracture: {},
      bonus: {}, traitTest: {}, fractureCause: {},
    },
    unlockedCardIds: [],   // 内容解锁（V2.1 §26）
    unlockedTitles: [],

    arena: {
      school: {},          // { [branchId]: { cleared: [0..4] } }
      national: { best: 0, wins: 0 },
      apex: { best: 0, wins: 0 },
      matchWins: 0,
      matchLosses: 0,
    },

    stats: {
      forgeCount: 0, fractureCount: 0, bestScore: 0,
      bestPeakRiskClear: 0, comboFound: 0,
    },

    daily: Daily.makeTaskState(),
    dailyScores: {},
    dailyStreak: 0,
    lastDailyDay: null,

    settings: defaultSettings(),
    v19: normalizeV19(),
  };
}

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const map = value => object(value) ? { ...value } : {};
const count = (value, fallback = 0) => Number.isFinite(Number(value)) && value !== null
  ? Math.max(0, Number(value)) : fallback;
const list = value => Array.isArray(value) ? value : [];

function normalizeBlade(raw) {
  const blade = { ...raw };
  for (const key of ['traits', 'combos', 'history', 'tagTiers', 'traitResonance', 'comboDiscoveries', 'arenaHistory']) {
    blade[key] = list(blade[key]);
  }
  for (const key of ['tags', 'traitSources', 'scoreDetail', 'arenaRecord']) blade[key] = map(blade[key]);
  blade.stats = map(blade.stats);
  for (const key of STAT_KEYS) blade.stats[key] = count(blade.stats[key]);
  blade.score = count(blade.score);
  return blade;
}

/** 保留有效内容和未知字段，只修复缺失或类型错误的字段；不裁剪历史。 */
export function normalizeSave(raw) {
  const defaults = makeSave();
  const src = map(raw);
  const out = { ...defaults, ...src };
  out.cr = count(src.cr, defaults.cr);
  out.workshopV41 = normalizeWorkshopV41(src.workshopV41);
  out.arenaCareerV41 = normalizeCareerV41(src.arenaCareerV41);
  out.createdAt = count(src.createdAt, defaults.createdAt);
  for (const key of ['collection', 'fractured']) {
    out[key] = list(src[key]).filter(item => object(item) && typeof item.id === 'string').map(normalizeBlade);
  }
  out.settings = normalizeSettings(src.settings);
  out.v19 = normalizeV19(src.v19);
  out.stats = { ...defaults.stats, ...map(src.stats) };
  for (const key of Object.keys(defaults.stats)) out.stats[key] = count(out.stats[key]);
  out.achievements = map(src.achievements);
  out.eventLedger = map(src.eventLedger);
  out.lastDailyCompleteDay = typeof src.lastDailyCompleteDay === 'string' ? src.lastDailyCompleteDay : null;
  out.unlockedEdgeSkins = list(src.unlockedEdgeSkins).filter(id => typeof id === 'string');
  out.unlockedBladeCards = list(src.unlockedBladeCards).filter(id => typeof id === 'string');
  const fb = map(src.forgeBonus);
  out.forgeBonus = {
    unlocked: list(fb.unlocked).filter(id => typeof id === 'string'),
    equippedId: fb.equippedId==='combo_insight' ? 'extra_reroll' : typeof fb.equippedId === 'string' ? fb.equippedId : null,
    usesTotal: count(fb.usesTotal),
    specialtyOptions: map(fb.specialtyOptions),
    knowledgeMigrated: !!fb.knowledgeMigrated || fb.equippedId==='combo_insight',
  };
  out.codex = { ...defaults.codex, ...map(src.codex) };
  for (const key of Object.keys(out.codex)) out.codex[key] = map(out.codex[key]);
  out.unlockedCardIds = list(src.unlockedCardIds).filter(id => typeof id === 'string');
  out.unlockedTitles = list(src.unlockedTitles).filter(id => typeof id === 'string');
  out.arena = { ...defaults.arena, ...map(src.arena) };
  out.arena.school = map(out.arena.school);
  for (const [id, value] of Object.entries(out.arena.school)) {
    out.arena.school[id] = { ...map(value), cleared: list(value?.cleared).filter(Number.isInteger) };
  }
  for (const key of ['national', 'apex']) {
    out.arena[key] = { ...defaults.arena[key], ...map(out.arena[key]) };
    for (const field of ['wins', 'best']) out.arena[key][field] = count(out.arena[key][field]);
  }
  for (const key of ['matchWins', 'matchLosses']) out.arena[key] = count(out.arena[key]);
  out.arena.history = list(out.arena.history).filter(object);
  if(!object(src.workshopV41)) out.workshopV41=migrateVerifiedLegacyGrowth(out.workshopV41,out);
  const daily = map(src.daily);
  out.daily = { ...defaults.daily, ...daily };
  out.daily.dayKey = typeof daily.dayKey === 'string' ? daily.dayKey : defaults.daily.dayKey;
  out.daily.tasks = defaults.daily.tasks.map(task => {
    const saved = list(daily.tasks).find(item => object(item) && item.id === task.id);
    return { ...task, ...saved, done: saved?.done === true, claimed: saved?.claimed === true };
  });
  /* ★ 2026-10-24：全勤奖励已取消，不再归一化也不保留 `allBonusClaimed`。
     上面 `...daily` 会把旧存档的这个字段带进来，这里显式删掉 ——
     否则一个已废弃的字段会跟着存档一直传递下去。 */
  delete out.daily.allBonusClaimed;
  out.dailyScores = map(src.dailyScores);
  for (const key of Object.keys(out.dailyScores)) out.dailyScores[key] = count(out.dailyScores[key]);
  out.dailyStreak = count(src.dailyStreak);
  out.lastDailyDay = typeof src.lastDailyDay === 'string' ? src.lastDailyDay : null;
  out.showcaseId = typeof src.showcaseId === 'string' ? src.showcaseId : null;
  out.showcasePinned = src.showcasePinned === true;
  return out;
}


