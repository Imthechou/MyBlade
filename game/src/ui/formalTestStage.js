/**
 * UI 层 · 正式赛多项目测试舞台（rework T06 / T08）
 *
 * ★ 要修什么：改造前正式单刀赛走的是三次 35 秒切割 + 逐局 buff，
 *   六流派同刀同种子拿到完全相同的目标分与靶具指纹（审计问题 4）。
 *   本文件把 `core/arenaFormal` 的五种项目测试接成**真实可玩**的舞台：
 *     cutting   —— 滑切手势（复用 cut-test 画布）
 *     precision —— 沿路径描线（真实覆盖/贴合/稳定）
 *     strength  —— 逐步施压，观察结构反应
 *     durability—— 持续保持，后期衰减
 *     extreme   —— 达标后自主收手或继续加压（明确警告）
 *
 * ★ 边界：舞台只负责采集**操作质量**（0–1）与展示，不做计分。
 *   计分、适配依据、临时损伤全部由 core/testScoring 产出。
 */

import { el, toast } from './dom.js';
/* ★ 必须用 default 导入 Game 实例：game.js 导出的是 `{ Game, default: Game }`，
   写成 `import * as Formal` 拿到的是模块命名空间，没有 submitFormalTest /
   formalTask 这些实例方法（实测报 TypeError: Formal.formalTask is not a function）。 */
import Formal from '../app/game.js';
import { audio, haptics } from '../platform/index.js';

let cleanup = null;
/** 当前测试项的提交入口（单刀赛 / 三刀赛轮次注入） */
let submitter = null;

export function disposeFormalTestStage() {
  cleanup?.();
  cleanup = null;
}

const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

/** 项目进度的横向步骤条 */
function stepBar(match) {
  const s = match.session;
  return el('ol', { class: 'formal-test-steps', 'aria-label': '测试项目进度' },
    s.entries.map((e, i) => el('li', {
      class: e.status === 'complete' ? 'is-complete' : e.status === 'not-run' ? 'is-skipped' : '',
      'aria-current': i === s.index ? 'step' : null,
      text: `${i + 1}. ${e.name}${e.status === 'complete' ? ' ✓' : ''}`,
    })));
}

function header(match, task) {
  const d = match.definition;
  return el('header', { class: 'formal-test-head' }, [
    el('div', { class: 'formal-test-title' }, [
      el('span', { class: 'formal-test-kicker', text: `第 ${task.index + 1}/${task.total} 项 · ${d.branchName} · ${d.gradientName}` }),
      el('h2', { text: task.name }),
    ]),
    el('p', { class: 'formal-test-focus', text: d.focus }),
    el('p', { class: 'formal-test-rule', text: task.rule?.label || '' }),
    stepBar(match),
    el('div', { class: 'formal-test-meta' }, [
      el('span', { text: `目标合成 ${d.targetScore}` }),
      el('span', { text: `靶具硬度 ×${task.hardness}` }),
      el('span', { text: `窗口 ×${task.window}` }),
    ]),
  ]);
}

/**
 * 主渲染入口。
 * @param {object} match    core/arenaFormal 的 match
 * @param {HTMLElement} body 容器
 * @param {Function} rerender 重新渲染回调
 */
export function renderFormalTest(match, body, rerender, { submit = null, taskOverride = null } = {}) {
  cleanup?.();
  cleanup = null;
  /* submitter 注入：单刀赛用 Game.submitFormalTest，
     三刀赛用 Game.apexSubmit（转发到当前轮的 match）。
     默认走单刀入口，保持既有调用点不变。
     taskOverride 同理：三刀赛的题目来自**本轮** match，而不是 Game.formalMatch。 */
  submitter = submit || ((payload) => Formal.submitFormalTest(payload));
  const task = taskOverride || Formal.formalTask();
  if (!task) {
    body.append(el('p', { class: 'arena-note', text: '没有待完成的测试项。' }));
    return;
  }
  // 没有有效题目不能进入倒计时，更不能以 0/0 自动提交零分。
  if (task.invalid || !task.rule?.kind || (task.kind === 'cutting' && !task.sequence?.length)) {
    body.append(el('section', { class: 'arena-empty-card', role: 'alert' }, [
      el('h2', { text: '赛事题目生成失败' }),
      el('p', { text: task.reason || '未生成可切目标，请检查赛事规则；本项尚未提交成绩。' }),
      el('button', { class: 'btn', text: '重试加载', onclick: () => rerender() }),
    ]));
    return;
  }
  body.append(header(match, task));
  const stage = el('div', { class: 'formal-test-stage' });
  body.append(stage);

  const kind = task.rule?.kind || 'sweep';
  if (kind === 'sweep') renderSweep(match, task, stage, body, rerender);
  else if (kind === 'trace') renderTrace(match, task, stage, body, rerender);
  else if (kind === 'sustain') renderSustain(match, task, stage, body, rerender);
  else if (kind === 'hold') renderHold(match, task, stage, body, rerender);
  else if (kind === 'overload') renderOverload(match, task, stage, body, rerender);

  /* 放弃剩余测试：按未进行计，不拿已得分冒充全部 */
  body.append(el('div', { class: 'formal-test-foot' }, [
    el('button', {
      class: 'btn', text: '放弃剩余测试',
      onclick: () => {
        const r = Formal.abandonFormalMatch();
        if (!r?.ok) { toast(r?.reason || '放弃失败', 'warn'); return; }
        rerender();
      },
    }),
    el('span', { class: 'muted tiny', text: '放弃按「未进行」记录，不用单项分顶替整场成绩。' }),
  ]));
}

