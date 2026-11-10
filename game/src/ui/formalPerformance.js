import { el, mount } from './dom.js';
import * as Input from '../core/arenaPerformance.js';
import * as Suite from '../core/arenaSuite.js';
import { fieldTestTask } from '../core/arena.js';
import { MATERIALS, hasStructuralFailure } from '../core/arenaChallenge.js';

let cleanup = null;
let activeSuite = null;
const GUIDE_HALF = .20;
const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
const fmt = value => Number(value || 0).toFixed(2);
const statusName = status => ({ locked: '已锁定刻度', out_of_tolerance: '偏差超限，尚未锁定',
  start_out_of_range: '未锁定起始刀尖／加载区，请从标记处按下', not_started: '未锁定起始刀尖／加载区，请从标记处按下', success: '承压窗口内完成',
  underloaded: '加载不足', outside_pressure_window: '超出承压窗口',
  concentrated_at_weak_point: '薄弱处受力集中（工件偏心加载）', interrupted: '触摸／轨迹中断，未提交' })[status] || '等待操作';
const policyText = '暂定可调原型，默认 3 项（并非锁定赛制）。切割沿用现有成绩接口；精度、强度先记录操作诊断，不新增合成权重或 CR。';
const riskText = '正式切割风险与本项受损沿用原行为；断刀概率曲线、跨项目受损、收手细则仍为 TBD。加载条仅是工件应力代理，不代表新增刀损／断刀规则。';

function ensureStyles() {
  if (document.getElementById('formal-performance-styles')) return;
  document.head.append(el('link', { id: 'formal-performance-styles', rel: 'stylesheet', href: './css/pages/formal-performance.css' }));
}
// A cancelled gesture is not a resting pressure/aim preview. Keep its reason,
// but discard only the transient attempt so a new press starts unambiguously.
function cancelPress(state, reason, paused = state.paused) {
  if (state.done || state.result?.submitted === true) return state;
  const interrupted = Input.interruptOperation(state, reason);
  return { ...Input.resetOperation(interrupted), paused, interruption: interrupted.interruption };
}
export function disposeFormalStage() { cleanup?.(); cleanup = null; activeSuite = null; }
export function pauseFormalStage() {
  if (activeSuite?.operation && !activeSuite.operation.done) activeSuite.operation = cancelPress(activeSuite.operation, 'stage-paused', true);
  disposeFormalStage();
}
function steps(suite) {
  return el('ol', { class: 'formal-suite-steps', 'aria-label': '实际性能测试进度' }, suite.entries.map((entry, i) => el('li', {
    class: entry.status === 'complete' ? 'is-complete' : '', 'aria-current': i === suite.index ? 'step' : null,
    text: `${i + 1}. ${entry.name}${entry.status === 'complete' ? ' · 已完成' : entry.status === 'not-run' ? ' · 未进行' : ''}`,
  })));
}
function nextButton(match, rerender) {
  const suite = match.formalPerformance;
  const last = suite.index === suite.entries.length - 1;
  return el('button', { class: 'btn btn--primary', text: last ? '提交成绩，查看赛后诊断' : `下一项：${suite.entries[suite.index + 1].name}`, onclick: () => {
    if (last) {
      const submitted = Suite.submitSuite(match);
      if (!submitted.ok) return;
    } else Suite.advanceSuite(suite);
    rerender();
  } });
}
/** Return true when the wrapper has rendered a non-cutting stage or introduction. */
export function renderFormalSuite(match, body, rerender) {
  ensureStyles();
  let suite = match.formalPerformance;
  if (!suite) suite = Suite.createSuite(match).suite;
  if (!suite) return false;
  if (!suite.started) {
    const intro = el('section', { class: 'quick-match formal-suite-intro', 'data-formal-stage': 'briefing' }, [
      el('span', { class: 'quick-kicker', text: '赛前策略已完成 · 以下是实际操作，不是事件选择' }),
      el('h2', { text: `一把刀，${suite.entries.length}种性能考验` }), steps(suite),
      el('ol', { class: 'formal-suite-instructions' }, [
        el('li', { text: '切割：沿材料切割线划动，查看切口偏差、切断与阻滞。' }),
        el('li', { text: '精度：从刀尖标记拖到工件刻度，松手提交落点。' }),
        el('li', { text: '强度：按住工件加载区，观察压力条，在承压窗口松开。' }),
      ]),
      el('p', { class: 'formal-suite-note', text: policyText }), el('p', { class: 'formal-suite-note', text: riskText }),
      el('button', { class: 'btn btn--primary btn--block', text: '开始切割测试', onclick: () => { if (Suite.startSuite(match)) rerender(); } }),
    ]);
    body.append(intro); return true;
  }
  const entry = Suite.currentSuiteTest(suite);
  if (entry.kind === 'cutting' && !suite.cutPerformance) return false;
  if (entry.status === 'complete') {
    const result = el('section', { class: 'quick-match formal-operation-result', 'data-formal-stage': `${entry.kind}-result` }, [
      steps(suite), el('h2', { text: `${entry.name} · 操作结果` }), diagnosticCard(entry),
      el('p', { class: 'formal-suite-note', text: policyText }),
      el('div', { class: 'formal-suite-actions' }, [
        entry.kind !== 'cutting' ? el('button', { class: 'btn', text: '重试本项', onclick: () => { suite.operation = Input.resetOperation(suite.operation); entry.status = 'pending'; entry.result = null; rerender(); } }) : null,
        nextButton(match, rerender),
      ]),
    ]);
    body.append(result); return true;
  }
  renderOperation(match, body, rerender); return true;
}
export function completeFormalCut(match, performance, rerender) {
  const suite = match.formalPerformance;
  if (!Suite.captureCut(suite, performance)) return;
  if (hasStructuralFailure(performance)) Suite.submitSuite(match);
  rerender();
}
export function abandonFormalSuite(match) { Suite.annotateAbandonedSuite(match); }

