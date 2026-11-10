/** V3 共用切割引擎：45 秒、三次强化、事件补位。永久成刀与局内刀况分离。 */
/**
 * 核心玩法层 · 2D 切割赛事单局
 * 所有随机序列状态可 JSON 往返；快速挑战绝不断刀。
 * 正式测试只输出失效证据，由赛事结算转移收藏，不改永久锻造属性。
 */
import { emit, EVENTS } from '../platform/bus.js';
import { deriveCutParams } from './cutParams.js';
import { adaptBlade } from './bladeAdapter.js';
import { applyForgeCutTraits } from './forgeTraitCuts.js';
import { createEncounter, selectEncounterMaterial, phaseQuota, stageSpawnInterval } from './arenaEncounters.js';
import { createStructure, updateStructure, structureScore, structureSnapshot } from './arenaStructures.js';

import { ARENA_V3, ARENA_MATERIALS, ARENA_STAT_CEILING, arenaStat } from '../data/balance.js';
import { rollBuffChoices, resonanceOf, BUFF_BY_ID } from '../data/arena/buffs.js';

// 待定参数不是 0%：未批准曲线前，不执行猜测性的随机销毁。
export const FORMAL_RISK_TBD = Object.freeze({
  probabilityCurve: null, // TBD：负荷、结构能力、受力结果、累积损伤 → 概率
  crossTestDamage: null, // TBD：跨项目受损延续
  withdrawalPolicy: null, // TBD：极限测试收手细则
});
export const CHALLENGE_SECONDS = ARENA_V3.seconds;


export const MATERIALS = ARENA_MATERIALS;
// Same six successive test specimens for every collection blade. Never draws from gameplay RNG.
export const SAMPLE_MATERIALS=Object.freeze(['foam','rope','plastic','wood','ice','metal']);
export const ROUTES = Object.freeze([
  { id: 'soft', name: '连切路线', tag: '低风险 · 软靶阵列', types: ['rope', 'foam', 'rope'], bonus: 1.04 },
  { id: 'mixed', name: '穿透路线', tag: '中风险 · 绳束夹板', types: ['rope', 'plastic', 'rope'], bonus: 1.18 },
  { id: 'hard', name: '硬核路线', tag: '高分 · 强度挑战', types: ['wood', 'plastic', 'metal'], bonus: 1.30 },
]);
export const FINALES = Object.freeze([
  { id: 'safe', name: '稳健收分', tag: '连续切割 · 低刀损', types: ['rope', 'foam', 'wood'], bonus: 1.20 },
  { id: 'rush', name: '高分冲刺', tag: '冰裂 + 金属 · 高刀损与退赛风险', types: ['ice', 'metal', 'plastic'], bonus: 1.70 },
]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));