/* ── 切割：滑切手势 ───────────────────────────────── */

function renderSweep(match, task, stage, body, rerender) {
  const canvas = el('canvas', { class: 'formal-sweep-canvas', 'aria-label': '切割测试区：按住并划过目标' });
  stage.append(canvas);
  const hud = el('div', { class: 'formal-sweep-hud' }, [
    el('span', { text: `剩余 ${task.rule.seconds}s` }),
    el('span', { class: 'cut-count', text: '已切 0' }),
  ]);
  stage.prepend(hud);

  const seq = task.sequence || [];
  const targets = seq.map((m, i) => ({
    id: i, type: m,
    x: 0.18 + (i % 3) * 0.32,
    y: 0.30 + Math.floor(i / 3) * 0.22,
    alive: true,
  }));
  let cuts = 0;
  let timeLeft = task.rule.seconds || 30;
  let raf = 0;
  let pointer = null;
  const trail = [];
  const ctx = canvas.getContext('2d');
  let disposed = false;

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  function draw() {
    const r = canvas.getBoundingClientRect();
    const w = r.width; const h = r.height;
    ctx.clearRect(0, 0, w, h);
    // 目标：硬靶画得更厚更暗，直观表达「需要更多次」
    for (const t of targets) {
      if (!t.alive) continue;
      const hard = t.type === 'wood' || t.type === 'plastic' || t.type === 'ice' || t.type === 'metal';
      ctx.beginPath();
      ctx.strokeStyle = hard ? '#4a5a66' : '#83c9aa';
      ctx.lineWidth = hard ? 8 : 5;
      ctx.lineCap = 'round';
      ctx.moveTo(t.x * w - 26, t.y * h);
      ctx.lineTo(t.x * w + 26, t.y * h);
      ctx.stroke();
    }
    // 轨迹
    if (trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#227A87'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      trail.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
      ctx.stroke();
    }
    hud.querySelector('.cut-count').textContent = `已切 ${cuts}/${targets.length}`;
    hud.firstChild.textContent = `剩余 ${Math.max(0, timeLeft).toFixed(1)}s`;
  }
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / Math.max(1, r.width), y: (e.clientY - r.top) / Math.max(1, r.height) };
  };
  function hit(a, b) {
    for (const t of targets) {
      if (!t.alive) continue;
      const cx = t.x; const cy = t.y;
      // 点到线段距离
      const dx = b.x - a.x; const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1e-8;
      const u = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len2));
      const px = a.x + u * dx; const py = a.y + u * dy;
      if (Math.hypot(cx - px, cy - py) < 0.085) {
        t.alive = false;
        cuts += 1;
        audio.play('hit'); haptics.feedback('tap');
      }
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (disposed || pointer) return;
    e.preventDefault();
    audio.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointer = { id: e.pointerId, last: point(e) };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (disposed || !pointer || pointer.id !== e.pointerId) return;
    const p = point(e);
    trail.push(p);
    if (trail.length > 40) trail.shift();
    hit(pointer.last, p);
    pointer.last = p;
  });
  const end = () => { pointer = null; };
  for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) {
    canvas.addEventListener(t, end);
  }

  size();
  draw();
  let last = performance.now();
  const loop = (now) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    timeLeft -= dt;
    draw();
    if (timeLeft <= 0 || cuts >= targets.length) { finish(); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function finish() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    /* 操作质量 = 实际切断比例（切割项的核心是效率，不是路径美观） */
    const measure = targets.length ? cuts / targets.length : 0;
    const r = submitter({
      measure,
      detail: { cuts, total: targets.length, seconds: task.rule.seconds },
      temporaryDamage: 0.02 * cuts,
    });
    applyResult(r, body, rerender);
  }

  cleanup = () => { disposed = true; cancelAnimationFrame(raf); };
}

