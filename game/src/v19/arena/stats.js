import { STAT_CAP } from '../forge.js';

export const ARMOR_BODY_SHARE = .57;

export function arenaBladeStats(stats) {
  const values = stats.map(value => Math.max(0, Math.min(STAT_CAP, value)));
  const [strength, toughness, sharpness, craft, design, spirit] = values;
  return {
    power: Math.round((strength + sharpness) / 2),
    control: Math.round((toughness + craft) / 2),
    art: Math.round((design + spirit) / 2),
    strongest: values.indexOf(Math.max(...values)),
    penetration: .46 + strength * .0095,
    edge: .47 + sharpness * .010,
    efficiency: .73 + craft * .0045,
    wearResistance: .50 + toughness * .012,
    markRadius: 15 + design * .12,
    chainWindow: .72 + design * .006,
    deflectTempo: .76 - design * .006,
    scoreMultiplier: .75 + spirit * .0038,
  };
}

export function strikeDamage(blade, target, tempo, durability, bonus = 1) {
  if (!target.armored && !target.reinforced) return target.hp;
  const wearPenalty = durability < 20 ? .82 : 1;
  const variation = 1 + (target.variation - .5) * .08;
  const effort = (55 + tempo * 45) * blade.efficiency * wearPenalty * variation * bonus;
  if (!target.armored) return Math.min(target.hp, effort * blade.edge);

  // Spend the swipe on the shell first, then apply any remaining effort to the cut.
  const shell = Math.max(0, target.hp - target.maxHp * ARMOR_BODY_SHARE);
  const shellEffort = Math.min(effort, shell / blade.penetration);
  const shellDamage = shellEffort * blade.penetration;
  const cutDamage = (effort - shellEffort) * blade.edge;
  return Math.min(target.hp, target.maxHp * .72, shellDamage + cutDamage);
}

export function wearCost(blade, target, force, scale, specialtyBonus = 0) {
  const impact = target.armored ? 1.76 : target.reinforced ? 1.18 : .86;
  return target.m.wear * impact * (.90 + force * .18) * scale /
    (blade.wearResistance * (1 + specialtyBonus));
}

export function deflectsSwipe(blade, target, tempo, priorHits) {
  return priorHits > 0 && target.armored && target.hp > target.maxHp * ARMOR_BODY_SHARE &&
    tempo < blade.deflectTempo;
}
