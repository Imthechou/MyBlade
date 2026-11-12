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
  quick: { name: '自由快赛', sub: '30 秒 · 三段冲分' },
  daily: { name: '每日挑战', sub: '30 秒 · 当日固定靶序' },
  school: { name: '流派试炼', sub: '六个流派 · 各五阶' },
  national: { name: '全国大赛', sub: '单刀出征 · 五轮淘汰' },
  apex: { name: '三刀巅峰赛', sub: '三把成刀 · 三轮接力' },
};

// A wave can be a line of light targets or a heavy target with persistent damage.
const line = (project, ...targets) => ({ project, targets, heavy: false });
const heavy = (project, target) => ({ project, targets: [target], heavy: true });
export const SCHOOLS = {
  press: { name: '锻压', glyph: '锤', focus: '重劈硬靶', waves: [
    line('strength', 'bamboo', 'wood', 'bamboo'), heavy('strength', 'wood'), heavy('strength', 'ice'),
  ] },
  edge: { name: '锋刃', glyph: '刃', focus: '横排连斩', combo: 2, waves: [
    line('cutting', 'card', 'rope', 'bamboo'), line('cutting', 'rope', 'pineapple', 'card'), heavy('cutting', 'bamboo'),
  ] },
  precise: { name: '精密', glyph: '准', focus: '稳斩凝胶', waves: [
    line('precision', 'card', 'gel', 'pineapple'), heavy('precision', 'gel'), line('precision', 'gel', 'rope', 'gel'),
  ] },
  quench: { name: '淬彩', glyph: '彩', focus: '冰果轮替', combo: 2, waves: [
    line('cutting', 'pineapple', 'card', 'pineapple'), heavy('precision', 'ice'), line('precision', 'ice', 'gel', 'card'),
  ] },
  composite: { name: '复合', glyph: '复', focus: '软硬兼顾', waves: [
    line('cutting', 'rope', 'pineapple', 'wood'), heavy('durability', 'steel'), line('precision', 'ice', 'bamboo', 'gel'),
  ] },
  overload: { name: '过载', glyph: '载', focus: '强破护甲', waves: [
    line('durability', 'bamboo', 'ice', 'steel'), heavy('extreme', 'shield'), heavy('durability', 'steel'),
  ] },
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
  { title: '第二轮 · 精斩', school: 'composite' },
  { title: '第三轮 · 极限', school: 'overload' },
];
// Thirty-second arcade flow: 0–10s warm-up, 10–20s technique, 20–30s finale.
// Keep the original 9 materials for the formal schools; quickplay favors one-hit
// rows and reserves heavy targets for brief punctuation, not a damage sponge.
const QUICK_WAVES = [
  { ...line('cutting', 'card', 'rope', 'card'), cue: '热身连斩', motion: 'float' },
  { ...line('precision', 'gel', 'pineapple', 'card'), cue: '轻快连斩', motion: 'float' },
  { ...line('cutting', 'rope', 'card', 'gel'), cue: '连续试锋', motion: 'float' },
  { ...line('cutting', 'card', 'pineapple', 'rope', 'gel'), cue: '移动追斩', motion: 'sweep' },
  { ...heavy('strength', 'wood'), cue: '硬靶破防', motion: 'static' },
  { ...line('precision', 'ice', 'gel', 'pineapple'), cue: '追踪切割', motion: 'sweep' },
  { ...line('cutting', 'card', 'rope', 'pineapple', 'card'), cue: '四连冲分', motion: 'sweep' },
  { ...heavy('durability', 'steel'), cue: '重劈钢桶', motion: 'static' },
  { ...line('cutting', 'gel', 'pineapple', 'rope', 'card'), cue: '终局狂热', motion: 'sweep' },
];
const TRAINING_BLADE = { id: 'training', name: '工坊试刀', grade: '借用', stats: [69, 77, 73, 65, 64, 60] };
export const APEX_GOAL = 2700;

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
  const index = BLADE_MASTERY_TIERS.reduce((tier, item, i) => xp >= item.xp ? i : tier, 0);
  const tier = BLADE_MASTERY_TIERS[index];
  const next = BLADE_MASTERY_TIERS[index + 1];
  return {
    specialty, matches, xp, level: tier.name, levelIndex: index, bonus: tier.bonus,
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
  if (entry.mode === 'national' && !Object.values(schools).some(cleared => cleared >= 2)) return '任一流派通关能手后解锁';
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
      title: stage?.title ?? school.name + ' · ' + GRADIENTS[grade],
      limit: 30, waves: school.waves, combo: school.combo ?? 0, timedLoop: false,
      hpScale: [.52, .62, .74, .86, .98][grade],
      wearScale: [.34, .38, .42, .46, .50][grade],
      // Higher-grade trials introduce gentle target motion rather than only
      // turning enemies into HP sponges. Heavy armor stays planted.
      motion: grade >= 2 && ['precise', 'quench', 'composite', 'edge'].includes(stage?.school ?? run.school)
        ? 'sweep' : 'float',
      motionRate: 1 + grade * .12,
      seed: run.id + ':' + round,
    };
  }
  const practice = run.mode === 'practice';
  const waves = !practice ? QUICK_WAVES : run.material ? [heavy('extreme', run.material)] :
    run.style === 'row' ? QUICK_WAVES.filter(wave => !wave.heavy) :
    run.style === 'heavy' ? QUICK_WAVES.filter(wave => wave.heavy) : QUICK_WAVES;
  return {
    title: EVENTS[run.mode].name, limit: practice ? 12 : 30, waves,
    combo: 0, timedLoop: true, arcade: !practice,
    hpScale: practice ? .63 : .54, wearScale: .27,
    seed: run.mode === 'daily' ? run.date : run.id,
    rotate: !practice,
  };
}

