import { arcadeCourse, courseGoals, practiceCourse, schoolCourse, SCHOOLS } from './arena/courses.js';
export { SCHOOLS } from './arena/courses.js';

export const TARGET_NAMES = {
  card: '纸牌', rope: '绳束', bamboo: '竹节', pineapple: '菠萝', gel: '凝胶',
  wood: '硬木', ice: '冰块', steel: '钢桶', shield: '复合盾牌',
};
export const GRADIENTS = ['学徒', '能手', '专家', '大师', '传奇'];

/**
 * 赛事评级：只增不减的长期进度，和「个人最佳分」分工——
 * 评级看积累（打得多、打得广），最佳分看技术上限。
 * 掉段会让失败变成惩罚，这里刻意不做。
 */
export const RANKS = [
  { name: '生铁', at: 0 },
  { name: '熟铁', at: 180 },
  { name: '精钢', at: 460 },
  { name: '名钢', at: 900 },
  { name: '神钢', at: 1600 },
];

export function rankOf(rating = 0) {
  const value = Math.max(0, Math.floor(Number(rating) || 0));
  let index = 0;
  while (index + 1 < RANKS.length && value >= RANKS[index + 1].at) index += 1;
  const floor = RANKS[index].at;
  const next = RANKS[index + 1] || null;
  return {
    index,
    name: RANKS[index].name,
    rating: value,
    next: next?.name ?? '',
    toNext: next ? Math.max(0, next.at - value) : 0,
    progress: next ? Math.min(1, (value - floor) / (next.at - floor)) : 1,
  };
}

/** 一场赛事给多少评级：有效局给足，无效局也给一点，避免空手而归。 */
export function rankGain(mode, info = {}) {
  const { valid = false, score = 0, win = false, grade = 0, champion = false } = info;
  if (mode === 'practice') return 0;
  if (mode === 'quick' || mode === 'daily') return valid ? 8 + Math.min(22, Math.floor(score / 140)) : 2;
  if (mode === 'school') return win ? 26 + grade * 8 : 7;
  if (mode === 'national') return champion ? 70 : win ? 34 : 12;
  if (mode === 'apex') return champion ? 110 : 40;
  return 0;
}

export const EVENTS = {
  practice: { name: '试刀练习', sub: '12 秒 · 自选靶具' },
  quick: { name: '自由快赛', sub: '30 秒 · 飞靶连斩' },
  daily: { name: '每日挑战', sub: '30 秒 · 当日固定飞靶' },
  school: { name: '流派试炼', sub: '六个流派 · 各五阶' },
  national: { name: '全国大赛', sub: '单刀出征 · 五轮淘汰' },
  apex: { name: '三刀巅峰赛', sub: '三把成刀 · 三轮接力' },
};

export const PROJECTS = {
  cutting: { name: '切割', stats: [2, 0, 3] },
  precision: { name: '精度', stats: [3, 4] },
  strength: { name: '强度', stats: [0, 1] },
  durability: { name: '耐久', stats: [1, 3] },
  extreme: { name: '极限', stats: [0, 1, 4] },
};

const NATIONAL = [
  { title: '32 强 · 试锋', school: 'edge' },
  { title: '16 强 · 定刃', school: 'precise' },
  { title: '8 强 · 破冰', school: 'quench' },
  { title: '4 强 · 硬撼', school: 'press' },
  { title: '决赛 · 破阵', school: 'overload' },
];
const APEX = [
  { title: '第一轮 · 连斩', school: 'edge' },
  { title: '第二轮 · 复合', school: 'composite' },
  { title: '第三轮 · 极限', school: 'overload' },
];
const TRAINING_BLADE = { id: 'training', name: '工坊试刀', grade: '借用', stats: [69, 77, 73, 65, 64, 60] };
export const APEX_GOAL = 2700;
export const NATIONAL_UNLOCK = 2;

export const dayKey = (time = Date.now()) => new Date(time + 8 * 3600e3).toISOString().slice(0, 10);
export const bladeId = blade => String(blade.id);
export const bladeCount = entry => entry.mode === 'apex' ? 3 : 1;
export const roundNames = mode => (mode === 'national' ? NATIONAL : mode === 'apex' ? APEX : []).map(item => item.title);
export const tournamentState = save => ({
  schools: {}, titles: {}, mastery: {}, best: {}, daily: {}, history: [], active: null, rating: 0, streak: 0,
  ...save.tournament,
});

