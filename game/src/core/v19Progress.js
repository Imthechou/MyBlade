import { get, archiveInto, applyCareerGrants, recordBladeMatch, checkAchievements, unlockCodex } from './progress.js';
import { commitSave } from './saveTransaction.js';
import { hasExternalChange } from '../platform/storage.js';
import { emit, EVENTS } from '../platform/bus.js';
import { STAT_KEYS } from '../data/balance.js';
import { KNIFE_BY_MODEL } from '../data/knifeTypes.js';
import { addCr } from './economy.js';
import { computeScore } from './scoring.js';
import { workshopSnapshot } from './arenaV41Growth.js';
import { careerRewardPlan } from './arenaV41Rewards.js';
import { specialtySnapshot } from './arenaV41Specialties.js';
import { settle, EVENT } from './events.js';
import { appraise, freshRun, LOOKS, MIN_PRICE, MODELS, signature, signaturePerk } from '../v19/forge.js';
import { SCHOOLS, masteryOf } from '../v19/tournament.js';
import { appraisalQuality, appraisalRarity } from '../v19/workshop.js';

function transact(change) {
  const save = get();
  if (hasExternalChange()) return { ok: false, error: '另一标签页更新了存档。请刷新后继续。' };
  const before = save.cr;
  const result = commitSave(save, change);
  if (save.cr !== before) emit(EVENTS.CR_CHANGED, { cr: save.cr });
  return result;
}

export const hasFurnace = () => Boolean(get().v19.forge);
export const hasLiveFurnace = () => hasFurnace() && !['appraise', 'broken'].includes(get().v19.forge.phase);

function newFurnace(save, seed) {
  const run = freshRun(seed);
  run.revision = 0;
  run.workshopLevel = workshopSnapshot(save).level;
  run.specialist = specialtySnapshot(save, save.forgeBonus.equippedId);
  run.freeFitting = save.forgeBonus.equippedId === 'extra_reroll';
  save.cr = Math.max(MIN_PRICE, save.cr);
  return run;
}

export function openFurnace({ restart = false, seed = Date.now() } = {}) {
  if (hasFurnace() && (!restart || hasLiveFurnace())) return { ok: true };
  return transact(save => {
    save.v19.forge = newFurnace(save, Math.max(seed, (save.v19.forge?.seed || 0) + 1));
    return { ok: true };
  });
}

export function recordVisual(run) {
  const { model, fit, skin, marks, purity, ore, refinement, highlights, hits, stability, last } = run;
  return { model, fit, skin, marks, purity, ore, refinement, highlights, hits, stability, last };
}

function forgeView(save) {
  const run = structuredClone(save.v19.forge);
  if (run?.phase === 'appraise') {
    const blade = save.collection.find(item => item.id === run.resultId);
    if (blade) run.record = {
      ...blade.v19Visual, id: blade.id, name: blade.bladeName, grade: blade.rarityName,
      quality: blade.qualityName, signature: blade.combos?.[0],
      score: blade.score, stats: STAT_KEYS.map(key => blade.stats[key]), credit: run.reward,
    };
  }
  return { credits: save.cr, run };
}

export const forgeSession = () => forgeView(get());

