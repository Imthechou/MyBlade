import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS, SCHOOLS, courseFor, createEntry, settleRound, summarizeRound, masteryOf, gate,
  BLADE_MASTERY_TIERS,
} from '../../src/v19/tournament.js';
import { flightAt, flightSchedule } from '../../src/v19/arena/flight.js';
import { TARGET_NAMES } from '../../src/v19/tournament.js';

const blade = {
  id: 'crafted-one', name: '青锋试刃', grade: '稀有',
  stats: [79, 77, 86, 76, 74, 62], signature: null,
};
function saveData() {
  return { collection: [{ ...blade, stats: [...blade.stats] }], tournament: {}, legacyCareer: false };
}
const sampleResult = {
  reason: 'time', score: 1180, combo: 4, swipe: 3, hits: 9, cut: 7, waves: 13,
  damage: 7, durability: 82, remaining: 0, projects: [],
};

test('quick and daily use a full 30-second flight schedule with a five-target finale', () => {
  assert.match(EVENTS.quick.sub, /30 秒/);
  assert.match(EVENTS.daily.sub, /30 秒/);
  for (const mode of ['quick', 'daily']) {
    const course = courseFor({ mode, id: 'arena-30', date: '2026-11-12', reports: [] });
    assert.equal(course.limit, 30);
    const waves = flightSchedule(course);
    assert.equal(waves.length, 13);
    assert.ok(waves.slice(0, 4).every(wave => wave.at < 10 && wave.pattern !== 'anvil'));
    assert.ok(waves.slice(4, 8).every(wave => wave.at >= 10 && wave.at < 20));
    assert.ok(waves.slice(8).every(wave => wave.at >= 20));
    assert.ok(waves.some(wave => wave.pattern === 'cross'));
    assert.equal(waves.at(-1).launches.length, 5);
    assert.ok(waves.flatMap(wave => wave.launches).every(launch => launch.begins + launch.duration <= 30));
    assert.equal(course.seed, mode === 'daily' ? '2026-11-12' : 'arena-30');
  }
});

test('daily flight paths match across attempts and move up, across and down', () => {
  const daily = id => flightSchedule(courseFor({ mode: 'daily', id, date: '2026-11-12', reports: [] }));
  assert.deepEqual(daily('first'), daily('replay'));
  const wave = daily('first').find(item => item.pattern === 'cross');
  const [launch, other] = wave.launches;
  const first = flightAt(launch, launch.begins + launch.duration * .12);
  const apex = flightAt(launch, launch.begins + launch.duration * .50);
  const last = flightAt(launch, launch.begins + launch.duration * .88);
  assert.ok(apex.y < first.y && apex.y < last.y);
  assert.ok(first.vy < 0 && last.vy > 0);
  assert.ok(first.x !== last.x && launch.drift * other.drift < 0);
  assert.equal(flightAt(launch, launch.begins - .01), null);
  assert.equal(flightAt(launch, launch.begins + launch.duration + .01), null);
});

test('each school has distinct win conditions and faster flights at higher grades', () => {
  const expected = {
    press: ['armor'], edge: ['multi'], precise: ['precision'],
    quench: ['relay'], composite: ['mixed'], overload: ['cut', 'durability'],
  };
  for (const school of Object.keys(SCHOOLS)) {
    const course = grade => courseFor({ mode: 'school', school, grade, id: 'test', reports: [] });
    for (let grade = 0; grade < 5; grade++) {
      const stage = course(grade);
      assert.equal(stage.limit, 30);
      assert.deepEqual(stage.goals.map(goal => goal.id), expected[school]);
      assert.ok(stage.waves.every(wave => wave.targets.every(key => Object.hasOwn(TARGET_NAMES, key))));
      assert.ok(stage.wearScale > 0 === (school === 'overload'));
    }
    assert.ok(course(4).waves[0].speed > course(0).waves[0].speed);
    assert.ok(course(4).goals[0].target > course(0).goals[0].target);
    const novice = course(0);
    const objectives = Object.fromEntries(novice.goals.map(item => [item.id, item.target]));
    const winning = { ...sampleResult, cut: 20, damage: 20, objectives };
    assert.equal(summarizeRound(novice, winning).win, true);
    const missing = school === 'overload' ? { durability: 24.9 } : { objectives: {} };
    assert.equal(summarizeRound(novice, { ...winning, ...missing, score: 99999 }).win, false);
  }
  for (const [mode, rounds] of [['national', 5], ['apex', 3]]) {
    for (let round = 0; round < rounds; round++) {
      const stage = courseFor({ mode, id: 'series', reports: Array(round).fill(null) });
      assert.equal(stage.limit, 30);
      assert.ok(stage.goals.length > 0);
    }
  }
  assert.equal(courseFor({ mode: 'practice', id: 't', reports: [], style: 'mix' }).limit, 12);
});

