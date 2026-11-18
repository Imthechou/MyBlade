import test from 'node:test';
import assert from 'node:assert/strict';

import * as progress from '../../src/core/progress.js';
import { makeSave, normalizeSave } from '../../src/core/saveSchema.js';
import {
  commitFurnace, commitTournament, finishAppraisal, forgeSession, openFurnace, walletView,
} from '../../src/core/v19Progress.js';
import { createEntry, courseFor, settleRound, gate } from '../../src/v19/tournament.js';
import {
  RELEASE_RULES, SERIES, commissionChecks, commissionFor, completeSeries, craftRating, meetsCommission, seriesCandidate,
} from '../../src/v19/launchRules.js';
import { advanceHeat, beginRefining, buyOre, canStrike, finishForge, fitOptions, offers, pourRefining, strike }
  from '../../src/v19/forge.js';
import { woodCalibration } from '../../src/v19/arena/stats.js';
import { flightAt, flightSchedule } from '../../src/v19/arena/flight.js';

function action(change) {
  const result = commitFurnace(forgeSession().run, change);
  assert.equal(result.ok, true, result.error);
  return result.run;
}

function qualifiedHeat(quality) {
  action(({ run }) => beginRefining(run));
  return action(({ run }) => {
    Object.assign(run.refining, { step: 'molten', temperature: 72, elapsed: 7, active: 7,
      stable: 7, quality, damage: 0, draft: 0 });
    assert.equal(pourRefining(run), true);
    advanceHeat(run, 1.25, false);
    return true;
  });
}

function craft({ zones, quality = 70, role = '轻巧' }) {
  assert.equal(action(buyOre).phase, 'reveal');
  assert.equal(qualifiedHeat(quality).phase, 'forge');
  for (const zone of zones) action(({ run }) => strike(run, zone));
  action(({ run }) => finishForge(run));
  return action(({ run }) => {
    run.fit = fitOptions(run).find(item => item.role === role).id;
    return finishAppraisal({ run });
  });
}

function result({ cut = 4, swipe = 3, objectives = { armor: 2, precision: 3, multi: 1 }, damage = 10 } = {}) {
  return { reason: 'time', score: 1800, combo: 5, swipe, hits: cut, cut, waves: 3,
    damage, durability: 75, remaining: 0, objectives };
}

function enter(id, entry, blades, date) {
  const reply = commitTournament(save => createEntry(save, entry, blades, id, date));
  assert.ok(reply.run, reply.error);
  return reply.run;
}

function settle(id, outcome, round = 0) {
  const reply = commitTournament(save => settleRound(save, id, round, outcome));
  assert.ok(reply.record, reply.error);
  return reply.record;
}

const TIDE = ['belly', 'belly', 'edge', 'edge', 'edge', 'edge'];
const HEAVY = ['belly', 'belly', 'belly', 'belly', 'tip', 'tip'];

test('fresh and migrated wallets keep their opening amount and paid checkpoints', () => {
  assert.equal(makeSave().cr, 30);
  const legacy = makeSave();
  delete legacy.wallet;
  delete legacy.v19.launch;
  legacy.cr = 713;
  legacy.collection.push({ id: 'old-1', bladeName: '旧刀', stats: {}, arenaHistory: [{ id: 'old-match' }] });
  legacy.v19.forge = { seed: 7, selected: 0, revision: 3, phase: 'reveal', skin: { levels: {} },
    ore: { tier: 0, price: 14, family: 'river' } };
  const migrated = normalizeSave(legacy);
  assert.equal(migrated.cr, 713);
  assert.equal(migrated.wallet.opening, 713);
  assert.deepEqual(migrated.wallet.receipts, {});
  assert.equal(migrated.v19.forge.ore.price, 14);
  assert.equal(migrated.v19.forge.rules, undefined);
  assert.equal(migrated.v19.launch.firstPassed, true);
  assert.equal(migrated.collection[0].arenaHistory.length, 1);
});

