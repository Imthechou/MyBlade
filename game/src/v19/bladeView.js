const center = { x: 0, y: 0 };
const neutral = { inverseZoom: 1, x: 0, y: 0, grip: 0, yaw: 0, pitch: 0 };
const fields = Object.keys(neutral);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class BladeView {
  current = { ...neutral };
  target = { ...neutral };
  easeMs = 32;

  reset(animate) {
    Object.assign(this.target, neutral);
    this.easeMs = 62;
    if (!animate) this.snap();
  }

  focusGrip(focus, animate) {
    Object.assign(this.target, { inverseZoom: focus ? 1 / 2.35 : 1, x: 0, y: 0, grip: Number(focus) });
    this.easeMs = 62;
    if (!animate) this.snap();
  }

  turn(dx, dy, animate) {
    this.target.yaw += dx;
    this.target.pitch = clamp(this.target.pitch + dy, -.9, .9);
    this.easeMs = 32;
    if (!animate) this.snap();
  }

  zoomBy(factor, { from = center, to = from, min = .68, max = 2.6, animate = true } = {}) {
    const target = this.target;
    const previous = target.inverseZoom;
    const next = clamp(previous / factor, 1 / max, 1 / min);
    // Leave a little space to frame either tip or handle at closer zooms.
    const room = Math.max(0, 1 - next) * 1.4;
    // In orthographic camera space, offset + screen position / zoom is the viewed point.
    target.x = room ? clamp(target.x + from.x * previous - to.x * next, -room, room) : 0;
    target.y = room ? clamp(target.y + from.y * previous - to.y * next, -room, room) : 0;
    target.inverseZoom = next;
    this.easeMs = 32;
    if (!animate) this.snap();
  }

  snap() {
    Object.assign(this.current, this.target);
  }

  advance(delta, reduced) {
    const step = reduced ? 1 : 1 - Math.exp(-Math.min(delta, 64) / this.easeMs);
    let changed = false;
    for (const key of fields) {
      const before = this.current[key];
      const desired = this.target[key];
      if (before === desired) continue;
      const next = before + (desired - before) * step;
      this.current[key] = Math.abs(desired - next) < .0005 ? desired : next;
      changed = true;
    }
    return changed;
  }
}
