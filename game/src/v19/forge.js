import { workshopPerks } from './workshop.js';

export const MIN_PRICE = 14;
export const REFRESH_PRICE = 12;
export const WINDOW_PRICE = 3;
export const LOT_SIZE = 3;
export const BATCHES = 3;
export const MARK_WIDTH = 24;
export const MARK_HEIGHT = 8;
export const PHASES = ['ore', 'refine', 'forge', 'fit', 'appraise'];

export const FAMILIES = [
  { id: 'river', name: '河床叠钢', short: '层钢', color: '#8ea8b6', dark: '#334f62', metal: 'silver', pattern: 'damascus', film: 'oxide', hint: '石皮下露出平行的细脉，适合打出层叠纹路。' },
  { id: 'frost', name: '霜晶矿', short: '晶矿', color: '#89cbc7', dark: '#345d5d', metal: 'pearl', pattern: 'crystal', film: 'rainbow', hint: '斜光下有细碎反光，内里可能有清晰的晶区。' },
  { id: 'coal', name: '熔渣铁', short: '暗钢', color: '#e0956a', dark: '#69433a', metal: 'obsidian', pattern: 'ember', film: 'oxide', hint: '断口露出暖色矿脉，可能保留少量熔纹。' },
  { id: 'meteor', name: '陨星黑矿', short: '陨铁', color: '#aaa1e6', dark: '#413862', metal: 'gunmetal', pattern: 'nebula', film: 'doppler', hint: '带浅熔蚀坑的深色熔壳，细看可能见到金属碎屑。' },
  { id: 'ochre', name: '赭铁层矿', short: '赭铁', color: '#b58a69', dark: '#684735', metal: 'copper', pattern: 'damascus', film: 'gold', hint: '黄褐石皮呈层状剥落，铁质结核常藏在厚皮之内。' },
];

export const LOOKS = {
  metal: { raw: '粗钢', silver: '银钢', pearl: '霜银', gunmetal: '枪灰', obsidian: '黑曜钢', copper: '铜辉钢' },
  pattern: {
    none: '', damascus: '大马士革', crystal: '冰棱', ember: '熔脉', nebula: '陨砂',
    feather: '叠羽', scales: '银鳞', fan: '扇骨', web: '蛛网', rings: '木目',
    braid: '绞丝', strata: '岩阶', honeycomb: '蜂巢',
  },
  film: {
    none: '', oxide: '淬蓝', doppler: '夜潮', rainbow: '极光', gold: '落日金',
    silverline: '一线银', nacre: '珠母', peacock: '青金光', smoke: '烟镜', verdigris: '铜青',
    ceramic: '霜瓷', satin: '镜缎', halo: '虹环',
  },
  fx: {
    none: '', edge: '刃光', ember: '余烬', aurora: '流光', tip: '尖芒', flame: '冷焰',
    vein: '晶脉', arc: '电弧', wave: '回波', vortex: '涡光', stardust: '星尘', frost: '凝霜', shards: '碎镜',
  },
};
export const MODELS = {
  blank: '刀胚', straight: '直刀', tangdao: '唐刀', karambit: '爪子刀',
  survival: '求生匕首', bayonet: '刺刀', balisong: '蝴蝶刀', folding: '折叠刀',
  gladius: '短剑', kris: '马来剑', machete: '开山刀', saber: '弯刀', skull: '骷髅匕首',
};
export const GRADES = ['普通', '良质', '稀质'];
export const ORE_TIERS = ['工坊料', '精选料', '珍藏料'];
export const RARE_ODDS = [5, 12, 22];
export const rareOdds = (run, tier) => RARE_ODDS[tier] + workshopPerks(run.workshopLevel).rareBonus;
export const fittingPrice = run => run.freeFitting ? 0 :
  Math.floor(REFRESH_PRICE * (1 - workshopPerks(run.workshopLevel).discount));