test('qualified rounds persist one-time swipe milestones without changing forging stats', () => {
  const save = saveData();
  const originalStats = [...blade.stats];
  const first = createEntry(save, { mode: 'quick' }, [blade.id], 'quick-1');
  assert.equal(first.run.roster[0].mastery.xp, 0);
  const result = { ...sampleResult, swipe: 4 };
  const reply = settleRound(save, 'quick-1', 0, result);
  assert.equal(reply.record.swipeBonus, 14 + 22);
  assert.equal(reply.record.masteryGain, 22 + Math.floor(result.score / 110) + 36);
  assert.equal(reply.record.mastery.swipeGoal.count, 5);
  assert.equal(save.tournament.best.flightQuick, result.score);
  assert.equal(save.tournament.active, null);
  assert.ok(settleRound(save, 'quick-1', 0, result).error);

  createEntry(save, { mode: 'quick' }, [blade.id], 'quick-2');
  const next = settleRound(save, 'quick-2', 0, result).record;
  assert.equal(next.swipeBonus, 0);
  assert.equal(next.best, result.score);
  assert.equal(save.tournament.mastery[blade.id].matches, 2);
  assert.deepEqual(save.collection[0].stats, originalStats);
});

test('a paid daily replay may improve the flight record but preserves streak and rewards', () => {
  const save = saveData();
  const date = '2026-11-12';
  save.tournament = { streak: 2, rating: 130, best: { quick: 5900 }, daily: { [date]: { best: 6000, rewarded: true } } };
  createEntry(save, { mode: 'daily' }, [blade.id], 'daily-replay', date);
  const { record } = settleRound(save, 'daily-replay', 0, sampleResult);
  assert.equal(record.paidDaily, true);
  assert.equal(record.cr, 0);
  assert.equal(record.xp, 0);
  assert.equal(record.masteryGain, 0);
  assert.equal(record.rank.gain, 0);
  assert.equal(save.tournament.streak, 2);
  assert.deepEqual(save.tournament.daily[date], { best: 6000, rewarded: true, flightBest: 1180 });
  assert.equal(save.tournament.best.quick, 5900);
});

test('school unlock and national round XP preserve the series and dedupe settlement', () => {
  const save = saveData();
  save.tournament.schools = { edge: 1 };
  assert.match(gate(save, { mode: 'national' }), /能手/);
  createEntry(save, { mode: 'school', school: 'edge', grade: 1 }, [blade.id], 'edge-1');
  const cleared = settleRound(save, 'edge-1', 0, { ...sampleResult, objectives: { multi: 3 } }).record;
  assert.equal(cleared.report.win, true);
  assert.equal(cleared.unlockedNational, true);

  save.tournament.schools.edge = 2;
  createEntry(save, { mode: 'national' }, [blade.id], 'national-1');
  const first = settleRound(save, 'national-1', 0, { ...sampleResult, objectives: { multi: 2 } }).record;
  assert.equal(first.done, false);
  assert.ok(settleRound(save, 'national-1', 0, sampleResult).error);
  const second = settleRound(save, 'national-1', 1, { ...sampleResult, objectives: { precision: 4 } }).record;
  assert.ok(second.mastery.xp > first.mastery.xp);
  assert.equal(second.mastery.matches, first.mastery.matches);
  assert.equal(second.rounds.length, 2);
});

test('old match-count saves retain earned mastery and specialty bonuses cap at 8%', () => {
  const old = { tournament: { mastery: { [blade.id]: { matches: 5 } } } };
  assert.ok(masteryOf(old, blade).levelIndex >= 3);
  const finalTier = BLADE_MASTERY_TIERS.at(-1);
  const capped = { tournament: { mastery: {
    [blade.id]: { matches: 100, xp: finalTier.xp + 9000, bestSwipe: 5 },
  } } };
  const result = masteryOf(capped, blade);
  assert.equal(result.level, finalTier.name);
  assert.equal(result.bonus, .08);
  assert.equal(result.progress, 1);
  assert.equal(result.swipeGoal, null);
});
