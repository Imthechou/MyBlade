/**
 * 数据配置层 · 决策卡（唯一真源）
 *
 * 218 张卡的内容来自已交付的决策卡 V1.1（data/legacy/cardsV11.js），
 * 本文件只做三件事，不重写任何卡面文案与数值语义：
 *
 *   ① 归一化字段 —— 把「卡定义 + write（视觉写入）+ visualSpec（视觉规格）」
 *      三处分散的数据合并成一张扁平卡对象，消除 V1 里 core/cards.js 需要
 *      同时读 card.write / card.variants / cardWrites 三个来源的混乱；
 *   ② 应用标定系数 —— statDelta 统一乘 balance.CARD_STAT_SCALE（理由见该文件）；
 *   ③ 派生展示信息 —— 属性方向（V2.1 §7 要求"不显示精确数字，只显示方向与强弱"）。
 *
 * ⚠ 卡池是**静态只读**数据：core 只读取，不在运行时改动本表。
 */

import { CARD_STAT_SCALE, STAT_KEYS } from './balance.js';
import { normalizeForgeCardStats } from './forgeStatBalance.js';
import { cardWrites } from './legacy/cardWrites.js';
import { cardsV11 } from './legacy/cardsV11.js';

/** 稀有度中文名（V1 卡表自带，直接复用，不另建一份） */
export const RARITY_CN = Object.freeze({
  common: '普通', fine: '精良', rare: '稀有',
  epic: '史诗', legend: '传说', mythic: '神话',
});

/** 六维增量的定性强度（V2.1 §7：明显强化 / 略微强化 / 保持 / 牺牲） */
const STRONG = 12;
const WEAK = 4;

export function directionOf(deltaValue) {
  const v = Number(deltaValue) || 0;
  if (v >= STRONG) return { key: 'up2', label: '明显强化' };
  if (v >= WEAK) return { key: 'up1', label: '略微强化' };
  if (v <= -STRONG) return { key: 'down2', label: '明显牺牲' };
  if (v <= -WEAK) return { key: 'down1', label: '略微牺牲' };
  if (v !== 0) return { key: 'flat', label: '基本保持' };
  return null;
}

function scaleStats(statDelta) {
  const out = {};
  if (!statDelta) return out;
  for (const k of STAT_KEYS) {
    const v = Number(statDelta[k]) || 0;
    if (v === 0) continue;
    // 标定到 V2.1 的六维量级（见 balance.CARD_STAT_SCALE 注释）
    out[k] = Math.round(v * CARD_STAT_SCALE);
  }
  return out;
}

function normalizeCard(raw) {
  const write = cardWrites.get ? cardWrites.get(raw.id) : null;
  const statDelta = normalizeForgeCardStats(raw, scaleStats(raw.statDelta));
  const directions = {};
  for (const k of STAT_KEYS) {
    const d = directionOf(statDelta[k]);
    if (d) directions[k] = d;
  }
  return Object.freeze({
    id: raw.id,
    stage: raw.stage,
    stageIndex: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'].indexOf(raw.stage),
    name: raw.name,
    rarity: raw.rarity,
    rarityCn: RARITY_CN[raw.rawRarity] || RARITY_CN[raw.rarity] || raw.rarity,
    role: raw.role || '',
    focus: raw.focus || '',
    pool: raw.pool || '基础池',
    statDelta: Object.freeze(statDelta),
    /** 定性方向（UI 展示用，不含精确数字） */
    directions: Object.freeze(directions),
    riskDeltaPoints: Number(raw.riskDeltaPoints) || 0,
    riskLabel: raw.riskLabel || '',
    tags: Object.freeze((raw.tags || []).slice()),
    copy: raw.copy || '',
    /** 视觉：规格 + 写入合并成一处，渲染门面直接消费 */
    visual: Object.freeze({
      recipeKey: (raw.visualSpec || {}).recipeKey || null,
      slots: ((raw.visualSpec || {}).slots || []).slice(),
      targetDescription: (raw.visualSpec || {}).targetDescription || '',
      assetRef: raw.assetRef != null ? raw.assetRef : ((raw.visualSpec || {}).assetRef || null),
      write: Object.freeze(write ? { ...write } : {}),
    }),
  });
}

export const CARDS = Object.freeze(cardsV11.CARDS.map(normalizeCard));

export const CARD_BY_ID = Object.freeze(Object.fromEntries(CARDS.map((c) => [c.id, c])));

/** 按阶段索引：BY_STAGE.S1 … BY_STAGE.S9 */
export const BY_STAGE = Object.freeze(
  CARDS.reduce((acc, c) => {
    (acc[c.stage] = acc[c.stage] || []).push(c);
    return acc;
  }, {})
);

/** 抽卡权重：越稀有越难出（V1 卡表自带 RARITY_WEIGHT 语义） */
export const RARITY_WEIGHT = Object.freeze({
  common: 100, fine: 62, rare: 30, epic: 14, legend: 6, mythic: 2,
});

export const STAGE_ORDER = Object.freeze(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);

/**
 * 卡在**本阶段池内**的位次（1 起）。
 *
 * ★ 这不是"展示序号"，而是**逐卡视觉指纹的分配基准**：
 *   渲染层的 `cardVisuals.resolve()` 用 rank 同时决定三件事 ——
 *   纹样 motif（MOTIFS[rank-1]）、色相栅格（`((rank-1)*7 % 25)/25`）、
 *   以及纹样尺度 scale。改这里的顺序就等于改每一张卡的观感。
 *   原项目由 `cardPools.decorateVisuals()` 按池顺序赋 `visualRank = index + 1`，
 *   这里把同一份规则收在数据层，避免 core / 渲染层各写一份而漂移。
 *
 * ⚠ `cardVisuals.resolve()` 在拿不到 visualRank 时会退回"id 尾号"当 rank。
 *   ⚠ 实测（2026-10-15，对照 docs/ui-compare/card-effects/_manifest.json）：218 张卡里
 *     有 **25 张尾号与池位次对不上，全部落在 S5** —— S5 池的第 1 位是 `S5_25`，
 *     于是 S5_01…S5_24 整体错位 1。所以这里**必须显式给出 rank**，绝不能靠尾号回落
 *     （一次探针就因信了这条回退，量出 rank 6 而真值 7 的错基线）。
 */
const STAGE_RANK = new Map();
for (const sid of STAGE_ORDER) {
  (BY_STAGE[sid] || []).forEach((c, i) => STAGE_RANK.set(c.id, i + 1));
}

/** 取卡在本阶段池内的位次（1 起）；未知卡返回 0（渲染层会退回 id 尾号）。 */
export const stageRankOf = (cardOrId) => {
  const id = typeof cardOrId === 'string' ? cardOrId : (cardOrId && cardOrId.id);
  return (id && STAGE_RANK.get(id)) || 0;
};

export const getCard = (id) => CARD_BY_ID[id] || null;
export const cardsOfStage = (stageId) => BY_STAGE[stageId] || [];
export const cardCount = CARDS.length;

export default CARDS;