// Independent low-poly shapes: one base plus three subtle, authored silhouette variants.
export const ORE_VARIANTS = ['原型', '横卧', '棱脊', '偏心'];
export const ORE_MATERIALS = Object.freeze([
  { id: 'river_gray', family: 'river', name: '河磨灰岩', base: '#687474', vein: '#bbc8c7', core: '#a9bfc7', steel: '#869eac', style: 0, roughness: .83, metalness: .10 },
  { id: 'river_silver', family: 'river', name: '银砂铁石', base: '#536064', vein: '#d4d7c8', core: '#ced2bd', steel: '#aeb4a2', style: 1, roughness: .79, metalness: .25 },
  { id: 'river_banded', family: 'river', name: '青灰层铁', base: '#4f626b', vein: '#9faeae', core: '#8aa9ba', steel: '#7190aa', style: 2, roughness: .85, metalness: .15 },
  { id: 'frost_quartz', family: 'frost', name: '霜白石英', base: '#899d98', vein: '#cce7de', core: '#73c7b7', steel: '#87bcb6', style: 3, roughness: .65, metalness: .08 },
  { id: 'frost_mica', family: 'frost', name: '青蓝云母', base: '#506f7a', vein: '#a2d4e1', core: '#70a8ca', steel: '#6d9ebc', style: 4, roughness: .72, metalness: .20 },
  { id: 'coal_slag', family: 'coal', name: '黑熔渣', base: '#454342', vein: '#cb9666', core: '#d7945a', steel: '#af856c', style: 5, roughness: .91, metalness: .15 },
  { id: 'coal_oxide', family: 'coal', name: '赤锈铁皮', base: '#6d493b', vein: '#e0a374', core: '#c77b52', steel: '#b37e70', style: 6, roughness: .89, metalness: .12 },
  { id: 'meteor_fusion', family: 'meteor', name: '暗陨熔壳', base: '#424d55', vein: '#a5afc5', core: '#929bc3', steel: '#939bb9', style: 7, roughness: .78, metalness: .30 },
  { id: 'meteor_nickel', family: 'meteor', name: '镍铁陨壳', base: '#576168', vein: '#cec4a5', core: '#c1b898', steel: '#b0aaa0', style: 8, roughness: .70, metalness: .39 },
  { id: 'ochre_limonite', family: 'ochre', name: '黄褐褐铁', base: '#96734b', vein: '#dfbd81', core: '#c69b5b', steel: '#b3a078', style: 9, roughness: .92, metalness: .08 },
  { id: 'ochre_red', family: 'ochre', name: '赤铁结核', base: '#815447', vein: '#d4a289', core: '#b97f68', steel: '#af9188', style: 10, roughness: .88, metalness: .16 },
  { id: 'ochre_layer', family: 'ochre', name: '砂岩铁层', base: '#9a8969', vein: '#dfcaaa', core: '#d0b98c', steel: '#bdad8f', style: 11, roughness: .92, metalness: .08 },
]);
export const oreMaterialOf = ore => ORE_MATERIALS.find(item => item.id === ore?.material) ||
  ORE_MATERIALS.find(item => item.family === ore?.family) || ORE_MATERIALS[0];

