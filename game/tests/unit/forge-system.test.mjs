import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, LOT_SIZE, FAMILIES, ORE_MATERIALS, LOOKS, MODELS, STAT_CAP, STAT_NAMES, FITS,
  appraise, buyOre, finishForge, freshRun, inspectOre, markLamp, offers, oreInspection, strike,
  tapOreProbe,
} from '../../src/v19/forge.js';
import {TARGET_NAMES,EVENTS,RANKS} from '../../src/v19/tournament.js';

test('five playable forge stages in a stable order',()=>{
  assert.deepEqual(PHASES,['ore','refine','forge','fit','appraise']);
  assert.equal(LOT_SIZE,3);
  assert.equal(STAT_NAMES.length,6);
});
test('current product assets are actually enumerated',()=>{
  assert.equal(FAMILIES.length,5);
  assert.equal(ORE_MATERIALS.length,12);
  assert.ok(Object.keys(MODELS).length>=12);
  assert.ok(FITS.length>=6);
  for(const slot of ['metal','pattern','film','fx'])assert.ok(Object.keys(LOOKS[slot]).length>=6,slot);
});

test('all tools can inspect every candidate repeatedly without changing ore or credits', () => {
  const run = freshRun(1771);
  // An active furnace from before the change may have all three tools spent.
  run.probeUsed = { lamp: true, tap: true, window: true };
  run.inspections = { 0: true };
  const save = { run, credits: 50 };
  assert.equal(offers(run)[0].window, true);
  for (let batch = 0; batch < 3; batch++) {
    run.batch = batch;
    const original = offers(run);
    for (let index = 0; index < LOT_SIZE; index++) {
      run.selected = index;
      const { id } = original[index];
      for (let count = 0; count < 3; count++) {
        assert.ok(markLamp(save, id));
        assert.ok(tapOreProbe(save, id));
        assert.ok(inspectOre(save));
      }
      assert.deepEqual(offers(run)[index], {
        ...original[index], probe: { lamp: true, taps: 1, window: true }, window: true,
      });
    }
    assert.equal(markLamp(save, (batch + 1) * LOT_SIZE), false);
  }
  assert.equal(Object.keys(run.probes).length, 9);
  assert.equal(save.credits, 50);
  const selected = offers(run)[run.selected];
  assert.ok(buyOre(save));
  assert.equal(save.credits, 50 - selected.price);
  assert.deepEqual(run.ore, selected);
  assert.equal(inspectOre(save), false);
});

test('mineral grades have separated inspection ranges even when purity and optical clarity overlap', () => {
  const opaqueRich = { grade: 2, purity: 72, clarity: 8, crust: 96, vein: 46, exposure: 'hidden' };
  const clearLean = { grade: 0, purity: 64, clarity: 94, crust: 7, vein: 71, exposure: 'open' };
  const rich = oreInspection(opaqueRich);
  const lean = oreInspection(clearLean);
  assert.ok(rich.transmission - lean.transmission > .35);
  assert.ok(rich.deposit - lean.deposit > .60);
  assert.ok(oreInspection({ stability: 43, flaw: 20 }).fractures >
    oreInspection({ stability: 76, flaw: 65 }).fractures);
});

test('tournament supplies nine targets, practice and progression',()=>{
  assert.equal(Object.keys(TARGET_NAMES).length,9);
  for(const mode of ['practice','quick','daily','school','national','apex']) assert.ok(EVENTS[mode],mode);
  assert.equal(RANKS.length,5);
});

function forgeSample(zone, family = 'river') {
  const run = freshRun(1047);
  Object.assign(run, {
    phase: 'forge', ore: { grade: 1, family }, purity: 72, stability: 68,
    refinement: { quality: 76, bonus: 3 },
  });
  for (let i = 0; i < 6; i++) strike(run, zone);
  assert.ok(finishForge(run));
  run.fit = 'walnut';
  return run;
}

test('forging choices create distinct six-stat profiles from the same seed', () => {
  const belly = appraise(forgeSample('belly')).stats;
  const edge = appraise(forgeSample('edge')).stats;
  const tip = appraise(forgeSample('tip')).stats;
  assert.ok(belly[0] - edge[0] >= 15);
  assert.ok(edge[2] - belly[2] >= 18);
  assert.ok(tip[5] - belly[5] >= 18);
  assert.ok(Math.max(...edge) - Math.min(...edge) >= 25);

  const frost = appraise(forgeSample('edge', 'frost')).stats;
  assert.ok(frost[2] - edge[2] >= 20);
  const fitting = forgeSample('edge');
  fitting.fit = 'copper';
  const copper = appraise(fitting).stats;
  assert.ok(copper[0] > edge[0] && copper[2] < edge[2]);
});

test('an older active forge without hammer locations can still appraise', () => {
  const run = forgeSample('belly');
  delete run.hammerWork;
  const { stats } = appraise(run);
  assert.equal(stats.length, 6);
  assert.ok(stats.every(value => Number.isInteger(value) && value >= 20 && value <= STAT_CAP));
});