/** Drawing is additive: existing material renderer, feedback and risk engine remain untouched. */
export function drawFormalCutGuides(ctx, run, w, h) {
  if (run.mode !== 'formal') return;
  ctx.save(); ctx.strokeStyle = 'rgba(241,214,157,.78)'; ctx.fillStyle = '#e9d2a2'; ctx.lineWidth = 1.4;
  for (const target of run.targets || []) {
    if (!target.alive) continue;
    const angle = MATERIALS[target.type].angle;
    const dx = Math.cos(angle) * GUIDE_HALF, dy = Math.sin(angle) * GUIDE_HALF;
    ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo((target.x - dx) * w, (target.y - dy) * h); ctx.lineTo((target.x + dx) * w, (target.y + dy) * h); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc((target.x - dx) * w, (target.y - dy) * h, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('起', (target.x - dx) * w, (target.y - dy) * h - 9);
  }
  ctx.restore();
}
export function noteCutStroke(match, stroke, interrupted = false) {
  const suite = match?.formalPerformance;
  if (!suite || !stroke || suite.cutPerformance) return;
  const hit = stroke.hits?.[0];
  const target = hit?.target;
  const angle = target ? MATERIALS[target.type].angle : 0;
  const center = target || { x: .5, y: .52 };
  const dx = Math.cos(angle) * GUIDE_HALF, dy = Math.sin(angle) * GUIDE_HALF;
  const options = { interrupted, hits: hit ? [hit] : [false], distance: stroke.distance,
    target: { from: { x: center.x - dx, y: center.y - dy }, to: { x: center.x + dx, y: center.y + dy } } };
  const diagnosis = Input.diagnoseCut(stroke.points, options)[0];
  if (diagnosis) Suite.addCutDiagnostic(suite, { ...diagnosis, target: target ? { id: target.id, type: target.type } : null });
  return diagnosis;
}
function directionText(direction) {
  if (!direction) return '';
  const horizontal = { right: '向右', left: '向左', aligned: '' }[direction.horizontal] || '';
  const vertical = { down: '向下', up: '向上', aligned: '' }[direction.vertical] || '';
  return horizontal || vertical ? `请${vertical}${horizontal}校准` : '已对准中心';
}
function diagnosticCard(entry) {
  const r = entry.result || {};
  const list = r.diagnostics || [];
  const label = entry.kind === 'cutting' ? r.message : `${r.submitted ? '已提交 · ' : ''}${statusName(r.status)}`;
  return el('div', { class: 'formal-suite-diagnostics' }, [
    el('h3', { text: label || '未完成本项' }),
    entry.kind === 'precision' ? el('p', { text: `落点偏差 ${pct(r.distance)}；容差 ${pct(r.tolerance)}（原型坐标）。${r.locked ? '精度等级：锁定' : '精度等级：超限'}。${r.locked ? '落点在容差内，无需继续校准' : directionText(r.direction)}。` }) : null,
    entry.kind === 'strength' ? el('p', { text: `加载 ${fmt(r.load)}；暂定承压窗口 ${fmt(r.loadWindow?.min)}–${fmt(r.loadWindow?.max)}。偏心量 ${pct(r.eccentricity)}。仅工件应力反馈，不产生新增刀具损伤。` }) : null,
    list.length ? el('details', {}, [el('summary', { text: `逐笔切割诊断（${list.length} 笔）` }), el('ul', {}, list.map(d => el('li', { text: `${d.message} 行程 ${pct(d.travel)}；切口偏差 ${Number.isFinite(d.meanDeviation) ? pct(d.meanDeviation) : '—'}。` })))]) : null,
    entry.status === 'not-run' ? el('p', { text: '结构失效或退出后未进行，不伪造成绩。' }) : null,
  ]);
}
export function renderSuiteDiagnostics(match) {
  ensureStyles();
  const summary = match.fieldTest?.result?.performance?.tests || (match.formalPerformance && Suite.suiteSummary(match.formalPerformance));
  if (!summary) return null;
  return el('section', { class: 'formal-suite-diagnostics', 'aria-label': '三类性能赛后诊断' }, [
    el('h3', { text: '实际性能诊断 · 暂定原型' }),
    ...summary.entries.map(entry => el('div', { 'data-diagnostic-kind': entry.kind }, [el('b', { text: `${entry.name} · ${entry.status === 'complete' ? '已完成' : '未进行'}` }), diagnosticCard(entry)])),
    el('p', { class: 'formal-suite-note', text: policyText }), el('p', { class: 'formal-suite-note', text: riskText }),
  ]);
}

function renderOperation(match, body, rerender) {
  const suite = match.formalPerformance;
  const entry = Suite.currentSuiteTest(suite);
  if (!suite.operation) {
    // 容差和加载窗口复用旧现场测试的中心/宽度；不新增赛事数值阈值。
    const task = fieldTestTask(match);
    suite.operation = Input.createPerformance(entry.kind, match.blade.stats, { PROTOTYPE_INPUT: {
      precision: { target: { x: task.center, y: Input.PROTOTYPE_INPUT.precision.target.y }, tolerance: task.width * .5 },
      strength: { loadWindow: { min: task.center - task.width * .5, max: task.center + task.width * .5 } },
    } });
  }
  let operation = suite.operation;
  activeSuite = suite;
  let pointerId = null, touchId = null, frame = 0, last = 0, width = 0, height = 0;
  const set = value => { operation = value; suite.operation = value; };
  const precision = entry.kind === 'precision';
  const instructions = precision ? '从「刀尖」圆环按下，拖到工件中心刻度；松手提交。' : '按住「加载区」，压力进入带刻线窗口后松手；偏心加载会集中应力。';
  const stage = el('section', { class: 'quick-match formal-operation', 'data-formal-stage': entry.kind }, [
    el('div', { class: 'formal-field-intro' }, [el('b', { text: `${entry.name} · 实际操作` }), el('span', { text: instructions })]), steps(suite),
  ]);
  const canvas = el('canvas', { class: 'quick-canvas formal-operation-canvas', 'aria-label': `${entry.name}操作舞台；${instructions}` });
  const feedback = el('div', { class: 'formal-operation-feedback', role: 'status', 'aria-live': 'polite' });
  const meter = el('div', { class: 'formal-operation-meter', role: precision ? 'status' : 'meter', 'aria-label': precision ? '校准偏差方向' : '原型加载压力', 'aria-valuemin': precision ? null : 0, 'aria-valuemax': precision ? null : operation.config.window.max });
  const clearPointer = () => {
    const previous = pointerId; pointerId = null; touchId = null;
    try { if (previous != null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous); } catch {}
  };
  const togglePause = paused => { set(paused ? cancelPress(operation, 'paused', true) : Input.pauseOperation(operation, false)); clearPointer(); draw(); };
  const pause = el('button', { class: 'quick-pause', text: operation.paused ? '继续' : '暂停', onclick: () => togglePause(!operation.paused) });
  const footer = el('div', { class: 'quick-footer' }, [el('span', { class: 'quick-time-label', text: match.blade.name }), pause, el('button', { class: 'quick-pause', text: '重置操作', onclick: () => { set(Input.resetOperation(operation)); clearPointer(); draw(); } })]);
  stage.append(canvas, feedback, meter, footer, el('p', { class: 'formal-suite-note', text: '容差与加载窗复用现有现场测试中心／宽度；其他输入参数仅为可调操作原型，不是新计分规则。取消触摸、失焦或离页不会提交成绩。' }));
  body.append(stage);
  const ctx = canvas.getContext('2d');
  const point = event => { const bounds = canvas.getBoundingClientRect(); return { x: (event.clientX - bounds.left) / Math.max(1, bounds.width), y: (event.clientY - bounds.top) / Math.max(1, bounds.height) }; };
  const interrupt = reason => { if (pointerId == null) return; set(cancelPress(operation, reason)); clearPointer(); draw(); };
  canvas.addEventListener('pointerdown', event => {
    if (pointerId != null || operation.paused || operation.done || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); set(Input.beginOperation(operation, point(event)));
    if (operation.active) { pointerId = event.pointerId; try { canvas.setPointerCapture(pointerId); } catch {} }
    draw();
  });
  const outside = p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1;
  canvas.addEventListener('pointermove', event => { if (event.pointerId !== pointerId) return; event.preventDefault(); const p = point(event); if (outside(p)) { interrupt('pointerleave'); return; } set(Input.moveOperation(operation, p)); draw(); });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    const p = point(event); if (outside(p)) { interrupt('pointerleave'); return; }
    set(Input.endOperation(operation, p)); clearPointer();
    if (operation.done) { Suite.recordSuiteOperation(suite, operation.result); rerender(); } else draw();
  });
  canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) interrupt('pointercancel'); });
  canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) interrupt('lostpointercapture'); });
  canvas.addEventListener('pointerleave', event => { if (event.pointerId === pointerId) interrupt('pointerleave'); });
  canvas.addEventListener('touchstart', event => { if (pointerId != null && touchId == null) touchId = event.changedTouches?.[0]?.identifier ?? null; }, { passive: true });
  canvas.addEventListener('touchcancel', event => {
    if (!event.changedTouches?.length || touchId == null || Array.from(event.changedTouches).some(touch => touch.identifier === touchId)) interrupt('touchcancel');
  }, { passive: true });
  const background = () => { if (document.hidden) togglePause(true); };
  const blur = () => togglePause(true);
  const key = event => { if (event.key === 'Escape' || event.key.toLowerCase() === 'p') { event.preventDefault(); togglePause(event.key === 'Escape' || !operation.paused); } };
  document.addEventListener('visibilitychange', background); window.addEventListener('blur', blur); window.addEventListener('pagehide', blur); document.addEventListener('keydown', key);
  const resize = () => {
    const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas); window.addEventListener('resize', resize);
  function draw() {
    pause.textContent = operation.paused ? '继续' : '暂停';
    const diagnostic = operation.result;
    const canRelease = operation.active && !operation.paused && !operation.done && diagnostic?.success === true;
    let message = instructions;
    if (diagnostic) {
      if (precision && diagnostic.locked) message = operation.active ? '落点在容差内，松手提交（尚未提交）。' : (diagnostic.submitted ? '已提交，落点在容差内。' : '落点在容差内。');
      else if (precision && operation.active) message = `偏差超限，尚未提交。${directionText(diagnostic.direction)}`;
      else if (!precision && operation.active) message = canRelease ? '已进入有效承压窗口，松手提交（尚未提交）。' : `${statusName(diagnostic.status)}。${diagnostic.concentratedAtWeakPoint ? `${directionText(diagnostic.direction)}，偏心加载需校准。` : '请观察压力窗口。'}`;
      else message = `${statusName(diagnostic.status)}。${directionText(diagnostic.direction)}`;
    } else if (operation.interruption) message = '已取消按压，未提交；请从标记区重新按下。';
    if (operation.paused) message = '已暂停：当前按压已清除，未提交。点击「继续」后从标记区重新按下。';
    if (feedback.textContent !== message) feedback.textContent = message;
    if (precision) {
      if (diagnostic?.submitted) meter.textContent = '本项已提交';
      else if (operation.paused) meter.textContent = '已暂停；继续后请从标记区重新按下';
      else if (diagnostic?.locked) meter.textContent = operation.active && !operation.done
        ? '落点在容差内，可松手提交'
        : '落点在容差内；请重新按下开始操作';
      else meter.textContent = `偏差方向：${directionText(diagnostic?.direction) || '从刀尖重新按下开始校准'}`;
    } else meter.textContent = `压力 ${fmt(operation.load)} · 窗口 ${fmt(operation.config.window.min)}–${fmt(operation.config.window.max)}${canRelease ? ' · 此时松开' : ''}`;
    if (!precision) meter.setAttribute('aria-valuenow', String(operation.load));
    if (!ctx || !width || !height) return;
    ctx.fillStyle = '#102338'; ctx.fillRect(0, 0, width, height); ctx.font = '13px system-ui'; ctx.textAlign = 'center';
    if (precision) drawPrecision(ctx, operation, width, height); else drawStrength(ctx, operation, width, height);
    if (operation.paused) { ctx.fillStyle = 'rgba(8,19,30,.7)'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#e8d6b3'; ctx.fillText('已暂停 · 继续后重新按下', width / 2, height / 2); }
  }
  const paint = now => {
    const dt = last ? Math.min(.05, Math.max(0, (now - last) / 1000)) : 0; last = now;
    if (operation.active && !operation.paused) { set(Input.tickOperation(operation, dt)); draw(); }
    frame = requestAnimationFrame(paint);
  };
  cleanup = () => { cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', background); window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur); document.removeEventListener('keydown', key); window.removeEventListener('resize', resize); if (suite.operation?.active) suite.operation = cancelPress(suite.operation, 'stage-disposed'); clearPointer(); };
  resize(); frame = requestAnimationFrame(paint);
}
function drawPrecision(ctx, state, w, h) {
  const target = state.config.target, start = state.config.initialPoint, current = state.current || start;
  ctx.fillStyle = '#587080'; ctx.fillRect(w * .26, h * .22, w * .48, h * .48);
  ctx.strokeStyle = '#a6c1cb'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(target.x * w, target.y * h, state.config.tolerance * w * (i + 1), state.config.tolerance * h * (i + 1), 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(target.x * w - 16, target.y * h); ctx.lineTo(target.x * w + 16, target.y * h); ctx.moveTo(target.x * w, target.y * h - 16); ctx.lineTo(target.x * w, target.y * h + 16); ctx.stroke();
  ctx.fillStyle = '#e8d5aa'; ctx.fillText('中心刻度 · 内环为容差', w * .5, h * .13);
  ctx.strokeStyle = '#d9bc7e'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.ellipse(start.x * w, start.y * h, state.config.zone.radius * w, state.config.zone.radius * h, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText('刀尖 · 从此按下', start.x * w, start.y * h + 35);
  ctx.strokeStyle = '#f7ead2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(current.x * w, current.y * h - 11); ctx.lineTo(current.x * w, current.y * h + 11); ctx.moveTo(current.x * w - 11, current.y * h); ctx.lineTo(current.x * w + 11, current.y * h); ctx.stroke();
}
function drawStrength(ctx, state, w, h) {
  const center = state.config.target, window = state.config.window, max = window.max * 1.5;
  const left = w * .12, top = h * .17, length = w * .76;
  ctx.fillStyle = '#203e53'; ctx.fillRect(left, top, length, 18);
  ctx.fillStyle = '#826b40'; ctx.fillRect(left + length * window.min / max, top, length * (window.max - window.min) / max, 18);
  ctx.strokeStyle = '#e9d1a0'; ctx.lineWidth = 1; ctx.strokeRect(left + length * window.min / max, top - 5, length * (window.max - window.min) / max, 28);
  ctx.fillStyle = '#b5d7da'; ctx.fillRect(left, top + 5, length * Math.min(1, state.load / max), 8);
  ctx.fillStyle = '#ecdbb9'; ctx.fillText('压力条 · 刻线为承压窗口', w * .5, h * .1);
  ctx.fillStyle = '#6b8290'; ctx.fillRect(w * .2, h * .4, w * .6, h * .27);
  ctx.fillStyle = '#243a49'; ctx.fillRect(w * .17, h * .66, w * .1, h * .1); ctx.fillRect(w * .73, h * .66, w * .1, h * .1);
  ctx.strokeStyle = '#e8d5aa'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(center.x * w, center.y * h, state.config.zone.radius * w, state.config.zone.radius * h, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#e8d5aa'; ctx.fillText('加载区 · 按住', center.x * w, h * .83);
  const current = state.current || center;
  ctx.strokeStyle = '#f4e8d2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(current.x * w, h * .29); ctx.lineTo(current.x * w, current.y * h); ctx.lineTo(current.x * w - 7, current.y * h - 9); ctx.moveTo(current.x * w, current.y * h); ctx.lineTo(current.x * w + 7, current.y * h - 9); ctx.stroke();
  if (state.load >= window.min) {
    const concentrated = state.result?.concentratedAtWeakPoint;
    ctx.strokeStyle = concentrated ? '#efd0a1' : '#a4c5cd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(current.x * w - 10, current.y * h + 10); ctx.lineTo(current.x * w, current.y * h + 20); ctx.lineTo(current.x * w - 6, current.y * h + 29); ctx.lineTo(current.x * w + 10, current.y * h + 36); ctx.stroke();
    ctx.fillStyle = '#e8d5aa'; ctx.fillText(concentrated ? '局部应力集中（示意）' : '工件受力纹（示意）', w * .5, h * .94);
  }
}
