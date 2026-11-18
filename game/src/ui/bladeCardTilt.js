import * as motion from '../platform/motion.js';

const clamp = (value) => Math.max(-1, Math.min(1, value));

/** Only the open card subscribes to pointer input. The shelf stays static. */
export function enableBladeCardTilt(surface, card) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let touch = null;
  let frame = 0;
  let x = 0;
  let y = 0;

  function reset() {
    touch = null;
    cancelAnimationFrame(frame);
    frame = 0;
    x = y = 0;
    delete surface.dataset.tilting;
    for (const name of ['--tilt-x', '--tilt-y', '--foil-x', '--foil-y']) {
      card.style.removeProperty(name);
    }
  }

  function tilt(nextX, nextY) {
    x = clamp(nextX);
    y = clamp(nextY);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      surface.dataset.tilting = 'true';
      card.style.setProperty('--tilt-x', `${-y * 6}deg`);
      card.style.setProperty('--tilt-y', `${x * 10}deg`);
      card.style.setProperty('--foil-x', `${50 + x * 43}%`);
      card.style.setProperty('--foil-y', `${50 + y * 43}%`);
    });
  }

  surface.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.pointerType === 'mouse' || motion.reduced()) return;
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, engaged: false };
  }, options);

  surface.addEventListener('pointermove', (event) => {
    if (motion.reduced()) return;
    if (event.pointerType !== 'mouse') {
      if (touch?.id !== event.pointerId) return;
      if (!touch.engaged) {
        const dx = Math.abs(event.clientX - touch.x);
        const dy = Math.abs(event.clientY - touch.y);
        if (dy > 8 && dy >= dx) { reset(); return; }
        if (dx < 8 || dx < dy * 1.2) return;
        touch.engaged = true;
      }
    }
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    tilt((event.clientX - rect.left) * 2 / rect.width - 1,
      (event.clientY - rect.top) * 2 / rect.height - 1);
  }, options);

  for (const name of ['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture', 'blur']) {
    surface.addEventListener(name, reset, options);
  }
  surface.addEventListener('keydown', (event) => {
    if (motion.reduced()) return;
    const step = .25;
    const deltas = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === 'Home') { event.preventDefault(); reset(); return; }
    const delta = deltas[event.key];
    if (!Array.isArray(delta)) return;
    event.preventDefault();
    tilt(x + delta[0], y + delta[1]);
  }, options);

  const unsubscribe = motion.subscribe((reduced) => { if (reduced) reset(); });
  return () => {
    listeners.abort();
    unsubscribe();
    reset();
  };
}
