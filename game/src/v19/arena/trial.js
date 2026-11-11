import { haptics, motion } from '../../platform/index.js';
import { PROJECTS } from '../tournament.js';
import { signaturePerk } from '../forge.js';
/* Adapted from Blade Trial v0.19. See LICENSE. */
import { BladeAudio } from './audio.js';
import { ART_BOUNDS, targetSprite, warmTargets, targetAlphaAt } from './targets.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => lerp(min, max, Math.random());
const TAU = Math.PI * 2;

const MATERIALS = {
  card:   {name:'纸牌组',short:'纸牌',eng:'纸牌',class:'连斩试炼',color:'#e9e0d3',chip:'#d8c9b7',hardness:.34,hp:58,heavyHP:180,score:16,wear:.65,glint:'#fff7ee',particles:'paper',sound:'card'},
  rope:   {name:'编织绳束',short:'绳束',eng:'绳束',class:'锋利试炼',color:'#d3b487',chip:'#cda66d',hardness:.52,hp:100,heavyHP:300,score:25,wear:1.1,glint:'#f0d6a8',particles:'fibers',sound:'rope'},
  bamboo: {name:'竹节靶',short:'竹节',eng:'竹节',class:'锋利试炼',color:'#a7cf7e',chip:'#9aba71',hardness:.72,hp:113,heavyHP:370,score:36,wear:1.4,glint:'#cef3ae',particles:'splinters',sound:'wood'},
  pineapple:{name:'菠萝',short:'菠萝',eng:'菠萝',class:'连斩试炼',color:'#d9b84c',chip:'#c9a13b',hardness:.94,hp:132,heavyHP:430,score:46,wear:1.75,glint:'#ffef93',particles:'juice',sound:'pineapple'},
  wood:   {name:'硬木桩',short:'硬木',eng:'硬木',class:'强度试炼',color:'#c58a54',chip:'#b37a43',hardness:1.20,hp:180,heavyHP:550,score:55,wear:2.1,glint:'#e0b684',particles:'splinters',sound:'wood'},
  ice:    {name:'坚冰块',short:'坚冰',eng:'坚冰',class:'强度试炼',color:'#8ce4ff',chip:'#6bcfeb',hardness:1.15,hp:190,heavyHP:500,score:62,wear:2.0,glint:'#c9f6ff',particles:'shards',sound:'ice'},
  gel:    {name:'透明凝胶',short:'凝胶',eng:'凝胶',class:'精准试炼',color:'#8bcef1',chip:'#a7d6ec',hardness:.82,hp:116,heavyHP:420,score:42,wear:1.6,glint:'#e6d6ff',particles:'gel',sound:'gel'},
  steel:  {name:'金属桶',short:'钢桶',eng:'金属',class:'耐久试炼',color:'#a9c6d0',chip:'#aebeca',hardness:1.95,hp:275,heavyHP:820,score:95,wear:4.3,glint:'#f5e0ae',particles:'sparks',sound:'metal'},
  shield: {name:'复合盾牌',short:'盾牌',eng:'盾牌',class:'终极试炼',color:'#a7b6c2',chip:'#abb9c4',hardness:2.55,hp:330,heavyHP:1120,score:132,wear:5.35,glint:'#d6e8ef',particles:'sparks',sound:'shield'}
};
// Keep tactile pauses short: input continues while target animation briefly holds.
const FEEL = { hitstop: { hit: 23, fracture: 39, break: 58 }, slowScale: .74 };
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
function strokeLine(c,coords,color,width=1){c.beginPath();c.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)c.lineTo(coords[i],coords[i+1]);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function seeded(i){let a=i|0;return ()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;}}

const audio = new BladeAudio();
const strength = .9;
audio.setTone('punchy');

export function warmTrialAudio() {
  void audio.preload().catch(() => {});
}

function gameplayRng(seed) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return seeded(hash);
}

function rotatingWaves(waves, rng) {
  // Keep the soft opening, and shuffle within comparable rows and heavy bouts.
  const rotateGroup = group => {
    const offset = Math.floor(rng() * group.length);
    return [...group.slice(offset), ...group.slice(0, offset)];
  };
  const rows = rotateGroup(waves.slice(2).filter(wave => !wave.heavy));
  const heavyWaves = rotateGroup(waves.slice(2).filter(wave => wave.heavy));
  return [...waves.slice(0, 2), ...waves.slice(2).map(wave => wave.heavy ? heavyWaves.shift() : rows.shift())];
}

