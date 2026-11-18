export const RELEASE_RULES = 'f01-v1';
export const NEW_WALLET = 30;
export const MIN_FURNACE_PRICE = 14;

export const MATERIAL_TIERS = [
  { price: 14, appraisal: 6, commission: 12, label: '工坊料' },
  { price: 22, appraisal: 9, commission: 16, label: '精选料' },
  { price: 34, appraisal: 12, commission: 22, label: '珍藏料' },
];

export const BLUEPRINTS = { straight: '直刀', tangdao: '唐刀', saber: '弯刀' };
export const ZONES = { belly: '刀腹', edge: '刃侧', tip: '刀尖' };
export const COMPARISON_BUILDS = {
  heavy: { name: '重锋', family: 'coal', hits: { belly: 4, tip: 2 }, grip: '沉稳' },
  edge: { name: '快锋', family: 'river', hits: { belly: 2, edge: 4 }, grip: '轻巧' },
};
export const comparisonBuildFor = (strength, sharpness) => strength > sharpness ? 'edge' : 'heavy';

const COMMISSION_TASKS = [
  { name: '基础锻压', zone: 'belly', hits: 2 },
  { name: '刃线精制', zone: 'edge', hits: 3, quality: 65 },
  { name: '复合精制', sequence: ['belly', 'belly', 'edge', 'edge'], quality: 65 },
];
export const SPECIALS = {
  multi: { label: '一划三斩', target: 3, hint: '同一划斩断至少三靶' },
  armor: { label: '重靶击破', target: 2, hint: '本场斩断两件带护甲的重靶' },
  precision: { label: '靶心精度', target: 3, hint: '本场斩断三个标记靶并命中靶心' },
};
export const FIRST_REWARD = { appraisal: 8, trial: 4 };

export function hitCounts(run) {
  return (run?.hitZones || []).reduce((counts, zone) => {
    if (Object.hasOwn(counts, zone)) counts[zone]++;
    return counts;
  }, { belly: 0, edge: 0, tip: 0 });
}

export function craftRating(run) {
  const hits = run.hitZones || [];
  const basic = hitCounts({ hitZones: hits.slice(0, 6) });
  const effective = Object.values(basic).reduce((sum, count) => sum + Math.min(4, count), 0);
  const shape = Math.min(100, 60 + effective * 5 + Math.max(0, hits.length - 6) * 2.5);
  const score = Math.round(.55 * (run.refinement?.quality || 0) + .45 * shape);
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D' };
}

export function commissionFor(ore) {
  const task = COMMISSION_TASKS[ore?.tier];
  if (!task) return null;
  const hammer = task.sequence ? task.sequence.map(zone => ZONES[zone]).join(' → ') : ZONES[task.zone] + ' ' + task.hits + ' 锤';
  const description = [task.quality ? '精炼至少 ' + task.quality : '', hammer].filter(Boolean).join(' · ');
  return { tier: ore.tier, family: ore.family, name: task.name, description, amount: MATERIAL_TIERS[ore.tier].commission };
}

export function commissionChecks(run) {
  const task = run.commission;
  const goal = COMMISSION_TASKS[task?.tier];
  if (!goal || task.family !== run.ore?.family || task.tier !== run.ore?.tier) return [];
  const checks = [];
  if (goal.quality) checks.push({ key: 'quality', label: '精炼', value: Math.floor(run.refinement?.quality ?? run.refining?.quality ?? 0),
    target: goal.quality, settled: Boolean(run.refinement) });
  if (goal.sequence) {
    const hits = run.hitZones || [];
    const complete = hits.some((_, at) => goal.sequence.every((zone, offset) => hits[at + offset] === zone));
    let value = goal.sequence.length;
    if (!complete) {
      value = Math.min(value - 1, hits.length);
      while (value && !goal.sequence.slice(0, value).every((zone, index) => hits[hits.length - value + index] === zone)) value--;
    }
    checks.push({ key: 'sequence', label: '连锤顺序', value, target: goal.sequence.length, settled: true,
      hint: goal.sequence.map(zone => ZONES[zone]).join(' → ') });
  } else {
    checks.push({ key: goal.zone, label: ZONES[goal.zone], value: hitCounts(run)[goal.zone], target: goal.hits, settled: true });
  }
  return checks;
}

export function meetsCommission(run) {
  const checks = commissionChecks(run);
  return checks.length > 0 && checks.every(check => check.settled && check.value >= check.target);
}

export const SERIES = [
  { id: '01', name: '回潮', model: 'straight', family: 'river', zone: 'belly', hits: 2, quality: 22 },
  { id: '02', name: '霜线', model: 'tangdao', family: 'frost', zone: 'edge', hits: 3, quality: 45 },
  { id: '03', name: '夜坠', model: 'saber', family: 'meteor', zone: 'belly', hits: 2, quality: 22, special: 'armor' },
  { id: '04', name: '熔脊', model: 'straight', family: 'coal', zone: 'belly', hits: 4, quality: 45 },
  { id: '05', name: '赭纹', model: 'tangdao', family: 'ochre', zone: 'tip', hits: 3, quality: 45, special: 'precision' },
  { id: '06', name: '工坊签名', quality: 55 },
];

export const seriesLabel = id => 'F01—' + id;

export function seriesCandidate(run) {
  const counts = hitCounts(run);
  const quality = run.refinement?.quality || 0;
  return SERIES.find(item => quality >= item.quality && (item.family ?
    item.family === run.ore?.family && item.model === run.model && counts[item.zone] >= item.hits :
    Object.values(counts).every(count => count >= 2))) || null;
}

export function fulfillsSpecial(report, key) {
  if (!Object.hasOwn(SPECIALS, key)) return false;
  return Number(key === 'multi' ? report.swipe : report.objectives?.[key]) >= SPECIALS[key].target;
}

export function completeSeries(blade, run, record) {
  const slot = SERIES.find(item => item.id === blade?.seriesCandidate);
  if (!slot || !slot.special || blade.seriesSlot || run.mode !== 'quick' ||
      run.special !== slot.special || !record.qualified || !fulfillsSpecial(record.report, slot.special)) return null;
  blade.seriesSlot = slot.id;
  return slot.id;
}