/* ── 精度：沿路径描线 ─────────────────────────────── */

function renderTrace(match, task, stage, body, rerender) {
  const path = task.path || [];
  const N = path.length;
  const canvas = el('canvas', { class: 'formal-trace-canvas', 'aria-label': '精度测试区：沿虚线描画' });
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const samples = new Map();
  let disposed = false;
  let raf = 0;

  function draw() {
    const r = canvas.getBoundingClientRect();
    const w = r.width; const h = r.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);
    const px = (i) => (i / (N - 1)) * (w - 24) + 12;
    const py = (v) => h * 0.5 - (v - 0.5) * (h - 40);
    // 容差带
    ctx.fillStyle = 'rgba(34,122,135,0.10)';
    ctx.beginPath();
    path.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v + task.tolerance)) : ctx.moveTo(px(i), py(v + task.tolerance))));
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(px(i), py(path[i] - task.tolerance));
    ctx.closePath(); ctx.fill();
    // 基准线
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#3F4A55'; ctx.lineWidth = 2;
    ctx.beginPath();
    path.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.stroke();
    // 玩家轨迹（只画已画过的点）
    ctx.setLineDash([]); ctx.strokeStyle = '#227A87'; ctx.lineWidth = 2.5;
    let pen = false;
    for (let i = 0; i < N; i++) {
      if (!samples.has(i)) { pen = false; continue; }
      const y = py(samples.get(i));
      if (pen) ctx.lineTo(px(i), y);
      else { ctx.beginPath(); ctx.moveTo(px(i), y); pen = true; }
    }
    if (pen) ctx.stroke();
  }
  let lastIndex = null;
  function write(i, v) {
    samples.set(i, Math.max(0, Math.min(1, v)));
    if (lastIndex !== null && Math.abs(i - lastIndex) > 1) {
      const a = Math.min(lastIndex, i); const b = Math.max(lastIndex, i);
      const va = samples.get(a) ?? v; const vb = samples.get(b) ?? v;
      for (let k = a + 1; k < b; k++) if (!samples.has(k)) samples.set(k, va + (vb - va) * ((k - a) / (b - a)));
    }
    lastIndex = i;
  }
  function fromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - 12) / Math.max(1, r.width - 24);
    const y = (e.clientY - r.top) / Math.max(1, r.height);
    const i = Math.max(0, Math.min(N - 1, Math.round(x * (N - 1))));
    const v = 0.5 - (y - 0.5) * (r.height / Math.max(1, r.height - 40));
    write(i, v);
  }
  let active = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (disposed || active) return;
    e.preventDefault(); audio.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    active = e.pointerId; lastIndex = null; fromEvent(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (disposed || e.pointerId !== active) return;
    if (!(e.buttons & 1)) { active = null; lastIndex = null; return; }
    fromEvent(e);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
    canvas.addEventListener(t, (e) => { if (e.pointerId === active) { active = null; lastIndex = null; } });
  }

  const submitBtn = el('button', {
    class: 'btn btn--primary', text: '提交描线',
    onclick: () => {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf);
      const ev = evaluateTrace(path, samples, N, task.tolerance);
      const r = submitter({
        measure: ev.quality,
        detail: { fidelity: ev.fidelity, coverage: ev.coverage, stability: ev.stability, drawn: ev.drawn },
      });
      applyResult(r, body, rerender);
    },
  });
  stage.append(el('div', { class: 'formal-trace-actions' }, [submitBtn,
    el('span', { class: 'muted tiny', text: `容差 ±${(task.tolerance * 100).toFixed(0)}% · 覆盖与稳定都会计入` })]));
  draw();
  raf = requestAnimationFrame(function tick() { if (disposed) return; draw(); raf = requestAnimationFrame(tick); });
  cleanup = () => { disposed = true; cancelAnimationFrame(raf); };
}

