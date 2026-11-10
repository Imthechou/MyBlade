/**
 * 核心玩法层 · S10 鉴定（V2.1 §14）
 *
 * 鉴定是整局最终结算，不再改变已经形成的 3D 视觉事实。
 * 结算顺序严格按 V2.1 §14：
 *   1 冻结材料、刀型、阶段卡、Risk 履历、锤击成果和刃线操作记录
 *   2 根据基础标签最终层数生成相应等级的特性
 *   3 加入特殊标签绑定特性
 *   4 正式揭晓已满足条件的隐藏 Combo 特性
 *   5 结算 S4 额外锻打特性强化等级
 *   6 根据所有真实效果计算最终六维，避免重复计算
 *   7 以六维均值和特性倍率计算成刀评分
 *   8 综合评分和作品独特性确定品质与稀有度
 *   9 保存永久成刀记录
 *
 * ★ 第 9 步的"保存"不在这里做 —— 存档与图鉴/成就结算交给 core/progress.js，
 *   本文件只产出 BladeRecord，保持纯函数式，便于无头验证。
 */

import { STAGES } from '../data/stages.js';
import { hammerTierTraitId } from '../data/traits.js';
import { KNIFE_BY_ID, bladeNameOf } from '../data/knifeTypes.js';
import { tagName } from '../data/tags.js';
import * as Attr from './attributes.js';
import * as Tags from './tags.js';
import * as Traits from './traits.js';
import * as Combos from './combos.js';
import * as Hammer from './hammer.js';
import { resultView as edgeResultView } from './edge.js';
import * as Scoring from './scoring.js';

let sequence = 0;

/**
 * @param {object} run 已走到 S10（或已断裂）的 RunState
 * @returns {object} BladeRecord
 */
export function appraise(run) {
  // ── 1. 冻结 ──
  const frozen = {
    seed: run.seed,
    mode: run.mode,
    knifeTypeId: run.knifeTypeId,
    knifeType: knifeModelId(run.knifeTypeId),
    history: run.history.slice(),
    riskCurrent: run.risk.current,
    riskPeak: run.risk.peak,
    hammerCount: run.hammer.count,
    hammerProgress: run.hammer.progress,
    hammerTier: run.hammer.tier,
    edge: run.edge ? { ...run.edge } : null,
    visualRecipe: run.visualRecipe.slice(),
    pendingSkin: JSON.parse(JSON.stringify(run.pendingSkin || {})),
    completedStages: run.completedStages.slice(),
  };

  // 断刀：保留经历与发现，但不生成完整成刀评分，也不能参赛（V2.1 §9.2 / §13.2）
  if (run.fractured) {
    return {
      id: makeId(run),
      createdAt: Date.now(),
      fractured: true,
      ...frozen,
      stats: Attr.clone(run.stats),
      traits: run.traits.slice(),
      combos: run.combos.slice(),
      comboDiscoveries: run.comboDiscoveries.slice(),
      tags: Tags.counts(run.ledger),
      fractureInfo: { ...run.fractureInfo },
      score: 0,
      rarity: null,
      quality: null,
      canEnterArena: false,
    };
  }

  // ── 2. 基础标签特性（正式授予，六维在此刻生效） ──
  const baseGranted = Traits.settleBaseTraits(run);
  // ── 3. 特殊标签特性（锻造期已登记，这里确保结算） ──
  const specialGranted = Traits.settleSpecialTags(run);
  // ── 4. 隐藏 Combo（最后一次检测，避免 S9 刚命中漏掉） ──
  const comboNew = Combos.evaluate(run);
  // ── 5. S4 锻打特性强化等级 ──
  const hammerInfo = Hammer.traitFor(run);
  const hammerTraitId = hammerTierTraitId(hammerInfo.mixed ? 'mixed' : hammerInfo.tagId, run.hammer.tier);
  let hammerGranted = null;
  if (hammerTraitId && Traits.grant(run, hammerTraitId, 'hammer')) hammerGranted = hammerTraitId;

  // ── 6/7. 最终六维与评分 ──
  const baseTagTiers = Tags.baseTagTiers(run.ledger);
  const scoreResult = Scoring.computeScore({
    stats: run.stats,
    baseTagTiers,
    traits: run.traits,
    combos: run.combos,
    hammerTier: run.hammer.tier,
    hammerTierReward: Hammer.tierReward(run.hammer.tier),
    hammerTierName: Hammer.tierName(run.hammer.tier),
    peakRisk: run.risk.peak,
  });

  // ── 8. 品质与稀有度 ──
  const rarity = Scoring.resolveRarity(scoreResult.score, run.traits);
  const quality = Scoring.qualityOf(scoreResult.mean);

  const record = {
    id: makeId(run),
    createdAt: Date.now(),
    fractured: false,
    ...frozen,
    stagePath: run.history.slice(),

    stats: Attr.clone(run.stats),
    statMean: scoreResult.mean,
    score: scoreResult.score,
    scoreDetail: scoreResult,
    rarity: rarity.id,
    rarityName: rarity.name,
    rarityRaisedByFloor: rarity.raisedByFloor,
    quality: quality.id,
    qualityName: quality.name,

    traits: run.traits.slice(),
    traitSources: { ...run.traitSources },
    traitResonance: run.traitResonance.slice(),
    granted: { base: baseGranted, special: specialGranted, combo: comboNew, hammer: hammerGranted },

    combos: run.combos.slice(),
    comboDiscoveries: run.comboDiscoveries.slice(),
    tags: Tags.counts(run.ledger),
    tagTiers: baseTagTiers,

    hammerTrait: hammerInfo,
    hammerTraitId,
    hammerTierName: Hammer.tierName(run.hammer.tier),
    edge: run.edge ? { ...run.edge } : null,

    bladeName: null,        // 由 data/knifeTypes.bladeNameOf 在展示层生成
    arenaRecord: { matches: 0, wins: 0, losses: 0, best: null },
    canEnterArena: true,
  };
  record.bladeName = bladeNameOf(record);
  return record;
}