const ARMOR_SCALE = 0.6;
const armorOf = (type) => Math.max(0, (Number(MATERIALS[type]?.armor) || 0) * ARMOR_SCALE);
const copy = (x) => JSON.parse(JSON.stringify(x));
const angleDiff = (a, b) => { let d = Math.abs((a - b) % Math.PI); return Math.min(d, Math.abs(Math.PI - d)); };
/** Mulberry32 step written into state: challenge saves survive JSON serialize/restore. */
function random(run) {
  run.rngState = (run.rngState + 0x6D2B79F5) >>> 0;
  let t = run.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 创建一局切割。
 *
 * 两种模式均为 45 秒、连续补位、三次强化。quick 保证收藏安全；formal 输出临时受损与失效证据。
 */
export function createChallenge(blade, { seed = null, daily = false, mode = 'quick', buffs = [], ghost = null, winStreak = 1, matchId = null, seconds = null, encounter = null, augments = true, styleId = null, targetScore = null } = {}) {
  if (!blade || blade.fractured || blade.canEnterArena === false) return { ok: false, reason: '只能使用完整成刀参加挑战' };
  if (!['quick', 'formal', 'sample'].includes(mode)) return { ok: false, reason: '未知测试模式' };

  const adaptation = adaptBlade(blade);
  const stats = Object.fromEntries(Object.entries(adaptation.permanentStats).map(([k,v])=>[k,arenaStat(v)]));
  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  const params = applyForgeCutTraits(deriveCutParams(stats, buffs), blade);
  params.adaptation = {
    version: adaptation.version,
    effectVersion: adaptation.effectVersion,
    bladeId: adaptation.bladeId,
    knifeTypeId: adaptation.knifeTypeId,
    knifeProfileLabel: adaptation.knifeProfileLabel,
    projectFactor: adaptation.projectFactor,
    effectSummary: adaptation.effectSummary,
  };
  const plan = encounter ? createEncounter({...encounter, styleId: styleId || encounter.styleId}) : null;
  const structure = mode === 'formal' && encounter?.structure === true
    ? createStructure(actualSeed, styleId || encounter.styleId || 'composite', encounter.gradient || encounter.round || 0)
    : null;
  // V4.1: forged blade traits are the build. Neither mode interrupts play for random augment offers.
  augments = false;
  const total = mode === 'quick' ? CHALLENGE_SECONDS : mode === 'sample' ? 12 : (seconds == null ? 70 : clamp(Number(seconds)||70,5,120));
  const run = {
    id: `C-${actualSeed.toString(36)}-${Date.now().toString(36)}`, seed: actualSeed, daily: !!daily, mode,
    blade: {
      id: adaptation.bladeId || blade.id,
      name: adaptation.bladeName || blade.bladeName || blade.name || blade.id,
      stats, score: Number(blade.score) || 0,
      /* ★ T01：刀型、适用特性与适配依据随局传递 —— 改造前这里全部丢失，
         于是「同六维换刀型/特性」在任何入口都看不出差异。 */
      knifeTypeId: adaptation.knifeTypeId,
      knifeProfileLabel: adaptation.knifeProfileLabel,
      projectFactor: { ...adaptation.projectFactor },
      effectSummary: adaptation.effectSummary.map((e) => ({ ...e })),
      effects: Object.fromEntries(Object.entries(blade.effects || {}).map(([k,v]) => [k, clamp(Number(v)||0,0,.5)])),
      // 局内抽取强化或重开需要重新计算临时参数：保留工艺来源，
      // 避免首次建局的刀技在第 0 秒选牌后被 deriveCutParams 覆盖丢失。
      tags: blade.tags && typeof blade.tags === 'object' && !Array.isArray(blade.tags) ? { ...blade.tags } : {},
      tagTiers: Array.isArray(blade.tagTiers) ? blade.tagTiers.map(t => ({ ...t })) : [],
      traits: Array.isArray(blade.traits) ? [...blade.traits] : [],
    },
    adaptation, buffs: [...buffs], params, ghost, matchId, winStreak,
    version: ARENA_V3.version, styleId: styleId || encounter?.styleId || 'composite', targetScore,
    augments, rulesVersion: 'arena-v4.1', choicesMade: 0, offers: [], resumePhase: 'warmup', resonances: resonanceOf(buffs),
    refillAt: null, targetSerial: 0, travel: 0, contacts: {},
    perfects: 0, weakHits: 0, armorBreaks: 0, crossCuts: 0, secondaryKills: 0, secondaryScore: 0,
    shield: 0, deathSaveUsed: false, objectives: 0, objectiveBonus: 0, materialSet: [],
    metrics: { emptySeconds: 0, activeSeconds: 0, refills: 0, emptyGap:0, maxEmptyGap:0 },
    encounter: plan, spawnStage: null, stageSpawned: 0, stagePrefill: 0,
    encounterHistory: plan ? Object.fromEntries(['warmup','route','speed','finale'].map(phase=>[
      phase,{spawned:0,materials:{}}])) : null,
    total, elapsed: 0, remaining: total, phase: 'warmup', paused: false, done: false, result: null,
    spawnMode: structure ? 'structure' : 'stream', structure,
    score: 0, kills: 0, combo: 0, maxCombo: 0, bestSwipe: 0, gestureKills: 0, misses: 0,
    health: params.healthMax, maxHealth: params.healthMax, damage: 0,
    fractureChecks: 0, riskStop: false, fractured: false, carry: [],
    route: null, finale: null, targets: [], wave: 0, nextWaveAt: 0, nextSpawnAt: 0, targetLife: 3.0, lastKillAt: -10,
    hitIds: [], typeCounts: {}, log: [], rngState: actualSeed || 1, guide: null,
    tripleCount: 0, frenzyUntil: -1, emergencyUsed: false,
    risk: { status: mode === 'formal' ? 'ready' : 'safe', chance: mode === 'formal' ? null : 0,
      message: mode === 'formal' ? '正式测试可能断刀；留意硬靶受力与累积受损' : '快速挑战完全安全，不会断刀',
      failure: null, lastContact: null },
  };
  if (run.spawnMode === 'structure') {
    run.targets = structure.parts;
    run.guide = null;
  } else if (run.spawnMode === 'stream') {
    /* 开场不空场：一进来就有 3 件可切，第一刀就有连击机会（原型 §5「几秒内感受到爽感」）。 */
    if (run.encounter) enterSpawnStage(run, 'warmup', 3);
    else run.nextSpawnAt = 0.22;
    spawnTarget(run); spawnTarget(run); spawnTarget(run);
  } else {
    spawnWave(run);
  }
  if (!structure) run.guide = makeGuide(run);
  if (augments) openAugmentChoice(run);
  return { ok: true, run };
}

/** 沿用重开入口，但正式测试内已发生的实际受损不被重开抹除；非跨项目政策。 */
export function restartChallenge(run) {
  if (!run || run.done || run.fractured) return { ok: false, reason: '已结束的测试不能重开' };
  if(run.mode==='formal')return {ok:false,reason:'正式赛事不能重开本轮，请继续或退出'};
  const created = createChallenge({...run.blade, stats:run.adaptation?.permanentStats || run.blade.stats}, { seed: run.seed, daily: run.daily, mode: run.mode || 'quick',
    buffs: run.mode==='formal' ? run.buffs || [] : [], ghost: run.ghost ?? null, winStreak: run.winStreak ?? 1, matchId: run.matchId ?? null, seconds: run.total, encounter: run.encounter, augments: run.augments, styleId: run.styleId, targetScore:run.targetScore });
  if (created.ok && run.mode === 'formal') {
    Object.assign(created.run, { health: run.health, damage: run.damage,
      fractureChecks: run.fractureChecks, risk: copy(run.risk),
      log: [...copy(run.log), { type: 'restart', health: run.health, damage: run.damage }, ...created.run.log] });
  }
  return created;
}

function activeTypes(run) {
  const n = run.wave + 1;
  if (run.phase === 'finale') {
    if (run.finale?.id === 'rush') return n % 2 ? ['ice', 'metal', 'plastic'] : ['wood', 'metal', 'ice'];
    return n % 2 ? ['rope', 'foam', 'wood'] : ['foam', 'rope', 'plastic'];
  }
  if (run.phase === 'route' || run.phase === 'speed') {
    if (run.phase === 'speed') return n % 2 ? ['rope', 'foam', 'wood'] : ['foam', 'plastic', 'rope'];
    if (run.route?.id === 'soft') return n % 2 ? ['foam', 'rope', 'foam'] : ['rope', 'foam', 'rope'];
    if (run.route?.id === 'hard') return n % 2 ? ['wood', 'plastic', 'metal'] : ['plastic', 'ice', 'wood'];
    return n % 2 ? ['rope', 'plastic', 'rope'] : ['foam', 'wood', 'rope'];
  }
  return n % 2 ? ['rope', 'foam', 'rope'] : ['foam', 'rope', 'foam'];
}
function waveLayout(run) {
  if (run.phase === 'finale' && run.finale?.id === 'rush') return (run.wave + 1) % 2 ? 'high' : 'cascade';
  if (run.phase === 'route' && run.route?.id === 'hard') return (run.wave + 1) % 2 ? 'high' : 'cascade';
  if (run.phase === 'route' && run.route?.id === 'mixed') return (run.wave + 1) % 2 ? 'skip' : 'zigzag';
  if (run.phase === 'route' && run.route?.id === 'soft') return (run.wave + 1) % 2 ? 'zigzag' : 'flat';
  return (run.wave + 1) % 2 ? 'flat' : 'cascade';
}
const LAYOUT_Y = Object.freeze({ flat: [.52, .52, .52], cascade: [.42, .52, .62], zigzag: [.43, .60, .43], skip: [.52, .41, .60], high: [.41, .52, .41] });

function makeGuide(run) {
  const base = { done: false, reward: 0, title: '' };
  if (run.phase === 'warmup') return run.wave % 2 ? { ...base, title: '一划串联至少 2 个软靶', reward: 80, minGestureKills: 2 } : { ...base, title: '优先切开中路靶具', reward: 70, slots: [1] };
  if (run.phase === 'route') return { ...base, title: '优先突破中路材料', reward: run.route?.id === 'hard' ? 100 : 90, slots: [1] };
  if (run.phase === 'speed') return { ...base, title: '连续完成 2 斩，抢节奏', reward: 110, minCombo: 2 };
  if (run.phase === 'finale' && run.finale?.id === 'rush') return { ...base, title: '优先斩断冰块或金属', reward: 140, types: ['ice', 'metal'] };
  if (run.phase === 'finale') return { ...base, title: '完赛时模拟刀况保持 40% 以上', reward: 120, minHealth: 40 };
  return null;
}
function spawnWave(run) {
  if (!run || run.done || run.phase.endsWith('-choice')) return [];
  const carry = [...(run.carry || []), ...(run.targets || []).filter((t) => t.alive && t.progress > .025)];
  const types = activeTypes(run), oldBySlot = new Map(carry.map((t) => [t.slot, t]));
  const layout = waveLayout(run), ys = LAYOUT_Y[layout];
  run.carry = [];
  run.wave += 1;
  run.targets = types.map((type, slot) => {
    const old = oldBySlot.get(slot);
    if (old) { old.createdAt = run.elapsed; old.difficulty = 1; old.x = [.19,.5,.81][slot]; old.y = ys[slot]; old.layout = layout; return old; }
    return { id: `${run.wave}-${slot}`, type, slot, progress: 0, alive: true,
      x: [.19,.5,.81][slot], y: ys[slot], layout, cuts: [], lastAngle: null,
      createdAt: run.elapsed, difficulty: 1,
      /* ★ rework T07：破甲层初始值。软靶 armor=0 → 直接进入生命阶段；
         硬靶先要破甲，强度不足时硬靶会阻滞（这是强度专长刀的意义）。 */
      armorLeft: armorOf(type), layer: 0, variation: random(run) * .06 };
  });
  run.guide = makeGuide(run);
  run.nextWaveAt = run.elapsed + (run.phase === 'warmup' ? 4.2 : run.phase === 'finale' ? 6.2 : 5.5);
  run.hitIds = [];
  run.log.push({ type: 'wave', wave: run.wave, stage: run.phase, materials: run.targets.map((t) => t.type), carryCount: carry.length });
  return run.targets;
}
/* ── 连续投放（赛事模式）──────────────────────────────
 * 三靶一波会在清空后留下 4–6 秒空场（实测 81%），赛事改成逐件投放：
 *   密度随进度上升 → 提速段更密 → 压轴段最密；超时未切算「漏切」，断连击。
 */
const STREAM_ROWS = Object.freeze([0.34, 0.52, 0.70]);
const STREAM_COLS = Object.freeze([0.19, 0.50, 0.81]);
const STREAM_MAX_ALIVE = 6;
function enterSpawnStage(run,phase,prefill=0) {
  if (!run.encounter) return;
  run.spawnStage=phase; run.stageSpawned=0; run.stagePrefill=prefill;
  run.nextSpawnAt=run.elapsed+stageSpawnInterval(run.encounter,phase,prefill);
  run.log.push({type:'stage-plan',stage:phase,quota:phaseQuota(run.encounter,phase),
    maxAlive:run.encounter.maxAlive});
}

/** 投放间隔：0.70 → 0.50 渐密；提速段 0.48；压轴段 0.40（再乘 buff 的 intervalMult） */
function spawnInterval(run) {
  if (run.encounter) return stageSpawnInterval(run.encounter, run.spawnStage, run.stagePrefill);
  const t = run.elapsed;
  let base;
  if (run.phase === 'finale') base = 0.40;
  else if (run.phase === 'speed') base = 0.48;
  else if (t < 4) base = 0.70;
  else base = Math.max(0.50, 0.64 - (t - 4) * 0.006);
  return base * (run.params?.intervalMult || 1);
}

/** 投放一件：在 3×3 的挂架里随机挑一个空位 */
function spawnTarget(run) {
  if (!run || run.done || (run.mode==='sample'&&run.targetSerial>=SAMPLE_MATERIALS.length)) return null;
  const alive = run.targets.filter((t) => t.alive);
  if (alive.length >= (run.encounter?.maxAlive ?? STREAM_MAX_ALIVE)) return null;
  const taken = new Set(alive.map((t) => `${t.row}:${t.slot}`));
  const free = [];
  for (let r = 0; r < STREAM_ROWS.length; r++) {
    for (let c = 0; c < STREAM_COLS.length; c++) if (!taken.has(`${r}:${c}`)) free.push([r, c]);
  }
  if (!free.length) return null;
  /* 按「从左到右、从上到下」填格：随机撒点会让台面像贴纸，排着填才像在装架 */
  const patterns=['line','weakpoint','armor','fracture'];
  const formation={edge:'line',precise:'weakpoint',press:'armor',quench:'fracture'}[run.styleId]
    || patterns[Math.floor(run.targetSerial/3)%patterns.length];
  const preferred={line:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
    weakpoint:[[0,0],[1,1],[0,2],[2,0],[1,2],[2,1]],
    armor:[[1,0],[1,1],[1,2],[0,1],[0,0],[0,2]],
    fracture:[[1,1],[1,0],[0,1],[1,2],[2,1],[0,0]]}[formation];
  const [row, slot] = preferred.find(([r,c])=>!taken.has(`${r}:${c}`)) || free[0];
  const types = activeTypes(run);
  let type = run.encounter
    ? selectEncounterMaterial(run.encounter,run.spawnStage,run.route?.id,run.finale?.id,random(run))
    : types[Math.min(types.length - 1, Math.floor(random(run) * types.length))];
  if(alive.length>=2 && !alive.some(t=>MATERIALS[t.type].hard===0))type=random(run)<.5?'foam':'rope';
  if(run.encounter) {
    run.stageSpawned++;
    const history=run.encounterHistory?.[run.spawnStage];
    if(history) {history.spawned++;history.materials[type]=(history.materials[type]||0)+1;}
  }
  run.spawnCount = (run.spawnCount || 0) + 1;
  if (run.spawnCount % 5 === 0) run.wave += 1;   // 让 activeTypes 的奇偶轮换起来
  // One authored, clearly marked avoid opportunity in every 20 quick targets.
  // No hidden damage or score penalty: clipping it only breaks the combo.
  const serial=(run.targetSerial||0)+1;
  const avoid=run.mode==='quick' && serial%20===0 && run.elapsed>=8;
  if(avoid)type='metal';
  if(run.mode==='sample')type=SAMPLE_MATERIALS[serial-1];
  const target = {
    id: `target-${run.targetSerial=serial}`, type, slot, row,
    avoid,
    progress: 0, alive: true, x: STREAM_COLS[slot], y: STREAM_ROWS[row], layout: 'stream',
    cuts: [], lastAngle: null, createdAt: run.elapsed,
    difficulty: 1, stage: run.encounter ? run.spawnStage : run.phase,
    armorLeft: armorOf(type), layer: 0, variation: random(run) * .06,
    challengeSpecimen: run.mode === 'quick' && (type === 'metal' || run.targetSerial % 7 === 0),
    weakX: formation==='weakpoint' ? .018 : 0, weakY: formation==='weakpoint' ? -.018 : 0, markedUntil: run.params.marked && run.targetSerial % 5 === 0 ? run.elapsed + 3 : -1,
  };
  target.formation=formation;
  target.baseX=target.x;target.baseY=target.y;
  target.moving=(run.encounter?.rank || 0)>=3 && run.targetSerial%4===0;
  run.targets.push(target);
  if(run.metrics)run.metrics.emptyGap=0;
  if (run.targets.length > 24) run.targets = run.targets.filter((t) => t.alive).slice(-24);
  return target;
}

/** 超时未切 = 漏切：断连击、记一次 miss（靶具退回空架） */
function expireTargets(run) {
  if (run.spawnMode !== 'stream' || run.done) return;
  for (const t of run.targets) {
    if (!t.alive) continue;
    const baseLife = MATERIALS[t.type].life;
    const worked = t.progress > .05 || t.armorLeft < armorOf(t.type) - .02;
    const extension = worked ? Math.min(2, Math.max(0,(t.lastHitAt || 0) - (t.createdAt ?? 0)) * .3) : 0;
    if (run.elapsed - (t.createdAt ?? 0) < baseLife + extension) continue;
    if(t.avoid) {
      t.alive=false;run.avoidCleared=(run.avoidCleared||0)+1;
      run.log.push({type:'avoid-cleared',target:t.id,at:run.elapsed});
      scheduleRefill(run);continue;
    }
    t.alive = false; t.missed = true; scheduleRefill(run);
    run.misses = (run.misses || 0) + 1;
    if ((run.streak || 0) >= 2) run.log.push({ type: 'combo-break', at: run.elapsed, streak: run.streak, reason: 'miss' });
    run.streak = 0; run.combo = 0;
  }
}

function completeGuide(run, hit) {
  const g = run.guide;
  if (!g || g.done) return false;
  if (!((g.slots?.includes(hit.target.slot)) || (g.types?.includes(hit.target.type)) || (g.minCombo && run.combo >= g.minCombo) || (g.minGestureKills && run.gestureKills >= g.minGestureKills))) return false;
  g.done = true; run.objectives++; run.objectiveBonus = Math.min(.24, run.objectives * (run.params.objectiveMult || 0)); run.score += g.reward; run.log.push({ type: 'objective', title: g.title, reward: g.reward }); hit.objective = g.reward; return true;
}

/** V3 选择锁定在 0 / 15 / 30 秒；决策期间不推进时间、靶具与刀况。 */
function openAugmentChoice(run) {
  run.resumePhase = run.phase;
  run.phase = 'buff-choice';
  run.offers = rollBuffChoices(()=>random(run), run.buffs, 3);
  run.log.push({type:'augment-offer', at:run.elapsed, offers:[...run.offers]});
}
export function chooseAugment(run, id) {
  if (!run || run.done || run.phase !== 'buff-choice' || !run.offers.includes(id)) return {ok:false,reason:'强化不在本次候选中'};
  const oldMax=run.maxHealth;
  run.buffs.push(id);
  run.params=applyForgeCutTraits(deriveCutParams(run.blade.stats,run.buffs), run.blade);
  run.maxHealth=run.params.healthMax;
  run.health=clamp(run.health + run.maxHealth - oldMax, 0, run.maxHealth);
  run.resonances=resonanceOf(run.buffs);
  run.choicesMade++;
  run.offers=[];
  run.phase=run.resumePhase;
  run.log.push({type:'augment',id,at:run.elapsed,resonances:[...(run.resonances||[])]});
  // 开局孤注等改变刀况上限后仍至少留 1 点，不在选卡时意外结束比赛。
  run.health=Math.max(1,run.health);
  return {ok:true,buff:BUFF_BY_ID[id]};
}
function scheduleRefill(run) {
  if (run.refillAt == null) run.refillAt=run.elapsed+ARENA_V3.refillDelay;
}
export function tick(run, seconds) {
  if (!run || run.done || run.paused || run.phase.endsWith('-choice')) return run;
  ensureRuntime(run);
  let dt=clamp(Number(seconds)||0,0,.25);
  const nextChoice=run.augments && run.choicesMade<3 ? ARENA_V3.choices[run.choicesMade] : Infinity;
  dt=Math.max(0,Math.min(dt,nextChoice-run.elapsed,run.total-run.elapsed));
  run.metrics ||= {emptySeconds:0,activeSeconds:0,refills:0};
  run.metrics.activeSeconds+=dt;
  if (!run.targets.some(t=>t.alive)) {
    run.metrics.emptySeconds+=dt;
    run.metrics.emptyGap=(run.metrics.emptyGap || 0)+dt;
    run.metrics.maxEmptyGap=Math.max(run.metrics.maxEmptyGap || 0,run.metrics.emptyGap);
  } else run.metrics.emptyGap=0;
  run.elapsed+=dt; run.remaining=Math.max(0,run.total-run.elapsed);
  if(run.elapsed>=run.total-1e-7) return finish(run);
  // Formal assemblies persist every cut and connection until destroyed or timed out.
  if (run.spawnMode === 'structure') return run;
  const phase=run.elapsed>=30?'finale':run.elapsed>=23?'speed':run.elapsed>=8?'route':'warmup';
  if(run.phase!==phase) {
    run.phase=phase;
    if(phase==='route') run.route={...ROUTES[1]};
    if(phase==='finale') run.finale={...FINALES[run.encounter?.rank>=5?1:0]};
    if(run.encounter) enterSpawnStage(run,phase,0);
    run.guide=makeGuide(run);
  }
  if(run.elapsed>=nextChoice-1e-7) {openAugmentChoice(run);return run;}
  for(const t of run.targets) if(t.alive && t.moving) {
    t.x=t.baseX+Math.sin((run.elapsed-t.createdAt)*1.8)*.045;
    t.y=t.baseY+Math.sin((run.elapsed-t.createdAt)*1.3)*.025;
  }
  expireTargets(run);
  // 补位不消耗固定配额：配额仅控制自然投放节奏，高手不能切光整段预算后等靶。
  if(run.refillAt!=null && run.elapsed>=run.refillAt) {
    const wanted=Math.min(run.encounter?.maxAlive || 5,5);
    while(run.targets.filter(t=>t.alive).length<wanted) {
      if(!spawnTarget(run))break;
      run.metrics.refills++;
    }
    run.refillAt=null;
  }
  if(run.elapsed>=run.nextSpawnAt) {
    spawnTarget(run);
    run.nextSpawnAt=run.elapsed+Math.min(.75,spawnInterval(run));
  }
  if(run.targets.filter(t=>t.alive).length<ARENA_V3.minAlive) scheduleRefill(run);
  return run;
}
export function chooseRoute(run, id) {
  if (!run || run.done || run.phase !== 'route-choice') return { ok: false, reason: '当前没有路线选择' };
  const choice = ROUTES.find((x) => x.id === id); if (!choice) return { ok: false, reason: '路线不存在' };
  run.route = { ...choice }; run.phase = 'route'; run.log.push({ type: 'route', id });
  if (run.spawnMode === 'stream') {
    run.guide=makeGuide(run);
    if(run.encounter)enterSpawnStage(run,'route',2);
    spawnTarget(run); spawnTarget(run);
  }
  else { run.targets = []; spawnWave(run); }
  return { ok: true, route: run.route };
}
export function chooseFinale(run, id) {
  if (!run || run.done || run.phase !== 'finale-choice') return { ok: false, reason: '当前没有压轴选择' };
  const choice = FINALES.find((x) => x.id === id); if (!choice) return { ok: false, reason: '压轴路线不存在' };
  run.finale = { ...choice }; run.phase = 'finale'; run.log.push({ type: 'finale', id });
  if (run.spawnMode === 'stream') {
    run.guide=makeGuide(run);
    if(run.encounter)enterSpawnStage(run,'finale',2);
    spawnTarget(run); spawnTarget(run);
  }
  else { run.targets = []; spawnWave(run); }
  return { ok: true, finale: run.finale };
}
export function beginSwipe(run) { if (!run || run.done || run.paused) return false; run.bestSwipe = Math.max(run.bestSwipe, run.gestureKills || 0); run.hitIds = []; run.gestureKills = 0; run.waveTriggered=false; run.secondaryThisSwipe=0; return true; }
function distanceToSegment(px, py, a, b) { const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((px-a.x)*dx+(py-a.y)*dy)/Math.max(1e-8,dx*dx+dy*dy),0,1); return Math.hypot(px-a.x-t*dx,py-a.y-t*dy); }
function addWear(run, target, quality, stats) {
  // V4.1 quick is a full 45-second practice session; it cannot end early on wear.
  if (run.mode === 'quick') return 0;
  const P = run.params || {};
  const mat = MATERIALS[target.type];
  const hard = mat.hard;
  const maxHealth = run.maxHealth ?? 100;
  // 覆土烧刃：每局前 N 秒不扣刀况
  if (P.noWearUntil && run.elapsed < P.noWearUntil) return 0;
  const tough = P.tough ?? stats.toughness;
  const design = P.design ?? stats.design;
  const resistance = (P.wearRate || 7) / (run.blade.projectFactor?.durability?.value || 1);
  const shield = Math.min(run.shield || 0, hard > 0 ? 1 : 0);
  run.shield = Math.max(0, (run.shield || 0) - shield);
  let loss = hard === 0 ? .1 + Math.max(0,60-tough)*.003
    : resistance * (mat.damage / .72) * (1 + .15*(1-clamp(run.health/maxHealth,0,1))) * (P.wearHardMult ?? 1);
  if(hard>0 && quality==='ANGLE') loss += .7*(P.wearShiftMult ?? 1);
  if(run.resonances?.includes('risk') && run.health<maxHealth*.3) loss*=.9;
  loss=Math.max(0,loss-shield);
  if(run.health-loss<=0 && P.deathSave && !run.deathSaveUsed) {
    run.deathSaveUsed=true; run.health=loss+P.deathSave;
    run.log.push({type:'death-save',at:run.elapsed});
  }
  run.health = clamp(run.health - loss, 0, maxHealth);
  run.damage += loss;
  // 回火：每局一次，刀况掉到 30% 以下时立刻回一口
  if (P.emergencyHeal && !run.emergencyUsed && run.health > 0 && run.health < maxHealth * .3) {
    run.emergencyUsed = true;
    run.health = Math.min(maxHealth, run.health + P.emergencyHeal);
    run.log.push({ type: 'emergency-heal', at: run.elapsed, amount: P.emergencyHeal });
  }
  return loss;
}
function recordContact(run, target, quality, loss, power) {
  if (run.mode !== 'formal') return;
  const hard = MATERIALS[target.type].hard;
  const contact = { targetId: target.id, material: target.type, hardness: hard,
    load: hard * targetDifficulty(target), quality, penetration: power, complete: target.progress >= 1,
    capacity: { ...run.blade.stats }, loss, damage: run.damage, health: run.health,
    acceptedHighLoad: run.route?.id === 'hard' || run.finale?.id === 'rush' };
  // 沿用现有单局刀况耗尽边界；不是由失分、评级或锻造 Risk 推导断裂。
  const collapse = hard > 0 && run.health <= 0;
  run.risk = { status: collapse ? 'failed' : hard > 0 ? 'warning' : 'ready', chance: null,
    message: collapse ? '硬靶负荷下累积受损耗尽承载余量，结构失效，停止参赛'
      : hard > 0 ? `${quality === 'ANGLE' ? '受力偏斜' : target.progress < 1 ? '硬靶阻滞' : '硬靶冲击'} · 累积受损 ${run.damage.toFixed(1)}；继续承载有断刀风险（概率待定）`
      : `本项累积受损 ${run.damage.toFixed(1)}；留意后续硬靶负荷`,
    failure: collapse ? 'structural-collapse' : null, lastContact: contact };
  run.log.push({ type: 'contact', at: run.elapsed, ...copy(run.risk) });
  if (collapse) { run.fractured = true; run.riskStop = true; }
}

