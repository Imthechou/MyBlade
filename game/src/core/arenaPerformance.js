/**
 * Arena performance prototype. Diagnostics only: this module never scores,
 * changes blade stats/condition, consults Risk, or mutates arena challenge flow.
 * Every tuning number is exposed under PROTOTYPE_INPUT and is overridable only
 * through config.PROTOTYPE_INPUT.
 */
export const TEST_TYPES = Object.freeze(['cut', 'precision', 'strength']);

export const PROTOTYPE_INPUT = Object.freeze({
  precision: Object.freeze({
    start: Object.freeze({ x: 0.2, y: 0.72 }),
    target: Object.freeze({ x: 0.5, y: 0.46 }),
    startRadius: 0.2,
    tolerance: 0.08,
  }),
  strength: Object.freeze({
    loadCenter: Object.freeze({ x: 0.5, y: 0.52 }),
    startRadius: 0.2,
    loadWindow: Object.freeze({ min: 0.6, max: 2.0 }),
    loadRate: 1,
    concentrationOffset: 0.12,
  }),
  cut: Object.freeze({
    target: Object.freeze({ from: Object.freeze({ x: 0.2, y: 0.72 }), to: Object.freeze({ x: 0.8, y: 0.28 }) }),
    hitTolerance: 0.14,
    alignmentTolerance: 0.055,
    minTravel: 0.3,
  }),
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const validPoint = (point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
const normalizePoint = (point) => ({ x: clamp01(point.x), y: clamp01(point.y) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pathLength = (points) => points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0);

function getInputs(config = {}) {
  const override = config?.PROTOTYPE_INPUT || {};
  const result = clone(PROTOTYPE_INPUT);
  for (const group of Object.keys(result)) {
    const patch = override[group];
    if (!patch || typeof patch !== 'object') continue;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[group][key] = { ...result[group][key], ...value };
      } else if (Number.isFinite(value)) {
        result[group][key] = value;
      }
    }
  }
  return result;
}

function withinRadius(a, b, radius) { return distance(a, b) <= radius; }
function pointToSegmentDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const denom = dx * dx + dy * dy;
  const t = denom ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / denom)) : 0;
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}
function directionTo(point, target) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const horizontal = Math.abs(dx) < 1e-9 ? 'aligned' : (dx > 0 ? 'right' : 'left');
  const vertical = Math.abs(dy) < 1e-9 ? 'aligned' : (dy > 0 ? 'down' : 'up');
  return { dx, dy, horizontal, vertical, label: `${vertical === 'aligned' ? '' : `${vertical} `}${horizontal === 'aligned' ? '' : horizontal}`.trim() || 'on-target' };
}

/** Create a JSON-serializable isolated diagnostic state. stats is intentionally not read. */
export function createPerformance(kind, stats, config = {}) {
  if (!TEST_TYPES.includes(kind)) throw new TypeError(`Unknown performance kind: ${kind}`);
  const inputs = getInputs(config);
  const uiConfig = kind === 'precision'
    ? { initialPoint: inputs.precision.start, target: inputs.precision.target, tolerance: inputs.precision.tolerance, zone: { center: inputs.precision.start, radius: inputs.precision.startRadius } }
    : kind === 'strength'
      ? { initialPoint: inputs.strength.loadCenter, target: inputs.strength.loadCenter, tolerance: inputs.strength.concentrationOffset, window: inputs.strength.loadWindow, zone: { center: inputs.strength.loadCenter, radius: inputs.strength.startRadius } }
      : { target: inputs.cut.target, tolerance: inputs.cut.alignmentTolerance, window: { min: inputs.cut.minTravel }, zone: { hitTolerance: inputs.cut.hitTolerance } };
  return {
    kind,
    active: false,
    paused: false,
    done: false,
    pointer: null,
    current: null,
    elapsed: 0,
    load: 0,
    result: null,
    trace: [],
    origin: null,
    interruption: null,
    config: clone(uiConfig),
    prototypeInput: inputs,
  };
}

function copyState(state) { return clone(state); }
const isTerminal = state => state.done || state.result?.submitted === true;
function startAnchor(state) {
  return state.kind === 'precision' ? state.prototypeInput.precision.start : state.prototypeInput.strength.loadCenter;
}