// Mineral colour, surface exposure and optical clarity are independent of the
// host-rock family. A plain dark stone can conceal a clear, brightly coloured core.
export const ORE_TINTS = Object.freeze([
  { id:'jade', name:'翠绿', core:'#56bb93', steel:'#579e87' },
  { id:'teal', name:'碧青', core:'#3fa69d', steel:'#588b88' },
  { id:'azure', name:'冰蓝', core:'#5dadd2', steel:'#5e8fac' },
  { id:'cobalt', name:'钴蓝', core:'#526ed1', steel:'#586da5' },
  { id:'amethyst', name:'紫晶', core:'#9472c7', steel:'#8e76ab' },
  { id:'rose', name:'烟粉', core:'#d590bd', steel:'#b17f9d' },
  { id:'garnet', name:'绛红', core:'#ae535d', steel:'#995c6b' },
  { id:'copper', name:'赤铜', core:'#cc8556', steel:'#ad7c5d' },
  { id:'amber', name:'琥珀', core:'#e2ac4e', steel:'#b69857' },
  { id:'gold', name:'浅金', core:'#d8c786', steel:'#b2a77a' },
  { id:'olive', name:'橄榄', core:'#a6b873', steel:'#8c9970' },
  { id:'forest', name:'松绿', core:'#5e987a', steel:'#5a836e' },
  { id:'ivory', name:'霜白', core:'#d7dfdc', steel:'#b0c1c0' },
  { id:'silver', name:'银灰', core:'#aebfcb', steel:'#91a7b5' },
  { id:'ink', name:'墨蓝', core:'#4c6488', steel:'#4c617e' },
  { id:'obsidian', name:'曜黑', core:'#4e4b60', steel:'#5a566f' },
]);
export const ORE_EXPOSURES = Object.freeze([
  { id:'hidden', name:'藏矿', value:0 },
  { id:'veiled', name:'隐露', value:.27 },
  { id:'open', name:'外露', value:1 },
]);
export const oreOptics = ore => {
  const material=oreMaterialOf(ore);
  const tint=ORE_TINTS.find(t => t.id===ore?.tint);
  const exposure=ORE_EXPOSURES.find(e=>e.id===ore?.exposure);
  const clarity=Number.isFinite(ore?.clarity) ? Math.max(0,Math.min(1,ore.clarity/100)) : .50;
  return {
    tint:tint?.id || 'legacy', name:tint?.name || material.name,
    core:tint?.core || material.core, steel:tint?.steel || material.steel,
    exposure:exposure?.value ?? .55, exposureName:exposure?.name || '露矿', clarity,
    clarityName:clarity<.35 ? '浑浊' : clarity<.70 ? '雾润' : '清透',
  };
};
export const oreInspection = ore => {
  const optics=oreOptics(ore);
  const shell=Math.max(0,Math.min(1,(ore?.crust ?? 50)/100));
  const transmission=Math.max(.04,Math.min(.96,
    .04+Math.pow(optics.clarity,1.4)*.92*(1.-shell*.82)+optics.exposure*.10+(ore?.window ? .22 : 0)));
  return {
    transmission,
    lamp:transmission>=.60 ? '色晕透入 · 内层较清' : transmission>=.26 ? '浅层散光 · 石皮仍有遮挡' : '光停在表皮 · 内芯未透出',
  };
};
export const oreModelId = ore => `ore_${FAMILIES.some(f => f.id === ore?.family) ? ore.family : 'river'}_${Math.max(0, Math.min(3, Math.floor(ore?.variant || 0)))}`;
export const mineralHeritage = ore => {
  const mineral = oreMaterialOf(ore);
  const optics = oreOptics(ore);
  return {
    family: FAMILIES.findIndex(f => f.id === mineral.family), style: mineral.style,
    seed: ore?.figure ?? .5, tone: optics.steel, core: optics.core,
    tint: optics.tint, tintName: optics.name, clarity: optics.clarity, clarityName: optics.clarityName,
    trace: (ore?.vein ?? 52) / 100,
    name: ['水纹层钢', '霜晶钢纹', '赤铜熔脉', '陨铁镍纹', '赭金叠层'][FAMILIES.findIndex(f => f.id === mineral.family)],
  };
};
export const oreSignals = ore => {
  const vein = ore?.vein ?? Math.round((ore?.purity ?? 62) * .8);
  const flaw = ore?.flaw ?? Math.round(90 - (ore?.stability ?? 60));
  const luster = ore?.luster ?? 45;
  const density = ore?.density ?? Math.round(ore?.stability ?? 60);
  const crust = ore?.crust ?? 50;
  return {
    vein: vein >= 72 ? '矿脉清晰' : vein >= 48 ? '矿脉可辨' : '矿脉隐约',
    shell: flaw >= 55 ? '裂隙较多' : flaw >= 35 ? '可见细裂' : '裂隙较少',
    glow: luster >= 69 ? '亮点明显' : luster >= 43 ? '局部微光' : '表面暗哑',
    density: density >= 73 ? '颗粒密实' : density >= 49 ? '密实中等' : '质地疏松',
    crust: crust >= 70 ? '石皮厚重' : crust >= 42 ? '石皮适中' : '石皮较薄',
  };
};
export const STAT_NAMES = ['强度', '韧性', '锋利', '工艺', '设计', '灵性'];
export const STAT_CAP = 100;
export const FITS = [
  { id: 'walnut', role: '沉稳', name: '赤木束柄', parts: '胡桃木 · 铜色端箍', color: '#673424', accent: '#bc8555', grip: 1, delta: [0, 5, 0, 3, 2, 0] },
  { id: 'night', role: '轻巧', name: '夜行纤维', parts: '黑纤维 · 枪灰端箍', color: '#252c32', accent: '#687988', grip: 2, delta: [1, 0, 5, 3, 0, 0] },
  { id: 'ivory', role: '衬纹', name: '霜白骨柄', parts: '骨白握柄 · 雾银端箍', color: '#b5a889', accent: '#bfcbd2', grip: 3, delta: [0, 1, 0, 1, 5, 3] },
  { id: 'copper', role: '沉稳', name: '炉心铜座', parts: '缝线棕皮 · 赤铜端箍', color: '#694031', accent: '#d69e5b', grip: 4, delta: [6, 1, -2, 0, 2, 2] },
  { id: 'ink', role: '轻巧', name: '墨蓝缠线', parts: '深蓝缠柄 · 冷银端箍', color: '#233b58', accent: '#82a4c3', grip: 5, delta: [0, 4, 4, 0, 1, 0] },
  { id: 'jade', role: '衬纹', name: '苍玉包柄', parts: '黛绿握柄 · 玉色嵌线', color: '#31685a', accent: '#7eb8a2', grip: 6, delta: [-1, 0, 1, 2, 4, 5] },
];

const anchors = [[6, 0], [10, .006], [14, .017], [18, .034], [22, .068], [25, .128], [27, .231], [30, .5], [35, .66], [40, .8], [45, .9]];
const priceBands = [[14, 18, .67, .95], [22, 28, .50, .88], [32, 40, .38, .78]];
const purityBands = [[42, 64], [58, 78], [72, 88]];
const centers = { river: 68, frost: 58, coal: 62, meteor: 49, ochre: 65 };
const standardModels = ['straight', 'survival', 'bayonet'];
const strangeModels = Object.keys(MODELS).filter(id => id !== 'blank' && !standardModels.includes(id));
export const HEAT = Object.freeze({ initial: 35, melt: 65, lower: 69, upper: 76, danger: 86, cold: 55,
  preheat: 8, window: 12, minimum: 3, minQuality: 22, fair: 40, good: 65, excellent: 86, cast: 1.1 });
