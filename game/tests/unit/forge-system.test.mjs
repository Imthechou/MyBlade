import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, LOT_SIZE, FAMILIES, ORE_MATERIALS, LOOKS, MODELS, STAT_CAP, STAT_NAMES, FITS,
  appraise, finishForge, freshRun, strike,
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