export function beginOperation(state, point) {
  const next = copyState(state);
  if (isTerminal(next) || next.paused || !validPoint(point)) return next;
  const p = normalizePoint(point);
  if (next.kind === 'precision' || next.kind === 'strength') {
    const input = next.prototypeInput[next.kind];
    if (!withinRadius(p, startAnchor(next), input.startRadius)) {
      const anchor = startAnchor(next);
      next.active = false;
      next.pointer = p;
      next.current = p;
      next.result = {
        type: 'start_out_of_range', status: 'not_started', accepted: false,
        distance: distance(p, anchor), direction: directionTo(p, anchor),
      };
      return next;
    }
  }
  next.active = true;
  next.pointer = p;
  next.current = p;
  next.origin = p;
  next.trace = [p];
  next.elapsed = 0;
  next.load = 0;
  next.result = null;
  next.interruption = null;
  return next;
}

export function moveOperation(state, point) {
  const next = copyState(state);
  if (isTerminal(next) || !next.active || next.paused || !validPoint(point)) return next;
  const p = normalizePoint(point);
  next.pointer = p;
  next.current = p;
  next.trace.push(p);
  if (next.kind === 'precision') next.result = precisionDiagnostic(next, false);
  if (next.kind === 'strength') next.result = strengthDiagnostic(next, false);
  return next;
}

export function tickOperation(state, dt) {
  const next = copyState(state);
  if (isTerminal(next) || !next.active || next.paused || !Number.isFinite(dt) || dt <= 0) return next;
  next.elapsed += dt;
  if (next.kind === 'strength') {
    next.load += dt * next.prototypeInput.strength.loadRate;
    next.result = strengthDiagnostic(next, false);
  }
  return next;
}

function precisionDiagnostic(state, submitted) {
  const input = state.prototypeInput.precision;
  const current = state.current || input.start;
  const d = distance(current, input.target);
  const locked = d <= input.tolerance;
  return {
    type: 'precision', status: locked ? 'locked' : 'out_of_tolerance',
    submitted, locked, outOfTolerance: !locked,
    distance: d, tolerance: input.tolerance,
    direction: directionTo(current, input.target),
  };
}

function strengthDiagnostic(state, submitted) {
  const input = state.prototypeInput.strength;
  const anchor = input.loadCenter;
  const current = state.current || anchor;
  const offset = distance(current, anchor);
  const underloaded = state.load < input.loadWindow.min;
  const overloaded = state.load > input.loadWindow.max;
  const concentrated = offset > input.concentrationOffset;
  let status = 'success';
  if (underloaded) status = 'underloaded';
  else if (overloaded) status = 'outside_pressure_window';
  else if (concentrated) status = 'concentrated_at_weak_point';
  return {
    type: 'strength', status, submitted,
    success: !underloaded && !overloaded && !concentrated,
    underloaded, outsidePressureWindow: overloaded,
    concentratedAtWeakPoint: concentrated,
    load: state.load, loadWindow: { ...input.loadWindow },
    eccentricity: offset, concentrationOffset: input.concentrationOffset,
    direction: directionTo(current, anchor),
    proxy: 'workpiece_loading_stress_only',
  };
}

export function endOperation(state, point) {
  const next = copyState(state);
  if (isTerminal(next) || !next.active || next.paused) return next;
  if (validPoint(point)) {
    const p = normalizePoint(point);
    next.pointer = p;
    next.current = p;
    next.trace.push(p);
  }
  next.active = false;
  next.done = true;
  if (next.kind === 'precision') next.result = precisionDiagnostic(next, true);
  else if (next.kind === 'strength') next.result = strengthDiagnostic(next, true);
  else next.result = diagnoseCut(next.trace, { interrupted: false, hits: null, ...next.prototypeInput.cut });
  return next;
}

export function interruptOperation(state, reason = 'interrupted') {
  const next = copyState(state);
  if (isTerminal(next)) return next;
  next.active = false;
  next.interruption = { reason: String(reason), elapsed: next.elapsed, load: next.load };
  next.result = {
    type: 'interruption', status: 'interrupted', reason: String(reason),
    submitted: false, done: false,
  };
  // Interrupt/cancel is diagnostic only: it never completes or submits an operation.
  return next;
}