export function eligibleBlades(save) {
  return save.collection.filter(blade => blade?.id != null && !blade.fractured && Array.isArray(blade.stats) && blade.stats.length === 6 &&
    blade.stats.every(Number.isFinite));
}

export const BLADE_MASTERY_TIERS = [
  { xp: 0, name: '新铸', bonus: 0 },
  { xp: 120, name: '磨合', bonus: .02 },
  { xp: 350, name: '熟刃', bonus: .04 },
  { xp: 700, name: '名刃', bonus: .06 },
  { xp: 1200, name: '传世', bonus: .08 },
];

const SWIPE_GOALS = [
  { count: 3, xp: 14 }, { count: 4, xp: 22 }, { count: 5, xp: 30 },
];

export function masteryOf(save, blade) {
  const saved = tournamentState(save).mastery[bladeId(blade)];
  const average = id => {
    const indices = PROJECTS[id].stats;
    return indices.reduce((sum, i) => sum + blade.stats[i], 0) / indices.length;
  };
  const specialty = Object.hasOwn(PROJECTS, saved?.specialty) ? saved.specialty :
    Object.keys(PROJECTS).reduce((best, id) => average(id) > average(best) ? id : best);
  const matches = Number.isFinite(saved?.matches) ? Math.max(0, Math.floor(saved.matches)) : 0;
  // Older saves only had match counts. Preserve the earned rank on migration.
  const legacyXp = matches >= 5 ? 700 : matches >= 2 ? 350 : matches * 40;
  const xp = Number.isFinite(saved?.xp) ? Math.max(0, Math.floor(saved.xp)) : legacyXp;
  const bestSwipe = Math.max(0, Math.floor(Number(saved?.bestSwipe) || 0));
  const index = BLADE_MASTERY_TIERS.reduce((tier, item, i) => xp >= item.xp ? i : tier, 0);
  const tier = BLADE_MASTERY_TIERS[index];
  const next = BLADE_MASTERY_TIERS[index + 1];
  return {
    specialty, matches, xp, bestSwipe, swipeGoal: SWIPE_GOALS.find(item => item.count > bestSwipe) ?? null,
    level: tier.name, levelIndex: index, bonus: tier.bonus,
    nextLevel: next?.name ?? '', nextXp: next?.xp ?? xp,
    progress: next ? (xp - tier.xp) / (next.xp - tier.xp) : 1,
    project: PROJECTS[specialty].name,
  };
}

export function gate(save, entry) {
  const { schools, titles } = tournamentState(save);
  if (entry.mode === 'practice') return '';
  if (!Object.hasOwn(EVENTS, entry.mode)) return '赛事未开放';
  if (save.legacyCareer) return '请先完成或结束旧赛程';
  if (entry.mode === 'school') {
    if (!Object.hasOwn(SCHOOLS, entry.school) || !Number.isInteger(entry.grade) || !GRADIENTS[entry.grade]) return '请选择流派与梯度';
    if (entry.grade > (schools[entry.school] || 0)) return '先通过本流派上一阶';
  }
  if (entry.mode === 'national' && !Object.values(schools).some(cleared => cleared >= NATIONAL_UNLOCK)) return '任一流派通关能手后解锁';
  if (entry.mode === 'apex' && !titles.national) return '夺得全国大赛冠军后解锁';
  if (eligibleBlades(save).length < bladeCount(entry)) return entry.mode === 'apex' ? '需要三把不同的成刀' : '完成第一把成刀即可报名';
  return '';
}

