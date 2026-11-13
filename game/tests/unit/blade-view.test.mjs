import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BladeView } from '../../src/v19/bladeView.js';

test('an off-center pinch keeps its focus while the zoom eases', () => {
  const view = new BladeView();
  const anchor = { x: .24, y: .58 };
  view.zoomBy(1.8, { from: anchor });
  for (let frame = 0; frame < 32; frame++) {
    view.advance(16, false);
    const { inverseZoom, x, y } = view.current;
    assert.ok(Math.abs(x + anchor.x * inverseZoom - anchor.x) < .001);
    assert.ok(Math.abs(y + anchor.y * inverseZoom - anchor.y) < .001);
    if (frame === 0) assert.ok(inverseZoom < 1 && inverseZoom > 1 / 1.8);
  }
  assert.deepEqual(view.current, view.target);
  assert.equal(view.advance(16, false), false);
});

test('two-finger movement can pan a close-up without changing the zoom', () => {
  const view = new BladeView();
  view.zoomBy(2, { animate: false });
  const from = { x: 0, y: .42 }, to = { x: .24, y: -.1 };
  view.zoomBy(1, { from, to, animate: false });
  assert.equal(view.current.inverseZoom, .5);
  assert.ok(Math.abs(view.current.x + to.x * .5 - from.x * .5) < .001);
  assert.ok(Math.abs(view.current.y + to.y * .5 - from.y * .5) < .001);
  view.zoomBy(.5, { from: to, animate: false });
  assert.deepEqual(view.current, { inverseZoom: 1, x: 0, y: 0, grip: 0, yaw: 0, pitch: 0 });
});

test('reduced motion applies the reset and grip focus immediately', () => {
  const view = new BladeView();
  view.turn(.8, 0, false);
  view.focusGrip(true, true);
  view.advance(16, true);
  assert.equal(1 / view.current.inverseZoom, 2.35);
  assert.equal(view.current.grip, 1);
  view.reset(true);
  view.advance(16, true);
  assert.deepEqual(view.current, { inverseZoom: 1, x: 0, y: 0, grip: 0, yaw: 0, pitch: 0 });
});
