import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS, SCHOOLS, courseFor, createEntry, settleRound, masteryOf,
  BLADE_MASTERY_TIERS,
} from '../../src/v19/tournament.js';

const blade = {
  id: 'crafted-one', name: '青锋试刃', grade: '稀有',
  stats: [79, 77, 86, 76, 74, 62], signature: null,
};
function saveData() {
  return { collection: [{ ...blade, stats: [...blade.stats] }], tournament: {}, legacyCareer: false };
}
const sampleResult = {
  reason: 'time', score: 1180, combo: 4, hits: 9, cut: 7, waves: 4,
  damage: 7, durability: 82, remaining: 0, projects: [],
};

test('arcade quick and daily are 30s with three target acts', () => {
  assert.match(EVENTS.quick.sub, /30 秒/);
  assert.match(EVENTS.daily.sub, /30 秒/);
  for (const mode of ['quick', 'daily']) {
    const course = courseFor({ mode, id: 'arena-30', date: '2026-11-12', reports: [] });
    assert.equal(course.limit, 30);
    assert.equal(course.arcade, true);
    assert.equal(course.timedLoop, true);
    assert.equal(course.waves.length, 9);
    assert.ok(course.waves.slice(0, 3).every(w => !w.heavy));
    assert.ok(course.waves.slice(3).some(w => w.motion === 'sweep'));
    assert.equal(course.seed, mode === 'daily' ? '2026-11-12' : 'arena-30');
  }
});

test('all school and championship stages are 30s; advanced schools have motion', () => {
  for (const school of Object.keys(SCHOOLS)) {
    for (const grade of [0, 2, 4]) {
      const c = courseFor({ mode: 'school', school, grade, id: 'test', reports: [] });
      assert.equal(c.limit, 30);
      assert.equal(c.waves.length, 3);
      assert.ok(c.hpScale > 0 && c.hpScale <= 1.1);
    }
  }
  for (const mode of ['national', 'apex']) {
    assert.equal(courseFor({ mode, id: 't', reports: [] }).limit, 30);
  }
  assert.equal(courseFor({mode: 'practice', id: 't', reports: [], style: 'mix', material: ''}).limit, 12);
});

test('valid 30s match grows the chosen blade without changing six forging stats', () => {
  const save = saveData(), originalStats = [...blade.stats];
  const out = createEntry(save, { mode: 'quick', grade: 0 }, [blade.id], 'arena-example');
  assert.ok(out.run);
  assert.equal(out.run.roster[0].mastery.xp, 0);
  const reply = settleRound(save, 'arena-example', 0, sampleResult);
  assert.ok(reply.record, JSON.stringify(reply));
  assert.equal(reply.record.masteryGain, 24 + Math.floor(sampleResult.score / 65));
  assert.equal(save.tournament.mastery[blade.id].matches, 1);
  assert.equal(save.tournament.mastery[blade.id].xp, reply.record.masteryGain);
  assert.deepEqual(save.collection[0].stats, originalStats);
  const next = masteryOf(save, blade);
  assert.ok(next.xp > 0);
  assert.ok(next.progress >= 0 && next.progress <= 1);
  assert.ok(next.bonus <= .08);
  assert.equal(save.tournament.active, null);
});

test('old match-count saves retain earned mastery, new mastery caps at 8%', () => {
  const old = { tournament: { mastery: { [blade.id]: { matches: 5 } } } };
  assert.ok(masteryOf(old, blade).levelIndex >= 3);
  const finalTier = BLADE_MASTERY_TIERS.at(-1);
  const capped = { tournament: { mastery: {
    [blade.id]: { matches: 100, xp: finalTier.xp + 9000 }
  } } };
  const result = masteryOf(capped, blade);
  assert.equal(result.level, finalTier.name);
  assert.equal(result.bonus, .08);
  assert.equal(result.progress, 1);
});
