/**
 * 数据层 · 赛事切割强化（buff / 海克斯）
 *
 * 45 秒一局：0 / 15 / 30 秒同品质三选一，选卡冻结时钟；每轮独立构筑。
 * 同一个 buff 可以被重复抽到并叠加（第 2 层起按 +60% 计），这是构筑的主线。
 *
 * 只影响单场切割参数，不写永久存档 —— 由 core/cutParams.js 统一折成参数。
 *
 * mods 键名约定：
 *   · 结尾 Mult 的是乘算（1.15 = +15%），叠层按 1 + (v-1)×1.6 计
 *   · 其余为加算
 */

export const BUFF_TIERS = Object.freeze({
  silver: { id: 'silver', name: '银', weight: 0.55, color: '#C9D6DC' },
  gold: { id: 'gold', name: '金', weight: 0.33, color: '#E8C57A' },
  prismatic: { id: 'prismatic', name: '彩', weight: 0.12, color: '#9FE3DA' },
});

export const BUFF_FAMILIES = Object.freeze({
  blade: '刀强化',
  run: '局内',
  score: '结算',
  risk: '风险',
});

export const BUFFS = Object.freeze([
  /* ── 银：手感补齐 ───────────────────────────────── */
  { id: 'whetstone', name: '磨石', tier: 'silver', family: 'blade', desc: '刀况上限 +15',
    mods: { healthMaxAdd: 15 } },
  { id: 'sharpening', name: '开刃', tier: 'silver', family: 'blade', desc: '角度容差 +15%',
    mods: { toleranceMult: 1.15 } },
  { id: 'grindwheel', name: '砂轮', tier: 'silver', family: 'blade', desc: '切割半径 +8%',
    mods: { radiusMult: 1.08 } },
  { id: 'bloodgroove', name: '血槽', tier: 'silver', family: 'score', desc: '跨划连击窗口 +0.25 秒（连击段位提高得分）',
    mods: { comboWindow: 0.25 } },
  { id: 'withgrain', name: '顺纹', tier: 'silver', family: 'score', desc: '软靶得分 +15%',
    mods: { softScoreMult: 1.15 } },
  { id: 'cladsteel', name: '包钢', tier: 'silver', family: 'risk', desc: '硬靶刀损 −15%',
    mods: { wearHardMult: 0.85 } },
  { id: 'steadyhand', name: '稳手', tier: 'silver', family: 'risk', desc: '偏斜（弹刃）刀损 −30%',
    mods: { wearShiftMult: 0.7 } },
  { id: 'pickings', name: '拾遗', tier: 'silver', family: 'risk', desc: '刀况低于 60% 时，每斩断 1 件回复 1 点',
    mods: { killHeal: 1 } },
  { id: 'quickhand', name: '快手', tier: 'silver', family: 'blade', desc: '手势速度对进度的加成 +15%',
    mods: { speedBonusMult: 1.15 } },

  /* ── 金：玩法倾向 ───────────────────────────────── */
  { id: 'sanmai', name: '夹钢', tier: 'gold', family: 'risk', desc: '硬靶每破一层，刀况回复 5',
    mods: { layerHeal: 5 } },
  { id: 'claycoat', name: '覆土烧刃', tier: 'gold', family: 'risk', desc: '每局前 6 秒不扣刀况',
    mods: { noWearUntil: 6 } },
  { id: 'foldedsteel', name: '折叠锻打', tier: 'gold', family: 'score', desc: '每完成一次三连，本局得分倍率 +0.06（上限 +0.36）',
    mods: { tripleBonus: 0.06 } },
  { id: 'longblade', name: '长刃', tier: 'gold', family: 'blade', desc: '切割半径 +18%',
    mods: { radiusMult: 1.18 } },
  { id: 'layerbreak', name: '破层', tier: 'gold', family: 'blade', desc: '硬靶每刀进度 +12%',
    mods: { hardPowerMult: 1.12 } },
  { id: 'piecework', name: '计件', tier: 'gold', family: 'score', desc: '每斩断 1 件额外 +12 固定分',
    mods: { flatPerKill: 12 } },
  { id: 'chainmult', name: '连乘', tier: 'gold', family: 'score', desc: '连击倍率每级 +0.08',
    mods: { comboStep: 0.08 } },
  { id: 'tempering', name: '回火', tier: 'gold', family: 'risk', desc: '每局一次：刀况低于 30% 时立即回复 30',
    mods: { emergencyHeal: 30 } },

  /* ── 彩：构筑核心 ───────────────────────────────── */
  { id: 'noself', name: '无我', tier: 'prismatic', family: 'score', desc: '一划二断触发狂热，狂热期得分 ×2.0',
    mods: { frenzyThreshold: 2, frenzyMult: 2.0 } },
  { id: 'smithsoul', name: '铁匠之魂', tier: 'prismatic', family: 'blade', desc: '韧性 +30，破甲获得 2 点临时防护（上限 8）',
    mods: { toughAdd: 30, armorShield: 2 } },
  { id: 'grandslam', name: '满贯', tier: 'prismatic', family: 'score', desc: '零漏切并完成本局目标，结算 ×1.3',
    mods: { flawlessMult: 1.3 } },
  { id: 'allin', name: '孤注', tier: 'prismatic', family: 'risk', desc: '本局得分 ×1.4，但刀况上限 −35%',
    mods: { scoreMult: 1.4, healthMaxMult: 0.65 } },
  { id: 'bloodblade', name: '血刃', tier: 'prismatic', family: 'score', desc: '刀况越低得分越高，最高 ×2',
    mods: { lowHealthScore: 1 } },
  { id: 'artisansoul', name: '匠魂', tier: 'prismatic', family: 'score', desc: '完成每段特殊目标，本局倍率 +8%（上限 +24%）',
    mods: { objectiveGain: .08 } },
  { id: 'quenchheat', name: '淬火余温', tier: 'prismatic', family: 'blade', desc: '狂热期间硬靶一刀必破（完整硬靶同样击破，正常记分并承担刀损）',
    mods: { frenzyHardBreak: 1 } },

  { id:'weakmap', name:'弱点测绘', tier:'silver', family:'blade', tags:['precise','crack'], desc:'弱点命中范围 +40%，弱点切入效率提高', mods:{weakMap:1} },
  { id:'piercing', name:'贯穿之刃', tier:'gold', family:'blade', tags:['precise'], desc:'精准斩断后，沿刀路向下一目标传递 65% 切入伤害', mods:{pierce:.65} },
  { id:'crackrelay', name:'裂纹传导', tier:'gold', family:'run', tags:['crack'], desc:'冰块交叉切割向附近最多 2 个目标传播裂纹', mods:{crackSpread:.35} },
  { id:'armorbounty', name:'破甲悬赏', tier:'gold', family:'score', tags:['armor'], desc:'有效破甲奖励 45 分，硬靶终结额外 20 分', mods:{armorBounty:45} },
  { id:'markedhunt', name:'标记狩猎', tier:'gold', family:'score', tags:['precise'], desc:'每第 5 个目标限时标记，命中弱点终结额外 120 分', mods:{marked:120} },
  { id:'direction', name:'定向刀势', tier:'gold', family:'blade', tags:['combo'], desc:'连续同向有效切割提高效率，每层 +8%，上限 32%', mods:{directional:.08} },
  { id:'armorchain', name:'碎甲连斩', tier:'gold', family:'blade', tags:['armor'], desc:'破甲后 1.8 秒内下一次切割效率 +40%', mods:{nextCutBoost:.4} },
  { id:'weakfinish', name:'精准终结', tier:'gold', family:'score', tags:['precise'], desc:'命中弱点斩断额外 40 分', mods:{weakScore:40} },
  { id:'iceedge', name:'冰纹刀路', tier:'gold', family:'blade', tags:['crack'], desc:'冰块与塑板的切入效率 +25%', mods:{crackPowerMult:1.25} },
  { id:'myriad', name:'万刃归宗', tier:'prismatic', family:'run', tags:['combo'], desc:'每次一划三断发出短距离剑气，每划仅触发一次', mods:{waveBlade:1.1} },
  { id:'glacier', name:'冰河连锁', tier:'prismatic', family:'run', tags:['crack'], desc:'冰块断裂引发最多 3 次连锁碎裂；次级击破仅记 35% 分', mods:{iceChain:1.2} },
  { id:'unbroken', name:'百炼不折', tier:'prismatic', family:'risk', tags:['risk'], desc:'首次致命刀损保命并恢复 20 点临时刀况', mods:{deathSave:20} },
]);