function archiveFurnace(save, run, appraisal) {
  const fractured = run.phase === 'broken';
  const stats = Object.fromEntries(STAT_KEYS.map((key, i) => [key, appraisal?.stats[i] ?? 0]));
  const fusion = signature(run.skin);
  const combos = fusion && !fractured ? [fusion] : [];
  const tiers = Object.values(run.skin.levels).reduce((total, tier) => total + tier, 0);
  const riskPeak = Math.round((run.riskPeak || 0) * 100);
  const finishMultiplier = 1 + Math.max(0, run.work) * .028 + tiers * .13 +
    (run.refinement?.quality || 0) * .004 + run.hits * .008;
  const scoreDetail = computeScore({
    stats, combos, peakRisk: riskPeak, hammerTier: 1,
    hammerTierReward: { scoreMult: finishMultiplier, name: '锻造工艺完成度' },
  });
  const rarity = appraisalRarity(scoreDetail.score);
  const model = run.model === 'blank' ? 'straight' : run.model;
  const knifeType = 'knife_' + model;
  const record = {
    id: 'v19-' + run.seed, seed: run.seed, createdAt: Date.now(),
    bladeName: appraisal?.name || (run.last?.type === 'refine-fail' ? '精炼废炉' : MODELS[run.model] + ' · 锻打断裂'),
    knifeType, knifeTypeId: KNIFE_BY_MODEL[knifeType]?.id ?? model,
    stats, score: scoreDetail.score, scoreDetail, statMean: scoreDetail.mean,
    rarity: rarity.id, rarityName: rarity.name, qualityName: appraisalQuality(scoreDetail.mean),
    riskPeak, riskCurrent: riskPeak, hammerCount: run.hits,
    fractured, canEnterArena: !fractured,
    traits: [], combos, history: [], tags: {},
    v19Visual: recordVisual(run),
  };
  if (fractured) record.fractureInfo = {
    stageName: run.last?.type === 'refine-fail' ? '精炼' : '锻打',
    risk: riskPeak, peakRisk: riskPeak, cause: run.last?.label || '炉料损伤',
  };
  const discoveries = [
    { category: 'material', id: run.ore?.material && 'v19:' + run.ore.material },
    { category: 'fitting', id: run.fit },
    ...Object.entries(LOOKS).filter(([slot, names]) => run.skin[slot] !== 'raw' && names[run.skin[slot]]).map(([slot]) => ({
      category: slot === 'pattern' ? 'texture' : 'finish', id: 'v19:' + slot + ':' + run.skin[slot],
    })),
  ];
  const balance = save.cr;
  const result = archiveInto(save, record, { discoveries });
  if (result.duplicate) return result;
  run.resultId = record.id;
  run.reward = save.cr - balance;
  return result;
}

/** Pointer heat is simulated on a private snapshot. Only completed writes publish gameplay. */
export function commitFurnace(current, change = () => true) {
  return transact(save => {
    const stored = save.v19.forge;
    if (!stored || stored.seed !== current.seed || stored.revision !== current.revision) {
      return { ok: false, error: '当前炉次已更新。请重新进入工坊。' };
    }
    const run = structuredClone(current);
    delete run.record;
    const draft = { credits: save.cr, run };
    const result = change(draft);
    if (!result) return { ok: false };
    save.cr = draft.credits;
    if (!stored.fittingBonusUsed && run.fittingBonusUsed) save.forgeBonus.usesTotal += 1;
    if (!stored.resultId && ['appraise', 'broken'].includes(run.phase)) {
      const archive = archiveFurnace(save, run, run.phase === 'appraise' ? result : null);
      if (archive.duplicate) return archive;
    }
    run.revision = stored.revision + 1;
    save.v19.forge = run;
    return { ok: true, result, ...forgeView(save) };
  });
}

export const finishAppraisal = ({ run }) => appraise(run);

function toContestBlade(blade) {
  const stats = STAT_KEYS.map(key => Number(blade.stats?.[key]) || 0);
  return {
    id: blade.id, name: blade.bladeName || blade.name || '成刀', grade: blade.rarityName,
    score: blade.score, stats, fractured: blade.fractured || blade.canEnterArena === false,
    signature: blade.v19Visual ? signaturePerk(blade.combos?.[0])?.name : undefined,
  };
}

function nationalCrowns(save) {
  const legacy = save.nationalRuns?.history?.filter(item => item.status === 'champion').length || 0;
  const official = save.arena.history.filter(item => item.tier === 'national' &&
    (item.champion === true || item.result?.champion === true || item.result?.reason === 'champion')).length;
  return Math.max(legacy, official);
}

export function tournamentView(save = get()) {
  const school = save.arena.school;
  return {
    credits: save.cr, collection: save.collection.map(toContestBlade), legacyCareer: hasLegacyCareer(save),
    tournament: {
      ...save.v19.arena,
      schools: Object.fromEntries(Object.keys(SCHOOLS).map(id => [id,
        Math.max(-1, ...(school[id]?.cleared || []).filter(grade => grade >= 0 && grade < 5)) + 1])),
      titles: {
        national: nationalCrowns(save),
        apex: save.arena.apex.wins,
      },
      history: save.arena.history.filter(item => item.v19).slice(-18).reverse().map(item => item.v19),
    },
  };
}

