import test from 'node:test';
import assert from 'node:assert/strict';
import {PHASES,LOT_SIZE,FAMILIES,ORE_MATERIALS,LOOKS,MODELS,STAT_NAMES,FITS,fractureRisk} from '../../src/v19/forge.js';
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