export function summarizeRound(course, result) {
  const targets = course.waves.reduce((count, wave) => count + wave.targets.length, 0);
  const complete = !course.timedLoop && result.waves >= course.waves.length;
  const win = complete && result.combo >= course.combo;
  const progress = Math.min(1, result.damage / targets);
  const performance = Math.round(800 * progress + (complete ?
    120 * result.remaining / course.limit + 80 * result.durability / 100 : 0));
  return { ...result, title: course.title, complete, win, progress, performance, targets };
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
  const qualified = quick ? result.reason === 'time' && result.hits >= 4 : report.progress >= .20;
  const paidDaily = run.mode === 'daily' && data.daily[run.date]?.rewarded;
  const valid = qualified && !paidDaily;
  /* 连胜：连续有效出战叠加额外 CR，断了就归零。只算快赛/每日，避免流派赛刷连胜。 */
  const streakBefore = Math.max(0, Math.floor(Number(data.streak) || 0));
  const streak = quick ? (valid ? streakBefore + 1 : 0) : streakBefore;
  const streakBonus = quick && streak >= 2 ? Math.min(12, (streak - 1) * 3) : 0;
  data.streak = streak;
  const cr = (valid && quick ? Math.min(35, 4 + Math.floor(result.score / 100)) : 0) + streakBonus;
  const xp = valid && quick ? Math.min(45, 10 + Math.floor(result.score / 75)) : 0;
  let mastery = null;
  let masteryGain = 0;
  if (valid && !run.qualified.includes(blade.id)) {
    const before = masteryOf(save, blade);
    // Blade experience is earned by using a specific knife. It never rewrites
    // the six forged base stats; capped specialty proficiency rewards practice.
    masteryGain = Math.min(90, 24 + Math.floor(result.score / 65) +
      (run.mode === 'school' && result.reason === 'clear' ? 15 : 0));
    data.mastery[blade.id] = {
      specialty: before.specialty, matches: before.matches + 1, xp: before.xp + masteryGain,
    };
    mastery = masteryOf({ tournament: data }, blade);
    run.qualified.push(blade.id);
  }
  /* 先存本局之前的最高分，写完 best 就分不清「刷新」和「追不上」了。 */
  const prevBest = run.mode === 'quick' ? Math.max(0, Math.floor(Number(data.best?.quick) || 0))
    : run.mode === 'daily' ? Math.max(0, Math.floor(Number(data.daily?.[run.date]?.best) || 0)) : null;
  if (run.mode === 'daily') data.daily[run.date] = {
    best: Math.max(data.daily[run.date]?.best ?? 0, result.score),
    rewarded: Boolean(paidDaily || valid),
  };
  if (run.mode === 'quick') data.best.quick = Math.max(data.best.quick ?? 0, result.score);
  run.reports.push({ ...report, blade: blade.name, bladeId: blade.id, cr, xp });
  const series = roundNames(run.mode).length;
  const done = !series || run.reports.length >= series || (run.mode === 'national' && !report.win);
  const total = run.reports.reduce((sum, item) => sum + item.performance, 0);
  const champion = done && run.reports.length === series && (run.mode === 'national' ?
    report.win : run.mode === 'apex' && run.reports.every(item => item.win) && total >= APEX_GOAL);
  const record = {
    id, round, mode: run.mode, title: report.title, date: run.date, blade: blade.name, cr, xp, mastery, masteryGain,
    qualified, paidDaily: Boolean(paidDaily), done, champion, total, report, rounds: run.reports.slice(),
    streak, streakBonus,
    /* 本模式结算前的最高分，用来判断本局是刷新还是落后。 */
    best: prevBest,
  };
  /* 赛事评级：本局结算时一次性写入，UI 用它做段位条与升段演出。 */
  const ratingBefore = Math.max(0, Math.floor(Number(data.rating) || 0));
  const gain = rankGain(run.mode, { valid, score: result.score, win: report.win, grade: run.grade ?? 0, champion });
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