function knifeModelId(typeId) {
  if (!typeId) return null;
  const t = KNIFE_BY_ID[typeId];
  return t ? t.modelId : null;
}

function makeId(run) {
  sequence += 1;
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `BLD-${ds}-${String(run.seed % 100000).padStart(5, '0')}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

/**
 * 揭晓顺序（V2.1 §14.1）—— UI 按这个顺序分步播放：
 * 成刀亮相 → 六维揭晓 → 特性结算 → 评分跃升 → 结果解释 → 长期去向
 */
export function revealSteps(record) {
  const traitGroups = {
    base: [],
    special: [],
    hammer: [],
    combo: [],
    legacy: [],
  };
  for (const id of record.traits) {
    const kind = (record.traitSources && record.traitSources[id]) || 'legacy';
    if (kind === 'baseTag') traitGroups.base.push(id);
    else if (kind === 'specialTag') traitGroups.special.push(id);
    else if (kind === 'hammer') traitGroups.hammer.push(id);
    else if (kind === 'combo') traitGroups.combo.push(id);
    else traitGroups.legacy.push(id);
  }
  return [
    { key: 'reveal', title: '成刀亮相', rarity: record.rarityName, score: record.score },
    { key: 'stats', title: '六维揭晓', stats: Attr.clone(record.stats), mean: record.statMean },
    { key: 'traits', title: '特性结算', groups: traitGroups },
    { key: 'score', title: '评分跃升', detail: record.scoreDetail },
    { key: 'explain', title: '结果解释', lines: explain(record) },
  ];
}

/** 结果解释（V2.1 §14.1 第 5 条）：影响最大的 1–3 项工艺选择 / 收锤时机 / Risk 经营 / S7 */
function explain(record) {
  const lines = [];
  const tags = Object.entries(record.tags || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (tags.length) {
    // ★ 这里必须进过 tagName：直接打 tagId 会渲染成 "stable×3 / oxide×2"（内部英文槽位名）
    lines.push(`主要工艺路线：${tags.map(([t, n]) => `${tagName(t)}×${n}`).join('、')}`);
  }
  lines.push(`S4 收锤：${record.hammerCount} 锤，强化档位「${record.hammerTierName}」`);
  lines.push(`Risk 经营：峰值 ${record.riskPeak}（峰值倍率 ×${record.scoreDetail.peakMult}），收尾 ${record.riskCurrent}`);
  const edgeView = edgeResultView(record.edge);
  if (edgeView) lines.push(`S7 刃线：${edgeView.label}（贴合度 ${edgeView.fitText}）`);
  if (record.combos.length) lines.push(`隐藏组合：${record.combos.join('、')}`);
  return lines;
}

export default { appraise, revealSteps };