export function createEntry(save, entry, selectedIds, id, date = dayKey()) {
  const reason = gate(save, entry);
  if (reason) return { error: reason };
  if (entry.mode !== 'practice' && tournamentState(save).active) return { error: '请先完成或结束已报名的赛事' };
  const blades = eligibleBlades(save);
  const practice = entry.mode === 'practice';
  const selected = practice && selectedIds.length === 0 ? [TRAINING_BLADE] :
    selectedIds.map(key => blades.find(blade => bladeId(blade) === key));
  if (selected.length !== bladeCount(entry) || selected.some(blade => !blade) ||
      new Set(selectedIds).size !== selectedIds.length) return { error: '请选齐符合要求的参赛刀' };
  const roster = selected.map(blade => ({
    id: bladeId(blade), name: blade.name, grade: blade.grade, stats: [...blade.stats],
    mastery: masteryOf(save, blade), signature: blade.signature,
  }));
  const run = { ...entry, id, date, roster, reports: [], qualified: [] };
  if (!practice) save.tournament = { ...tournamentState(save), active: run };
  return { run };
}

export function courseFor(run) {
  const round = run.reports.length;
  const series = run.mode === 'national' ? NATIONAL : run.mode === 'apex' ? APEX : null;
  const stage = series?.[round];
  const school = SCHOOLS[stage?.school ?? run.school];
  if (school && ['school', 'national', 'apex'].includes(run.mode)) {
    const grade = run.mode === 'school' ? run.grade : run.mode === 'national' ? round : 4;
    return {
      ...schoolCourse(school, grade),
      title: stage?.title ?? school.name + ' · ' + GRADIENTS[grade],
      limit: 30,
      seed: run.id + ':' + round,
    };
  }
  const practice = run.mode === 'practice';
  return {
    ...(practice ? practiceCourse(run) : arcadeCourse()),
    title: EVENTS[run.mode].name, limit: practice ? 12 : 30,
    seed: run.mode === 'daily' ? run.date : run.id,
  };
}

export function summarizeRound(course, result) {
  const targets = course.waves.reduce((count, wave) => count + wave.targets.length, 0);
  const coverage = Math.min(1, result.damage / targets);
  const goals = courseGoals(course, { ...result.objectives, cut: result.cut, durability: result.durability });
  const progress = goals.length ? Math.min(...goals.map(item => Math.min(1, item.value / item.target))) : coverage;
  const win = goals.length > 0 && goals.every(item => item.met) && result.reason !== 'wear';
  const swipe = result.swipe ?? 0;
  const performance = Math.round(win ? 880 + 100 * coverage + 20 * Math.min(1, swipe / 4) :
    goals.length ? 850 * progress : 1000 * (.74 * coverage + .16 * Math.min(1, swipe / 4) + .10 * Math.min(1, result.combo / 8)));
  const medal = performance >= (goals.length ? 950 : 830) ? 'S' : performance >= (goals.length ? 900 : 650) ? 'A' :
    performance >= (goals.length ? 780 : 470) ? 'B' : performance >= (goals.length ? 480 : 240) ? 'C' : 'D';
  return { ...result, swipe, title: course.title, complete: win, win, progress, coverage, performance, targets, goals, medal };
}

