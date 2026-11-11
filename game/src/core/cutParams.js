/** 赛事能力 + 局内强化 → 切割参数。arenaStat 仅作用于局内副本，保留永久属性。 */
import { BUFF_BY_ID, resonanceOf } from '../data/arena/buffs.js';
import { ARENA_STAT_CEILING as STAT_CURVE_CEILING, arenaStat, arenaGrowth, ARENA_POWER } from '../data/balance.js';
import { adaptBlade } from './bladeAdapter.js';
import { applyForgeCutTraits } from './forgeTraitCuts.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 把 buff 列表折成 mods（同名叠加：第 2 层起按 +60% 计） */
export function foldBuffMods(buffs = []) {
  const counts = new Map();
  for (const id of buffs) counts.set(id, (counts.get(id) || 0) + 1);
  const add = {};
  const mult = {};
  for (const [id, n] of counts) {
    const def = BUFF_BY_ID[id];
    if (!def) continue;
    const k = 1 + 0.6 * (n - 1);
    for (const [key, raw] of Object.entries(def.mods || {})) {
      const v = num(raw);
      if (key.endsWith('Mult')) {
        // 乘算项叠加：1.15 → 1 + 0.15×k
        mult[key] = (mult[key] ?? 1) * (1 + (v - 1) * k);
      } else {
        add[key] = (add[key] ?? 0) + v * k;
      }
    }
  }
  return { add, mult, counts };
}

/**
 * @param {object} stats 测试能力值（0…STAT_CURVE_CEILING；见 core/bladeAdapter）
 * @param {string[]} buffs 本场已持有的 buff id（可重复）
 */
export function deriveCutParams(stats, buffs = []) {
  /* ★ 能力值已经是曲线后的值；这里只做物理上限保护。
     传入大于 100 的能力会**得到大于 100 的效果** —— 这正是 T01 要的行为。 */
  const cap = (v) => clamp(num(v), 0, STAT_CURVE_CEILING);
  const s = {
    strength: cap(stats?.strength),
    sharpness: cap(stats?.sharpness),
    toughness: cap(stats?.toughness),
    craft: cap(stats?.craft),
    design: cap(stats?.design),
    spirit: cap(stats?.spirit),
  };
  const { add, mult } = foldBuffMods(buffs);
  const m = (key, dflt = 1) => mult[key] ?? dflt;
  const resonances=resonanceOf(buffs);
  const resonancePower=.04+s.spirit*.0002;

  // 铁匠之魂等：把韧性抬起来再参与刀况计算
  const tough = clamp(s.toughness + num(add.toughAdd), 0, STAT_CURVE_CEILING + 40);

  return {
    /* 命中几何 */
    radius: 0.095 * m('radiusMult'),
    tolerance: (0.275 + s.design * 0.0028 + s.craft * 0.00075) * m('toleranceMult'),
    perfectMult: m('perfectMult'),

    /* 进度 */
    softBase: arenaGrowth(s.sharpness * .8 + s.craft * .2, ARENA_POWER.soft),
    hardBase: arenaGrowth(s.strength * .55 + s.sharpness * .3 + s.craft * .15, ARENA_POWER.hard),
    speedBonus: 1.35 * m('speedBonusMult'),
    hardPowerMult: m('hardPowerMult'),
    crackPowerMult: m('crackPowerMult'),

    /* 连击 */
    comboWindow: 1.65 + num(add.comboWindow) + (resonances.includes('combo')?.2:0),
    comboStep: 0.09 + num(add.comboStep),
    comboCap: resonances.includes('combo')?.8:.7,
    resonancePower,
    tripleBonus: num(add.tripleBonus),

    /* 得分 */
    spiritMult: 1,
    softSharpWall: 0,
    scoreMult: m('scoreMult'),
    softScoreMult: m('softScoreMult'),
    flatPerKill: num(add.flatPerKill),
    flawlessMult: m('flawlessMult'),
    lowHealthScore: !!num(add.lowHealthScore),
    winStreakMult: m('winStreakMult'),

    /* 刀况 */
    healthMax: Math.max(20, (100 + num(add.healthMaxAdd)) * m('healthMaxMult')),
    healthStart: num(add.healthStart),
    wearHardMult: m('wearHardMult'),
    wearShiftMult: m('wearShiftMult'),
    noWearUntil: num(add.noWearUntil),
    killHeal: num(add.killHeal),
    layerHeal: num(add.layerHeal),
    emergencyHeal: num(add.emergencyHeal),
    wearRate: arenaGrowth(tough * .8 + s.design * .2, ARENA_POWER.wear),
    tough, design: s.design, stats: s,

    /* 狂热 */
    frenzyThreshold: add.frenzyThreshold ? num(add.frenzyThreshold) : 3,
    frenzyMult: Math.max(1.5, m('frenzyMult',1.5)),
    frenzyHardBreak: !!num(add.frenzyHardBreak),

    /* V3 机制强化；仅当局状态消费 */
    weakMap: num(add.weakMap), pierce: num(add.pierce), crackSpread: num(add.crackSpread),
    armorBounty: num(add.armorBounty), marked: num(add.marked), directional: num(add.directional),
    nextCutBoost: num(add.nextCutBoost), weakScore: num(add.weakScore),
    waveBlade: num(add.waveBlade), iceChain: num(add.iceChain), deathSave: num(add.deathSave),
    objectiveMult: num(add.objectiveGain), armorShield: num(add.armorShield),

    /* 投放 */
    intervalMult: m('intervalMult', 1),
    materialBias: num(add.materialBias),
  };
}

