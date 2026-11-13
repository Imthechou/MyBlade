import { el } from './dom.js';
import { icon } from './icons.js';

export function createViewReset(reset) {
  const label = '复位视角';
  const button = el('button', { type: 'button', class: 'blade-reset', title: label, 'aria-label': label }, [icon('refresh')]);
  let lastTouch = -Infinity;
  button.addEventListener('click', event => {
    if (event.detail && performance.now() - lastTouch < 500) return;
    reset();
  });
  button.addEventListener('pointerup', event => {
    // A touch just after a canvas drag may not synthesize a click.
    if (event.pointerType !== 'touch' || !event.isPrimary ||
      document.elementFromPoint(event.clientX, event.clientY) !== button) return;
    lastTouch = performance.now();
    reset();
  });
  return button;
}