export const REFINEMENT_RESULTS = Object.freeze({
  excellent: { label: '精炼极佳', purity: 20, stability: 18, bonus: 8 },
  good: { label: '精炼良好', purity: 10, stability: 8, bonus: 3 },
  fair: { label: '普通成坯', purity: 2, stability: -4, bonus: -1 },
  poor: { label: '勉强成坯', purity: -12, stability: -18, bonus: -7 },
  failed: { label: '精炼失败', purity: 0, stability: 0, bonus: 0 },
});
export const REFINEMENT_FAILURES = Object.freeze({
  burnt: '钢料烧损，无法成坯', frozen: '熔钢凝固，炉次报废',
  unmelted: '原石未熔化，炉次报废', slag: '排渣不足，无法成坯',
});
const freshHeat = ore => ({ version: 2, step: 'ore', temperature: HEAT.initial, elapsed: 0, active: 0,
  stable: 0, quality: 0, damage: 0, draft: 0, hot: 0, result: null,
  drift: (ore?.figure ?? .5) * Math.PI * 2 });

export const refinementRank = quality => quality >= HEAT.excellent ? 'excellent' : quality >= HEAT.good ? 'good' :
  quality >= HEAT.fair ? 'fair' : quality >= HEAT.minQuality ? 'poor' : 'failed';