test('first furnace, optional commission and paid fixtures settle once through the live transaction', () => {
  progress.resetAll();
  assert.ok(openFurnace({ seed: 21234 }).ok);
  assert.deepEqual(offers(forgeSession().run).map(ore => [ore.family, ore.price]), [['river', 0], ['coal', 0]]);
  const first = craft({ zones: TIDE });
  const blade = progress.get().collection[0];
  assert.equal(first.rules, RELEASE_RULES);
  assert.equal(first.reward, 8);
  assert.equal(progress.get().cr, 38);
  assert.deepEqual(first.record.stats, [68, 75, 78, 75, 64, 64]);
  assert.equal(blade.seriesSlot, '01');
  assert.deepEqual(blade.craftRating, { score: 79, grade: 'B' });
  assert.equal(openFurnace({ restart: true }).ok, false);

  const failed = enter('f01-incomplete', { mode: 'first' }, [blade.id]);
  assert.deepEqual(flightSchedule(courseFor(failed)).map(item => item.at), [0, 4, 8]);
  assert.equal(settle(failed.id, result({ cut: 2, swipe: 2 })).qualified, false);
  assert.equal(progress.get().cr, 38);
  enter('f01-first', { mode: 'first' }, [blade.id]);
  assert.equal(settle('f01-first', result({ cut: 3 })).cr, 4);
  assert.equal(progress.get().collection[0].firstTrialStamp, true);
  assert.equal(progress.get().cr, 42);
  assert.ok(commitTournament(save => settleRound(save, 'f01-first', 0, result())).error);
  enter('f01-first-again', { mode: 'first' }, [blade.id]);
  assert.equal(settle('f01-first-again', result({ cut: 3 })).cr, 0);

  assert.ok(openFurnace({ restart: true, compare: true, seed: 21235 }).ok);
  assert.equal(forgeSession().run.comparisonBuild, 'heavy');
  assert.equal(forgeSession().run.commissionSelected, false);
  action(({ run }) => { run.commissionSelected = true; return true; });
  const second = craft({ zones: HEAVY, role: '沉稳' });
  const secondBlade = progress.get().collection.find(item => item.id === second.record.id);
  assert.equal(secondBlade.seriesSlot, '04');
  assert.equal(second.reward, 18);
  assert.equal(progress.get().cr, 46);
  assert.deepEqual(second.record.stats, [98, 78, 59, 69, 68, 66]);
  assert.deepEqual(walletView(secondBlade).receipts.map(item => item.amount), [12, 6, -14]);

  enter('f01-quick', { mode: 'quick', special: 'armor' }, [secondBlade.id]);
  assert.deepEqual(settle('f01-quick', result()).creditRows.map(item => item.amount), [4, 4]);
  assert.equal(progress.get().cr, 54);
  assert.equal(walletView(secondBlade).receipts.reduce((sum, item) => sum + item.amount, 0), 12);
  const compare = enter('f01-same-target', { mode: 'compare' }, [blade.id, secondBlade.id]);
  assert.equal(flightAt(flightSchedule(courseFor(compare))[0].launches[0], 1).x, .23);
  const start = settle(compare.id, result());
  assert.equal(start.done, false);
  assert.equal(normalizeSave(progress.get()).v19.arena.active.id, compare.id);
  const end = settle(compare.id, result(), 1);
  assert.equal(end.done, true);
  assert.deepEqual(end.rounds.map(item => item.calibration), [{ shell: 2, cut: 3 }, { shell: 1, cut: 3 }]);
  assert.equal(progress.get().cr, 54);
  assert.equal(progress.get().wallet.accounted, progress.get().cr);
});

test('a contrasting build opens with an optional commission and unpaid previews migrate safely', () => {
  progress.resetAll();
  const save = progress.get();
  save.v19.launch = { firstBladeId: 'heavy-first', firstPassed: true };
  save.collection.push({ id: 'heavy-first', stats: { strength: 90, sharpness: 65 } });
  assert.ok(openFurnace({ compare: true, seed: 43210 }).ok);
  const run = forgeSession().run;
  assert.equal(run.comparisonBuild, 'edge');
  assert.equal(offers(run)[0].family, 'river');
  const blade = craft({ zones: TIDE });
  assert.equal(blade.commission, null);
  assert.equal(blade.reward, 6);
  assert.equal(progress.get().cr, 22);

  const released = makeSave();
  const { comparisonBuild, ...oldRun } = run;
  released.v19.forge = { ...oldRun, compareCommission: true, commissionSelected: true };
  const preview = normalizeSave(released).v19.forge;
  assert.equal(preview.comparisonBuild, 'heavy');
  assert.equal(preview.commissionSelected, false);
  const ore = { family: 'coal', tier: 0, price: 14 };
  released.v19.forge = { ...released.v19.forge, phase: 'reveal', ore, commission: commissionFor(ore) };
  const locked = normalizeSave(released).v19.forge;
  assert.equal(locked.commission.amount, 12);
  assert.equal(locked.ore.price, 14);
  assert.equal(locked.commissionSelected, true);
});