/** 结果标志不是失效证据；桥接与持久化使用同一校验，拒绝缺失/不一致的接触履历。
 * 这是本地结果一致性校验，不是面向恶意改存档的防作弊或真实性签名。
 */
export function hasStructuralFailure(performance) {
  if (performance?.mode !== 'formal' || performance?.fractured !== true) return false;
  const risk = performance.risk, contact = risk?.lastContact;
  if (risk?.status !== 'failed' || risk.failure !== 'structural-collapse'
    || !contact || contact.health !== 0 || !(contact.damage > 0)
    || !(contact.loss > 0) || !(contact.load > 0)) return false;
  const material = MATERIALS[contact.material];
  if (!material || material.hard <= 0 || contact.hardness !== material.hard) return false;
  if (!['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'].every(
    key => Number.isFinite(contact.capacity?.[key]) && contact.capacity[key] >= 0 && contact.capacity[key] <= ARENA_STAT_CEILING)) return false;
  const contacts = Array.isArray(performance.log) ? performance.log.filter(entry => entry.type === 'contact') : [];
  const last = contacts.at(-1);
  return !!last && last.status === risk.status && last.failure === risk.failure
    && last.message === risk.message && JSON.stringify(last.lastContact) === JSON.stringify(contact);
}

export function swipe(run, a, b, { duration = .12, angle = null } = {}) {
  if (!run || run.done || run.paused || run.phase.endsWith('-choice')) return { ok: false, hits: [] };
  ensureRuntime(run);
  const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy); if (dist < .008) return { ok: true, hits: [] };
  const P = run.params || {};
  const radius = P.radius ?? .095;
  const velocity=clamp(dist/Math.max(.018,Number(duration)||.12),.04,3.5), direction=angle == null ? Math.atan2(dy,dx) : angle, hits=[];
  run.travel=(run.travel || 0)+dist;
  run.contacts ||= {};
  const ordered = run.targets.filter((t) => {
    const last=run.contacts[t.id];
    // A target can only receive one primary contact per natural stroke; sampling rate is irrelevant.
    return t.alive && !run.hitIds.includes(t.id);
  }).map((t) => ({ t, d: distanceToSegment(t.x,t.y,a,b) })).filter((x) => x.d < radius).sort((x,y) => ((x.t.x-a.x)*dx+(x.t.y-a.y)*dy)-((y.t.x-a.x)*dx+(y.t.y-a.y)*dy));
  let secondaryBudget=Math.max(0,ARENA_V3.secondaryLimit-(run.secondaryThisSwipe||0));
  const frenzy = run.elapsed < (run.frenzyUntil ?? -1);
  for (const {t,d} of ordered) {
    if(!t.alive)continue;
    if(!run.hitIds.includes(t.id))run.hitIds.push(t.id);
    run.contacts[t.id]={at:run.elapsed,travel:run.travel}; t.lastHitAt=run.elapsed;
    if(t.avoid) {
      t.alive=false;run.avoidHits=(run.avoidHits||0)+1;
      run.streak=0;run.combo=0;run.gestureKills=0;
      run.log.push({type:'avoid-hit',target:t.id,at:run.elapsed});
      scheduleRefill(run);
      hits.push({target:t,complete:false,points:0,quality:'MISS',
        contactEvent:'avoid-hit',combo:0});
      continue;
    }
    run.primaryContacts=(run.primaryContacts||0)+1;
    /* 「一刀必破」标记：每次接触独立重置，不能跨目标/跨手势泄漏 */
    let guaranteedBreak = false;
    const mat=MATERIALS[t.type],stats=run.blade.stats;
    // 指针分段会先接触刃长范围的前缘；质量按刀路横向偏差计算，避免帧率改变精准与切入。
    const lineDistance=(x,y)=>Math.abs(dx*(y-a.y)-dy*(x-a.x))/dist;
    const accuracy=clamp(1-lineDistance(t.x,t.y)/.12,.25,1);
    const tol = (P.tolerance ?? (.275+stats.design*.0028+stats.craft*.00075)) * (run.blade.projectFactor?.precision?.value || 1);
    const perfectTol = tol * (P.perfectMult ?? 1);
    let diff=angleDiff(direction,mat.angle),quality=diff<perfectTol?'PERFECT':diff<tol*2.1?'CLEAN':'ANGLE';
    let precision=quality==='PERFECT'?1.20:quality==='CLEAN'?1:.76;
    const speed=clamp(velocity*(P.speedBonus ?? 1.35),.55,1.35),center=.78+accuracy*.24;
    const prev=t.cuts.at(-1),cross=!!(t.type==='ice'&&prev&&angleDiff(direction,prev.angle)>.68&&angleDiff(direction,prev.angle)<1.4);
    if (cross) { diff=Math.min(diff,.10); quality=diff<perfectTol?'PERFECT':quality; precision=quality==='PERFECT'?1.2:quality==='CLEAN'?1:.76; }
    const weak = lineDistance(t.x+(t.weakX||0),t.y+(t.weakY||0)) < (P.weakMap ? .045 : .032) && quality==='PERFECT';
    if(weak && P.weakMap) precision*=1.12;
    if(quality==='PERFECT')run.perfects++;
    if(weak)run.weakHits++;
    if(cross)run.crossCuts++;
    let mult=precision*(.82+speed*.22)*center;
    const knife=(run.blade.projectFactor?.cutting?.value || 1);
    mult*=knife;
    if(P.directional) {
      run.directionCount=Number.isFinite(run.lastDirection)&&angleDiff(direction,run.lastDirection)<.2 ? Math.min(4,(run.directionCount||0)+1) : 0;
      mult*=1+run.directionCount*P.directional;
      run.lastDirection=direction;
    }
    if(run.nextBoostUntil>=run.elapsed) {mult*=1+(P.nextCutBoost || 0);run.nextBoostUntil=-1;}
    if(run.resonances?.includes('precise') && weak) mult*=1+P.resonancePower;
    if((t.type==='plastic'||t.type==='ice'))mult*=P.crackPowerMult || 1;
    let power=mat.hard===0
      ? (P.softBase ?? (1.05+(stats.sharpness-50)*.0064+(stats.craft-50)*.0018))*mult
      : (P.hardBase ?? (.37+(stats.strength-50)*.0042+(stats.sharpness-50)*.0016+(stats.craft-50)*.0015))*(P.hardPowerMult ?? 1)*(1+.13*(1-mat.hard))*mult/targetDifficulty(t);
    if (P.frenzyHardBreak && frenzy && mat.hard > 0) { power = 2; guaranteedBreak = true; }   // 淬火余温
    if (run.structure && t.coveredBy) {
      const shield=run.targets.find(part=>part.key===t.coveredBy);
      if (shield?.alive) {
        // A living connector physically shields this component. Heavy/strong
        // blades can force their way in, at substantial wear; precision paths
        // can instead cut the cover first to expose the weak connector.
        const strength=clamp(stats.strength/150,0,1);
        power*=.28+.42*strength;
      }
    }
    if (t.type==='ice'&&cross) power*=1.35;
    if (t.type==='wood'&&prev) power*=angleDiff(direction,prev.angle)<.22&&Math.abs(b.y-(t.y+prev.y))<.046?1.27+(run.blade.effects.grooveFollow||0):.96;
    if (t.type==='plastic'&&prev&&angleDiff(direction,prev.angle)<.26&&Math.abs(b.y-(t.y+prev.y))<.045) power*=1.10+(run.blade.effects.grooveFollow||0);
    if (t.type==='plastic'&&t.progress>=.38) power*=1.08;
    if (t.type==='metal'&&t.layer) power*=1+(run.blade.effects.layerBreak||0);
    if (t.type==='metal'&&t.progress>=.45) power*=1.16;
    power=clamp(power,.01,t.type==='metal'?3.2:10);
    if (mat.hard===0&&quality==='ANGLE'&&stats.sharpness<55) power*=.86;
    power*=1+(run.blade.effects.softChain||0)*(run.gestureKills>0?1:.25);

    if (guaranteedBreak) power = Math.max(power, 1);

    const before = t.progress;
    let phase = 'health';
    let effective = power;
    let armorBroke = false;
    if ((t.armorLeft ?? 0) > 1e-6) {

      phase = 'armor';
      const strengthDrive = (0.55 + 0.45 * clamp(stats.strength / 100, 0, 1.6)) * (run.blade.projectFactor?.strength?.value || 1);
      const force = power * strengthDrive;
      const take = Math.min(t.armorLeft, force * 0.9);
      t.armorLeft = Math.max(0, t.armorLeft - take);
      if (t.armorLeft <= 1e-6) {
        armorBroke = true;
        run.log.push({ type: 'armor-broken', target: t.id, material: t.type });
        /* 破甲溢出 → 同一次生命阶段计算，**只算一次** */
        const overflow = Math.max(0, force - take / 0.9);
        const sharpDrive = 0.60 + 0.40 * clamp(stats.sharpness / 100, 0, 1.6);
        const craftEff = 0.88 + 0.12 * clamp(stats.craft / 100, 0, 1.6);
        effective = overflow * sharpDrive * craftEff;
      } else {
        effective = 0;
      }
    } else {
      /* ② 生命阶段 */
      const sharpDrive = 0.60 + 0.40 * clamp(stats.sharpness / 100, 0, 1.6);
      const craftEff = 0.88 + 0.12 * clamp(stats.craft / 100, 0, 1.6);
      effective = power * sharpDrive * craftEff;
    }
    t.progress = clamp(t.progress + effective / (mat.health * (1 + (t.variation || .03) - .03)), 0, 1);
    // Most ordinary arcade pieces break on a deliberate first cut. Hard specimens
    // remain optional skill/strength challenges, never block the next wave.
    if (run.mode === 'quick' && !t.challengeSpecimen &&
        (t.type === 'foam' || t.type === 'rope' || t.type === 'wood' ||
         t.type === 'plastic' || t.type === 'ice') && quality !== 'ANGLE' && dist >= .008) {
      t.armorLeft = 0;
      t.progress = 1;
    }

    if (guaranteedBreak) {
      t.progress = 1;
      if (Number.isFinite(t.armorLeft) && t.armorLeft > 1e-6) {
        t.armorLeft = 0;
        armorBroke = true;
        run.log.push({ type: 'armor-broken', target: t.id, material: t.type });
      }
    }
    if(armorBroke) {
      run.armorBreaks++;
      const reward=(P.armorBounty || 0)*(run.styleId==='press'?1.3:1);
      run.score+=reward;
      if(P.layerHeal)run.health=Math.min(run.maxHealth,run.health+P.layerHeal);
      if(P.armorShield)run.shield=Math.min(8,(run.shield||0)+P.armorShield);
      if(P.nextCutBoost)run.nextBoostUntil=run.elapsed+1.8;
      if(run.resonances?.includes('armor'))run.health=Math.min(run.maxHealth,run.health+1);
    }
    t.cuts.push({ angle: direction, y: b.y - t.y, progress: t.progress, quality, phase });
    t.cuts = t.cuts.slice(-6);
    t.lastAngle = direction;
    const loss = addWear(run, t, quality, stats);
    recordContact(run, t, quality, loss, power);


    const gained = t.progress - before;
    let contactEvent = 'cut';
    if (t.progress >= 1) contactEvent = 'kill';
    else if (armorBroke) contactEvent = 'armor';
    else if (phase === 'armor' && gained < 0.02) contactEvent = 'blocked';
    else if (quality === 'ANGLE' && loss > 0) contactEvent = 'deflect';

    if (t.type==='metal'&&before<.42&&t.progress>=.42) {
      t.layer=1; run.log.push({ type:'layer-break', target:t.id, progress:t.progress });
      // 夹钢
    }
    if (t.progress>=1) {
      t.alive=false;run.kills++;run.gestureKills++;
      // A fracture can finish the match from inside this loop, before the
      // post-loop peak update. Record the current swipe immediately so the
      // settled result never loses its final completed cut.
      run.bestSwipe=Math.max(run.bestSwipe,run.gestureKills);
      /* ★ 连击 = **本次手势内**斩断了几件（水果忍者的口径），不是"隔 1.65 秒内连续杀"。
         后者在连续投放下一路不断（实测 68 连），倍率被永久拉满，分数直接失真。 */
      run.combo = run.gestureKills;
      const window = P.comboWindow ?? 1.65;
      run.streak = run.elapsed - run.lastKillAt < window ? (run.streak || 0) + 1 : 1;
      run.lastKillAt = run.elapsed;
      run.maxCombo = Math.max(run.maxCombo, run.combo);
      run.maxStreak = Math.max(run.maxStreak || 0, run.streak);
      // 拾遗：只在残血时生效，避免"越切越健康"
      if (P.killHeal && run.health < run.maxHealth * .6) run.health = Math.min(run.maxHealth, run.health + P.killHeal);
      // 狂热：连击到阈值就开一段，落在窗口内的击杀额外乘分
      if (run.gestureKills >= (P.frenzyThreshold ?? 3) && run.frenzyUntil < run.elapsed) {
        run.frenzyUntil = run.elapsed + 1.5;
        run.frenzyCount = (run.frenzyCount || 0) + 1;
        run.log.push({ type: 'frenzy', at: run.elapsed, gesture: run.gestureKills });
      }
      const routeMult=run.phase==='finale'?(run.finale?.bonus||1):(run.phase==='route'||run.phase==='speed'?(run.route?.bonus||1):1);
      const comboMult=1+Math.min(P.comboCap ?? .7,(run.combo-1)*(P.comboStep ?? .09));
      // 折叠锻打：每完成一次三连，本局倍率永久 +0.06（上限 +0.36）
      if (P.tripleBonus && run.combo % 3 === 0) {
        run.tripleCount=(run.tripleCount||0)+1;
        run.foldBonus=Math.min(.36,(run.foldBonus||0)+P.tripleBonus);
      }
      const frenzyMult = run.elapsed < (run.frenzyUntil ?? -1) ? (P.frenzyMult ?? 1.5) : 1;
      const lowHealth = P.lowHealthScore ? clamp(1 + (1 - run.health / Math.max(1,run.maxHealth)), 1, 2) : 1;

      const streakStep = P.streakStep ?? .06;
      const streakCap = P.streakCap ?? .30;
      const streakMult = 1 + Math.min(streakCap, Math.max(0, (run.streak || 1) - 1) * streakStep);
      const points=Math.round(
        (mat.points*(P.spiritMult ?? (.9+stats.spirit*.0029))
          * comboMult * routeMult
          * (quality==='PERFECT'?1.12:quality==='ANGLE'?.76:1)
          * (mat.hard===0?(P.softScoreMult ?? 1)*(1+(P.softSharpWall ?? ((stats.sharpness-55)*.0018))):1)
          * (1+(run.blade.effects.scoreBoost||0))
          * (P.scoreMult ?? 1)
          * (1+(run.foldBonus||0))
          * (1+(run.objectiveBonus||0))
          * branchScoreFactor(run,t,{weak,cross,quality})
          * streakMult
          * frenzyMult * lowHealth)
        + (P.flatPerKill||0) + (weak ? (P.weakScore||0) : 0)
        + (weak && t.markedUntil>=run.elapsed ? (P.marked||0) : 0)
        + (mat.hard>0 && P.armorBounty ? 20 : 0));
      scheduleRefill(run);
      run.materialSet=[...new Set([...(run.materialSet||[]),t.type])];
      run.score+=points;run.typeCounts[t.type]=(run.typeCounts[t.type]||0)+1;
      const hit={ target:t, complete:true, points, precision, combo:run.combo, streak:run.streak, streakMult,
        quality, weak, crossedIce:cross, frenzy: frenzyMult>1, guaranteedBreak,
        /* ★ T07：命中位置的分级反馈类型 + 破甲余量，供 UI 区分表现 */
        contactEvent: contactEvent === 'blocked' || contactEvent === 'deflect' ? 'kill' : contactEvent,
        armorLeft: Number.isFinite(t.armorLeft) ? t.armorLeft : null };
      completeGuide(run,hit);hits.push(hit);
      if(run.guide?.minGestureKills&&run.gestureKills>=run.guide.minGestureKills)completeGuide(run,hit);
    } else hits.push({ target:t, complete:false, points:0, precision, combo:run.combo, streak:run.streak, quality, crossedIce:cross,
      contactEvent,
      armorLeft: Number.isFinite(t.armorLeft) ? t.armorLeft : null });
    // 次级命中不制造精准/连击/回血/狂热，最多影响 3 个目标，得分只给材料基础分的 35%。
    const primaryComplete=t.progress>=1;
    let secondaryPower=0, candidates=[];
    if(primaryComplete && weak && P.pierce) {
      secondaryPower=power*P.pierce;
      candidates=run.targets.filter(n=>n.alive && !n.avoid && n.id!==t.id && (n.x-t.x)*dx+(n.y-t.y)*dy>0 && lineDistance(n.x,n.y)<radius)
        .sort((x,y)=>Math.hypot(x.x-t.x,x.y-t.y)-Math.hypot(y.x-t.x,y.y-t.y)).slice(0,1);
    }
    if(cross && P.crackSpread) {
      secondaryPower=Math.max(secondaryPower,power*P.crackSpread);
      candidates.push(...run.targets.filter(n=>n.alive && !n.avoid && n.id!==t.id && Math.hypot(n.x-t.x,n.y-t.y)<.4).slice(0,2));
    }
    if(primaryComplete && t.type==='ice' && P.iceChain) {
      secondaryPower=Math.max(secondaryPower,P.iceChain);
      candidates.push(...run.targets.filter(n=>n.alive && !n.avoid && Math.hypot(n.x-t.x,n.y-t.y)<.5));
    }
    if(primaryComplete && P.waveBlade && run.gestureKills>=3 && !run.waveTriggered) {
      run.waveTriggered=true; secondaryPower=Math.max(secondaryPower,P.waveBlade);
      candidates.push(...run.targets.filter(n=>n.alive && !n.avoid && Math.hypot(n.x-t.x,n.y-t.y)<.48));
    }
    for(const next of new Set(candidates)) {
      if(!next.alive || secondaryBudget<=0)continue;
      secondaryBudget--;run.secondaryThisSwipe=(run.secondaryThisSwipe||0)+1;
      const secondary=applySecondary(run,next,secondaryPower);
      hits.push(secondary);
      if(secondary.complete && next.type==='ice' && P.iceChain && secondaryBudget>0) {
        for(const n of run.targets.filter(n=>n.alive && !n.avoid && Math.hypot(n.x-next.x,n.y-next.y)<.4)) {
          if(secondaryBudget<=0)break;
          secondaryBudget--;run.secondaryThisSwipe++;hits.push(applySecondary(run,n,P.iceChain));
        }
      }
    }
    // 未切开的硬靶同样可能导致失效，不能只在成功斩断后检查。
    if (run.mode === 'formal' && run.fractured) {
      run.fractureChecks++; hits[hits.length-1].riskStop = true;
      return { ok: true, hits, done: finish(run, 'fracture') };
    }
  }
  run.bestSwipe=Math.max(run.bestSwipe,run.gestureKills);
  if(run.mode==='sample' && run.kills>=SAMPLE_MATERIALS.length)
    return {ok:true,hits,done:finish(run,'sample-complete')};
  if (run.structure) {
    updateStructure(run.structure,run.targets);
    run.score=structureScore(run.structure,run.elapsed,run.total,run.health,run.maxHealth);
    if (run.structure.completed) {
      if(!run.primaryClearLogged) {
        run.primaryClearLogged=true;
        run.log.push({type:'structure-primary-clear',at:run.elapsed,route:run.structure.routeComplete,
          completed:[...run.structure.completedIds]});
      }
      // The required structure is defeated, but the player owns the choice:
      // collect now to bank time/blade condition, or cut remaining optional
      // pieces to improve precision/protection quality. The timer stays real.
      if(!run.targets.some(t=>t.alive && !t.isProtected)){
        return {ok:true,hits,done:finish(run,'structure-complete')};
      }
    }
  }
  if(run.health<=0)return {ok:true,hits,done:finish(run,'wearout')};
  return {ok:true,hits};
}
// 已保存的旧操作可能缺少 V3 诊断字段；加法归一化，不清除存档或重掷刀具。
function ensureRuntime(run) {
  for(const key of ['perfects','weakHits','armorBreaks','crossCuts','secondaryKills','secondaryScore','objectives','objectiveBonus'])
    if(!Number.isFinite(run[key]))run[key]=0;
  run.resonances ||= [];
  run.materialSet ||= [];
  run.metrics ||= {emptySeconds:0,activeSeconds:0,refills:0};
}
function branchScoreFactor(run,t,{weak,cross,quality}) {
  switch(run.styleId) {
    case 'press':return MATERIALS[t.type].hard>0?1.2:1;
    case 'edge':return 1+Math.min(.4,Math.max(0,run.gestureKills-1)*.1);
    case 'precise':return weak?1.4:quality==='PERFECT'?1.12:.9;
    case 'quench':return cross?1.4:(t.type==='ice'||t.type==='plastic'?1.12:1);
    case 'composite':return 1+Math.min(.25,(run.materialSet?.length||0)*.04);
    case 'overload':return 1+(1-run.health/run.maxHealth)*.4;
    default:return 1;
  }
}
function applySecondary(run,t,power) {
  if(t.avoid)return {target:t,complete:false,points:0,contactEvent:'avoid-ignored'};
  const mat=MATERIALS[t.type];
  if(run.resonances?.includes('crack'))power*=1+run.params.resonancePower*2;
  const armor=Math.min(t.armorLeft||0,power*.9);
  t.armorLeft=Math.max(0,(t.armorLeft||0)-armor);
  t.progress=clamp(t.progress+Math.max(0,power-armor/.9)/mat.health,0,1);
  t.lastHitAt=run.elapsed;
  t.cuts.push({angle:0,y:0,progress:t.progress,quality:'CHAIN',phase:'secondary'});
  t.cuts=t.cuts.slice(-6);
  let points=0;
  if(t.progress>=1) {
    t.alive=false;run.kills++;run.secondaryKills++;
    points=Math.round(mat.points*ARENA_V3.secondaryScore);
    run.score+=points;run.secondaryScore+=points;scheduleRefill(run);
    run.typeCounts[t.type]=(run.typeCounts[t.type]||0)+1;
  }
  run.log.push({type:'secondary',target:t.id,power,complete:!t.alive,points});
  return {target:t,complete:!t.alive,points,quality:'CHAIN',secondary:true,contactEvent:!t.alive?'kill':'cut',combo:0};
}
function targetDifficulty(t) { return t.difficulty || 1; }
export function finish(run, reason='time') {
  if (run?.structure) {
    updateStructure(run.structure,run.targets);
    run.score=structureScore(run.structure,run.elapsed,run.total,run.health,run.maxHealth);
  }
  if (!run) return null;
  ensureRuntime(run);
  // 缺少 mode 的旧快速局也安全；旧 reason/标志不能绕过这条边界。
  if (run.mode !== 'formal') {
    run.fractured = false; run.riskStop = false;
    if (run.result) { run.result.fractured = false; run.result.riskStop = false; }
  }
  if(run.done)return run.result||null;
  if(run.guide&&!run.guide.done&&run.guide.minHealth&&run.health>=run.guide.minHealth){run.guide.done=true;run.score+=run.guide.reward;run.log.push({type:'objective',title:run.guide.title,reward:run.guide.reward});}
  // 满贯：本局零漏切时整局乘分（在评级之前结算）
  const P = run.params || {};
  if (!run.structure && P.flawlessMult>1 && reason==='time' && (run.misses || 0) === 0 && run.score >= (run.targetScore || 1800)) {
    run.score = Math.round(run.score * P.flawlessMult);
    run.log.push({ type: 'flawless', mult: P.flawlessMult });
  }
  run.done=true;run.phase='result';run.remaining=Math.max(0,run.remaining);
  run.fractured = run.mode === 'formal' && run.risk?.failure === 'structural-collapse';
  run.riskStop = run.fractured;
  /* 评级：赛事按「得分 / 幽灵分」的比值定级（自动随难度与 buff 缩放）；
     训练场没有幽灵分，沿用原来的绝对阈值。 */
  const ghost = Number(run.ghost) || 0;
  const ratio = ghost > 0 ? run.score / ghost : 0;
  const grade = run.structure
    ? (run.score >= 950 ? 'S' : run.score >= 900 ? 'A' : run.score >= 800 ? 'B' : 'C')
    : ghost > 0
      ? (ratio >= 1.5 ? 'S' : ratio >= 1.15 ? 'A' : ratio >= 0.85 ? 'B' : 'C')
      : (run.score >= 18000 ? 'S' : run.score >= 9000 ? 'A' : run.score >= 3500 ? 'B' : 'C');
  const reward=run.mode==='sample' || reason==='manual' || run.kills === 0 ? 0
    : run.mode === 'quick'
      ? Math.min(20, Math.max(8, 8 + Math.floor(run.score / 750)))
      : Math.max(2, Math.min(30, Math.floor(run.score / 100) + (grade==='S'?5:grade==='A'?3:grade==='B'?1:0)));
  run.result={grade,score:Math.floor(run.score),reward,kills:run.kills,maxCombo:run.maxCombo,maxStreak:run.maxStreak||0,bestSwipe:run.bestSwipe,
    health:Math.round(run.health),maxHealth:Math.round(run.maxHealth ?? 100),misses:run.misses||0,
    frenzy:run.frenzyCount||0,buffs:[...(run.buffs||[])],
    ghost: ghost || null, win: ghost > 0 ? run.score >= ghost : null,
    route:run.route?.name||'—',finale:run.finale?.name||'—',reason,riskStop:run.riskStop,fractured:!!run.fractured,
    version:run.rulesVersion || ARENA_V3.version, choicesMade:run.choicesMade, resonances:[...(run.resonances||[])],
    perfects:run.perfects,weakHits:run.weakHits,armorBreaks:run.armorBreaks,crossCuts:run.crossCuts,
    secondaryKills:run.secondaryKills,secondaryScore:run.secondaryScore,metrics:copy(run.metrics),
    objectives:run.objectives,materials:[...(run.materialSet||[])],avoidHits:run.avoidHits||0,avoidCleared:run.avoidCleared||0,
    elapsedSeconds:Number(run.elapsed.toFixed(3)),primaryContacts:run.primaryContacts||0,sampleTotal:run.mode==='sample'?SAMPLE_MATERIALS.length:null,
    mode:run.mode || 'quick',total:run.total,risk:copy(run.risk || {}),log:copy(run.log),
    structure:structureSnapshot(run.structure),rulesVersion:run.rulesVersion};
  if (run.mode === 'quick' && reason !== 'manual') emit(EVENTS.QUICK_CHALLENGE_FINISHED, run);
  return run.result;
}
export function setPaused(run, paused) { if(!run||run.done)return false;run.paused=!!paused;return true; }
export default { chooseAugment, createChallenge, tick, swipe, beginSwipe, chooseRoute, chooseFinale, finish, setPaused, MATERIALS, ROUTES, FINALES };