/** 描线评价（与 core/edge 同一套权重：贴合 55% / 完成 30% / 稳定 15%） */
function evaluateTrace(base, samples, n, tolerance) {
  let devSum = 0; let devN = 0;
  let minIdx = Infinity; let maxIdx = -Infinity;
  for (const [i] of samples) { if (i < minIdx) minIdx = i; if (i > maxIdx) maxIdx = i; }
  for (let i = 0; i < n; i++) {
    if (!samples.has(i)) continue;
    devSum += Math.abs(base[i] - samples.get(i)); devN += 1;
  }
  const fidelity = devN === 0 ? 0 : Math.max(0, Math.min(1, 1 - (devSum / devN) / Math.max(1e-6, tolerance)));
  const span = devN >= 2 ? (maxIdx - minIdx + 1) : 0;
  const coverage = n > 1 ? Math.min(1, span / n) : 0;
  let jitter = 0; let jN = 0;
  for (let i = 1; i < n - 1; i++) {
    if (!samples.has(i) || !samples.has(i - 1) || !samples.has(i + 1)) continue;
    const p2 = samples.get(i - 1) - 2 * samples.get(i) + samples.get(i + 1);
    const b2 = base[i - 1] - 2 * base[i] + base[i + 1];
    jitter += Math.abs(p2 - b2); jN += 1;
  }
  const stability = jN === 0 ? 0 : Math.max(0, Math.min(1, 1 - (jitter / jN) / 0.075));
  let quality = devN === 0 ? 0 : Math.max(0, Math.min(1, fidelity * 0.55 + coverage * 0.30 + stability * 0.15));
  if (devN === 0) quality = 0;
  else if (coverage < 0.55) quality = Math.min(quality, 0.34);
  return { fidelity, coverage, stability, quality, drawn: devN };
}

/* ── 强度：逐步施压 ───────────────────────────────── */

function renderSustain(match, task, stage, body, rerender) {
  const steps = task.loadSteps || [0.5, 0.7, 0.9, 1.1];
  let idx = 0;
  let load = 0;           // 当前施压进度 0–1（一个阶梯内）
  let held = 0;           // 已完成的阶梯承载质量累计
  let holding = false;
  let raf = 0;
  let disposed = false;
  let last = performance.now();

  const bar = el('div', { class: 'formal-load-bar', 'aria-hidden': 'true' }, [el('i')]);
  const status = el('p', { class: 'formal-load-status', text: '按住「施压」把负荷推上第 1 档' });
  const pressBtn = el('button', {
    class: 'btn btn--primary', text: '按住施压',
    onpointerdown: (e) => { e.preventDefault(); holding = true; audio.unlock(); },
  });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) {
    pressBtn.addEventListener(t, () => { holding = false; });
  }
  stage.append(bar, status, el('div', { class: 'formal-load-actions' }, [pressBtn,
    el('button', { class: 'btn', text: '结束本项', onclick: () => finish() })]));

  const loop = (now) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (holding) load = Math.min(1, load + dt * 0.55);
    else load = Math.max(0, load - dt * 0.25);
    bar.firstElementChild.style.width = `${Math.round(load * 100)}%`;
    if (load >= 1) {
      held += 1;
      idx += 1;
      load = 0;
      status.textContent = idx >= steps.length
        ? `全部 ${steps.length} 档已完成，请结束本项`
        : `第 ${idx} 档达标，继续推向第 ${idx + 1} 档（负荷 ${steps[idx]}）`;
      audio.play('hit');
      if (idx >= steps.length) { holding = false; pressBtn.disabled = true; }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function finish() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    /* 操作质量 = 完成档位比例 × 每档完成度（不是纯按住计时：未推满不计） */
    const measure = steps.length ? held / steps.length : 0;
    const r = submitter({
      measure,
      detail: { steps: steps.length, held },
      temporaryDamage: 0.05 * held,
    });
    applyResult(r, body, rerender);
  }
  cleanup = () => { disposed = true; cancelAnimationFrame(raf); };
}

/* ── 耐久：持续保持，后期衰减 ─────────────────────── */