/**
 * 从一把成刀（BladeRecord 或已适配视图）直接得到切割参数。
 *
 * ★ 这是 UI / 赛事入口应该用的那个函数：它内部只经 bladeAdapter 换算一次，
 *   调用方不需要（也不应该）自己准备能力值。传入裸六维也可以工作，
 *   因为 adaptBlade 会按同一条曲线换算 —— 不会出现两套标尺。
 *
 * @param {object} blade BladeRecord 或 adaptBlade() 的结果
 * @param {string[]} buffs
 */
export function deriveCutParamsForBlade(blade, buffs = []) {
  const view = blade && blade.version && blade.capabilities
    ? blade                 // 已经是适配视图，不重复换算
    : adaptBlade(blade);
  const params = applyForgeCutTraits(deriveCutParams(Object.fromEntries(Object.entries(view.permanentStats).map(([k,v])=>[k,arenaStat(v)])), buffs), blade);
  // 把适配结果挂在参数上，供 UI 展示「为什么这把刀在这项更强」
  params.adaptation = {
    version: view.version,
    effectVersion: view.effectVersion,
    bladeId: view.bladeId,
    knifeTypeId: view.knifeTypeId,
    knifeProfileLabel: view.knifeProfileLabel,
    projectFactor: view.projectFactor,
    effectSummary: view.effectSummary,
  };
  return params;
}

/** 给 UI 的「本刀参数」卡：五条可读指标 */
export function describeParams(P) {
  return [
    { key: 'radius', name: '刃长', value: `+${Math.round((P.radius / 0.095 - 1) * 100)}%`, ratio: clamp((P.radius - 0.095) / 0.03, 0, 1) },
    { key: 'hard', name: '突破', value: P.hardBase.toFixed(2), ratio: clamp((P.hardBase - 0.28) / 0.25, 0, 1) },
    { key: 'tol', name: '容差', value: `${Math.round(P.tolerance * 180 / Math.PI)}°`, ratio: clamp((P.tolerance - 0.27) / 0.18, 0, 1) },
    { key: 'combo', name: '连击窗', value: `${P.comboWindow.toFixed(2)}s`, ratio: clamp((P.comboWindow - 1.65) / 0.6, 0, 1) },
    { key: 'score', name: '得分', value: `×${(P.spiritMult * P.scoreMult).toFixed(2)}`, ratio: clamp((P.spiritMult * P.scoreMult - 0.9) / 0.5, 0, 1) },
  ];
}

export default { deriveCutParams, deriveCutParamsForBlade, foldBuffMods, describeParams };