export const BUILD_TAGS = Object.freeze({
  combo:'连斩', precise:'精准', armor:'破甲', crack:'裂变', risk:'险刃',
});
const TAGS = {
  bloodgroove:'combo', chainmult:'combo', foldedsteel:'combo', longblade:'combo',
  sharpening:'precise', grandslam:'precise', layerbreak:'armor', cladsteel:'armor', sanmai:'armor', quenchheat:'armor',
  pickings:'risk', tempering:'risk', bloodblade:'risk', allin:'risk', smithsoul:'armor',
};
export function resonanceOf(owned=[]) {
  const counts={};
  for(const id of new Set(owned)) {
    const b=BUFFS.find(x=>x.id===id);
    for(const tag of b?.tags || (TAGS[id]?[TAGS[id]]:[])) counts[tag]=(counts[tag]||0)+1;
  }
  return Object.keys(counts).filter(tag=>counts[tag]>=2);
}

export const BUFF_BY_ID = Object.freeze(Object.fromEntries(BUFFS.map((b) => [b.id, b])));

/** 按档位权重抽 n 张，且优先给"已持有、还能再叠"的 buff（保证叠层摸得到）。 */
export function rollBuffChoices(rng, owned = [], count = 3) {
  const ownedCount = new Map();
  for (const id of owned) ownedCount.set(id, (ownedCount.get(id) || 0) + 1);
  const roll=rng();
  const tier=roll<.55?'silver':roll<.88?'gold':'prismatic';
  const pool=BUFFS.filter(b=>b.tier===tier && (ownedCount.get(b.id)||0)<3);
  const picks=[];
  while(pool.length && picks.length<count) {
    const index=Math.min(pool.length-1,Math.floor(rng()*pool.length));
    picks.push(pool.splice(index,1)[0].id);
  }
  return picks;
}

export default { BUFFS, BUFF_BY_ID, BUFF_TIERS, BUFF_FAMILIES, rollBuffChoices };
