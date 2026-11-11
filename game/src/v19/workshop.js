import { WORKSHOP_TIERS } from '../core/arenaV41Growth.js';
import { RARITY_THRESHOLDS } from '../data/balance.js';

export const V19_RARITY_MIN = Object.freeze({ common: 0, fine: 140, rare: 200, epic: 265, legend: 350, mythic: 430 });
export const V19_RISK_GOALS = Object.freeze([25, 50]);
const v19Rarities = RARITY_THRESHOLDS.map(rank => ({ ...rank, min: V19_RARITY_MIN[rank.id] }));
const qualityBands = [[95, 'S'], [86, 'A'], [76, 'B'], [68, 'C']];

export const appraisalRarity = score => v19Rarities.find(rank => score >= rank.min) ?? v19Rarities.at(-1);
export const appraisalQuality = mean => qualityBands.find(([min]) => mean >= min)?.[1] ?? 'D';

const rarePoints = { none: 0, A: 2, B: 4, C: 6 };

export function workshopPerks(level) {
  const { discount, riskReduction, rarity } = WORKSHOP_TIERS[level - 1] ?? WORKSHOP_TIERS[0];
  return { discount, riskReduction, rareBonus: rarePoints[rarity] };
}
