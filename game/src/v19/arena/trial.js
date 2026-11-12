import { haptics, motion } from '../../platform/index.js';
import { PROJECTS } from '../tournament.js';
import { signaturePerk } from '../forge.js';
/* Adapted from Blade Trial v0.19. See LICENSE. */
import { BladeAudio } from './audio.js';
import { ART_BOUNDS, targetSprite, warmTargets, targetAlphaAt } from './targets.js';
import { courseGoals } from './courses.js';
import { flightAt, flightSchedule } from './flight.js';
import { ARMOR_BODY_SHARE, arenaBladeStats, deflectsSwipe, strikeDamage, wearCost } from './stats.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => lerp(min, max, Math.random());
const TAU = Math.PI * 2;

const MATERIALS = {
  card:      { short: '纸牌', color: '#e9e0d3', armor: 118, score: 18, wear: .78, glint: '#fff7ee', particles: 'paper' },
  rope:      { short: '绳束', color: '#d3b487', armor: 146, score: 22, wear: 1.12, glint: '#f0d6a8', particles: 'fibers' },
  bamboo:    { short: '竹节', color: '#a7cf7e', armor: 162, score: 32, wear: 1.66, glint: '#cef3ae', particles: 'splinters' },
  pineapple: { short: '菠萝', color: '#d9b84c', armor: 164, score: 26, wear: 1.38, glint: '#ffef93', particles: 'juice' },
  wood:      { short: '硬木', color: '#c58a54', armor: 216, score: 47, wear: 2.35, glint: '#e0b684', particles: 'splinters' },
  ice:       { short: '冰块', color: '#8ce4ff', armor: 203, score: 40, wear: 2.02, glint: '#c9f6ff', particles: 'shards' },
  gel:       { short: '凝胶', color: '#8bcef1', armor: 160, score: 24, wear: 1.24, glint: '#e6d6ff', particles: 'gel' },
  steel:     { short: '钢桶', color: '#a9c6d0', armor: 307, score: 83, wear: 4.45, glint: '#f5e0ae', particles: 'sparks' },
  shield:    { short: '盾牌', color: '#a7b6c2', armor: 403, score: 108, wear: 5.40, glint: '#d6e8ef', particles: 'sparks' },
};

function grad(c,x0,y0,x1,y1,stops){const g=c.createLinearGradient(x0,y0,x1,y1);stops.forEach(a=>g.addColorStop(a[0],a[1]));return g;}
function radial(c,x,y,r,stops){const g=c.createRadialGradient(x,y,0,x,y,r);stops.forEach(a=>g.addColorStop(a[0],a[1]));return g;}
function roundRect(c, x, y, w, h, radius) {
  c.beginPath();
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, radius);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function seeded(i){let a=i|0;return ()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;}}

const audio = new BladeAudio();
audio.setTone('punchy');

export function warmTrialAudio() {
  void audio.preload().catch(() => {});
}