function renderHold(match, task, stage, body, rerender) {
  const segments = task.segments || 5;
  const decay = task.decay || 0.06;
  let t = 0;
  let keep = 0;         // 累计保持质量
  let cur = 1;          // 当前能力保留率
  let holding = false;
  let raf = 0;
  let disposed = false;
  let last = performance.now();
  const total = task.rule.seconds || 24;

  const bar = el('div', { class: 'formal-load-bar', 'aria-hidden': 'true' }, [el('i')]);
  const status = el('p', { class: 'formal-load-status', text: `按住保持节奏；能力保留率会随测试推进下降` });
  const holdBtn = el('button', {
    class: 'btn btn--primary', text: '按住保持',
    onpointerdown: (e) => { e.preventDefault(); holding = true; audio.unlock(); },
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    holdBtn.addEventListener(ev, () => { holding = false; });
  }
  stage.append(bar, status, el('div', { class: 'formal-load-actions' }, [holdBtn,
    el('button', { class: 'btn', text: '结束本项', onclick: () => finish() })]));

  const segLen = total / segments;
  let segIdx = 0;
  const loop = (now) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t = Math.min(total, t + dt);
    // 能力保留率随时间线性衰减（decay 由靶具硬度决定）
    cur = Math.max(0.25, 1 - (t / total) * decay * segments);
    if (holding) keep = Math.min(1, keep + dt * cur / total);
    bar.firstElementChild.style.width = `${Math.round(keep * 100)}%`;
    const nextSeg = Math.min(segments - 1, Math.floor(t / segLen));
    if (nextSeg !== segIdx) {
      segIdx = nextSeg;
      status.textContent = `第 ${segIdx + 1}/${segments} 段 · 能力保留 ${pct(cur)}${holding ? ' · 保持中' : ' · 松手会掉质量'}`;
    }
    if (t >= total) { finish(); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function finish() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    const r = submitter({
      measure: keep,
      detail: { seconds: total, segments, retained: cur },
      temporaryDamage: 0.03 * segments,
    });
    applyResult(r, body, rerender);
  }
  cleanup = () => { disposed = true; cancelAnimationFrame(raf); };
}

/* ── 极限：达标后自主收手或加压 ───────────────────── */

function renderOverload(match, task, stage, body, rerender) {
  const levels = task.pressLevels || [0, 1, 2, 3];
  const warnAt = task.warningAt ?? 0.6;
  let level = 1;
  let progress = 0;
  let raf = 0;
  let disposed = false;
  let last = performance.now();
  let pressed = false;
  let finished = false;

  const bar = el('div', { class: 'formal-load-bar', 'aria-hidden': 'true' }, [el('i')]);
  const status = el('p', { class: 'formal-load-status', text: '负荷正在上升；达标后你可以选择收手' });
  const warn = el('p', { class: 'formal-overload-warn', role: 'status', 'aria-live': 'polite', text: '' });
  const pressMore = el('button', {
    class: 'btn btn--danger', text: '继续加压（有临时损伤）',
    onclick: () => { pressed = true; level = Math.min(levels.length - 1, level + 1); status.textContent = `已加压到第 ${level + 1} 档；这是你的主动选择`; haptics.feedback('hammer'); },
  });
  const stop = el('button', {
    class: 'btn btn--primary', text: '现在收手',
    onclick: () => finish(),
  });
  stage.append(bar, status, warn, el('div', { class: 'formal-load-actions' }, [pressMore, stop]));

  const loop = (now) => {
    if (disposed || finished) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const speed = 0.18 + level * 0.10;
    progress = Math.min(1, progress + dt * speed * (task.hardness || 1));
    bar.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
    if (progress >= warnAt) {
      warn.textContent = `⚠ 已进入高负荷区（>${pct(warnAt)}）。继续加压会提高得分，但带来实际临时损伤；永久断刀政策仍未定案。`;
    }
    if (progress >= 1) {
      status.textContent = '本档已满；可以收手，或继续加压争取更高分';
      progress = 0.72;   // 满档后回落到高位，等待玩家决定
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function finish() {
    if (disposed) return;
    disposed = true; finished = true;
    cancelAnimationFrame(raf);
    /* 质量 = 达到的档位比例；加压扣分归 core 处理（计入临时损伤） */
    const measure = Math.min(1, (level + (progress / 1)) / levels.length);
    const r = submitter({
      measure,
      detail: { level, pressed, reached: progress },
      temporaryDamage: 0.06 * level,
      pressed,
    });
    applyResult(r, body, rerender);
  }
  cleanup = () => { disposed = true; cancelAnimationFrame(raf); };
}

/* ── 结果处理 ─────────────────────────────────────── */

function applyResult(r, body, rerender) {
  if (!r?.ok) { toast(r?.reason || '提交失败', 'warn'); rerender(); return; }
  /* done = 单刀赛整场结束；roundDone = 三刀赛本轮结束 */
  if (r.done || r.roundDone) { rerender(); return; }
  /* 本项完成但整场未完：给出即时的分项回执，再进入下一项 */
  const res = r.result;
  const card = el('div', { class: 'formal-test-receipt', role: 'status', 'aria-live': 'polite' }, [
    el('b', { text: `${res.name}：${res.score} 分` }),
    el('small', { text: `能力 ${res.raw.capability} · 有效 ${res.raw.effective} · 适配 ×${res.adaptation.projectFactor} · 操作 ${pct(res.raw.measure)}` }),
    r.next ? el('small', { text: `下一项：${r.next.name}` }) : null,
    el('button', { class: 'btn btn--primary', text: r.next ? '进入下一项' : '查看成绩', onclick: () => rerender() }),
  ]);
  body.append(card);
}

export default { renderFormalTest, disposeFormalTestStage };