export const bladeMastery = blade => masteryOf(tournamentView(), toContestBlade(blade));

export function commitTournament(change) {
  return transact(save => {
    const view = tournamentView(save);
    const active = view.tournament.active;
    const result = change(view);
    if (result.error) return result;
    const { daily, best, mastery, active: next } = view.tournament;
    Object.assign(save.v19.arena, { daily, best, mastery, active: next });
    if (result.record) {
      const bladeId = active.roster[active.mode === 'apex' ? result.record.round : 0].id;
      if (!save.collection.some(blade => blade.id === bladeId && !blade.fractured && blade.canEnterArena !== false)) {
        return { error: '参赛刀已失去资格，请返回大厅结束本届' };
      }
      settleTournament(save, active, result.record);
    }
    return result;
  });
}

function settleTournament(save, run, record) {
  const { mode, report, round, champion, done } = record;
  const { id, school, grade, roster } = run;
  const blade = save.collection.find(item => item.id === roster[mode === 'apex' ? round : 0].id);
  const bladeId = blade?.id;
  const official = ['school', 'national', 'apex'].includes(mode);
  const before = save.cr;
  let events;
  if (official) {
    const performance = { version: 'cut-v19', result: { structure: { primary: report.progress } },
      rounds: [{ round, primary: report.progress, primaryCompleted: report.win, win: report.win }] };
    events = careerRewardPlan(mode, mode === 'school' ? report.win : champion, grade, performance, id, school).events.filter(grant => {
      if (grant.key === 'first:school:' + school + ':' + grade) return !save.arena.school[school]?.cleared.includes(grade);
      if (grant.key === 'first:' + mode + ':champion') return mode === 'national' ? !nationalCrowns(save) : !save.arena.apex.wins;
      return true;
    });
  } else {
    events = [{ key: 'v19:' + id, cr: record.cr, xp: record.xp }];
  }
  const grants = applyCareerGrants(save, events);
  record.xp = grants.reduce((sum, grant) => sum + grant.xp, 0);
  addCr(save, grants.reduce((sum, grant) => sum + grant.cr, 0), 'cut:v19');
  const win = mode === 'school' ? report.win : official && champion;
  if (mode === 'school' && win) {
    const branch = save.arena.school[school] ||= { cleared: [] };
    if (!branch.cleared.includes(grade)) branch.cleared.push(grade);
    unlockCodex(save, 'arena', school + ':' + grade);
  }
  if (done && official) {
    save.arena[win ? 'matchWins' : 'matchLosses'] += 1;
    if (mode !== 'school') {
      const tally = save.arena[mode];
      if (champion) tally.wins++;
      tally.best = Math.max(tally.best, Math.round(record.total / record.rounds.length));
    }
  }
  if (record.qualified && !record.paidDaily) {
    settle(save, official ? EVENT.FORMAL_COMPLETED : EVENT.QUICK_COMPLETED, { matchId: id, tier: mode });
  }
  if (win) settle(save, EVENT.HONOR_EARNED, { matchId: id, tier: mode, itemKey: 'win' });
  const entry = {
    id: id + ':' + round, seriesId: id, bladeId, version: 'cut-v19', tier: mode,
    styleId: school, gradient: grade, win, champion, score: report.performance,
    recordedAt: Date.now(), grants, v19: record,
  };
  save.arena.history.push(entry);
  if (blade) recordBladeMatch(blade, { ...entry, v19: undefined }, report.projects);
  if (champion && mode === 'apex') {
    for (const competitor of roster.slice(0, -1)) {
      const participant = save.collection.find(item => item.id === competitor.id);
      const participation = participant?.arenaHistory?.find(item => item.seriesId === id);
      if (participation) Object.assign(participation, { win: true, champion: true });
    }
  }
  checkAchievements(save);
  record.cr = entry.reward = save.cr - before;
  Object.assign(record.rounds.at(-1), { cr: record.cr, xp: record.xp });
}

/** Old checkpoints remain resumable with their original rules. */
export function hasLegacyCareer(save = get()) {
  return Boolean(save.arenaCareerV41.national.active || save.arenaCareerV41.apex.active ||
    save.nationalRuns?.active || save.teamArena?.active || save.arena.nationalActive);
}