export function createTrial(frame, course, blade, { muted, volume, onPause, onFinish }) {
  const canvas = frame.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('浏览器无法开启切割画布');
  const ui = Object.fromEntries([...frame.querySelectorAll('[data-trial]')].map(node => [node.dataset.trial, node]));
  const ready = frame.querySelector('[data-trial-ready]');
  const input = new AbortController();
  const projects = new Map();
  const launches = flightSchedule(course).flatMap(wave => {
    const group = { ...wave, iceAt: -Infinity, paired: false, armorBroken: false, lightCuts: 0 };
    const project = projects.get(wave.project) || { damage: 0, count: 0 };
    project.count += wave.launches.length;
    projects.set(wave.project, project);
    return wave.launches.map(launch => ({ ...launch, group }));
  }).sort((a, b) => a.begins - b.begins);
  const stats = arenaBladeStats(blade.stats);
  const bladeAccent = ['#f7bd86', '#a8d0e7', '#c8f2e7', '#a6dfda', '#cdb9f6', '#f4d7a0'][stats.strongest];
  const mastery = blade.mastery;
  const perk = signaturePerk(blade.signature);
  audio.setVolume(volume);
  const state = {
    screen: 'ready', score: 0, bestCombo: 0, bestSwipe: 0, durability: 100, time: 0, elapsed: 0,
    waves: 0, cut: 0, hits: 0, damage: 0, deflections: 0, targets: [], pieces: [], particles: [], rings: [],
    slashes: [], trails: [], impacts: [], comboChain: 0, lastKillAt: -Infinity,
    objectives: { multi: 0, precision: 0, armor: 0, relay: 0, mixed: 0 },
    pointer: { down: false, points: [], hitTargets: new Set() },
    reducedMotion: motion.reduced(), shakeX: 0, shakeY: 0, shakeVX: 0, shakeVY: 0, flash: 0,
  };
  let W = 1, H = 1, DPR = 1, unit = 1, fieldWidth = 1, ambientDots = [];
  let backdrop, deadline, timeLeft = course.limit * 1000, lastTick, raf, launchIndex = 0, clock = -1;
  let readyUntil = 0, pausedLead = 0, lastBuzz = -Infinity, lastVerdict = -Infinity, scoreTimer;
  const actLabels = ['热身', '进阶', '冲刺'];
  const phaseMarks = course.limit === 30 ? 3 : 1;

  function write(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function updateHUD() {
    write(ui.score, String(state.score).padStart(4, '0'));
    write(ui.hits, String(state.cut));
    write(ui.combo, state.comboChain > 1 ? '×' + state.comboChain : '—');
    const values = courseGoals(course, { ...state.objectives, cut: state.cut, durability: state.durability });
    values.forEach((goal, i) => {
      const node = ui['goal-' + i];
      write(node, goal.id === 'durability' ? goal.value + '% / ' + goal.target + '%' : goal.value + ' / ' + goal.target);
      node.closest('.trial-goal').classList.toggle('is-met', goal.met);
    });
    if (ui.wear) {
      ui.wear.value = state.durability;
      ui.wear.closest('.trial-goal').classList.toggle('is-danger', state.durability < 25);
      write(ui.durability, Math.floor(state.durability) + '%');
    }
  }

  function updateClock(now) {
    const remaining = now < readyUntil ? timeLeft : Math.max(0, deadline - now);
    const seconds = Math.ceil(remaining / 1000);
    if (clock === seconds) return;
    clock = seconds;
    write(ui.time, String(seconds).padStart(2, '0') + '″');
    ui.time.classList.toggle('urgent', seconds <= 5);
    if (phaseMarks > 1) {
      const act = Math.min(2, Math.floor((course.limit - seconds) / 10));
      frame.dataset.act = String(act);
      write(ui.phase, actLabels[act]);
    }
  }

  function showScore(points) {
    write(ui.delta, '+' + points);
    ui.delta.getAnimations().forEach(animation => animation.cancel());
    ui.delta.animate([
      { opacity: 0, transform: 'translateY(4px)' },
      { opacity: 1, offset: .18, transform: 'translateY(0)' },
      { opacity: 1, offset: .68 }, { opacity: 0 },
    ], { duration: 490 });
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => write(ui.delta, ''), 490);
  }

  function showVerdict(text, kind) {
    if (kind !== 'combo' && kind !== 'deflect' && state.elapsed - lastVerdict < .37) return;
    lastVerdict = state.elapsed;
    ui.verdict.className = 'cut-callout ' + kind;
    ui.verdict.textContent = text;
    ui.verdict.getAnimations().forEach(animation => animation.cancel());
    ui.verdict.animate(state.reducedMotion ? [
      { opacity: 1 }, { opacity: 1, offset: .75 }, { opacity: 0 },
    ] : [
      { opacity: 0, transform: 'translateY(7px) scale(.92)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: .16 },
      { opacity: 1, offset: .52 }, { opacity: 0, transform: 'translateY(-8px)' },
    ], { duration: kind === 'combo' ? 690 : 570 });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    endStroke(false);
    W = rect.width; H = rect.height;
    fieldWidth = Math.min(W, H * 1.44);
    const pixelBudget = W < 620 ? 1_650_000 : 2_250_000;
    DPR = Math.max(1, Math.min(window.devicePixelRatio || 1,
      W < 620 ? 2.5 : 2, Math.sqrt(pixelBudget / (W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    unit = clamp(Math.min(W / 660, H / 570), .44, 1.26);
    ambientDots = Array.from({ length: W < 620 ? 17 : 28 }, () => ({
      x: rand(0, W), y: rand(H * .18, H * .94), r: rand(.4, 1.5), s: rand(.2, 1.1), phase: rand(0, TAU),
    }));
    backdrop = null;
    layoutTargets();
    render();
  }

  function start() {
    if (state.screen !== 'ready') return;
    audio.setEnabled(!muted);
    const now = performance.now();
    state.screen = 'playing';
    readyUntil = now + (state.reducedMotion ? 220 : 700);
    deadline = readyUntil + timeLeft;
    lastTick = now;
    ready.hidden = false;
    ready.classList.add('is-on');
    warmTargets([...new Set(course.waves.flatMap(wave => wave.targets))]);
    updateClock(now);
    updateHUD();
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (state.screen !== 'playing') return false;
    const now = performance.now();
    if (now >= deadline) {
      finish('time');
      return false;
    }
    pausedLead = Math.max(0, readyUntil - now);
    timeLeft = deadline - Math.max(now, readyUntil);
    endStroke(false);
    state.screen = 'paused';
    cancelAnimationFrame(raf);
    audio.setEnabled(false);
    onPause();
    return true;
  }

  function resume(settings) {
    if (state.screen !== 'paused') return;
    muted = settings.sound === false;
    state.reducedMotion = motion.reduced();
    audio.setVolume(settings.volume);
    audio.setEnabled(!muted);
    state.screen = 'playing';
    lastTick = performance.now();
    readyUntil = lastTick + pausedLead;
    deadline = readyUntil + timeLeft;
    raf = requestAnimationFrame(tick);
  }

  function finish(reason) {
    if (state.screen !== 'playing') return;
    endStroke(false);
    state.screen = 'finished';
    cancelAnimationFrame(raf);
    onFinish({
      reason, score: state.score, combo: state.bestCombo, swipe: state.bestSwipe,
      hits: state.hits, cut: state.cut, waves: state.waves,
      missed: launches.length - state.cut, objectives: { ...state.objectives },
      damage: state.damage, durability: state.durability, deflections: state.deflections,
      scoreMultiplier: stats.scoreMultiplier,
      projects: [...projects].map(([kind, item]) => ({
        kind, name: PROJECTS[kind].name, score: Math.round(item.damage / item.count * 100),
      })),
      remaining: reason === 'time' ? 0 : Math.max(0, deadline - performance.now()) / 1000,
    });
  }

  function layoutTargets() {
    for (const target of state.targets) {
      const flight = flightAt(target, state.elapsed);
      if (!flight || !target.alive) {
        target.pose = null;
        continue;
      }
      const rowSize = target.group.launches.length;
      const scale = target.anchored ? Math.min(W / 227, H / 335, 1.52) :
        Math.min(fieldWidth * .77 / (rowSize * 137), Math.max(.49, unit * 1.22));
      const spring = Math.sin(Math.min(target.recoilTime * 23, Math.PI * 1.55)) * Math.exp(-target.recoilTime * 9);
      const recoil = state.reducedMotion ? 0 : target.recoil;
      const angle = flight.angle + target.tilt * recoil;
      target.pose = {
        x: (W - fieldWidth) / 2 + fieldWidth * flight.x + target.impulseX * recoil,
        y: H * flight.y + target.impulseY * recoil,
        angle, cos: Math.cos(angle), sin: Math.sin(angle),
        sx: scale * (1 + recoil * (.04 + Math.max(0, spring) * .075)),
        sy: scale * (1 - recoil * (.03 + Math.max(0, spring) * .065)),
        scale, vx: flight.vx * fieldWidth, vy: flight.vy * H,
      };
    }
  }

  function advance(now) {
    state.elapsed = clamp(course.limit - (deadline - now) / 1000, 0, course.limit);
    while (launchIndex < launches.length && launches[launchIndex].begins <= state.elapsed) {
      const id = ++launchIndex;
      const launch = launches[id - 1];
      const m = MATERIALS[launch.key];
      const hp = m.armor * course.armorScale * (launch.reinforced ? .70 : 1);
      state.targets.push({
        ...launch, id, m, alive: true, hp, maxHp: hp, pose: null, strikes: [], cracks: [],
        recoil: 0, recoilTime: 1, impulseX: 0, impulseY: 0, tilt: 0,
      });
      state.waves = Math.max(state.waves, launch.group.index + 1);
    }
    state.targets = state.targets.filter(target => target.alive && state.elapsed < target.begins + target.duration);
    if (state.comboChain && state.elapsed - state.lastKillAt > stats.chainWindow) clearCombo();
  }

  function specialtyBonus(target) {
    return mastery && (mastery.specialty === target.group.project || mastery.specialty === course.specialty) ? mastery.bonus : 0;
  }

  const markRadiusFor = target => stats.markRadius * (1 + specialtyBonus(target));

  function recordCut(target, precise) {
    const group = target.group;
    if (target.armored) {
      state.objectives.armor++;
      group.armorBroken = true;
    } else {
      group.lightCuts++;
    }
    if (precise) state.objectives.precision++;
    if (group.pattern === 'mixed' && !group.paired && group.armorBroken && group.lightCuts > 0) {
      group.paired = true;
      state.objectives.mixed++;
      showVerdict('软硬同破', 'special');
    }
    if (group.pattern === 'relay') {
      if (target.key === 'ice') group.iceAt = state.elapsed;
      if (target.key === 'pineapple' && !group.paired && state.elapsed - group.iceAt <= 1.65) {
        group.paired = true;
        state.objectives.relay++;
        showVerdict('破冰接斩', 'special');
      }
    }
  }

  function splitTarget(target, contact, dx, dy, precise) {
    target.alive = false;
    const { pose } = target;
    const angle = Math.atan2(dy, dx);
    const speed = target.armored ? 132 : 160;
    const lifetime = target.armored ? .80 : .63;
    const face = cutLine(target, contact);
    for (const side of [-1, 1]) state.pieces.push({
      target, x: pose.x, y: pose.y, face, rotation: pose.angle, life: lifetime, maxLife: lifetime,
      sx: pose.sx, sy: pose.sy, side, hold: target.armored && !state.reducedMotion ? .036 : 0,
      vx: pose.vx * .5 - Math.sin(angle) * speed * side + Math.cos(angle) * 18,
      vy: pose.vy * .50 + Math.cos(angle) * speed * side - (target.armored ? 59 : 30),
      spin: side * rand(.9, 2.1),
    });
    state.cut++;
    const pointer = state.pointer;
    pointer.kills++;
    state.bestSwipe = Math.max(state.bestSwipe, pointer.kills);
    const chained = state.elapsed - state.lastKillAt <= stats.chainWindow;
    state.comboChain = chained ? state.comboChain + 1 : 1;
    state.lastKillAt = state.elapsed;
    state.bestCombo = Math.max(state.bestCombo, state.comboChain);
    const chainBonus = Math.min(54, (state.comboChain - 1) * 7);
    const swipeBonus = pointer.kills >= 3 ? 42 + (pointer.kills - 3) * 20 : 0;
    const cuttingBonus = mastery?.specialty === 'cutting' ? specialtyBonus(target) : 0;
    const style = stats.scoreMultiplier * (1 + cuttingBonus);
    const targetWeight = target.armored ? 3.1 : target.reinforced ? 2.45 : 2;
    state.score += Math.round((target.m.score * targetWeight + chainBonus +
      swipeBonus + (precise ? 32 : 0)) * style);
    recordCut(target, precise);
    if (pointer.kills >= 3) {
      if (pointer.kills === 3) state.objectives.multi++;
      showVerdict((['三', '四', '五', '六'][pointer.kills - 3] ?? pointer.kills) + '连斩', 'combo');
    } else if (precise) {
      showVerdict('精准一斩', 'special');
    } else if (target.armored) {
      showVerdict('破开' + target.m.short, 'break');
    }
  }

  function hitTarget(target, contact, dx, dy, speed, tempo, index) {
    const pointer = state.pointer;
    pointer.hitTargets.add(target.id);
    if (!target.strikes.length) state.hits++;
    const signature = perk?.targets.includes(target.key) ? 1 + Math.min(.10, perk.bonus) : 1;
    const specialty = specialtyBonus(target);
    const damage = strikeDamage(stats, target, tempo, state.durability, (1 + specialty) * signature);
    const previous = target.hp / target.maxHp;
    target.hp = Math.max(0, target.hp - damage);
    const remainder = target.hp / target.maxHp;
    state.damage += previous - remainder;
    projects.get(target.group.project).damage += previous - remainder;
    const broken = target.hp <= 0;
    const shellBroke = target.armored && previous > ARMOR_BODY_SHARE && remainder <= ARMOR_BODY_SHARE;
    const fracture = !broken && (shellBroke || (previous > .33 && remainder <= .33));
    const phase = broken ? 'break' : fracture ? 'fracture' : 'hit';
    const length = Math.hypot(dx, dy);
    const force = clamp(speed / Math.max(540, W * 1.22), .62, 1.32);
    const kick = target.armored ? 8 : 5;
    const { x, y } = contact;
    Object.assign(target, { recoil: 1, recoilTime: 0, impulseX: dx / length * kick, impulseY: dy / length * kick * .72 });
    target.tilt += clamp(dx / length * rand(-.04, .08), -.12, .12);
    target.strikes.push({ angle: Math.atan2(contact.uy, contact.ux), time: state.time, offset: contact.offset });
    if (!broken) makeCrack(target, dx, dy, damage);
    if (course.wearScale) {
      state.durability = Math.max(0, state.durability - wearCost(stats, target, force, course.wearScale, specialty));
    }
    if (!state.reducedMotion && target.armored) {
      state.flash = Math.max(state.flash, broken ? .17 : fracture ? .085 : .045);
      applyCameraKick(dx, dy, phase);
    }
    addSlash(x, y, dx, dy, target.m, target.armored, force);
    state.impacts.push({
      x, y, color: target.m.glint, life: broken ? .19 : .14, maxLife: broken ? .19 : .14,
      radius: (target.armored ? 76 : 47) * unit, strength: broken ? 1 : fracture ? .68 : .42,
      angle: Math.atan2(dy, dx),
    });
    if (state.impacts.length > 8) state.impacts.shift();
    burst(x, y, target.m, broken ? (target.armored ? 22 : 12) : fracture ? 9 : 5);
    const now = performance.now();
    pointer.soundGroup = now - pointer.lastContact < 110 ? Math.min(4, pointer.soundGroup + 1) : 1;
    pointer.lastContact = now;
    audio.playHit({ material: target.key, stage: phase, force, pan: (x / W - .5) * .95,
      delayMs: index * 23, groupSize: pointer.soundGroup });
    if (now - lastBuzz > 50) {
      haptics.vibrate(target.armored ? (broken ? 24 : 11) : 7);
      lastBuzz = now;
    }
    if (broken) splitTarget(target, contact, dx, dy, contact.precise);
    else if (fracture) showVerdict(shellBroke ? '破甲' : '开裂', 'fracture');
  }

  function strokeSegment(a, b, seconds) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const speed = length / Math.max(.006, seconds);
    if (speed < Math.max(138, Math.min(220, W * .35))) return;
    const pointer = state.pointer;
    if (pointer.deflected) return;
    if (!pointer.swung) {
      pointer.swung = true;
      audio.playSwing({ heavy: state.targets.some(target => target.anchored && target.pose?.y < H * .79) });
    }
    const hits = [];
    for (const target of state.targets) {
      if (!target.alive || !target.pose || pointer.hitTargets.has(target.id)) continue;
      const contact = traceTarget(a, b, target);
      if (contact) hits.push({ target, contact });
    }
    if (!hits.length) return;
    hits.sort((a, b) => a.contact.ratio - b.contact.ratio);
    const previous = state.score;
    const tempo = clamp(speed / Math.max(650, W * 1.8), .22, 1);
    for (const [i, { target, contact }] of hits.entries()) {
      if (state.durability <= 0) break;
      if (deflectsSwipe(stats, target, tempo, pointer.hitTargets.size)) {
        pointer.deflected = true;
        state.deflections++;
        clearCombo();
        showVerdict('弹刀', 'deflect');
        audio.playHit({ material: target.key, stage: 'hit', force: .78, pan: (contact.x / W - .5) * .95 });
        burst(contact.x, contact.y, target.m, 5);
        haptics.vibrate(12);
        break;
      }
      hitTarget(target, contact, dx, dy, speed, tempo, i);
    }
    updateHUD();
    if (state.score > previous) showScore(state.score - previous);
  }

  function clearCombo() {
    state.comboChain = 0;
    write(ui.combo, '—');
  }

  function beginStroke(point, id) {
    Object.assign(state.pointer, {
      down: true, id, points: [point], anchor: point, x: point.x, y: point.y,
      kills: 0, swung: false, deflected: false, lastContact: -Infinity, soundGroup: 0,
    });
    state.pointer.hitTargets.clear();
  }

  function endStroke(whiff = true) {
    const pointer = state.pointer;
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.points.length > 1) state.trails.push({ points: pointer.points });
    if (whiff && pointer.swung && pointer.hitTargets.size === 0) clearCombo();
  }

  function pointFor(event, rect) {
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp };
  }

  function canStrike() {
    const now = performance.now();
    return state.screen === 'playing' && now >= readyUntil && now < deadline && state.durability > 0;
  }

  function pointerDown(event) {
    if (!canStrike() || state.pointer.down || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    void audio.unlock();
    beginStroke(pointFor(event, canvas.getBoundingClientRect()), event.pointerId);
  }

  function pointerMove(event) {
    const pointer = state.pointer;
    if (!pointer.down || pointer.id !== event.pointerId || !canStrike()) return;
    event.preventDefault();
    const coalesced = event.getCoalescedEvents?.();
    const rect = canvas.getBoundingClientRect();
    for (const sample of coalesced?.length ? coalesced : [event]) {
      const next = pointFor(sample, rect), previous = pointer.anchor;
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 3.5) continue;
      strokeSegment(previous, next, (next.t - previous.t) / 1000);
      pointer.anchor = next;
      pointer.points.push(next);
      if (pointer.points.length > 24) pointer.points.shift();
      pointer.x = next.x; pointer.y = next.y;
    }
  }

  function pointerUp(event) {
    if (state.pointer.id !== event.pointerId) return;
    if (event.type === 'pointerup') pointerMove(event);
    endStroke(event.type === 'pointerup');
  }

  function keyboardStrike(event) {
    if (!canStrike() || event.repeat || state.pointer.down) return;
    const row = event.code === 'Space';
    const available = state.targets.filter(item => item.alive && item.pose?.y < H * .88);
    const target = row ? available[0] : available[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    const { x, y, scale } = target.pose;
    const t = performance.now(), height = y - 4 * scale + state.shakeY;
    const a = { x: row ? 0 : x - 59 * scale + state.shakeX, y: height, t };
    const b = { x: row ? W : x + 59 * scale + state.shakeX, y: height, t };
    beginStroke(a, null);
    strokeSegment(a, b, Math.abs(b.x - a.x) / 900);
    state.pointer.points.push(b);
    endStroke();
  }

  function applyCameraKick(dx, dy, phase) {
    const length = Math.hypot(dx, dy);
    const power = phase === 'break' ? 240 : phase === 'fracture' ? 145 : 83;
    state.shakeVX = clamp(state.shakeVX + dx / length * power, -300, 300);
    state.shakeVY = clamp(state.shakeVY + dy / length * power, -300, 300);
  }

  function cutFaceStyle(key){
    return {
      card:{w:2.1,fill:'#f9efe3',edge:'#fff9f1',detail:'#d7b39f',lines:2},
      rope:{w:3.8,fill:'#d8b98f',edge:'#f4dfbb',detail:'#af8452',lines:5},
      bamboo:{w:3.5,fill:'#d9d88c',edge:'#f2f4c0',detail:'#8b9e52',lines:4},
      pineapple:{w:4.4,fill:'#f5d97a',edge:'#fff0ab',detail:'#e7b848',lines:4},
      gel:{w:4.0,fill:'rgba(140,225,233,.68)',edge:'rgba(250,217,247,.9)',detail:'rgba(235,135,194,.6)',lines:2},
      wood:{w:4.8,fill:'#f0af61',edge:'#ffe1b3',detail:'#a66735',lines:4},
      ice:{w:3.7,fill:'rgba(207,250,255,.82)',edge:'rgba(255,255,255,.95)',detail:'rgba(140,227,255,.72)',lines:3},
      steel:{w:2.7,fill:'#8fa0ac',edge:'#eef7fa',detail:'#5d707d',lines:3},
      shield:{w:3.0,fill:'#899ca8',edge:'#edf4f4',detail:'#526272',lines:3}
    }[key]||{w:7,fill:'#e6c08b',edge:'#fff4dd',detail:'#8a694f',lines:3};
  }
  function burst(x, y, material, count) {
    const type = material.particles;
    const amount = state.reducedMotion ? Math.ceil(count / 2) : count;
    for (let i = 0; i < amount && state.particles.length < 144; i++) {
      const angle = rand(-Math.PI, Math.PI * .27);
      const speed = rand(56, type === 'sparks' ? 330 : 240);
      const life = rand(.22, type === 'sparks' ? .40 : .58);
      const color = Math.random() < .40 ? material.glint : material.color;
      state.particles.push({
        x, y, type, color, life, maxLife: life, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 34,
        size: rand(type === 'sparks' ? 1 : 1.8, type === 'shards' ? 7 : 4.7),
        rotation: type === 'sparks' ? angle : rand(0, TAU), spin: rand(-10, 10),
      });
    }
  }

  function addSlash(x, y, dx, dy, m, heavy, force = 1) {
    const length = (heavy ? 150 : 102) * unit * clamp(force, .8, 1.24);
    state.slashes.push({
      x, y, angle: Math.atan2(dy, dx), length, life: .19, maxLife: .19,
      // Only the blade glow changes with the forged knife. Fracture fragments remain material colored.
      color: bladeAccent,
    });
    if (state.slashes.length > 12) state.slashes.shift();
    state.rings.push({ x, y, r: heavy ? 23 : 12, life: .28, maxLife: .28,
      color: m.glint, scale: heavy ? 2.0 : 1.45 });
    if (state.rings.length > 16) state.rings.shift();
  }
  function localPoint(point, pose) {
    const x = point.x - state.shakeX - pose.x, y = point.y - state.shakeY - pose.y;
    return { x: (pose.cos * x + pose.sin * y) / pose.sx, y: (pose.cos * y - pose.sin * x) / pose.sy };
  }

  // Test the swipe against the same transformed sprite the player sees.
  function traceTarget(a, b, target) {
    const first = localPoint(a, target.pose), last = localPoint(b, target.pose);
    const dx = last.x - first.x, dy = last.y - first.y;
    const [left, top, right, bottom] = ART_BOUNDS[target.key];
    const x0 = left / 2 - 104, x1 = right / 2 - 96;
    const y0 = top / 2 - 120, y1 = bottom / 2 - 112;
    let enter = 0, leave = 1;
    for (const [p, q] of [[-dx, first.x - x0], [dx, x1 - first.x], [-dy, first.y - y0], [dy, y1 - first.y]]) {
      if (Math.abs(p) < 1e-8) {
        if (q < 0) return null;
      } else if (p < 0) {
        enter = Math.max(enter, q / p);
      } else {
        leave = Math.min(leave, q / p);
      }
    }
    if (enter > leave) return null;
    const length = Math.hypot(dx, dy);
    const ux = dx / length, uy = dy / length;
    const samples = Math.max(2, Math.ceil(length * (leave - enter) / 5));
    const markRadius = target.marked ? markRadiusFor(target) : 0;
    let ratio = null, precise = false;
    for (let i = 0; i <= samples; i++) {
      const t = lerp(enter, leave, i / samples);
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const localX = first.x + dx * t, localY = first.y + dy * t;
      if (targetAlphaAt(target.key, localX / 200 + .5, localY / 232 + .5) === false) continue;
      ratio ??= t;
      if (!target.marked) break;
      if (localX * localX + (localY + 4) ** 2 <= markRadius ** 2) {
        ratio = t;
        precise = true;
        break;
      }
    }
    if (ratio === null || (target.marked && !precise)) return null;
    return {
      x: lerp(a.x, b.x, ratio) - state.shakeX, y: lerp(a.y, b.y, ratio) - state.shakeY,
      ratio, ux, uy, offset: ux * first.y - uy * first.x, precise,
    };
  }

  function cutLine(target, contact) {
    const { ux, uy } = contact;
    const offset = clamp(contact.offset, -89, 89);
    const x = -uy * offset, y = ux * offset;
    let from = Infinity, to = -Infinity;
    const [left, top, right, bottom] = ART_BOUNDS[target.key];
    for (let k = -145; k <= 145; k += 4) {
      const px = (x + ux * k + 100) * 2, py = (y + uy * k + 116) * 2;
      if (px < left || px > right || py < top || py > bottom) continue;
      if (targetAlphaAt(target.key, px / 400, py / 464, 0) === false) continue;
      from = Math.min(from, k);
      to = Math.max(to, k);
    }
    return { x, y, ux, uy, from, to };
  }

  function makeCrack(t,dx,dy,power){
    const count=(t.key==='steel'||t.key==='shield')?1:Math.floor(2+Math.min(power/100,2));const rng=seeded(t.id*191+t.strikes.length*423);
    const angle=Math.atan2(dy,dx);
    for(let i=0;i<count;i++){
      const start=rng()*TAU,reach=rand(21,t.key==='ice'?70:54)*Math.min(1.2,.55+t.strikes.length*.10);
      t.cracks.push({a:start,reach,branch:rng()*TAU,x:rand(-9,9),y:rand(-17,17),thick:rand(.6,2.3),angle});
    }
    if(t.cracks.length>22)t.cracks.splice(0,t.cracks.length-22);
  }

  function makeBackdrop() {
    const buffer = document.createElement('canvas');
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const c = buffer.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = grad(c, 0, 0, 0, H, [[0, '#0a1522'], [.55, '#182b3d'], [1, '#0b1523']]);
    c.fillRect(0, 0, W, H);
    c.fillStyle = radial(c, W * .46, H * .51, Math.max(W * .74, H * .54), [
      [0, 'rgba(88,162,165,.32)'], [.52, 'rgba(50,96,119,.13)'], [1, 'rgba(15,30,49,0)'],
    ]);
    c.fillRect(0, 0, W, H);
    c.fillStyle = radial(c, W * .90, H * .34, Math.max(180, W * .65), [
      [0, 'rgba(224,156,100,.14)'], [1, 'rgba(224,156,100,0)'],
    ]);
    c.fillRect(0, 0, W, H);
    const floor = H * .785;
    // Frame the playfield with workshop beams and a low, recessed launch deck.
    c.fillStyle = grad(c, 0, 0, W, 0, [[0, '#08131eb0'], [.16, '#08131e00'], [.84, '#08131e00'], [1, '#08131eb0']]);
    c.fillRect(0, 0, W, H);
    for (const side of [-1, 1]) {
      const x = W * (.5 + side * .415);
      c.beginPath();
      c.moveTo(x + side * W * .055, H * .16);
      c.lineTo(x, H * .29);
      c.lineTo(x, floor - H * .07);
      c.lineTo(x + side * W * .10, floor + H * .095);
      c.strokeStyle = 'rgba(159,210,215,.10)';
      c.lineWidth = 1;
      c.stroke();
    }
    c.fillStyle = grad(c, 0, floor, 0, H, [[0, '#1b2a37'], [.27, '#111e2e'], [1, '#0a1320']]);
    c.fillRect(0, floor, W, H - floor);
    c.fillStyle = grad(c, 0, 0, W, 0, [[0, '#96b1bd00'], [.25, '#96b1bd3a'], [.5, '#afd9d773'], [.75, '#dfb18a44'], [1, '#dfb18a00']]);
    c.fillRect(0, floor, W, 1);
    const rx = Math.min(fieldWidth * .38, 290);
    const ry = Math.min(H * .040, 32);
    c.beginPath();
    c.ellipse(W * .5, floor + H * .057, rx, ry, 0, 0, TAU);
    c.fillStyle = grad(c, 0, floor, 0, floor + H * .10, [[0, '#304758'], [1, '#101b29']]);
    c.fill();
    c.strokeStyle = '#86b1bd3d';
    c.stroke();
    for (const side of [-1, 1]) {
      c.beginPath();
      c.ellipse(W * .5, floor + H * .057, rx * .88, ry * .76, 0,
        side > 0 ? Math.PI * .04 : Math.PI * 1.10, side > 0 ? Math.PI * .42 : Math.PI * 1.49);
      c.strokeStyle = side > 0 ? '#e4a77561' : '#a5f3dd6a';
      c.lineWidth = 1.5;
      c.stroke();
    }
    return buffer;
  }

  function renderBackground() {
    backdrop ??= makeBackdrop();
    ctx.drawImage(backdrop, 0, 0, W, H);
    if (state.reducedMotion) return;
    for (const dot of ambientDots) {
      const alpha = .06 + .08 * (1 + Math.sin(state.time * dot.s + dot.phase)) * .5;
      ctx.fillStyle = 'rgba(216,234,235,' + alpha + ')';
      ctx.fillRect(dot.x + Math.sin(state.time * .16 + dot.phase) * 4,
        dot.y + Math.cos(state.time * .21 + dot.phase) * 8, dot.r, dot.r);
    }
  }

  function shadowForTarget(target) {
    const { x, y, scale } = target.pose;
    if (y > H * .93) return;
    const ground = H * .839;
    const near = clamp(1 - Math.abs(y - ground) / (H * .5), .10, 1);
    ctx.fillStyle = 'rgba(4,11,18,' + (near * .23) + ')';
    ctx.beginPath();
    ctx.ellipse(x, ground, (target.anchored ? 77 : 57) * scale, 10 * scale, 0, 0, TAU);
    ctx.fill();
  }

  function drawCracks(t){
    const fraction=1-t.hp/t.maxHp;
    const c=ctx;
    if(!t.cracks.length)return;
    c.save();c.globalAlpha=clamp(.23+fraction*.65,0,.85);
    if(t.key==='steel'||t.key==='shield'){
      // Steel and armored shield dent rather than spider-webbing like ice and dents rather than exploding into spiderweb cracks.
      for(let i=0;i<t.cracks.length;i++){
        const a=t.cracks[i],x=a.x+(i%5-2)*16,y=a.y+(Math.floor(i/5)%3-1)*22;
        c.save();c.translate(x,y);c.rotate(a.angle*.25);
        c.strokeStyle='#1b313c';c.lineWidth=2.2;c.beginPath();c.ellipse(0,0,8+fraction*8,3.5+fraction*4,.05,0,TAU);c.stroke();
        c.strokeStyle='#e2f6f4a9';c.lineWidth=1;c.beginPath();c.ellipse(1,-2,8+fraction*8,3.5+fraction*4,.05,Math.PI,TAU);c.stroke();
        c.restore();
      }
    }else{
      for(const a of t.cracks){
        const cx=a.x,cy=a.y,ex=cx+Math.cos(a.a)*a.reach,ey=cy+Math.sin(a.a)*a.reach;
        c.beginPath();c.moveTo(cx,cy);
        c.lineTo(cx+Math.cos(a.a+.12)*a.reach*.46,cy+Math.sin(a.a+.12)*a.reach*.43);
        c.lineTo(ex,ey);
        c.lineWidth=a.thick;
        c.strokeStyle=t.key==='ice'?'#efffff':t.key==='gel'?'#d9f6ff':'#322219';c.stroke();
        c.lineWidth=.5;c.strokeStyle=t.m.glint;c.stroke();
        c.beginPath();c.moveTo(ex,ey);
        c.lineTo(ex+Math.cos(a.branch)*a.reach*.23,ey+Math.sin(a.branch)*a.reach*.23);
        c.strokeStyle=t.key==='ice'?'#dafaff':t.key==='gel'?'#ffe0f4':'#3a261c';c.lineWidth=.75;c.stroke();
      }
    }
    c.restore();
  }
  function drawHits(t){
    const c=ctx,age=state.time;
    const progress=1-t.hp/t.maxHp;
    const base=clamp(2.0+progress*6.2,2,9.5);
    for(let i=0;i<t.strikes.length;i++){
      const s=t.strikes[i];c.save();c.rotate(s.angle);c.translate(0,s.offset);
      const fresh=clamp(1-(age-s.time)*2.6,0,1);
      const length=48+progress*30;
      // Width grows on successive strikes: visual cut depth is not just an HP bar.
      c.beginPath();c.moveTo(-length,0);c.quadraticCurveTo(-12,2.8,length,0);
      c.strokeStyle=t.key==='ice'?'#2e9bbcb5':(t.key==='steel'||t.key==='shield')?'#25313fef':t.key==='gel'?'#427c8bd8':'#24180ed9';
      c.lineCap='round';c.lineWidth=(t.key==='steel'||t.key==='shield')?Math.max(1.5,base*.53):base*.85;c.stroke();
      c.translate(0,-base*.43);c.strokeStyle=t.key==='ice'?'#e4ffffd9':(t.key==='steel'||t.key==='shield')?'#e3e3f5b1':t.key==='gel'?'#cdeff5ad':'#f0bc8199';
      c.lineWidth=Math.max(.8,base*.21);c.stroke();
      if(fresh>.01&&!state.reducedMotion){c.strokeStyle=`rgba(253,255,233,${fresh*.52})`;c.lineWidth=1.6;c.stroke();}
      c.restore();
    }
    if(t.armored&&progress>.33&&t.key!=='gel'){
      c.save();c.globalAlpha=clamp((progress-.32)*.9,0,.49);
      c.strokeStyle=t.key==='ice'?'#e7ffff':(t.key==='steel'||t.key==='shield')?'#e1e5f3':'#f3c38b';
      c.lineWidth=2+progress*2;c.beginPath();c.moveTo(-30,0);c.lineTo(4,progress*15);c.lineTo(31,progress*29);c.stroke();c.restore();
    }
  }
  function drawTarget(target) {
    const { x, y, angle, sx, sy, scale } = target.pose;
    const sprite = targetSprite(target.key);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(sx, sy);
    drawTargetArt(target, sprite);
    drawCracks(target);
    drawHits(target);
    if (target.marked) {
      // A small high-contrast ring stays inside the material silhouette.
      ctx.beginPath();
      ctx.arc(0, -4, markRadiusFor(target), 0, TAU);
      ctx.strokeStyle = '#0a202c';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#c4ffee';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 3, 0, TAU);
      ctx.fillStyle = '#e7fff4';
      ctx.fill();
    }
    ctx.restore();
    if (target.armored || target.reinforced) {
      const barWidth = Math.min(102, 87 * scale);
      const barY = y + 113 * scale;
      const gap = 3;
      const segment = (barWidth - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        const left = x - barWidth / 2 + i * (segment + gap);
        ctx.fillStyle = '#121e2a';
        roundRect(ctx, left, barY, segment, 4, 2);
        ctx.fill();
        const fraction = clamp(target.hp / target.maxHp * 3 - i, 0, 1);
        if (fraction > .02) {
          ctx.fillStyle = '#f6bc83';
          roundRect(ctx, left, barY, segment * fraction, 4, 2);
          ctx.fill();
        }
      }
    }
  }

  function drawTargetArt(target, sprite) {
    if (sprite) {
      ctx.drawImage(sprite, -100, -116, 200, 232);
      return;
    }
    const [left, top, right, bottom] = ART_BOUNDS[target.key];
    ctx.fillStyle = target.m.color;
    roundRect(ctx, left / 2 - 100, top / 2 - 116, (right - left) / 2, (bottom - top) / 2, 14);
    ctx.fill();
  }

  function drawPiece(piece) {
    const { target, face, side, life, maxLife } = piece;
    const { x, y, ux, uy, from, to } = face;
    const nx = -uy, ny = ux;
    const palette = cutFaceStyle(target.key);
    ctx.save();
    ctx.globalAlpha = clamp(life * 6, 0, 1);
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation + piece.spin * (maxLife - life) * .60);
    ctx.scale(piece.sx, piece.sy);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - ux * 280, y - uy * 280);
    ctx.lineTo(x + ux * 280, y + uy * 280);
    ctx.lineTo(x + ux * 280 + nx * side * 300, y + uy * 280 + ny * side * 300);
    ctx.lineTo(x - ux * 280 + nx * side * 300, y - uy * 280 + ny * side * 300);
    ctx.closePath();
    ctx.clip();
    drawTargetArt(target, targetSprite(target.key));
    if (to > from) {
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(uy, ux));
      ctx.strokeStyle = palette.fill;
      ctx.lineWidth = palette.w * 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from, 0);
      ctx.lineTo(to, 0);
      ctx.stroke();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(from, side * 1.2);
      ctx.lineTo(to, side * 1.2);
      ctx.stroke();
      ctx.fillStyle = palette.detail;
      for (let i = 1; i <= palette.lines; i++) {
        ctx.fillRect(lerp(from, to, i / (palette.lines + 1)), side > 0 ? 1.5 : -3.7, 1.4, 2.2);
      }
    }
    ctx.restore();
    ctx.restore();
  }

  function renderParticles(){
    for(const p of state.particles){
      const a=clamp(p.life/p.maxLife,0,1);ctx.save();ctx.globalAlpha=a*.97;
      ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
      if(p.type==='sparks'){
        ctx.shadowColor=p.color;ctx.shadowBlur=5*unit;ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(1,1.2*unit);
        ctx.beginPath();ctx.moveTo(-p.size*1.5,0);ctx.lineTo(p.size*2.8,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,-p.size*1.4);ctx.lineTo(0,p.size*1.4);ctx.stroke();
      }else if(p.type==='shards'||p.type==='splinters'){
        ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(-p.size*.5,-p.size);ctx.lineTo(p.size*.6,-p.size*.2);ctx.lineTo(p.size*.27,p.size);ctx.closePath();ctx.fill();
      }else if(p.type==='paper'){
        ctx.fillStyle=p.color;roundRect(ctx,-p.size*.8,-p.size*.55,p.size*1.6,p.size*1.1,1.6);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=.8;ctx.stroke();
      }else if(p.type==='juice'){
        ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,p.size*1.05,p.size*.75,.2,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,245,170,.45)';ctx.beginPath();ctx.arc(p.size*.16,-p.size*.12,Math.max(.6,p.size*.18),0,TAU);ctx.fill();
      }else if(p.type==='fibers'){
        ctx.strokeStyle=p.color;ctx.lineWidth=1.5*unit;ctx.beginPath();ctx.moveTo(0,-p.size*1.8);ctx.quadraticCurveTo(p.size,p.size,0,p.size*1.2);ctx.stroke();
      }else{
        ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,p.size,p.size*.65,.3,0,TAU);ctx.fill();
        if(p.type==='gel'){ctx.fillStyle='rgba(255,255,255,.32)';ctx.beginPath();ctx.arc(p.size*.18,-p.size*.15,Math.max(.6,p.size*.22),0,TAU);ctx.fill();}
      }
      ctx.restore();
    }
  }
  function renderRings(){

    for(const ring of state.rings){
      const k=1-ring.life/ring.maxLife,r=ring.r+120*unit*k*ring.scale;
      ctx.save();ctx.globalAlpha=(1-k)*.19;ctx.strokeStyle=ring.color;ctx.lineWidth=(3-k*2)*unit;
      ctx.beginPath();ctx.arc(ring.x,ring.y,r,0,TAU);ctx.stroke();ctx.restore();
    }
  }
  // A restrained bright impact bloom behind the material particles.
  // A single glow plus two intersecting strokes reads as a solid contact, not fireworks.
  function renderImpacts() {
    for (const hit of state.impacts) {
      const k = clamp(hit.life / hit.maxLife, 0, 1);
      const r = hit.radius * (1.0 + (1 - k) * .44);
      ctx.save();
      ctx.translate(hit.x, hit.y);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = k * hit.strength * .44;
      ctx.fillStyle = radial(ctx, 0, 0, r, [
        [0, '#fffaf0'], [.13, hit.color], [1, 'rgba(210,232,245,0)'],
      ]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.rotate(hit.angle);
      ctx.globalAlpha = k * hit.strength * .8;
      ctx.strokeStyle = '#fffaf2';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(.8, 1.7 * unit * k);
      ctx.beginPath();
      ctx.moveTo(-r * .64, 0);
      ctx.lineTo(r * .64, 0);
      ctx.stroke();
      ctx.globalAlpha *= .22;
      ctx.beginPath();
      ctx.moveTo(0, -r * .25);
      ctx.lineTo(0, r * .25);
      ctx.stroke();
      ctx.restore();
    }
  }
  function renderSlashes() {
    for (const s of state.slashes) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      const len = s.length * (1.26 - .26 * a);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.lineCap = 'round';
      ctx.globalAlpha = a * .72;
      ctx.shadowBlur = (10 + 7 * a) * unit;
      ctx.shadowColor = s.color;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, 7 * unit * a);
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.quadraticCurveTo(0, -5 * unit, len, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f8fffe';
      ctx.lineWidth = Math.max(.7, 1.7 * unit * a);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Render each swipe as a continuous ribbon. Three canvas strokes per ribbon
  // instead of repeated wide shadow blurs per raw pointer sample.
  function renderTrail() {
    const now = performance.now();
    const current = state.pointer.down ? state.pointer.points : [];
    const paths = state.trails.map(t => t.points);
    if (current.length > 1) paths.push(current);
    for (const points of paths) {
      const recent = points.filter(p => now - p.t < 180);
      if (recent.length < 2) continue;
      const latest = recent[recent.length - 1];
      const opacity = clamp(1 - (now - latest.t) / 180, 0, 1);
      if (opacity <= 0) continue;
      const first = recent[0];
      const last = recent[recent.length - 1];
      const total = Math.hypot(last.x - first.x, last.y - first.y);
      if (total < 4) continue;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < recent.length - 1; i++) {
        const p = recent[i], q = recent[i + 1];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) * .5, (p.y + q.y) * .5);
      }
      ctx.lineTo(last.x, last.y);
      ctx.shadowColor = bladeAccent;
      ctx.shadowBlur = state.reducedMotion ? 0 : 12 * unit;
      ctx.strokeStyle = bladeAccent;
      ctx.globalAlpha = opacity * .36;
      ctx.lineWidth = Math.max(4, 19 * unit * opacity);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = bladeAccent;
      ctx.globalAlpha = opacity * .88;
      ctx.lineWidth = Math.max(2, 4.6 * unit * opacity);
      ctx.stroke();
      ctx.strokeStyle = '#fafffe';
      ctx.globalAlpha = opacity;
      ctx.lineWidth = Math.max(.8, 1.35 * unit * opacity);
      ctx.stroke();
      ctx.restore();
    }
    // A subtle touch marker, no circular reticle floating over the art.
    if (state.pointer.down) {
      const p = state.pointer;
      ctx.save();
      ctx.fillStyle = '#faffff';
      ctx.shadowColor = bladeAccent;
      ctx.shadowBlur = 7 * unit;
      ctx.globalAlpha = .85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 * unit, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    renderBackground();
    if (state.screen !== 'playing' && state.screen !== 'paused') return;
    ctx.save();
    ctx.translate(state.shakeX, state.shakeY);
    for (const target of state.targets) if (target.alive && target.pose) shadowForTarget(target);
    for (const piece of state.pieces) drawPiece(piece);
    for (const target of state.targets) if (target.alive && target.pose) drawTarget(target);
    renderImpacts();
    renderRings();
    renderParticles();
    renderSlashes();
    ctx.restore();
    // The touch trail stays under the finger while the stage reacts to a heavy cut.
    renderTrail();
    if (state.flash > .003) {
      ctx.fillStyle = 'rgba(237,252,250,' + (state.flash * .30) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function update(seconds, now) {
    state.time += seconds;
    state.flash = Math.max(0, state.flash - seconds * 2.8);
    const damp = Math.exp(-29 * seconds);
    state.shakeVX = (state.shakeVX - state.shakeX * 420 * seconds) * damp;
    state.shakeVY = (state.shakeVY - state.shakeY * 420 * seconds) * damp;
    state.shakeX = clamp(state.shakeX + state.shakeVX * seconds, -5.5, 5.5);
    state.shakeY = clamp(state.shakeY + state.shakeVY * seconds, -5.5, 5.5);
    for (const target of state.targets) {
      target.recoil = Math.max(0, target.recoil - seconds * 6);
      target.recoilTime += seconds;
      target.tilt *= Math.max(0, 1 - seconds * 5);
    }
    for (const particle of state.particles) {
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.vy += 350 * seconds;
      particle.rotation += particle.spin * seconds;
    }
    for (const piece of state.pieces) {
      if (piece.hold > 0) {
        piece.hold -= seconds;
        continue;
      }
      piece.x += piece.vx * seconds;
      piece.y += piece.vy * seconds;
      piece.vy += 515 * seconds;
      piece.vx *= Math.exp(-1.45 * seconds);
    }
    for (const effects of [state.pieces, state.particles, state.rings, state.slashes, state.impacts]) {
      for (let i = effects.length - 1; i >= 0; i--) {
        effects[i].life -= seconds;
        if (effects[i].life <= 0) effects.splice(i, 1);
      }
    }
    for (let i = state.trails.length - 1; i >= 0; i--) {
      if (now - state.trails[i].points.at(-1).t > 180) state.trails.splice(i, 1);
    }
  }

  function tick(now) {
    const seconds = clamp((now - lastTick) / 1000, 0, .05);
    lastTick = now;
    if (now >= readyUntil) {
      if (!ready.hidden) {
        ready.hidden = true;
        ready.classList.remove('is-on');
      }
      advance(now);
    }
    update(seconds, now);
    layoutTargets();
    updateClock(now);
    render();
    if (now >= deadline) return finish('time');
    if (state.durability <= 0) return finish('wear');
    raf = requestAnimationFrame(tick);
  }

  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: input.signal });
  listen(canvas, 'pointerdown', pointerDown);
  listen(canvas, 'pointermove', pointerMove);
  listen(canvas, 'pointerup', pointerUp);
  listen(canvas, 'pointercancel', pointerUp);
  listen(canvas, 'lostpointercapture', pointerUp);
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'keydown', keyboardStrike);
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  const observer = new ResizeObserver(resize);
  observer.observe(frame);
  resize();

  return {
    start, pause, resume,
    destroy() {
      input.abort();
      observer.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(scoreTimer);
      audio.setEnabled(false);
    },
  };
}