export function heatBand(heat) {
  const t = heat.active || 0, drift = heat.drift || 0;
  const center = (HEAT.lower + HEAT.upper) / 2 + Math.sin(drift + t * .62) * 2.8 + Math.sin(drift * .71 + t * 1.43) * 1.2;
  return { center, lower: center - 3.5, upper: center + 3.5 };
}
const slotWeights = {
  belly: [30, 48, 16, 6],
  edge: [8, 15, 53, 24],
  tip: [13, 30, 27, 30],
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function rngFor(...parts) {
  let state = 2166136261;
  for (const char of parts.join('|')) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ state >>> 15, state | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function lookVariant(skin, slot) {
  const saved = skin.variants?.[slot];
  const id = skin[slot];
  if (saved && saved.id === id && Number.isInteger(saved.layout) && saved.layout >= 0 && saved.layout < 3 &&
      Number.isFinite(saved.seed) && saved.seed >= 0 && saved.seed < 1) return saved;
  // Older blades already have a surface seed. The style and slot give them
  // repeatable layouts without consuming any of the strike outcome rolls.
  const roll = rngFor(skin.seed ?? .5, 'blade-layout-v1', slot, id);
  return { id, layout: Math.floor(roll() * 3), seed: roll() };
}

const pick = (array, roll) => array[Math.floor(roll() * array.length)];

export function freshRun(seed) {
  return {
    seed, phase: 'ore', batch: 0, selected: 0, inspections: {}, ore: null, purity: 0, stability: 60, refining: null, refinement: null,
    hits: 0, work: 0, cracks: 0, changedShape: false, model: 'blank', marks: {}, highlights: [],
    fit: null, refreshed: false, last: null, record: null,
    skin: { metal: 'raw', pattern: 'none', film: 'none', fx: 'none', levels: { metal: 1, pattern: 0, film: 0, fx: 0 }, seed: rngFor(seed, 'surface')() },
  };
}

export function offers(run) {
  const order = rngFor(run.seed, 'batch', run.batch);
  const priceShift = Math.floor(order() * LOT_SIZE);
  const familyShift = Math.floor(order() * FAMILIES.length);
  return Array.from({ length: LOT_SIZE }, (_, index) => {
    const id = run.batch * LOT_SIZE + index;
    const tier = (index + priceShift) % LOT_SIZE;
    const roll = rngFor(run.seed, 'tray-v2', id);
    const family = FAMILIES[(familyShift + index) % FAMILIES.length];
    const [low, high, ordinary, good] = priceBands[tier];
    const price = tier === 0 ? MIN_PRICE : low + Math.floor(roll() * (high - low + 1));
    const quality = roll();
    const grade = quality < ordinary ? 0 : quality < good - workshopPerks(run.workshopLevel).rareBonus / 100 ? 1 : 2;
    const [lo, hi] = purityBands[grade];
    const figure = roll();
    const purity = lo + Math.floor(roll() * (hi - lo + 1));
    const stability = centers[family.id] + Math.floor(roll() * 19) - 9;
    // Surface indications track the hidden deposit with overlap: inspecting matters,
    // but the true grade, purity and stability are never guaranteed by appearance.
    const vein = clamp(Math.round(purity * .78 + grade * 5 + (roll() - .5) * 43), 9, 98);
    const flaw = clamp(Math.round(77 - stability * .66 + (roll() - .5) * 37), 5, 92);
    const luster = clamp(Math.round(purity * .63 + grade * 8 + (roll() - .5) * 44), 8, 98);
    const clue = vein >= 72 ? 2 : vein >= 48 ? 1 : 0;
    const density = clamp(Math.round(stability * .77 + (roll() - .5) * 40 + 13), 8, 98);
    const crust = clamp(Math.round(69 - purity * .33 + (roll() - .5) * 48 + 12), 7, 96);
    const choices = ORE_MATERIALS.filter(material => material.family === family.id);
    const material = choices[Math.floor(roll() * choices.length)].id;
    const variant = Math.floor(roll() * ORE_VARIANTS.length);
    // A separate stream preserves the existing price, quality and forging rolls.
    const optical=rngFor(run.seed,'ore-optics-v1',id);
    const tint=ORE_TINTS[Math.floor(optical()*ORE_TINTS.length)].id;
    const exposureRoll=optical();
    const exposure=exposureRoll<.34 ? 'hidden' : exposureRoll<.70 ? 'veiled' : 'open';
    const clarity=Math.round(8+optical()*86);
    return { id, family: family.id, material, variant, price, grade, clue, figure, purity, stability, tier,
      vein, flaw, luster, density, crust, tint, exposure, clarity,
      window: Boolean(run.inspections?.[id]), number: String(id + 1).padStart(2, '0') };
  });
}

export const familyOf = (id) => FAMILIES.find(family => family.id === id) || FAMILIES[0];
export const stabilityOf = value => value < 50 ? '偏脆' : value >= 70 ? '稳定' : '中等';

// A small window reveals a real local sample, never a guaranteed quality label.
// Refuse optional spending that would leave this stone unaffordable.
export function inspectOre(save) {
  const run = save.run;
  if (run.phase !== 'ore') return false;
  const ore = offers(run)[run.selected];
  if (!ore || ore.window || save.credits < ore.price + WINDOW_PRICE) return false;
  save.credits -= WINDOW_PRICE;
  (run.inspections ??= {})[ore.id] = true;
  return true;
}

export function modelCandidates(run) {
  const family = FAMILIES.findIndex(item => item.id === run.ore?.family);
  const normal = standardModels[Math.floor(rngFor(run.seed, 'initial-model')() * standardModels.length)];
  const roll = rngFor(run.seed, 'rare-models', family);
  const rare = [...strangeModels];
  for (let i = rare.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [rare[i], rare[j]] = [rare[j], rare[i]];
  }
  return { normal, rare: rare.slice(0, 2) };
}

export function buyOre(save) {
  const run = save.run;
  if (run.phase !== 'ore') return false;
  const ore = offers(run)[run.selected];
  if (!ore || save.credits < ore.price) return false;
  save.credits -= ore.price;
  run.ore = ore;
  // Identical decisions on two distinct stones no longer produce identical grain.
  run.skin.seed = rngFor(run.seed, 'ore-grain', ore.id, ore.family, ore.material, ore.variant, ore.figure)();
  run.phase = 'reveal';
  return true;
}

export function beginRefining(run) {
  if (run.phase !== 'reveal') return false;
  run.phase = 'refine';
  run.refining = freshHeat(run.ore);
  return true;
}

function failRefining(run, reason) {
  const heat = run.refining;
  run.refinement = { result: 'failed', quality: Math.floor(heat.quality), damage: Math.round(heat.damage), reason,
    stable: heat.stable, purity: 0, stability: 0 };
  run.last = { type: 'refine-fail', label: REFINEMENT_FAILURES[reason] };
  run.refining = null;
  run.phase = 'broken';
}

function castRefining(run) {
  const heat = run.refining;
  heat.result = refinementRank(heat.quality);
  if (heat.result === 'failed') return failRefining(run, 'slag');
  heat.step = 'cast';
  heat.elapsed = 0;
}

export function pourRefining(run) {
  if (run.phase !== 'refine' || run.refining?.step !== 'molten' || run.refining.elapsed < HEAT.minimum ||
      run.refining.quality < HEAT.minQuality) return false;
  castRefining(run);
  return true;
}

function heatTick(run, seconds, blowing) {
  const heat = run.refining;
  heat.elapsed += seconds;
  if (heat.step === 'cast') {
    if (heat.elapsed >= HEAT.cast) {
      const outcome = REFINEMENT_RESULTS[heat.result];
      run.purity = clamp(run.ore.purity + outcome.purity, 0, 100);
      run.stability = clamp(run.ore.stability + outcome.stability, 0, 100);
      run.refinement = { result: heat.result, quality: Math.floor(heat.quality), damage: Math.round(heat.damage),
        stable: heat.stable, purity: run.purity, stability: run.stability, bonus: outcome.bonus };
      run.refining = null;
      run.phase = 'forge';
    }
    return;
  }
  // Blower inertia remains after release: the player must stop before the upper edge.
  const previousDraft = heat.draft;
  heat.draft = Number(Boolean(blowing)) + (heat.draft - Number(Boolean(blowing))) * Math.exp(-seconds / .27);
  heat.temperature = clamp(heat.temperature + seconds * (-18 + 46 * (previousDraft + heat.draft) / 2), 0, 100);
  if (heat.step === 'ore') {
    if (heat.temperature >= HEAT.melt) {
      heat.step = 'molten';
      heat.elapsed = 0;
    } else if (heat.elapsed >= HEAT.preheat) failRefining(run, 'unmelted');
    return;
  }
  heat.active += seconds;
  const band = heatBand(heat);
  const inside = heat.temperature >= band.lower && heat.temperature <= band.upper;
  const damage = heat.temperature >= HEAT.danger ? 60 * (1 + (heat.temperature - HEAT.danger) / 18) :
    heat.temperature <= HEAT.cold ? 45 * (1 + (HEAT.cold - heat.temperature) / 20) : 0;
  if (heat.temperature >= HEAT.danger) heat.hot += seconds;
  heat.damage = clamp(heat.damage + damage * seconds, 0, 100);
  if (inside) heat.stable += seconds;
  const precision = Math.max(0, 1 - Math.abs(heat.temperature - band.center) / 3.5);
  heat.quality = clamp(heat.quality + seconds * (inside ? 7 + precision * 5.5 : -.8) - damage * seconds * .28, 0, 100);
  if (heat.damage >= 100) {
    failRefining(run, heat.temperature >= HEAT.danger ? 'burnt' : 'frozen');
  } else if (heat.elapsed >= HEAT.window) castRefining(run);
}

export function advanceHeat(run, seconds, blowing) {
  if (run.phase !== 'refine' || !run.refining || !Number.isFinite(seconds) || seconds <= 0) return;
  // Bounded substeps make failure and quality consistent across frame rates.
  let remaining = seconds;
  while (remaining > 1e-8 && run.phase === 'refine') {
    const tick = Math.min(remaining, 1 / 120);
    heatTick(run, tick, blowing);
    remaining -= tick;
  }
}

export function fractureRisk(run) {
  const next = run.hits + 1;
  if (next <= 6) return 0;
  const workshop = workshopPerks(run.workshopLevel).riskReduction;
  const specialist = run.specialist?.id === 'press' && next >= 11 ? run.specialist.boost : 0;
  const reduction = Math.max(.8, (1 - workshop) * (1 - specialist));
  if (next >= 45) return .9 * reduction;
  const hi = anchors.findIndex(([hit]) => hit >= next);
  const [a, pa] = anchors[hi - 1];
  const [b, pb] = anchors[hi];
  const baseline = pa + (pb - pa) * ((next - a) / (b - a));
  const stability = run.stability < 50 ? 1.25 : run.stability >= 70 ? .8 : 1;
  const blend = clamp((30 - next) / 12, 0, 1);
  return Math.round(baseline * (1 + (stability - 1) * blend) * reduction * 1000) / 1000;
}

function chooseSlot(run, zone, type, roll) {
  const keys = Object.keys(LOOKS);
  const choices = keys.map((slot, index) => ({
    slot,
    weight: slotWeights[zone][index] * (run.skin[slot] === 'none' ? 1.45 : 1),
  })).filter(({ slot }) => (slot !== 'film' || run.hits >= 7) &&
    (slot !== 'fx' || run.hits >= (type === 'surge' ? 9 : 12)) &&
    (type === 'surge' || run.skin.levels[slot] < 2));
  if (!choices.length) return null;
  let point = roll() * choices.reduce((sum, item) => sum + item.weight, 0);
  return choices.find(({ weight }) => (point -= weight) < 0)?.slot || choices.at(-1).slot;
}

function mutate(run, slot, type, roll, guaranteed = false) {
  if (!slot) return null;
  const family = familyOf(run.ore.family);
  const original = run.skin[slot];
  const level = run.skin.levels[slot];
  const nextLevel = type === 'surge' && run.hits >= 13 ? 3 : 2;
  if (!guaranteed && original !== 'none' && original !== 'raw' && level < nextLevel && (type !== 'surge' || roll() < .71)) {
    run.skin.levels[slot]++;
    return { slot, label: LOOKS[slot][original] + '强化', action: 'upgrade', tier: run.skin.levels[slot] };
  }
  const familyChoice = family[slot] ?? ({ coal: 'ember', meteor: 'aurora' }[family.id] || 'edge');
  const options = Object.keys(LOOKS[slot]).filter(id => id !== 'none' && id !== 'raw' && id !== original &&
    !(slot === 'film' && id === 'rainbow' && run.skin.pattern === 'ember') &&
    !(slot === 'pattern' && id === 'ember' && run.skin.film === 'rainbow'));
  const affinity = slot === 'pattern' ? 2.5 : slot === 'film' ? 1.5 : 2;
  const affinityFilms = { cold: ['doppler', 'silverline', 'ceramic'], heat: ['gold', 'rainbow', 'halo'], oxide: ['oxide', 'verdigris', 'smoke'] };
  const specialist = run.specialist;
  const aligned = slot === 'film' && specialist?.id === 'quench' ? affinityFilms[specialist.options.inclination] : [];
  const premium = run.ore.tier === 2 && slot === 'film' ? .7 : 0;
  const weight = key => (key === familyChoice ? affinity + premium : 1) + (aligned.includes(key) ? specialist.boost : 0);
  let point = roll() * options.reduce((total, key) => total + weight(key), 0);
  const next = guaranteed && slot === 'metal' && options.includes(familyChoice) ? familyChoice :
    options.find(key => (point -= weight(key)) < 0);
  if (!next) return null;
  run.skin[slot] = next;
  (run.skin.variants ??= {})[slot] = lookVariant(run.skin, slot);
  run.skin.levels[slot] = type === 'surge' && run.hits >= 13 ? (roll() < .34 ? 3 : 2) : 1;
  return { slot, label: LOOKS[slot][next], action: original === 'none' || original === 'raw' ? 'add' : 'replace', tier: run.skin.levels[slot] };
}

export const SIGNATURES = [
  { name: '霜潮层钢', pattern: 'damascus', film: 'oxide', targets: ['ice', 'wood'], bonus: .08, desc: '对冰块和硬木的切割伤害 +8%' },
  { name: '极光晶刃', pattern: 'crystal', film: 'rainbow', targets: ['gel', 'pineapple'], bonus: .08, desc: '对凝胶和菠萝的切割伤害 +8%' },
  { name: '深空星砂', pattern: 'nebula', film: 'doppler', targets: ['steel', 'shield'], bonus: .08, desc: '对金属桶和复合盾牌的切割伤害 +8%' },
  { name: '炉脉余烬', pattern: 'ember', fx: 'ember', targets: ['rope', 'bamboo'], bonus: .08, desc: '对绳束和竹节的切割伤害 +8%' },
];

export const signaturePerk = name => SIGNATURES.find(item => item.name === name);

export function signature(skin) {
  const match = SIGNATURES.find(({ pattern, film, fx }) =>
    skin.pattern === pattern && (!film || skin.film === film) && (!fx || skin.fx === fx));
  return match?.name ?? null;
}

function workSurface(run, type, position) {
  const x = Math.floor(clamp(position.u, 0, .9999) * MARK_WIDTH);
  const y = Math.floor(clamp(position.v, 0, .9999) * MARK_HEIGHT);
  const key = y * MARK_WIDTH + x;
  const before = run.marks[key] || 0;
  const oldPolish = before & 15;
  const oldGrain = (before >> 4) & 15;
  const oldScar = (before >> 8) & 15;
  const polish = clamp(oldPolish + (type === 'scar' ? -4 : type === 'surge' ? 5 : 3), 0, 15);
  const grain = (oldGrain + 3) & 15;
  const scar = clamp(oldScar + (type === 'scar' ? 7 : -1), 0, 15);
  run.marks[key] = polish | (grain << 4) | (scar << 8);
  return { u: position.u, v: position.v };
}

export function strike(run, zone, position = { u: .67, v: zone === 'edge' ? .12 : .48 }) {
  if (run.phase !== 'forge' || !Object.hasOwn(slotWeights, zone)) return null;
  const risk = fractureRisk(run);
  run.riskPeak = Math.max(run.riskPeak || 0, risk);
  const hit = ++run.hits;
  const roll = rngFor(run.seed, 'work', hit);
  if (rngFor(run.seed, 'fracture', hit)() < risk) {
    run.phase = 'broken';
    return run.last = { type: 'break', hit, zone, risk, label: '刀身断裂', mark: position };
  }
  const before = signature(run.skin);
  const draw = roll();
  let type = draw < .08 && hit > 6 ? 'scar' : draw >= .88 ? 'surge' : draw >= .38 ? 'shift' : 'polish';
  let change = null;
  const specialist = run.specialist;
  if (specialist?.id === 'overload' && risk >= .10 && !specialist.consumed) {
    specialist.consumed = true;
    if (rngFor(run.seed, 'overload-specialty', hit)() < specialist.boost) type = 'surge';
  }
  if (specialist?.id === 'composite' && type === 'shift' && specialist.remaining > 0 &&
      Object.values(run.skin.levels).filter(tier => tier >= 2).length >= 2) {
    specialist.remaining--;
    if (rngFor(run.seed, 'composite-specialty', hit)() < specialist.boost) type = 'surge';
  }
  if (hit === 2 || hit === 4 || hit === 6) {
    type = 'shift';
    if (hit === 4) {
      run.model = modelCandidates(run).normal;
      change = { slot: 'model', label: MODELS[run.model] + '成型', action: 'form', tier: 1 };
    } else if (hit === 2 || run.skin.pattern === 'none') {
      change = mutate(run, hit === 2 ? 'metal' : 'pattern', type, roll, true);
    }
  }
  if (type === 'scar') {
    run.cracks = Math.min(4, run.cracks + 1);
    if (run.skin.fx !== 'none' && hit >= 15 && roll() < .44) {
      run.skin.levels.fx--;
      if (!run.skin.levels.fx) {
        run.skin.fx = 'none';
        if (run.skin.variants) delete run.skin.variants.fx;
      }
      change = { slot: 'fx', label: '特效退档', action: 'fade', tier: run.skin.levels.fx };
    }
  } else if (!change && type === 'surge' && hit >= 12 && !run.changedShape && rngFor(run.seed, 'shape-trigger', hit)() < .14) {
    run.model = pick(modelCandidates(run).rare, rngFor(run.seed, 'shape-pick', hit));
    run.changedShape = true;
    change = { slot: 'model', label: '异形 · ' + MODELS[run.model], action: 'form', tier: 3 };
  } else if (!change && (type === 'surge' || type === 'shift') && run.model !== 'blank') {
    change = mutate(run, chooseSlot(run, zone, type, roll), type, roll);
  }
  if (run.specialist?.id === 'edge' && zone === 'edge' && type !== 'scar') run.edgeHits = (run.edgeHits || 0) + 1;
  const mark = workSurface(run, type, position);
  run.work += ({ scar: -.6, polish: .8, shift: 1.35, surge: 2.4 })[type];
  const after = signature(run.skin);
  const fusion = after !== before ? after : null;
  const notable = Boolean(fusion || change?.tier === 3 || change?.action === 'fade');
  const label = change?.label || (type === 'scar' ? '崩口 · 裂痕显现' : type === 'surge' ? '暴发 · 局部精抛' : '整面 · 钢面抛光');
  if (change || fusion || type === 'scar') run.highlights = [...run.highlights, { hit, label: fusion || label }].slice(-8);
  return run.last = { type, hit, zone, risk, change, fusion, notable, label, mark };
}

export function finishForge(run) {
  if (run.phase !== 'forge' || run.hits < 6) return false;
  run.phase = 'fit';
  return true;
}

export function fitOptions(run) {
  if (!run.legacyFittings) {
    return ['轻巧', '沉稳', '衬纹'].map(role => {
      const options = FITS.filter(fit => fit.role === role);
      const first = rngFor(run.seed, 'fitting-role', role)() < .5 ? 0 : 1;
      return options[run.refreshed ? 1 - first : first];
    });
  }
  const roll = rngFor(run.seed, 'fittings');
  const ordered = FITS.map(fit => ({ fit, sort: roll() })).sort((a, b) => a.sort - b.sort).map(item => item.fit);
  return run.refreshed ? ordered.slice(3) : ordered.slice(0, 3);
}

export function refreshFittings(save) {
  const run = save.run;
  const price = fittingPrice(run);
  if (run.phase !== 'fit' || run.refreshed || save.credits < price) return false;
  save.credits -= price;
  run.refreshed = true;
  if (run.freeFitting) run.fittingBonusUsed = true;
  run.freeFitting = false;
  run.fit = null;
  return true;
}

export function appraise(run) {
  const fit = FITS.find(item => item.id === run.fit);
  if (run.phase !== 'fit' || !fit) return null;
  const roll = rngFor(run.seed, 'review');
  const base = 41 + run.ore.grade * 5 + run.purity * .19 + run.work * .94 - run.cracks * 2.9 + (run.refinement?.bonus || 0);
  const stats = fit.delta.map((delta, index) => clamp(Math.round(base + delta + (roll() - .5) * 12 + (index > 3 ? run.skin.levels.fx * 2 : 0)), 20, STAT_CAP));
  const specialist = run.specialist;
  if (specialist?.id === 'edge') stats[2] = clamp(stats[2] + Math.round(Math.min(6, run.edgeHits || 0) * specialist.boost), 20, STAT_CAP);
  if (specialist?.id === 'precise') {
    const index = ['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'].indexOf(specialist.options.stat);
    if (index >= 0) stats[index] = clamp(stats[index] + Math.round((run.refinement?.quality || 0) * specialist.boost * .35), 20, STAT_CAP);
  }
  const trait = signature(run.skin) || LOOKS.fx[run.skin.fx] || LOOKS.pattern[run.skin.pattern] || '原钢锻面';
  run.phase = 'appraise';
  return { name: trait + ' · ' + MODELS[run.model], stats };
}
