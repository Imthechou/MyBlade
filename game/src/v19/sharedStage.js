import { ForgeStage } from './stage.js';
import { FITS } from './forge.js';
import { motion } from '../platform/index.js';
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

let stage;
let host;
let canvas;

motion.subscribe(reduced => { if (stage) stage.reduceMotion = reduced; });

export function attachForgeStage(next, initialModels) {
  canvas ??= Object.assign(document.createElement('canvas'), { id: 'scene', tabIndex: 0 });
  canvas.className = 'v19-canvas';
  canvas.setAttribute('aria-label', '3D 预览，方向键旋转，刀具可用加减键缩放，Home 键复位');
  next.prepend(canvas);
  try {
    stage ??= new ForgeStage(canvas, initialModels);
    stage.reduceMotion = motion.reduced();
    host = next;
    stage.setRendering(true);
    stage.resize();
    return stage;
  } catch (error) {
    canvas.remove();
    throw error;
  }
}

export function releaseForgeStage(owner) {
  if (host !== owner) return;
  stage.setRendering(false);
  canvas.remove();
  host = null;
}

function viewButton(symbol, label, action, zoom = false) {
  const button = el('button', { type: 'button', class: zoom ? 'blade-zoom' : 'blade-reset', title: label, 'aria-label': label }, [icon(symbol)]);
  let lastTouch = -Infinity;
  button.addEventListener('click', event => {
    if (event.detail && performance.now() - lastTouch < 500) return;
    action();
  });
  button.addEventListener('pointerup', event => {
    // A touch immediately after a canvas drag may not synthesize a click.
    if (event.pointerType === 'touch' && event.isPrimary &&
      document.elementFromPoint(event.clientX, event.clientY) === button) {
      lastTouch = performance.now();
      action();
    }
  });
  return button;
}

const zoomStep = 1.2;

export function createBladeTools({ zoom, reset }) {
  return el('div', { class: 'blade-view-tools', role: 'group', 'aria-label': '视角控制' }, [
    viewButton('minus', '缩小刀具', () => zoom(1 / zoomStep), true),
    viewButton('plus', '放大刀具', () => zoom(zoomStep), true),
    viewButton('refresh', '复位视角', reset),
  ]);
}

export function bindStageInput(stage, {
  signal, enabled = () => true, canAdjust = () => true, reset = () => stage.resetView(), onTap,
}) {
  const { canvas } = stage;
  const pointers = new Map();
  let mode;
  let moved = false;
  const threshold = 7;
  const listen = (type, handle, options) => canvas.addEventListener(type, handle, { signal, ...options });

  listen('pointerdown', event => {
    if (!enabled() || event.button !== 0 || pointers.size === 2) return;
    if (pointers.size && (event.pointerType !== 'touch' || !stage.canZoom)) return;
    if (!pointers.size) {
      mode = stage.mode;
      moved = false;
    } else moved = true;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  listen('pointermove', event => {
    const point = pointers.get(event.pointerId);
    if (!point || stage.mode !== mode || !enabled()) return;
    const { clientX: x, clientY: y } = event;
    const dx = x - point.x, dy = y - point.y;
    if (pointers.size === 2) {
      const other = [...pointers.values()].find(value => value !== point);
      const before = Math.hypot(point.x - other.x, point.y - other.y);
      if (before > 0 && canAdjust()) stage.zoomBy(Math.hypot(x - other.x, y - other.y) / before);
    } else {
      if (!moved && Math.hypot(dx, dy) < threshold) return;
      moved = true;
      if (canAdjust()) stage.turn(dx, dy);
    }
    point.x = x;
    point.y = y;
  });
  listen('pointerup', event => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    pointers.delete(event.pointerId);
    if (!moved && stage.mode === mode && enabled() &&
      Math.hypot(event.clientX - point.x, event.clientY - point.y) < threshold) onTap?.(event);
  });
  const cancel = event => {
    if (pointers.delete(event.pointerId)) moved = true;
  };
  listen('pointercancel', cancel);
  listen('lostpointercapture', cancel);
  listen('wheel', event => {
    if (!enabled() || !stage.canZoom || !canAdjust()) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = Math.max(-300, Math.min(300, event.deltaY * unit));
    stage.zoomBy(Math.exp(-delta * .0026));
  }, { passive: false });
  listen('keydown', event => {
    if (!enabled() || !canAdjust()) return;
    const angles = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    if (event.key === 'Home') reset();
    else if (Object.hasOwn(angles, event.key)) stage.turn(...angles[event.key]);
    else if (stage.canZoom && ['+', '=', '-'].includes(event.key)) stage.zoomBy(event.key === '-' ? 1 / zoomStep : zoomStep);
    else return;
    event.preventDefault();
  });
}

export function showForgedBlade(host, visual, { fractured = false } = {}) {
  const stage = attachForgeStage(host);
  const abort = new AbortController();
  bindStageInput(stage, { signal: abort.signal });
  const tools = createBladeTools({ zoom: factor => stage.zoomBy(factor), reset: () => stage.resetView() });
  const controls = el('div', { class: 'blade-view-controls' }, [el('span', { text: '横拖旋转' }), tools]);
  host.dataset.preview = 'blade';
  host.append(controls);
  stage.resetView();
  const phase = fractured ? 'broken' : 'appraise';
  const ready = stage.sync({ ...visual, phase }, visual.ore, FITS.find(item => item.id === visual.fit));
  const close = () => {
    abort.abort();
    controls.remove();
    delete host.dataset.preview;
    releaseForgeStage(host);
  };
  return { close, ready: Promise.resolve(ready ?? true) };
}
