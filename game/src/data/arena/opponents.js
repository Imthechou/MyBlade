/**
 * 数据配置层 · 赛事对手
 *
 * 对手画像沿用已交付的生成器（data/legacy/arenaOpponents.js：预算 → 六维 → 特性），
 * 本文件补上 V2.1 要求的两件事：
 *   · 对手的**轻量战术倾向**（主动进攻 / 稳守 / 精密 / 重视表现）（§18）
 *   · 成刀评分（赛事需要「评分对抗分」，见 §15.2）
 */

import { arenaOpponents } from '../legacy/arenaOpponents.js';
import { arenaStyles } from '../legacy/arenaStyles.js';
import { STAT_KEYS, FACE_REF, OPPONENT_STAT_SCALE } from '../balance.js';
import { FACES } from '../balance.js';

/** 四种轻量战术倾向（V2.1 §18） */
export const TENDENCIES = Object.freeze([
  { id: 'aggressive', name: '主动进攻', face: 'POWER', desc: '倾向于在力量对抗面上施压' },
  { id: 'defensive', name: '稳守', face: 'CONTROL', desc: '倾向于消耗与稳定对抗面' },
  { id: 'precise', name: '精密', face: 'CONTROL', desc: '倾向于在工艺对抗面上较真' },
  { id: 'expressive', name: '重视表现', face: 'ART', desc: '倾向于在设计/灵性对抗面上争胜' },
]);

export const tendencyById = (id) => TENDENCIES.find((t) => t.id === id) || TENDENCIES[0];

/** 由对手六维推出主要倾向 */
export function tendencyOfStats(stats) {
  let best = TENDENCIES[0];
  let bestV = -1;
  for (const t of TENDENCIES) {
    const keys = FACES[t.face].stats;
    const v = keys.reduce((a, k) => a + (Number(stats[k]) || 0), 0);
    if (v > bestV) { bestV = v; best = t; }
  }
  return best;
}

/**
 * 造一名流派赛对手。
 * @param {string} styleId 分支 id
 * @param {number} tier 梯度 0–4
 * @param {number|string} seed
 */
export function makeBranchOpponent(styleId, tier, seed) {
  const raw = arenaOpponents.makeTierOpponent
    ? arenaOpponents.makeTierOpponent(styleId, tier, seed)
    : null;
  if (!raw) return null;
  return decorate(raw, styleId, tier);
}

/**
 * 造一名全国赛 / 全球巅峰赛对手（随机分支）。
 * @param {number} tier 预算档 0–4
 * @param {number|string} seed
 * @param {string} [styleId] 指定分支（全球巅峰赛按主题指定）
 */
export function makeTournamentOpponent(tier, seed, styleId = null) {
  const styles = arenaStyles.STYLES || [];
  if (!styles.length) return null;
  let sid = styleId;
  if (!sid) {
    const n = Math.abs(hash(String(seed))) % styles.length;
    sid = styles[n].id;
  }
  const raw = arenaOpponents.makeTierOpponent
    ? arenaOpponents.makeTierOpponent(sid, tier, seed)
    : null;
  if (!raw) return null;
  return decorate(raw, sid, tier);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** 补上 V2.1 需要的字段：倾向 + 成刀评分 */
function decorate(raw, styleId, tier) {
  const stats = {};
  /* 对手预算表是按卡池 2.0 倍标定的，这里同步到当前 CARD_STAT_SCALE ——
     否则玩家（或对手）会恒定碾压，赛事退化（见 balance.OPPONENT_STAT_SCALE）。 */
  for (const k of STAT_KEYS) stats[k] = Math.round((Number(raw.stats && raw.stats[k]) || 0) * OPPONENT_STAT_SCALE);
  const tendency = tendencyOfStats(stats);
  /* 对手成刀评分（§15.2 评分对抗分需要它）。
     对手不是玩家那样"六维 × 倍率"算出来的，这里用**同一个公式的简化版**：
     六维均值 × 该梯度对应的倍率档。梯度越高倍率越大，且不超过玩家可达上限，
     保证评分对抗分始终是一个"相对"量，不会因数值膨胀而碾压。 */
  const mean = STAT_KEYS.reduce((a, k) => a + stats[k], 0) / STAT_KEYS.length;
  const score = Math.round(mean * [1.05, 1.25, 1.55, 1.9, 2.3][Math.max(0, Math.min(4, tier | 0))]);
  return Object.freeze({
    id: raw.id,
    name: raw.name,
    styleId,
    tier,
    knifeType: raw.knifeType,
    knifeName: raw.knifeName || '',
    stats: Object.freeze(stats),
    score,
    sixMean: Math.round(mean * 10) / 10,
    traits: Object.freeze((raw.traits || []).slice()),
    tendency: tendency.id,
    tendencyName: tendency.name,
    /** 信息透明度：低阶赛事更透明（V2.1 §18 / §20） */
    revealed: tier <= 2,
  });
}

/** 对手的三个对抗面强度（0–100，与玩家同一把尺） */
export function faceScores(stats) {
  const out = {};
  for (const [face, def] of Object.entries(FACES)) {
    const mean = def.stats.reduce((a, k) => a + (Number(stats[k]) || 0), 0) / def.stats.length;
    out[face] = Math.max(0, Math.min(100, (mean / FACE_REF) * 100));
  }
  return out;
}

export default { makeBranchOpponent, makeTournamentOpponent, faceScores, tendencyOfStats, TENDENCIES };