export function pauseOperation(state, paused) {
  const next = copyState(state);
  if (isTerminal(next)) return next;
  next.paused = Boolean(paused);
  if (next.paused) {
    next.active = false;
    next.interruption = { reason: 'paused', elapsed: next.elapsed, load: next.load };
    next.result = { type: 'interruption', status: 'interrupted', reason: 'paused', submitted: false, done: false };
  }
  return next;
}

// Explicit retry remains available to legacy callers, including completed attempts.
export function resetOperation(state) {
  const next = copyState(state);
  next.active = false;
  next.paused = false;
  next.done = false;
  next.pointer = null;
  next.current = null;
  next.elapsed = 0;
  next.load = 0;
  next.result = null;
  next.trace = [];
  next.origin = null;
  next.interruption = null;
  return next;
}

/** Diagnose each supplied cut stroke independently; no gameplay score is produced. */
export function diagnoseCut(points, { interrupted = false, hits = null, ...options } = {}) {
  const input = getInputs({ PROTOTYPE_INPUT: { cut: options } }).cut;
  const suppliedDistance = Number.isFinite(options.distance) ? options.distance : null;
  const strokes = Array.isArray(points) && points.length && Array.isArray(points[0]) ? points : [points || []];
  return strokes.map((rawStroke, index) => {
    const stroke = (Array.isArray(rawStroke) ? rawStroke : []).filter(validPoint).map(normalizePoint);
    const hitValue = Array.isArray(hits) ? hits[index] : hits;
    const structuredHit = hitValue && typeof hitValue === 'object' && !Array.isArray(hitValue);
    const hitExplicit = typeof hitValue === 'boolean' || Boolean(structuredHit && Object.hasOwn(hitValue, 'target'));
    const hit = typeof hitValue === 'boolean'
      ? hitValue
      : structuredHit && Object.hasOwn(hitValue, 'target') && hitValue.target != null;
    const blocked = Boolean(structuredHit && hitValue.complete === false);
    const cutThrough = Boolean(structuredHit && hitValue.complete === true);
    const distances = stroke.map(p => pointToSegmentDistance(p, input.target.from, input.target.to));
    const minDistance = distances.length ? Math.min(...distances) : Infinity;
    const meanDistance = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : Infinity;
    const travel = pathLength(stroke);
    const geometricallyHit = minDistance <= input.hitTolerance;
    const didHit = hitExplicit ? Boolean(hit) : geometricallyHit;
    const measuredTravel = suppliedDistance == null ? travel : suppliedDistance;
    let status;
    if (interrupted) status = 'trajectory_interrupted';
    else if (!didHit) status = 'target_not_hit';
    else if (blocked) status = 'blocked';
    else if (measuredTravel < input.minTravel) status = 'insufficient_travel';
    else if (meanDistance > input.alignmentTolerance || minDistance > input.alignmentTolerance) status = 'cut_deviated';
    else status = cutThrough || didHit ? 'cut_through' : 'cut_diagnostic';
    const messages = {
      trajectory_interrupted: '切割轨迹中断，未提交。',
      target_not_hit: '未碰到目标。',
      cut_deviated: '切口偏离目标轨迹。',
      insufficient_travel: '切割行程不足。',
      blocked: '目标受力后仍未切断（阻滞）。',
      cut_through: '切断完成。',
      cut_diagnostic: '轨迹已记录。',
    };
    return {
      stroke: index, code: status, status, message: messages[status],
      hit: didHit, target: structuredHit ? hitValue.target ?? null : null,
      quality: structuredHit ? hitValue.quality ?? null : null,
      complete: structuredHit && typeof hitValue.complete === 'boolean' ? hitValue.complete : status === 'cut_through',
      interrupted: Boolean(interrupted), blocked,
      cutThrough: status === 'cut_through', travel: measuredTravel, measuredPathLength: travel, minimumTravel: input.minTravel,
      minDeviation: minDistance, meanDeviation: meanDistance,
      hitTolerance: input.hitTolerance, alignmentTolerance: input.alignmentTolerance,
    };
  });
}

export default {
  PROTOTYPE_INPUT, TEST_TYPES, createPerformance, beginOperation, moveOperation,
  tickOperation, endOperation, interruptOperation, pauseOperation, resetOperation, diagnoseCut,
};