export function createTrial(frame, course, blade, { muted, volume, onPause, onFinish }) {
  const canvas = frame.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('浏览器无法开启切割画布');
  const colors = getComputedStyle(frame);
  const color = name => colors.getPropertyValue(name).trim();
  const wall = color('--arena-wall'), horizon = color('--arena-horizon'), floor = color('--arena-floor');
  const glow = color('--arena-glow'), grid = color('--stage-grid'), shadow = color('--stage-shadow');
  const label = color('--face-2'), mutedLabel = color('--face-3'), positive = color('--arena-positive');
  const ink = color('--stage-ink');
  const ui = Object.fromEntries([...frame.querySelectorAll('[data-trial]')].map(node => [node.dataset.trial, node]));
  const input = new AbortController();
  const rng = gameplayRng(course.seed);
  const waves = course.rotate ? rotatingWaves(course.waves, rng) : course.waves;
  const stats = blade.stats.map(value => {
    const normalized = value <= 100 ? Math.round(value * 1.45) : 145 + Math.min(24, Math.log1p(value - 100) * 4.5);
    return normalized / 150;
  });
  const projects = new Map();
  audio.setVolume(volume);
  const perk = signaturePerk(blade.signature);
  const [power, toughness, edge, craft, design, spirit] = stats;
  const derived = {
    penetration: .65 + edge * .92, force: .67 + power * .85, stability: .77 + craft * .25,
    wearMitigation: .55 + toughness * .84, combo: 1 + design * .4, critChance: .025 + spirit * .18,
  };
  // The swipe itself inherits a restrained signature tint from the forged blade's strongest stat.
  // Keep target break particles material-colored so the blade and the material remain distinct.
  const strongestStat = stats.indexOf(Math.max(...stats));
  const bladeAccent = ['#f7bd86', '#a8d0e7', '#c8f2e7', '#a6dfda', '#cdb9f6', '#f4d7a0'][strongestStat] || '#c8f2e7';
  const state = {
    screen: 'ready', score: 0, bestCombo: 0, durability: 100, time: 0,
    round: 0, waves: 0, cut: 0, hits: 0, damage: 0, targets: [], pieces: [], particles: [], rings: [],
    slashes: [], trails: [], impacts: [], comboChain: 0, lastKillAt: -1e4,
    pointer: { down: false, points: [], hitTargets: new Set() },
    feel: true, intensity: strength, reducedMotion: motion.reduced(), hitstop: 0, slowRemaining: 0,
    shakeX: 0, shakeY: 0, shakeVX: 0, shakeVY: 0, flash: 0, nextWaveAt: -1,
  };
  let W = 1, H = 1, DPR = 1, unit = 1, ambientDots = [];
  let backdrop, deadline, timeLeft = course.limit * 1000, lastTick, raf, sequence = 0, clock = -1;
  let currentWave, timeLeftAtClear = null, lastVerdictAt = -1000, fatalAt = -1, readyUntil = 0;
  let scoreTimer, comboTimer, readyTimer;

  function updateHUD() {
    ui.score.textContent = String(state.score).padStart(4, '0');
    ui.durability.textContent = Math.round(state.durability) + '%';
    ui.wear.value = state.durability;
    ui.wear.classList.toggle('low', state.durability < 25);
    ui.hits.textContent = String(state.cut);
  }

  function updateClock(now) {
    const remaining = now < readyUntil ? timeLeft : Math.max(0, deadline - now);
    const next = Math.ceil(remaining / 1000);
    if (clock === next) return;
    clock = next;
    ui.time.textContent = String(next).padStart(2, '0') + '″';
    ui.time.classList.toggle('urgent', next <= 8);
  }

  function addScore(points) {
    state.score += points;
    ui.delta.textContent = '+' + points;
    ui.delta.classList.remove('is-pop');
    void ui.delta.offsetWidth;
    ui.delta.classList.add('is-pop');
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => { ui.delta.textContent = ''; ui.delta.classList.remove('is-pop'); }, 750);
  }

  function showVerdict(label, kind) {
    const now = performance.now();
    if (kind === 'fracture' && now - lastVerdictAt < 510) return;
    lastVerdictAt = now;
    ui.verdict.className = 'cut-callout ' + kind;
    ui.verdict.textContent = label;
    ui.verdict.getAnimations().forEach(animation => animation.cancel());
    ui.verdict.animate(state.reducedMotion ? [
      { opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 },
    ] : [
      { opacity: 0, transform: 'translateY(8px) scale(.92)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: .16 },
      { opacity: 1, offset: .54 }, { opacity: 0, transform: 'translateY(-6px)' },
    ], { duration: 640 });
  }

  function layoutTargets() {
    const count = state.targets.length;
    const row = count > 1;
    const step = row ? Math.min(W / (count + .25), 192 * unit) : 0;
    const scale = row ? Math.min(unit * 1.24, step / 144) : Math.min(1.4, Math.max(unit * 1.22, Math.min(W / 246, H / 368)));
    state.targets.forEach((target, i) => {
      target.x = W / 2 + (i - (count - 1) / 2) * step;
      // Set target feet near the lit platform. The previous offset made props float in mid-air.
      target.y = H * (row ? .56 : .50);
      target.scale = scale;
    });
  }

  function resize() {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width; H = rect.height;
    // Keep targets sharp on Retina phones, but cap actual canvas pixels for stable FPS.
    const pixelBudget = W < 620 ? 2_000_000 : 2_700_000;
    DPR = Math.max(1, Math.min(window.devicePixelRatio || 1,
      W < 620 ? 2.5 : 2, Math.sqrt(pixelBudget / Math.max(1, W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    unit = clamp(Math.min(W / 770, H / 610), .45, 1.55);
    ambientDots = Array.from({ length: W < 620 ? 25 : 48 }, () => ({
      x: rand(0, W), y: rand(H * .13, H * .91), r: rand(.3, 1.8), s: rand(.2, 1.1), phase: rand(0, TAU),
    }));
    backdrop = null;
    layoutTargets();
    render();
  }

  function spawnWave() {
    currentWave = waves[state.round % waves.length];
    const { heavy, targets } = currentWave;
    const nextWave = waves[state.round + 1] ?? (course.timedLoop ? waves[0] : null);
    warmTargets(targets);
    if (nextWave) warmTargets(nextWave.targets);
    const project = projects.get(currentWave.project) || { damage: 0, count: 0 };
    project.count += targets.length;
    projects.set(currentWave.project, project);
    state.targets = targets.map(key => {
      const m = MATERIALS[key];
      const hp = (heavy ? m.heavyHP : m.hp) * course.hpScale;
      return {
        id: ++sequence, key, m, hp, maxHp: hp, heavy, alive: true, phase: rand(0, TAU), recoil: 0,
        impulseX: 0, impulseY: 0, tilt: 0, hitGlow: 0, recoilTime: 0, strikes: [], cracks: [],
        spawnT: state.time - .08, cutDepth: 0, statusText: '', statusUntil: 0,
      };
    });
    state.round++;
    state.nextWaveAt = -1;
    state.durability = Math.min(100, state.durability + (state.round > 1 ? 12 : 0));
    layoutTargets();
    ui.wave.textContent = course.timedLoop ? String(state.round).padStart(2, '0') : state.round + ' / ' + waves.length;
    ui.target.textContent = '第 ' + state.round + ' 波' + (heavy ? ' · ' + state.targets[0].m.name : '');
    ui.target.classList.remove('is-new');
    void ui.target.offsetWidth;
    ui.target.classList.add('is-new');
    ui.tip.textContent = heavy ? '反复劈开重靶' : '横划连斩';
    updateHUD();
  }

  function start() {
    if (state.screen !== 'ready') return;
    audio.setEnabled(!muted);
    const now = performance.now();
    const lead = state.reducedMotion ? 220 : 820;
    state.screen = 'playing';
    readyUntil = now + lead;
    deadline = readyUntil + timeLeft;
    lastTick = now;
    spawnWave();
    updateClock(lastTick);
    const ready = frame.querySelector('[data-trial-ready]');
    if (ready) {
      ready.hidden = false;
      ready.classList.add('is-on');
      clearTimeout(readyTimer);
      readyTimer = setTimeout(() => {
        ready.classList.remove('is-on');
        ready.hidden = true;
      }, lead);
    }
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (state.screen !== 'playing') return false;
    const now = performance.now();
    if (now >= deadline) {
      finish('time', now);
      return false;
    }
    timeLeft = deadline - now;
    endStroke();
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
    deadline = lastTick + timeLeft;
    raf = requestAnimationFrame(tick);
  }

  function finish(reason, now) {
    if (state.screen !== 'playing') return;
    endStroke();
    state.screen = 'finished';
    cancelAnimationFrame(raf);
    onFinish({
      reason: timeLeftAtClear !== null ? 'clear' : reason, score: state.score, combo: state.bestCombo,
      hits: state.hits, cut: state.cut, waves: state.waves, damage: state.damage, durability: state.durability,
      projects: [...projects].map(([kind, item]) => ({
        kind, name: PROJECTS[kind].name, score: Math.round(item.damage / item.count * 100),
      })),
      remaining: (timeLeftAtClear ?? Math.max(0, deadline - now)) / 1000,
    });
  }

  function damageFor(target, speed) {
    const mastery = blade.mastery;
    const multiplier = mastery.specialty === currentWave.project ? 1 + mastery.bonus : 1;
    const signatureBoost = perk?.targets.includes(target.key) ? 1 + perk.bonus : 1;
    const skill = clamp(.80 + speed / 1450, .87, 1.30);
    const degraded = state.durability < 18 ? .68 : state.durability < 35 ? .84 : 1;
    const variation = 1 + (rng() - .5) * .24 * (1.15 - derived.stability);
    const crit = rng() < derived.critChance;
    const damage = 110 * derived.penetration * derived.force / target.m.hardness *
      skill * degraded * variation * multiplier * signatureBoost * (crit ? 1.34 : 1);
    return { damage: Math.max(10, damage), crit };
  }

  function splitTarget(target, dx, dy, crit) {
    target.alive = false;
    const angle = Math.atan2(dy, dx);
    // Halves move apart along the normal of the actual cut, rather than flying randomly.
    // Short lifetimes keep the next wave from filling the stage with old fragments.
    const speed = target.heavy ? 146 : 172;
    const lifetime = target.heavy ? .86 : .66;
    for (const side of [-1, 1]) state.pieces.push({
      target, x: target.x, y: target.y, angle, life: lifetime, maxLife: lifetime,
      scale: target.scale, side,
      vx: -Math.sin(angle) * speed * side + Math.cos(angle) * 22,
      vy: Math.cos(angle) * speed * side - (target.heavy ? 64 : 52),
      spin: side * rand(.8, 2.2),
    });
    state.cut++;
    const now = performance.now();
    state.comboChain = now - state.lastKillAt < 1300 ? Math.min(12, state.comboChain + 1) : 1;
    state.lastKillAt = now;
    state.bestCombo = Math.max(state.bestCombo, state.comboChain);
    const chainBonus = state.comboChain > 1 ? Math.min(48, (state.comboChain - 1) * 8) : 0;
    addScore(Math.round((target.m.score * (target.heavy ? 3.7 : 1.9) * (crit ? 1.3 : 1) + chainBonus) * derived.combo));
    if (state.comboChain > 1) {
      ui.combo.textContent = '×' + state.comboChain;
      ui.combo.classList.remove('is-live');
      void ui.combo.offsetWidth;
      ui.combo.classList.add('is-live');
    }
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      if (performance.now() - state.lastKillAt >= 1250) {
        ui.combo.textContent = '—';
        state.comboChain = 0;
      }
    }, 1340);
    burst(target.x, target.y, target.m, target.heavy ? 22 : 13, target.heavy ? 1.18 : 1.08);
  }

  function hitTarget(target, dx, dy, speed, delay, groupSize) {
    const pointer = state.pointer;
    pointer.hitTargets.add(target.id);
    const liveCombo = pointer.hitTargets.size;
    if (liveCombo > 1) {
      ui.combo.textContent = '×' + liveCombo;
      ui.combo.classList.remove('is-live');
      void ui.combo.offsetWidth;
      ui.combo.classList.add('is-live');
    }
    const { damage, crit } = damageFor(target, speed);
    const previous = target.hp / target.maxHp;
    if (!target.strikes.length) {
      target.sprite = targetSprite(target.key);
      state.hits++;
      if (target.heavy) haptics.vibrate(12);
    }
    target.hp = Math.max(0, target.hp - damage);
    const remainder = target.hp / target.maxHp;
    state.damage += previous - remainder;
    projects.get(currentWave.project).damage += previous - remainder;
    target.cutDepth = 1 - remainder;
    const broken = target.hp <= 0;
    const fracture = !broken && ((previous > .67 && remainder <= .67) || (previous > .33 && remainder <= .33));
    const phase = broken ? 'break' : fracture ? 'fracture' : 'hit';
    const crackNames = { steel: '桶身凹陷', shield: '盾甲破损', ice: '冰面开裂', pineapple: '果肉裂开', gel: '凝胶撕裂' };
    target.statusText = broken ? '斩断' : fracture ? (crackNames[target.key] || '裂痕扩大') : '切入';
    target.statusUntil = state.time + .68;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const force = clamp(speed / 900, .72, 1.36);
    const resistance = clamp(target.m.hardness / 2.55, 0, 1);
    const kick = (target.heavy ? 6 : 10) + force * (1 - resistance * .48) * 5;
    Object.assign(target, { hitGlow: 1, recoil: 1, recoilTime: 0, impulseX: dx / len * kick, impulseY: dy / len * kick * .72 });
    target.tilt += clamp(dx / len * rand(-.04, .09), -.15, .15);
    target.strikes.push({ angle: Math.atan2(dy, dx), time: state.time, offset: rand(-10, 10) });
    if (target.strikes.length > 16) target.strikes.shift();
    makeCrack(target, dx, dy, damage);
    const wear = target.m.wear * (target.heavy ? 1.9 : 1.15) * (.6 + damage / 200) / derived.wearMitigation;
    state.durability = Math.max(0, state.durability - wear * course.wearScale);
    if (!state.reducedMotion) {
      state.hitstop = Math.max(state.hitstop, FEEL.hitstop[phase] * (target.heavy ? 1.18 : .82) * clamp(.82 + force * .16, .90, 1.06));
      state.slowRemaining = Math.max(state.slowRemaining, broken ? 50 : 35);
      state.flash = Math.max(state.flash, broken ? .18 : fracture ? .115 : .055);
      applyCameraKick(dx, dy, phase, target.heavy);
    }
    addSlash(target.x, target.y, dx, dy, target.m, target.heavy, force);
    state.impacts.push({
      x: target.x, y: target.y, color: target.m.glint,
      life: broken ? .20 : .15, maxLife: broken ? .20 : .15,
      radius: (target.heavy ? 75 : 49) * unit,
      strength: broken ? 1 : fracture ? .68 : .42,
      angle: Math.atan2(dy, dx),
    });
    if (state.impacts.length > 8) state.impacts.shift();
    burst(target.x, target.y, target.m, broken ? 12 : fracture ? 7 : 3);
    audio.playHit({ material: target.key, stage: phase, force, pan: (target.x / W - .5) * 1.1, delayMs: delay, groupSize });
    if (broken) haptics.vibrate(target.heavy ? 24 : 10);
    if (broken) {
      splitTarget(target, dx, dy, crit);
      pointer.kills++;
      if (groupSize === 1) showVerdict(target.key === 'shield' ? '强破盾面' : target.strikes.length === 1 ? '一刀斩断' : '利落斩断', 'break');
    } else if (fracture && target.heavy) {
      showVerdict(target.statusText, 'fracture');
    }
  }

  function strokeSegment(a, b, seconds) {
    if (state.nextWaveAt >= 0 || fatalAt >= 0) return;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const speed = length / Math.max(.008, seconds);
    if (length < 5 || speed < Math.max(155, 230 * Math.min(1, W / 750))) return;
    const pointer = state.pointer;
    if (!pointer.swung) {
      pointer.swung = true;
      audio.playSwing({ heavy: currentWave.heavy });
    }
    const hits = state.targets.filter(target => target.alive && !pointer.hitTargets.has(target.id) &&
      lineHitsTarget(a.x, a.y, b.x, b.y, target));
    hits.sort((first, second) => (first.x - second.x) * dx + (first.y - second.y) * dy);
    hits.forEach((target, i) => hitTarget(target, dx, dy, speed, i * 43, hits.length));
    if (hits.length) {
      updateHUD();
      if (state.targets.every(target => !target.alive)) {
        state.waves++;
        state.nextWaveAt = state.time + (currentWave.heavy ? .45 : .31);
        if (!course.timedLoop && state.waves === waves.length) {
          timeLeftAtClear = Math.max(0, deadline - performance.now());
        }
      }
      if (!course.timedLoop && state.durability <= 0 && timeLeftAtClear === null) fatalAt = state.time + .4;
    }
  }

  function beginStroke(point, pointerId) {
    Object.assign(state.pointer, {
      down: true, id: pointerId, points: [point], x: point.x, y: point.y, kills: 0, swung: false,
    });
    state.pointer.hitTargets.clear();
  }

  function endStroke() {
    const pointer = state.pointer;
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.points.length > 1) state.trails.push({ points: pointer.points });
    // The chain rewards actual kills within 1.3 s, including across successive swipes.
    // Passing over an already-damaged heavy target alone does not count as a combo.
    if (pointer.swung && pointer.hitTargets.size === 0) {
      state.comboChain = 0;
      clearTimeout(comboTimer);
      ui.combo.textContent = '—';
    }
    if (pointer.kills >= 2) {
      showVerdict(pointer.kills >= 3 ? '一气呵成' : '双靶齐断', 'combo');
    } else if (pointer.kills === 1 && state.comboChain >= 4) {
      showVerdict('漂亮连斩', 'combo');
    }
  }

  function pointFor(event, rect) {
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp };
  }

  function canStrike() {
    const now = performance.now();
    return state.screen === 'playing' && now >= readyUntil && now < deadline;
  }

  function pointerDown(event) {
    if (!canStrike() || state.pointer.down || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    // iOS Safari requires a user-gesture AudioContext unlock. Preload alone is insufficient.
    void audio.unlock();
    beginStroke(pointFor(event, canvas.getBoundingClientRect()), event.pointerId);
  }

  function pointerMove(event) {
    const pointer = state.pointer;
    if (!pointer.down || pointer.id !== event.pointerId || !canStrike()) return;
    event.preventDefault();
    const points = event.getCoalescedEvents?.();
    const rect = canvas.getBoundingClientRect();
    for (const sample of points?.length ? points : [event]) {
      const next = pointFor(sample, rect), prev = pointer.points.at(-1);
      strokeSegment(prev, next, Math.max(.008, (next.t - prev.t) / 1000));
      pointer.points.push(next);
      if (pointer.points.length > 18) pointer.points.shift();
      pointer.x = next.x; pointer.y = next.y;
    }
  }

  function pointerUp(event) {
    if (state.pointer.id !== event.pointerId) return;
    if (event.type === 'pointerup') pointerMove(event);
    endStroke();
  }

  function keyboardStrike(event) {
    if (!canStrike() || event.repeat || state.pointer.down) return;
    const row = event.code === 'Space';
    const target = row ? state.targets.find(item => item.alive) : state.targets[Number(event.key) - 1];
    if (!target?.alive) return;
    event.preventDefault();
    const t = performance.now(), y = target.y;
    const a = { x: row ? 0 : target.x - 42 * target.scale, y, t };
    const b = { x: row ? W : target.x + 42 * target.scale, y, t };
    beginStroke(a, null);
    strokeSegment(a, b, Math.abs(b.x - a.x) / 760);
    state.pointer.points.push(b);
    endStroke();
  }

  function applyCameraKick(dx,dy,phase,heavy=false){
    if(!state.feel||state.reducedMotion)return;
    const mag=Math.max(1,Math.hypot(dx,dy));
    const power=(phase==='break'?210:phase==='fracture'?130:71)*(heavy?1.3:1);
    state.shakeVX+=clamp(dx/mag*power*state.intensity,-270,270);
    state.shakeVY+=clamp(dy/mag*power*state.intensity,-270,270);
    state.shakeVX=clamp(state.shakeVX,-370,370);state.shakeVY=clamp(state.shakeVY,-370,370);
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
  function cutBurstSpec(key){
    return {
      card:{count:1.1,force:1.0,extra:'paper'}, rope:{count:1.15,force:1.0,extra:'fibers'}, bamboo:{count:1.1,force:1.04,extra:'splinters'},
      pineapple:{count:1.16,force:1.05,extra:'juice'}, gel:{count:1.12,force:1.02,extra:'gel'}, wood:{count:1.08,force:1.07,extra:'splinters'},
      ice:{count:1.18,force:1.1,extra:'shards'}, steel:{count:1.22,force:1.15,extra:'sparks'}, shield:{count:1.22,force:1.15,extra:'sparks'}
    }[key]||{count:1,force:1,extra:null};
  }
  function burst(x,y,m,n,force=1){
    if(!state.feel)return;
    const spec=cutBurstSpec(m.sound==='metal'?'steel':(m.sound==='shield'?'shield':Object.keys(MATERIALS).find(k=>MATERIALS[k]===m)||''));
    const count=Math.floor(n*spec.count*(.35+state.intensity*.85)*(state.reducedMotion?.5:1));
    const max=220;
    for(let i=0;i<count && state.particles.length<max;i++){
      const angle=rand(-Math.PI*.96,Math.PI*.18),speed=rand(70,290)*force*spec.force;
      const p=m.particles;
      const type=(Math.random()<.72?p:spec.extra)||p;
      const accent=Math.random();
      let color=Math.random()<.38?m.glint:m.color;
      if(type==='sparks'&&accent>.62)color=m.sound==='shield'?'#dceaf3':'#ffeac4';
      if(type==='gel'&&accent>.5)color='rgba(241,161,209,.83)';
      if(type==='juice'&&accent>.55)color='#ffe98c';
      state.particles.push({x,y,vx:Math.cos(angle)*speed+rand(-55,55),vy:Math.sin(angle)*speed-rand(10,50),
        life:rand(.32,.9),maxLife:0,size:rand(type==='sparks'?1:type==='shards'?2.4:type==='fibers'?2.5:2.2,type==='shards'?8:type==='gel'?6.5:5.5),
        color,type,rotation:rand(0,TAU),spin:rand(-13,13)});
      state.particles[state.particles.length-1].maxLife=state.particles[state.particles.length-1].life;
    }
  }
  function addSlash(x, y, dx, dy, m, heavy, force = 1) {
    if (!state.feel) return;
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
  // Segment-vs-visible-art hitbox, unlike the old fixed circle which could miss tall targets
  // and falsely hit a wide empty halo. Uses the real transparent sprite alpha bounds.
  function lineHitsTarget(ax,ay,bx,by,t){
    const b=ART_BOUNDS[t.key]; if(!b)return false;
    const margin=Math.max(3.0,5*t.scale);
    const x0=t.x+(b[0]*.5-100)*t.scale-margin;
    const y0=t.y+(b[1]*.5-116)*t.scale-margin;
    const x1=t.x+(b[2]*.5-100)*t.scale+margin;
    const y1=t.y+(b[3]*.5-116)*t.scale+margin;
    const dx=bx-ax,dy=by-ay;
    let minT=0,maxT=1;
    for(const [p,q] of [[-dx,ax-x0],[dx,x1-ax],[-dy,ay-y0],[dy,y1-ay]]){
      if(Math.abs(p)<1e-8){if(q<0)return false;continue;}
      const r=q/p;
      if(p<0){if(r>maxT)return false;minT=Math.max(minT,r);}
      else {if(r<minT)return false;maxT=Math.min(maxT,r);}
    }
    if (minT > maxT) return false;
    // First intersect the coarse visible-art bounds; then test actual opacity.
    // A missing/unreadable sprite deliberately preserves the old forgiving hitbox.
    const length = Math.hypot(dx, dy) * (maxT - minT);
    const samples = Math.min(70, Math.max(2, Math.ceil(length / 4)));
    for (let i = 0; i <= samples; i++) {
      const ratio = minT + (maxT - minT) * i / samples;
      const px = (ax + dx * ratio - t.x) / (200 * t.scale) + .5;
      const py = (ay + dy * ratio - t.y) / (232 * t.scale) + .5;
      const inside = targetAlphaAt(t.key, px, py);
      if (inside === null || inside) return true;
    }
    return false;
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
    // One-time high-DPI paint. The arena should feel like a lit object studio,
    // with the targets as the visual focal point—not a busy wireframe floor.
    const buffer = document.createElement('canvas');
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const c = buffer.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = grad(c, 0, 0, 0, H, [
      [0, '#0f1829'], [.52, '#1a3048'], [1, '#0e192a'],
    ]);
    c.fillRect(0, 0, W, H);
    const halo = c.createRadialGradient(W * .49, H * .43, 5,
      W * .49, H * .43, Math.max(W * .8, H * .54));
    halo.addColorStop(0, 'rgba(101,186,189,.28)');
    halo.addColorStop(.36, 'rgba(66,130,158,.14)');
    halo.addColorStop(1, 'rgba(9,28,49,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, W, H);
    const warm = c.createRadialGradient(W * .83, H * .20, 0,
      W * .83, H * .20, W * .74);
    warm.addColorStop(0, 'rgba(232,172,119,.095)');
    warm.addColorStop(1, 'rgba(232,172,119,0)');
    c.fillStyle = warm;
    c.fillRect(0, 0, W, H);

    // Frosted panel edges, a subtle top light bar, and two vertical stage seams.
    c.strokeStyle = 'rgba(199,228,236,.08)';
    c.lineWidth = 1;
    for (const x of [W * .085, W * .915]) {
      c.beginPath();
      c.moveTo(x, H * .24);
      c.lineTo(x, H * .76);
      c.stroke();
    }
    c.fillStyle = grad(c, W * .18, 0, W * .82, 0, [
      [0, 'rgba(154,224,215,0)'], [.5, 'rgba(177,228,227,.24)'],
      [1, 'rgba(154,224,215,0)'],
    ]);
    c.fillRect(W * .18, 1, W * .64, 2);
    c.beginPath();
    c.ellipse(W * .5, H * .34, W * .34, H * .25, 0, Math.PI * 1.07, Math.PI * 1.93);
    c.strokeStyle = 'rgba(200,228,239,.075)';
    c.stroke();

    // Floating display dais: layered beveled rings with gentle reflected light.
    const py = H * .745;
    const rx = Math.min(W * .415, 325), ry = Math.min(H * .079, 62);
    const under = c.createRadialGradient(W * .5, py + ry * .7, 0,
      W * .5, py + ry * .7, rx * 1.35);
    under.addColorStop(0, 'rgba(4,12,24,.62)');
    under.addColorStop(1, 'rgba(4,12,24,0)');
    c.fillStyle = under;
    c.beginPath(); c.ellipse(W * .5, py + 10, rx * 1.31, ry * 1.65, 0, 0, TAU); c.fill();

    c.beginPath(); c.ellipse(W * .5, py + 12, rx, ry, 0, 0, TAU);
    c.fillStyle = '#0b1422'; c.fill();
    c.strokeStyle = 'rgba(4,11,20,.7)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.ellipse(W * .5, py + 3, rx, ry, 0, 0, TAU);
    c.fillStyle = grad(c, 0, py - ry, 0, py + ry, [
      [0, '#263e52'], [.36, '#1c3146'], [1, '#162537'],
    ]); c.fill();
    c.strokeStyle = 'rgba(158,204,210,.28)'; c.lineWidth = 1.25; c.stroke();
    c.beginPath(); c.ellipse(W * .5, py, rx * .79, ry * .68, 0, 0, TAU);
    c.strokeStyle = 'rgba(185,223,224,.10)'; c.lineWidth = 1; c.stroke();
    // Two clean cinematic highlights on the forward rim.
    c.beginPath();
    c.ellipse(W * .5, py + 3, rx, ry, 0, .09 * Math.PI, .91 * Math.PI);
    c.strokeStyle = 'rgba(119,207,203,.32)'; c.lineWidth = 1.7; c.stroke();
    c.beginPath();
    c.ellipse(W * .5, py + 3, rx, ry, 0, 1.18 * Math.PI, 1.69 * Math.PI);
    c.strokeStyle = 'rgba(239,191,140,.24)'; c.lineWidth = 1.2; c.stroke();
    // A fine separator communicates depth without dated perspective-grid lines.
    c.fillStyle = grad(c, 0, py + ry * 1.5, W, py + ry * 1.5, [
      [0, 'rgba(120,167,192,0)'], [.5, 'rgba(120,167,192,.13)'],
      [1, 'rgba(120,167,192,0)'],
    ]);
    c.fillRect(0, py + ry * 1.5, W, 1);
    return buffer;
  }
  function renderBackground() {
    if (!backdrop) backdrop = makeBackdrop();
    ctx.drawImage(backdrop, 0, 0, W, H);
    const t = state.time;
    // Very few slow drifting dust motes, always behind the target art.
    for (let i = 0; i < ambientDots.length; i++) {
      const p = ambientDots[i], a = .05 + .11 * (1 + Math.sin(t * p.s + p.phase)) * .5;
      ctx.fillStyle = 'rgba(208,235,235,' + a + ')';
      ctx.fillRect(p.x + Math.sin(t * .12 + p.phase) * 3,
        p.y + Math.cos(t * .18 + p.phase) * 5, p.r * .65, p.r * .65);
    }
    ctx.fillStyle = 'rgba(134,230,214,' + (.016 + .008 * Math.sin(t * .82)) + ')';
    ctx.beginPath();
    ctx.ellipse(W * .5, H * .745, Math.min(W * .3, 260),
      Math.min(H * .055, 48), 0, 0, TAU);
    ctx.fill();
  }
  function shadowForTarget(t){
    /* 阴影必须落在精灵脚底，否则会浮在下方 30px 处，目标看上去悬空。 */
    const x=t.x,y=t.y+112*t.scale;const sx=t.heavy?100:66;
    const g=ctx.createRadialGradient(x,y,0,x,y,sx*t.scale);
    g.addColorStop(0, shadow);g.addColorStop(1, shadow.slice(0, 7) + '00');
    ctx.save();ctx.fillStyle=g;ctx.translate(x,y);ctx.scale(1,.26);ctx.beginPath();ctx.arc(0,0,sx*t.scale,0,TAU);ctx.fill();ctx.restore();
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
      const s=t.strikes[i];c.save();c.rotate(s.angle);c.translate(0,s.offset*.62);
      const fresh=clamp(1-(age-s.time)*2.6,0,1);
      const length=48+progress*30;
      // Width grows on successive strikes: visual cut depth is not just an HP bar.
      c.beginPath();c.moveTo(-length,0);c.quadraticCurveTo(-12,2.8,length,0);
      c.strokeStyle=t.key==='ice'?'#2e9bbcb5':(t.key==='steel'||t.key==='shield')?'#25313fef':t.key==='gel'?'#427c8bd8':'#24180ed9';
      c.lineCap='round';c.lineWidth=(t.key==='steel'||t.key==='shield')?Math.max(1.5,base*.53):base*.85;c.stroke();
      c.translate(0,-base*.43);c.strokeStyle=t.key==='ice'?'#e4ffffd9':(t.key==='steel'||t.key==='shield')?'#e3e3f5b1':t.key==='gel'?'#cdeff5ad':'#f0bc8199';
      c.lineWidth=Math.max(.8,base*.21);c.stroke();
      if(fresh>.01&&state.feel){c.strokeStyle=`rgba(253,255,233,${fresh*.52})`;c.lineWidth=1.6;c.stroke();}
      c.restore();
    }
    if(t.heavy&&progress>.33&&t.key!=='gel'){
      c.save();c.globalAlpha=clamp((progress-.32)*.9,0,.49);
      c.strokeStyle=t.key==='ice'?'#e7ffff':(t.key==='steel'||t.key==='shield')?'#e1e5f3':'#f3c38b';
      c.lineWidth=2+progress*2;c.beginPath();c.moveTo(-30,0);c.lineTo(4,progress*15);c.lineTo(31,progress*29);c.stroke();c.restore();
    }
  }
  function drawTarget(t){
    const c=ctx;
    const recoilEase=state.feel?t.recoil:0;
    const bob=state.reducedMotion?0:Math.sin(state.time*1.35+t.phase)*3*t.scale;
    c.save();c.translate(t.x+(t.impulseX*recoilEase),t.y+bob+(t.impulseY*recoilEase));
    c.rotate(t.tilt*recoilEase);
    // Springy restitution: impact compresses then rebounds before settling.
    const spring=Math.sin(Math.min(t.recoilTime*23,Math.PI*1.55))*Math.exp(-t.recoilTime*9);
    const squash=1-recoilEase*.035-Math.max(0,spring)*.060;
    c.scale(t.scale*(1+recoilEase*.032+Math.max(0,spring)*.085),t.scale*squash);
    c.globalAlpha=clamp((state.time-t.spawnT)*5.5,0,1);
    // Resolve upgraded art every frame: never pin a small/late-loading sprite on first impact.
    const sprite = targetSprite(t.key) || t.sprite;
    drawTargetArt(t, sprite);
    drawCracks(t);drawHits(t);
    if(state.feel&&t.hitGlow>.01){
      c.save();c.globalCompositeOperation='screen';c.globalAlpha=t.hitGlow*.28;
      c.filter='brightness(1.45) saturate(.75)'; if(sprite) c.drawImage(sprite,-100,-116,200,232);c.restore();
    }
    c.restore();
    // Centered nameplate, integrated with 3D target. Heavy mode also has segmented HP bar.
    const tagY=t.y+108*t.scale;
    c.textAlign='center';c.font=`650 ${clamp(11*unit,10,14)}px system-ui`;
    if(!t.heavy){c.fillStyle=label;c.fillText(t.m.name,t.x,tagY);}
    if(!t.heavy && t.strikes.length){
      const penetration=Math.round(t.cutDepth*100);
      c.font=`650 ${clamp(9*unit,9,11)}px system-ui`;
      c.fillStyle=state.time<t.statusUntil?positive:mutedLabel;
      c.fillText((state.time<t.statusUntil?t.statusText+' · ':'切深 ')+penetration+'%',t.x,tagY+31*unit);
    }
    if(t.heavy){
      const bw=Math.min(W*.44,180*unit),h=Math.max(4,5*unit),py=tagY+5*unit;
      c.fillStyle=grid;roundRect(c,t.x-bw/2,py,bw,h,h/2);c.fill();
      const p=clamp(t.hp/t.maxHp,0,1);
      if(p>0){c.fillStyle=p<.25?'#d38964':positive;roundRect(c,t.x-bw/2,py,bw*p,h,h/2);c.fill();}
      c.fillStyle=mutedLabel;c.font=`600 ${clamp(9*unit,9,11)}px system-ui`;c.fillText(state.time<t.statusUntil ? t.statusText+' · '+Math.round((1-p)*100)+'% 切深' : Math.round(p*100)+'% 结构完整度',t.x,py+19*unit);
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

  function drawPiece(p){
    const t=p.target,age=p.life;
    ctx.save();ctx.globalAlpha=clamp(Math.min(age*5,1),0,1);
    ctx.translate(p.x,p.y);ctx.rotate(p.spin*(p.maxLife-age)*.60);
    ctx.scale(p.scale,p.scale);
    const d=p.side,ang=p.angle,ux=Math.cos(ang),uy=Math.sin(ang),nx=-uy,ny=ux;
    const face=cutFaceStyle(t.key),faceW=face.w;
    ctx.save();ctx.beginPath();
    const ax=-ux*200,ay=-uy*200,bx=ux*200,by=uy*200;
    ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(bx+nx*d*300,by+ny*d*300);ctx.lineTo(ax+nx*d*300,ay+ny*d*300);ctx.closePath();ctx.clip();
    drawTargetArt(t, targetSprite(t.key) || t.sprite);ctx.restore();
    // Subtle exposed material lip: follows the visible cut width, never draws
    // the oversized rectangular bars that previously floated beyond the target.
    const lip=Math.min(49,Math.max(25,(ART_BOUNDS[t.key][2]-ART_BOUNDS[t.key][0])*.15));
    ctx.save();
    ctx.globalAlpha=clamp(age*.92,0,.93);
    ctx.lineCap='round';
    ctx.strokeStyle=face.fill;
    ctx.lineWidth=Math.max(1.8,faceW*.75);
    ctx.beginPath();ctx.moveTo(-ux*lip+nx*d*.6,-uy*lip+ny*d*.6);
    ctx.lineTo(ux*lip+nx*d*.6,uy*lip+ny*d*.6);ctx.stroke();
    ctx.strokeStyle=face.edge;ctx.globalAlpha=clamp(age*.6,0,.68);
    ctx.lineWidth=Math.max(.85,faceW*.24);
    ctx.beginPath();ctx.moveTo(-ux*lip+nx*d*1.8,-uy*lip+ny*d*1.8);
    ctx.lineTo(ux*lip+nx*d*1.8,uy*lip+ny*d*1.8);ctx.stroke();
    ctx.restore();
    ctx.beginPath();ctx.moveTo(-ux*lip,-uy*lip);ctx.lineTo(ux*lip,uy*lip);ctx.strokeStyle=t.m.glint;ctx.lineWidth=2.2;ctx.globalAlpha=clamp(age*.75,0,.7);ctx.stroke();ctx.restore();
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
    if(!state.feel)return;
    for(const ring of state.rings){
      const k=1-ring.life/ring.maxLife,r=ring.r+120*unit*k*ring.scale;
      ctx.save();ctx.globalAlpha=(1-k)*.19;ctx.strokeStyle=ring.color;ctx.lineWidth=(3-k*2)*unit;
      ctx.beginPath();ctx.arc(ring.x,ring.y,r,0,TAU);ctx.stroke();ctx.restore();
    }
  }
  // A restrained bright impact bloom behind the material particles.
  // A single glow plus two intersecting strokes reads as a solid contact, not fireworks.
  function renderImpacts() {
    if (!state.feel) return;
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
    if (!state.feel) return;
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
      ctx.shadowBlur = state.feel ? 15 * unit : 3;
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
  function renderCrosshair(){
    // Quiet targeting guide fades underneath actual objects; never obscures blade path.
    const r=Math.min(120*unit,W*.24),x=W/2,y=H*.50;
    ctx.save();ctx.strokeStyle='#a2ecef12';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();ctx.restore();
  }
  function render(){
    ctx.setTransform(DPR,0,0,DPR,0,0);
    renderBackground();
    if(state.screen!=='playing'&&state.screen!=='paused')return;
    ctx.save();
    if(state.feel&&(Math.abs(state.shakeX)+Math.abs(state.shakeY)>.06)){ctx.translate(state.shakeX,state.shakeY);}
    renderCrosshair();
    for(const t of state.targets)if(t.alive)shadowForTarget(t);
    for(const p of state.pieces)drawPiece(p);
    for(const t of state.targets)if(t.alive)drawTarget(t);
    renderImpacts();renderRings();renderParticles();renderSlashes();renderTrail();
    ctx.restore();
    if(state.feel&&state.flash>.003){
      ctx.fillStyle=`rgba(237,252,250,${state.flash*.30})`;ctx.fillRect(0,0,W,H);
    }
  }
  function update(realDt){
    const seconds=clamp(realDt,0,.05);
    if(state.screen!=='playing')return;
    state.hitstop=Math.max(0,state.hitstop-seconds*1000);
    const frozen=state.feel&&state.hitstop>0;
    const slow=state.feel&&state.slowRemaining>0;
    if(!frozen)state.slowRemaining=Math.max(0,state.slowRemaining-seconds*1000);
    const dt=frozen?0:seconds*(slow?FEEL.slowScale:1);
    state.time+=dt;
    const soften=state.reducedMotion?.36:1;
    state.flash=Math.max(0,state.flash-seconds*2.6);
    // Directional spring camera reaction, no full-screen random jitter.
    const damp=Math.exp(-29*seconds);
    state.shakeVX=(state.shakeVX-state.shakeX*420*seconds)*damp;
    state.shakeVY=(state.shakeVY-state.shakeY*420*seconds)*damp;
    state.shakeX=clamp(state.shakeX+state.shakeVX*seconds,-7,7)*soften;
    state.shakeY=clamp(state.shakeY+state.shakeVY*seconds,-7,7)*soften;
    for(const t of state.targets){
      t.recoil=Math.max(0,t.recoil-seconds*7);t.recoilTime+=seconds;
      t.hitGlow=Math.max(0,t.hitGlow-seconds*7.8);
      t.tilt*=Math.max(0,1-seconds*5);
    }
    // Animating effects using real time makes the hit-stop perceptible without input freezing.
    for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.life-=seconds;
      if(p.life<=0){state.particles.splice(i,1);continue;}p.x+=p.vx*seconds;p.y+=p.vy*seconds;p.vy+=330*seconds;p.vx*=.985;p.rotation+=p.spin*seconds;
    }
    for(let i=state.pieces.length-1;i>=0;i--){const p=state.pieces[i];p.life-=seconds;
      if(p.life<=0){state.pieces.splice(i,1);continue;}p.x+=p.vx*seconds;p.y+=p.vy*seconds;
      p.vy+=540*seconds;p.vx*=Math.exp(-1.45*seconds);
    }
    for(let i=state.rings.length-1;i>=0;i--){state.rings[i].life-=seconds;if(state.rings[i].life<=0)state.rings.splice(i,1);}
    for(let i=state.slashes.length-1;i>=0;i--){state.slashes[i].life-=seconds;if(state.slashes[i].life<=0)state.slashes.splice(i,1);}
    for(let i=state.impacts.length-1;i>=0;i--){state.impacts[i].life-=seconds;if(state.impacts[i].life<=0)state.impacts.splice(i,1);}
    const now=performance.now();for(let i=state.trails.length-1;i>=0;i--){if(now-state.trails[i].points.at(-1).t>180)state.trails.splice(i,1);}
  }

  function tick(now) {
    const dt = clamp((now - lastTick) / 1000, 0, .05);
    lastTick = now;
    update(dt);
    updateClock(now);
    render();
    if (now >= deadline) return finish('time', now);
    if (fatalAt >= 0 && state.time >= fatalAt) return finish('wear', now);
    if (state.nextWaveAt >= 0 && state.time >= state.nextWaveAt) {
      endStroke();
      if (timeLeftAtClear !== null) return finish('clear', now);
      spawnWave();
    }
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
      clearTimeout(comboTimer);
      clearTimeout(readyTimer);
      audio.setEnabled(false);
    },
  };
}