export function settleRound(save, id, round, result) {
  if (!['clear', 'wear', 'time'].includes(result?.reason) ||
    !['score', 'combo', 'hits', 'cut', 'waves', 'damage', 'durability', 'remaining'].every(key => Number.isFinite(result[key]) && result[key] >= 0)) {
    return { error: '本轮切割数据无效，请重新开赛' };
  }
  const data = tournamentState(save);
  const run = data.active;
  if (!run || run.id !== id || round !== run.reports.length) return { error: '这一轮已结算或已退出，请回到赛事大厅' };
  const course = courseFor(run);
  const report = summarizeRound(course, result);
  const quick = run.mode === 'quick' || run.mode === 'daily';
  const blade = run.roster[run.mode === 'apex' ? round : 0];
  const qualified = quick ? result.reason === 'time' && result.cut >= 4 :
    report.win || (result.cut >= 4 && (report.progress >= .20 || report.coverage >= .24));
  const paidDaily = run.mode === 'daily' && data.daily[run.date]?.rewarded;
  const valid = qualified && !paidDaily;
  /* 连胜：连续有效出战叠加额外 CR，断了就归零。只算快赛/每日，避免流派赛刷连胜。 */
  const streakBefore = Math.max(0, Math.floor(Number(data.streak) || 0));
  const streak = quick && !paidDaily ? (valid ? streakBefore + 1 : 0) : streakBefore;
  const streakBonus = quick && valid && streak >= 2 ? Math.min(12, (streak - 1) * 3) : 0;
  data.streak = streak;
  const cr = (valid && quick ? Math.min(35, 4 + Math.floor(result.score / 100)) : 0) + streakBonus;
  const xp = valid && quick ? Math.min(45, 10 + Math.floor(result.score / 75)) : 0;
  let mastery = null;
  let masteryGain = 0;
  let swipeBonus = 0;
  if (valid) {
    const before = masteryOf(save, blade);
    const firstRoundForBlade = !run.qualified.includes(blade.id);
    swipeBonus = SWIPE_GOALS.filter(item => item.count > before.bestSwipe && item.count <= report.swipe)
      .reduce((sum, item) => sum + item.xp, 0);
    masteryGain = Math.min(75, 22 + Math.floor(result.score / 110) + (report.win ? 12 : 0)) + swipeBonus;
    data.mastery[blade.id] = {
      specialty: before.specialty, matches: before.matches + Number(firstRoundForBlade),
      xp: before.xp + masteryGain, bestSwipe: Math.max(before.bestSwipe, report.swipe),
    };
    mastery = masteryOf({ tournament: data }, blade);
    mastery.leveled = mastery.levelIndex > before.levelIndex;
    if (firstRoundForBlade) run.qualified.push(blade.id);
  }
  // The flight rules change scoring; keep the original records and compare
  // scores earned on the new course. Daily rewards still share the original receipt.
  const prevBest = run.mode === 'quick' ? Math.max(0, Number(data.best.flightQuick) || 0) :
    run.mode === 'daily' ? Math.max(0, Number(data.daily[run.date]?.flightBest) || 0) : null;
  if (run.mode === 'daily') data.daily[run.date] = {
    ...data.daily[run.date], flightBest: Math.max(prevBest, result.score),
    rewarded: Boolean(paidDaily || valid),
  };
  if (run.mode === 'quick') data.best.flightQuick = Math.max(prevBest, result.score);
  run.reports.push({ ...report, blade: blade.name, bladeId: blade.id, cr, xp });
  const series = roundNames(run.mode).length;
  const done = !series || run.reports.length >= series || (run.mode === 'national' && !report.win);
  const total = run.reports.reduce((sum, item) => sum + item.performance, 0);
  const champion = done && run.reports.length === series && (run.mode === 'national' ?
    report.win : run.mode === 'apex' && run.reports.every(item => item.win) && total >= APEX_GOAL);
  const record = {
    id, round, mode: run.mode, title: report.title, date: run.date, blade: blade.name, cr, xp, mastery, masteryGain, swipeBonus,
    qualified, paidDaily: Boolean(paidDaily), done, champion, total, report, rounds: run.reports.slice(),
    unlockedNational: run.mode === 'school' && report.win && run.grade + 1 === NATIONAL_UNLOCK &&
      !Object.values(data.schools).some(cleared => cleared >= NATIONAL_UNLOCK),
    streak, streakBonus,
    /* 本模式结算前的最高分，用来判断本局是刷新还是落后。 */
    best: prevBest,
  };
  /* 赛事评级：本局结算时一次性写入，UI 用它做段位条与升段演出。 */
  const ratingBefore = Math.max(0, Math.floor(Number(data.rating) || 0));
  const gain = paidDaily ? 0 : rankGain(run.mode, { valid, score: result.score, win: report.win, grade: run.grade ?? 0, champion });
  const before = rankOf(ratingBefore);
  const after = rankOf(ratingBefore + gain);
  data.rating = ratingBefore + gain;
  record.rank = { before: ratingBefore, after: data.rating, gain, from: before.name, to: after.name,
    levelUp: after.index > before.index, progress: after.progress, next: after.next, toNext: after.toNext };
  data.active = done ? null : run;
  save.tournament = data;
  return { record };
}

export function abandonEntry(save, id) {
  const data = tournamentState(save);
  if (data.active?.id !== id) return false;
  save.tournament = { ...data, active: null };
  return true;
}