test('visible commission progress uses the same settled heat and consecutive strikes as payout', () => {
  const ore = { tier: 2, family: 'river' };
  const run = { ore, commission: commissionFor(ore), refining: { quality: 70 },
    hitZones: ['tip', 'belly', 'belly', 'belly', 'edge'] };
  assert.deepEqual(commissionChecks(run).map(check => [check.value, check.target]), [[70, 65], [3, 4]]);
  assert.equal(meetsCommission(run), false);
  run.hitZones.push('edge', 'tip');
  assert.equal(commissionChecks(run)[1].value, 4);
  assert.equal(meetsCommission(run), false);
  run.refinement = { quality: 64 };
  assert.equal(meetsCommission(run), false);
  run.refinement.quality = 65;
  assert.equal(meetsCommission(run), true);
});

test('F01 releases each slot once and saves a reserved recipe before its event', () => {
  for (const item of SERIES) {
    const run = { model: item.model || 'saber', ore: { family: item.family || 'coal' },
      hitZones: item.zone ? Array(item.hits).fill(item.zone) : ['tip', 'tip', 'edge', 'edge', 'belly', 'belly'],
      refinement: { quality: item.quality } };
    assert.equal(seriesCandidate(run).id, item.id);
    if (!item.special) continue;
    const blade = { seriesCandidate: item.id };
    const report = { mode: 'quick', special: item.special };
    assert.equal(completeSeries(blade, report, { qualified: false, report: result() }), null);
    assert.equal(completeSeries(blade, report, { qualified: true, report: result() }), item.id);
    assert.equal(completeSeries(blade, report, { qualified: true, report: result() }), null);
  }
  assert.deepEqual(craftRating({ hitZones: TIDE, refinement: { quality: 70 } }), { score: 79, grade: 'B' });
  assert.equal(commissionFor({ tier: 2, family: 'coal' }).amount, 22);
  assert.equal(woodCalibration([98, 78, 59, 69, 68, 66]).shell, 1);
});

test('protection, shared daily payout, and recorded recovery preserve the wallet', () => {
  progress.resetAll();
  const initial = progress.get();
  initial.v19.launch.firstPassed = true;
  initial.cr = initial.wallet.opening = initial.wallet.accounted = 6;
  assert.ok(openFurnace({ seed: 33001 }).ok);
  assert.equal(forgeSession().run.furnaceKind, 'recovery');
  craft({ zones: TIDE });
  assert.equal(progress.get().cr, 14);
  assert.deepEqual(walletView().receipts.map(item => item.amount), [8]);
  const recovered = progress.get().collection[0];

  enter('f01-loan-daily', { mode: 'daily' }, [], '2026-11-18');
  assert.equal(settle('f01-loan-daily', result()).cr, 12);
  enter('f01-own-daily', { mode: 'daily' }, [recovered.id], '2026-11-18');
  assert.equal(settle('f01-own-daily', result()).cr, 0);
  assert.equal(progress.get().v19.arena.daily['2026-11-18'].trainingBest, 1800);
  assert.equal(progress.get().v19.arena.daily['2026-11-18'].flightBest, 1800);
  assert.equal(walletView().receipts[0].bladeId, null);
  assert.equal(gate({ launch: { firstBladeId: recovered.id }, collection: [] }, { mode: 'quick' }), '完成首刀试斩后开放');

  assert.ok(openFurnace({ restart: true, compare: true, seed: 33002 }).ok);
  action(({ run }) => { run.furnaceKind = 'challenge'; return true; });
  action(buyOre);
  action(({ run }) => beginRefining(run));
  const failure = action(({ run }) => {
    advanceHeat(run, 7, true);
    return run.phase === 'broken';
  });
  assert.equal(failure.reward, 5);
  assert.equal(progress.get().cr, 17);
  assert.equal(progress.get().wallet.accounted, 17);
  assert.equal(canStrike({ phase: 'forge', rules: RELEASE_RULES, furnaceKind: 'first', hits: 6 }), false);
});
