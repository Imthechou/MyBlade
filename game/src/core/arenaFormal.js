/** 正式赛事 V3 编排：一场 45 秒切割、全国一刀五轮、巅峰三刀轮换。旧分项会话保留兼容。 */
import { buildFormalDefinition, gradientRule, FORMAL_RULES_VERSION } from '../data/arena/formalTests.js';
import { ARENA_V3 } from '../data/balance.js';
import { BRANCHES, GRADIENTS } from '../data/arena/branches.js';
import * as TestScoring from './testScoring.js';
import { adaptBlade } from './bladeAdapter.js';
import * as RNG from '../platform/rng.js';

/** 赛事规则版本（与 formalTests.FORMAL_RULES_VERSION 同步） */
export const FORMAL_MATCH_VERSION = FORMAL_RULES_VERSION;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 三刀赛资格校验（T09：UI 与 core 都必须拒绝）。
 *
 * @param {Array} blades BladeRecord[]
 * @returns {{ok:boolean, reason?:string, ids?:string[]}}
 */
export function validateApexRoster(blades) {
  const list = Array.isArray(blades) ? blades : [];
  if (list.length !== 3) return { ok: false, reason: '巅峰赛需要正好三把刀' };
  const ids = list.map((b) => (b && typeof b.id === 'string' ? b.id : null));
  if (ids.some((id) => !id)) return { ok: false, reason: '阵容里有刀缺少身份' };
  if (new Set(ids).size !== 3) return { ok: false, reason: '三把刀必须是不同的刀（ID 重复）' };
  for (const b of list) {
    if (!b) return { ok: false, reason: '阵容里有刀不存在' };
    if (b.fractured) return { ok: false, reason: '阵容里有刀已断裂，不能参赛' };
    if (b.canEnterArena === false) return { ok: false, reason: '阵容里有刀已失去参赛资格' };
  }
  return { ok: true, ids };
}

/**
 * 创建一场正式单刀赛。
 *
 * @param {object} o
 * @param {object} o.blade      BladeRecord
 * @param {'school'|'national'} [o.tier]
 * @param {string} [o.styleId]  流派（school 必填）
 * @param {number} [o.gradient] 档位 0–4
 * @param {number} [o.seed]
 */
export function createFormalMatch({ blade, tier = 'school', styleId = null, gradient = 0, seed = null, round = 0 } = {}) {
  if (!blade || blade.fractured || blade.canEnterArena === false) {
    return { ok: false, reason: '只能使用完整成刀参赛' };
  }
  // 风格只改变阵型、材料权重与得分条件，材料本体恒定。
  const branchId = styleId || 'composite';
  if (!BRANCHES.some((b) => b.id === branchId)) return { ok: false, reason: '未知流派' };

  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  const def = buildFormalDefinition({ branchId, gradient, seed: actualSeed });
  if (!def.ok) return def;
  if(tier==='national')def.targetScore=[820,840,860,880,900][Math.min(4,Math.max(0,round|0))];
  if(tier==='apex')def.targetScore=900;
  // Duration is the actual published rule, not a visual-only timer.
  def.rules[0].seconds=tier==='national'?[90,95,100,105,110][Math.min(4,Math.max(0,round|0))]
    :tier==='apex'?[100,110,120][Math.min(2,Math.max(0,round|0))]
    :[70,75,85,90,90][Math.min(4,Math.max(0,gradient|0))];

  const view = adaptBlade(blade);
  const session = TestScoring.createTestSession({
    view, tests: def.tests, weights: def.weights, seed: actualSeed,
  });
  if (!session.ok) return session;

  return {
    ok: true,
    match: {
      id: `FM-${actualSeed.toString(36)}-${Date.now().toString(36)}`,
      version: FORMAL_MATCH_VERSION,
      kind: 'formal',
      tier,
      styleId: branchId,
      gradient: gradient | 0,
      round,
      seed: actualSeed,
      definition: def,
      blade: {
        id: view.bladeId,
        name: view.bladeName,
        knifeTypeId: view.knifeTypeId,
        score: view.score,
        rarity: view.rarity,
        rarityName: view.rarityName,
        stats: { ...view.permanentStats },
        capabilities: { ...view.capabilities },
        projectFactor: { ...view.projectFactor },
        effectSummary: view.effectSummary.map((e) => ({ ...e })),
      },
      view,
      session,
      startedAt: Date.now(),
      done: false,
      result: null,
      /** 旧字段兼容：UI 部分位置读 fieldTest */
      fieldTest: { used: false, result: null },
      log: [],
    },
  };
}

/** 当前待完成的测试项（UI 读这个渲染测试舞台） */
export function currentTest(match) {
  if (!match || match.done) return null;
  return TestScoring.currentTest(match.session);
}

/**
 * 生成某项测试的确定性题目/参数（靶具序列、路径、负荷档）。
 * ★ 同刀同种子同项 → 同题；不同流派/项 → 不同题。
 */
export function testTask(match) {
  const entry = currentTest(match);
  if (!entry) return null;
  const def = match.definition;
  const rng = RNG.stream(match.seed, 'formal-task', entry.kind, match.styleId);
  const rule = def.rules.find((r) => r.projectId === entry.kind)
    || def.rules.find((r) => !r.projectId && r.kind === entry.kind)
    || def.rules.find((r) => !r.projectId && r.kind === ({
      cutting: 'sweep', precision: 'trace', strength: 'sustain',
      durability: 'hold', extreme: 'overload',
    }[entry.kind])) || null;
  // 旧存档有可能没有 projectId；兜底按操作种类兼容，仍禁止空靶自结算。
  if (!rule) return { invalid: true, kind: entry.kind, reason: '赛事规则缺失，请重新开赛' };
  const task = {
    kind: entry.kind,
    name: entry.name,
    rule: { ...rule },
    hardness: round1(def.hardness * 100) / 100,
    window: def.window,
    index: match.session.index,
    total: match.session.entries.length,
    seed: match.seed,
  };

  if (rule.kind === 'sweep') {
    /* 切割：按流派给不同的靶具序列（软靶/硬靶配比不同） */
    const pool = rule.materials || ['rope', 'foam'];
    const n = Math.max(6, Math.round((rule.seconds || 30) / 3));
    task.sequence = Array.from({ length: n }, (_, i) =>
      pool[Math.floor(rng() * pool.length) % pool.length]);
  } else if (rule.kind === 'trace') {
    /* 精度：一条窄路径，容差随梯度收窄 */
    const points = 20;
    const amp = 0.10 + rng() * 0.10;
    task.path = Array.from({ length: points }, (_, i) => {
      const t = i / (points - 1);
      return 0.5 + Math.sin(t * Math.PI * (1.4 + rng() * 0.1)) * amp * Math.sin(t * Math.PI);
    });
    task.tolerance = round1((rule.tolerance || 0.30) * (def.window || 1) * 1000) / 1000;
  } else if (rule.kind === 'sustain') {
    /* 强度：负荷阶梯 */
    const steps = rule.loadSteps || 4;
    task.loadSteps = Array.from({ length: steps }, (_, i) =>
      round1((0.5 + i * 0.20) * def.hardness * 100) / 100);
  } else if (rule.kind === 'hold') {
    /* 耐久：能力衰减序列 */
    task.decay = round1((rule.decay || 0.06) * def.hardness * 1000) / 1000;
    task.segments = 5;
  } else if (rule.kind === 'overload') {
    /* 极限：警告点与加压档 */
    task.warningAt = rule.warningAt ?? 0.6;
    task.pressLevels = [0, 1, 2, 3];
  }
  return task;
}

/**
 * 提交一项测试结果。
 *
 * @param {object} match
 * @param {object} o
 * @param {number} o.measure 操作质量 0–1（来自真实操作舞台）
 * @param {object} [o.detail]
 * @param {number} [o.temporaryDamage] 本项临时损伤 0–1
 * @param {boolean} [o.failed] 临时结构失效
 * @param {boolean} [o.pressed] 极限项选择了加压
 */
export function submitTest(match, { measure, detail = {}, temporaryDamage = 0, failed = false, pressed = false } = {}) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  const entry = currentTest(match);
  if (!entry) return { ok: false, reason: '没有待完成的测试项' };

  if(match.version===FORMAL_RULES_VERSION && !failed &&
    (detail.source!=='arenaChallenge' || !Number.isFinite(detail.score) || detail.score<0 || detail.duration!==match.definition.rules[0].seconds)) {
    return {ok:false,reason:'缺少完整切割成绩，请完成本轮切割后提交'};
  }
  const res = TestScoring.settleTest(match.session, match.view, {
    kind: entry.kind,
    measure: num(measure),
    detail: { ...detail, pressed },
    temporaryDamage: num(temporaryDamage) + (pressed ? 0.08 : 0),
    failed,
  });
  if (!res.ok) return res;
  if(match.version===FORMAL_RULES_VERSION) {
    // 刀具属性已在切割/刀损中生效；真实分数不再乘第二遍能力分。
    res.result.score=Number.isFinite(detail.score)?Math.min(1000,Math.max(0,Math.floor(detail.score))):0;
    res.result.raw.score=res.result.score;
    res.result.version='cut-score-3';
  }

  match.log.push({
    type: 'test', kind: entry.kind, score: res.result.score,
    measure: res.result.raw.measure, failed: res.result.failed,
  });

  if (res.aborted) {
    const fin = finishMatch(match, 'temporary-failure');
    return { ...fin, result: res.result, matchResult: fin.result };
  }

  /* 推进或收场。
     ★ 收场时要同时返回**本项结果**与**整场结果**，
     否则调用方只能看到 match 级 result，拿不到最后一项的分项成绩（UI 会少一行）。 */
  if (match.session.index < match.session.entries.length - 1) {
    const advanced = TestScoring.advance(match.session);
    if (!advanced) {
      const fin = finishMatch(match, 'complete');
      return { ...fin, result: res.result, matchResult: fin.result };
    }
    return { ok: true, result: res.result, advanced: true, next: currentTest(match) };
  }
  const fin = finishMatch(match, 'complete');
  return { ...fin, result: res.result, matchResult: fin.result };
}

/** 放弃剩余测试（记为未进行，不用单项分冒充全部） */
export function abandon(match) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  for (const e of match.session.entries) if (e.status === 'pending') e.status = 'not-run';
  match.session.aborted = 'abandoned';
  return finishMatch(match, 'abandoned');
}

/**
 * 赛事结算。
 * ★ 只消费有效分项结果；缺失/失效项按 0 计，不拿其余项顶替。
 */
export function finishMatch(match, reason = 'complete') {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  const agg = TestScoring.aggregate(match.session);
  const judge = TestScoring.judge(agg, match.definition.targetScore);

  /* 临时失效 → 判负，但**不是**永久断刀（FORMAL_RISK_TBD 未定） */
  const temporaryFailure = match.session.aborted === 'temporary-failure';
  const cutDetail=match.session.entries[0]?.result?.detail || {};
  // Formal titles require the actual target connection objective. A high score
  // alone cannot count as a completed structure.
  const primaryCompleted=match.version!==FORMAL_RULES_VERSION ||
    cutDetail.structure?.completed === true;
  const win = reason==='complete' && !temporaryFailure && primaryCompleted && judge.win;

  match.done = true;
  match.fieldTest = {
    used: true,
    result: { tier: win ? 'perfect' : 'fail', performance: null },
  };
  const cut=cutDetail;
  match.result = {
    cut, honors:match.version===FORMAL_RULES_VERSION && win ? honorsOf(cut,match.styleId) : [],
    version: FORMAL_MATCH_VERSION,
    reason,
    win,
    temporaryFailure,
    /* 明确声明：本轮不执行永久断刀（政策待定） */
    bladeDestroyed: false,
    permanentRiskPolicy: 'FORMAL_RISK_TBD',
    composite: agg.composite,
    target: judge.target,
    margin: judge.margin,
    ratio: judge.ratio,
    projectScores: agg.projectScores,
    weights: agg.weights,
    temporaryDamage: agg.temporaryDamage,
    strongest: agg.strongest,
    weakest: agg.weakest,
    missing: agg.missing,
    definition: {
      version: match.definition.version,
      branchId: match.definition.branchId,
      branchName: match.definition.branchName,
      focus: match.definition.focus,
      gradient: match.definition.gradient,
      gradientName: match.definition.gradientName,
      tests: [...match.definition.tests],
      fingerprint: match.definition.fingerprint,
    },
    bladeId: match.blade.id,
    bladeName: match.blade.name,
    /** 赛报：不足对应哪类能力（T08 验收） */
    report: buildReport(match, agg, judge, win),
  };
  return { ok: true, done: true, result: match.result };
}

function honorsOf(cut,styleId) {
  const honors=[];
  if(cut.bestSwipe>=3 && cut.maxStreak>=12)honors.push('疾风连斩');
  if(cut.armorBreaks>=8 && cut.health/Math.max(1,cut.maxHealth)>=.2)honors.push('百炼之刃');
  if(cut.perfects>=30 && cut.weakHits>=15)honors.push('精准锋芒');
  if(cut.materials?.length===6)honors.push('六材通解');
  if(cut.crossCuts>=8)honors.push('冰裂匠心');
  return honors;
}
function buildReport(match, agg, judge, win) {
  if(match.version===FORMAL_RULES_VERSION) {
    const cut=match.session.entries[0]?.result?.detail || {};
    return {headline:match.session.aborted==='temporary-failure'?'刀况耗尽 · 本轮终止':win?'挑战成功':'未达目标',lines:[
      `${match.definition.branchName} · ${match.definition.focus}`,
      `切割分 ${agg.composite} / 目标 ${judge.target}`,
      `斩断 ${cut.kills || 0} · 精准 ${cut.perfects || 0} · 弱点 ${cut.weakHits || 0} · 破甲 ${cut.armorBreaks || 0}`,
      `一划最多 ${cut.bestSwipe || 0} 断 · 跨划连斩 ${cut.maxStreak || 0} · 连锁击破 ${cut.secondaryKills || 0}`,
      `本轮强化 ${(cut.buffs || []).length}/3 · 剩余刀况 ${Math.round((cut.health || 0)/Math.max(1,cut.maxHealth || 100)*100)}%`,
    ]};
  }
  const lines = [];
  const d = match.definition;
  lines.push(`${d.branchName} · ${d.gradientName}：${d.focus}`);
  lines.push(`切割分 ${agg.composite} / 目标 ${judge.target}（${judge.margin >= 0 ? '超出' : '差'} ${Math.abs(judge.margin)}）`);
  for (const p of agg.projectScores) {
    if (p.score === null) lines.push(`${p.name}：未完成`);
    else lines.push(`${p.name}：${p.score}${p.failed ? '（临时失效）' : ''}`);
  }
  if (agg.strongest) lines.push(`最强项：${agg.strongest.name}（${agg.strongest.score}）`);
  if (agg.weakest) lines.push(`最弱项：${agg.weakest.name}（${agg.weakest.score}）—— 这是下次改进的方向`);
  if (agg.temporaryDamage > 0) lines.push(`本场临时损伤累计 ${Math.round(agg.temporaryDamage * 100)}%（不影响永久属性）`);
  if (!win && agg.weakest) lines.push(`建议：为「${agg.weakest.name}」补齐对应的刀型或特性适配`);
  return {
    headline: match.session.aborted === 'temporary-failure' ? '结构临时失效 · 本项终止'
      : win ? '达标' : '未达标',
    lines,
    strongest: agg.strongest,
    weakest: agg.weakest,
  };
}

/* ══════════════════════════════════════════════════════════════
   三刀巅峰赛（T09）
   ══════════════════════════════════════════════════════════════ */

/** 三轮主题：分别覆盖切割、结构/耐久、精度/综合 */
export const APEX_ROUNDS = Object.freeze([
  { round: 0, label: '第一轮 · 极致锋芒', branchId: 'edge', gradient: 4 },
  { round: 1, label: '第二轮 · 不屈之刃', branchId: 'press', gradient: 4 },
  { round: 2, label: '第三轮 · 巅峰之作', branchId: 'composite', gradient: 4 },
]);

/**
 * 创建三刀赛。
 * ★ 资格在 core 层强制校验，不能通过任何 UI 旁路绕过。
 */
export function createApexMatch({ blades, seed = null } = {}) {
  const roster = validateApexRoster(blades);
  if (!roster.ok) return roster;
  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  return {
    ok: true,
    match: {
      id: `AP-${actualSeed.toString(36)}-${Date.now().toString(36)}`,
      version: FORMAL_MATCH_VERSION,
      kind: 'apex',
      tier: 'apex',
      seed: actualSeed,
      roster: blades.map((b) => ({
        id: b.id, name: b.bladeName || b.name || b.id,
        knifeTypeId: b.knifeTypeId || null, score: num(b.score),
      })),
      rounds: APEX_ROUNDS.map((r) => ({
        ...r, dispatchedBladeId: null, result: null, status: 'pending',
      })),
      roundIndex: 0,
      usedBladeIds: [],
      done: false,
      result: null,
      startedAt: Date.now(),
    },
  };
}

/** 可派遣的刀（未被本场使用过） */
export function apexAvailable(match) {
  if (!match||match.done)return [];
  const current=match.rounds[match.roundIndex];
  // Precommitted order is part of the challenge, not a between-round free pick.
  const promised=match.roster[match.roundIndex];
  return current?.status==='pending'&&promised?[promised]:[];
}

/**
 * 派一把刀进入当前轮。
 * @returns {{ok:boolean, match?:object, round?:object, reason?:string}}
 */
export function apexDispatch(match, blades, bladeId) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  const round = match.rounds[match.roundIndex];
  if (!round || round.status !== 'pending') return { ok: false, reason: '当前没有待进行的轮次' };
  if (!bladeId) return { ok: false, reason: '请选择派出的刀' };
  if(match.roster[match.roundIndex]?.id!==bladeId)
    return {ok:false,reason:'三把刀的出场顺序已在开赛前锁定'};
  if ((match.usedBladeIds||[]).includes(bladeId) && !(round.attempts>0))
    return {ok:false,reason:'此刀已用于其他轮次'};
  if(!match.roster.some(b=>b.id===bladeId))return {ok:false,reason:'这把刀不在本届三刀阵容内'};
  const rec = (blades || []).find((b) => b && b.id === bladeId);
  if (!rec) return { ok: false, reason: '找不到这把刀' };
  if (rec.fractured || rec.canEnterArena === false) return { ok: false, reason: '这把刀已失去参赛资格' };

  const created = createFormalMatch({
    blade: rec, tier: 'apex', styleId: round.branchId, gradient: round.gradient, round:match.roundIndex,
    seed: (match.seed + match.roundIndex * 7919) >>> 0,
  });
  if (!created.ok) return created;

  round.dispatchedBladeId = bladeId;
  round.status = 'active';
  round.label = round.label;
  round.match = created.match;
  return { ok: true, match, round, roundMatch: created.match };
}

/** 提交当前轮的测试结果（转发到该轮的单刀赛） */
export function apexSubmit(match, payload) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  const round = match.rounds[match.roundIndex];
  if (!round || round.status !== 'active' || !round.match) return { ok: false, reason: '当前轮还没有派出刀' };
  const res = submitTest(round.match, payload);
  if (!res.ok) return res;
  if (res.done) {
    round.status='complete';
    round.attempts=(round.attempts||0)+1;
    if(!round.result || (res.matchResult?.cut?.structure?.completed &&
       res.matchResult.composite>round.result.composite))round.result=res.matchResult;
    if(!match.usedBladeIds.includes(round.dispatchedBladeId))
      match.usedBladeIds.push(round.dispatchedBladeId);
    const next=match.rounds.findIndex((r,i)=>i>match.roundIndex&&r.status==='pending');
    match.roundIndex=next>=0?next:match.rounds.length;
    if(next<0)return finishApex(match);
    return {ok:true,roundDone:true,result:round.result,next:match.rounds[next]};
  }
  return res;
}

/** Retry a completed world round with the SAME roster slot and fixed seed. */
export function apexRetryRound(match,index) {
  if(!match?.done||match.settled)return {ok:false,reason:'仅可在领奖前补考'};
  if(!Number.isInteger(index)||index<0||index>=3)return {ok:false,reason:'轮次不存在'};
  const round=match.rounds[index];
  if(round?.status!=='complete'||!round.result)return {ok:false,reason:'本轮尚无成绩'};
  match.done=false;match.result=null;match.roundIndex=index;
  round.status='pending';round.match=null;round.dispatchedBladeId=null;
  match.retryCount=(match.retryCount||0)+1;
  return {ok:true,match,round};
}

/** 三刀赛结算：按各轮实际表现合成，不加鉴定分 */
export function finishApex(match) {
  if (!match || match.done) return { ok: false, reason: '本场已结束' };
  for (const r of match.rounds) {
    if (r.status === 'pending' || r.status === 'active') r.status = r.status === 'pending' ? 'not-run' : 'incomplete';
  }
  const completed = match.rounds.filter((r) => r.status === 'complete' && r.result);
  const wins = completed.filter((r) => r.result.win).length;
  const composite = round1(completed.reduce((a, r) => a + num(r.result.composite), 0));
  // V4.1 world title requires all three physical structures and 2700 total.
  // A weak round may be offset by a stronger one: no hidden 900-per-round gate.
  const primaryValid=completed.every(r=>r.result?.cut?.structure?.completed===true);
  const win=completed.length===match.rounds.length && primaryValid && composite>=2700;

  match.done = true;
  match.result = {
    version: FORMAL_MATCH_VERSION,
    win,
    wins,
    primaryValid,
    rounds: completed.length,
    honors:[...new Set(completed.flatMap(r=>r.result.honors || [])),...(wins===3?['三刀全胜']:[])],
    composite,
    roundsDetail: match.rounds.map((r) => ({
      round: r.round, label: r.label, branchId: r.branchId,
      bladeId: r.dispatchedBladeId, status: r.status,
      composite: r.result?.composite ?? null,
      win: r.result?.win ?? null,
      primary: r.result?.cut?.structure?.primary || 0,
      primaryCompleted: r.result?.cut?.structure?.completed === true,
      projectScores: r.result?.projectScores || [],
      honors:r.result?.honors || [],
    })),
    bladeDestroyed: false,
    permanentRiskPolicy: 'FORMAL_RISK_TBD',
    report: {
      headline: win ? '三刀巅峰赛达标' : '三刀巅峰赛未达标',
      lines: [
        `完成 ${completed.length}/${match.rounds.length} 轮，胜 ${wins} 轮`,
        ...match.rounds.map((r) => {
          const sub = r.result ? `合成 ${r.result.composite} / 目标 ${r.result.target}` : '未进行';
          return `${r.label}：${r.dispatchedBladeId ? `派出 ${r.dispatchedBladeId}` : '未派刀'} · ${sub}`;
        }),
      ],
    },
  };
  return { ok: true, done: true, result: match.result };
}

/* ════════════════════════════════════════════════════════════
   全国大赛（rework T09）
   ════════════════════════════════════════════════════════════
   一把代表刀贯穿 32强→16强→8强→半决赛→决赛。
   每轮都是一场**真实多项目测试**（composite 三项），梯度逐轮提升，
   不是重复同一套切割目标分。
   一败即淘汰；**普通淘汰不等于断刀**，成刀与历史全部保留。
 */

export const NATIONAL_ROUNDS_FORMAL = Object.freeze([
  { round: 0, label: '32 强 · 高速连斩', gradient: 0, size: 32, styleId:'edge' },
  { round: 1, label: '16 强 · 精准刀路', gradient: 1, size: 16, styleId:'precise' },
  { round: 2, label: '8 强 · 重型破甲', gradient: 2, size: 8, styleId:'press' },
  { round: 3, label: '半决赛 · 综合考验', gradient: 3, size: 4, styleId:'composite' },
  { round: 4, label: '决赛 · 双风格对抗', gradient: 4, size: 2, styleId:'overload' },
]);

/**
 * 创建一届全国赛。
 * ★ 代表刀在创建时锁定，整届不换（T09：一届锁定代表刀）。
 */
export function createNationalMatch({ blade, seed = null } = {}) {
  if (!blade || blade.fractured || blade.canEnterArena === false) {
    return { ok: false, reason: '只能使用完整成刀参加全国赛' };
  }
  const view = adaptBlade(blade);
  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  return {
    ok: true,
    match: {
      id: `NB-${actualSeed.toString(36)}-${Date.now().toString(36)}`,
      version: FORMAL_MATCH_VERSION,
      kind: 'national',
      tier: 'national',
      seed: actualSeed,
      /* 代表刀：整届锁定，不允许中途换刀 */
      blade: {
        id: view.bladeId, name: view.bladeName,
        knifeTypeId: view.knifeTypeId, score: view.score,
        rarity: view.rarity, rarityName: view.rarityName,
      },
      rounds: NATIONAL_ROUNDS_FORMAL.map((r) => ({
        ...r, status: 'pending', result: null, roundMatch: null,
      })),
      roundIndex: 0,
      done: false,
      result: null,
      startedAt: Date.now(),
    },
  };
}

/** 当前轮 */
export const nationalCurrentRound = (match) =>
  match?.rounds?.[match.roundIndex] || null;

/**
 * 开启当前轮（创建该轮的多项目测试）。
 * @param {object} match
 * @param {object[]} blades 候选刀集（用 id 找回代表刀完整记录）
 */
export function nationalStartRound(match, blades) {
  if (!match || match.done) return { ok: false, reason: '本届已结束' };
  const round = nationalCurrentRound(match);
  if (!round) return { ok: false, reason: '没有待进行的轮次' };
  if (round.status === 'active') return { ok: true, round, roundMatch: round.roundMatch };
  if (round.status !== 'pending') return { ok: false, reason: '本轮已结算' };

  const record = (blades || []).find((b) => b && b.id === match.blade.id);
  if (!record) return { ok: false, reason: '找不到代表刀' };
  if (record.fractured || record.canEnterArena === false) {
    return { ok: false, reason: '代表刀已失去参赛资格' };
  }

  const created = createFormalMatch({
    blade: record,
    tier: 'national',
    styleId: round.styleId,
    round:round.round,
    gradient: round.gradient,
    seed: (match.seed + round.round * 7919) >>> 0,
  });
  if (!created.ok) return created;

  round.status = 'active';
  round.roundMatch = created.match;
  if(round.round===4) {
    const styles=['press','edge','precise','quench'];
    const rng=RNG.stream(match.seed,'national-final');
    const first=styles.splice(Math.floor(rng()*styles.length),1)[0];
    created.match.styleIds=[first,styles[Math.floor(rng()*styles.length)]];
    created.match.definition.focus='双风格：'+created.match.styleIds.map(id=>BRANCHES.find(b=>b.id===id)?.name).join(' + ');
  }
  return { ok: true, round, roundMatch: created.match };
}

/**
 * 提交当前轮的测试成绩（转发到该轮的正式赛）。
 * 一轮完成 → 胜则晋级，负则淘汰（普通淘汰不断刀）。
 */
export function nationalSubmit(match, payload) {
  if (!match || match.done) return { ok: false, reason: '本届已结束' };
  const round = nationalCurrentRound(match);
  if (!round || round.status !== 'active' || !round.roundMatch) {
    return { ok: false, reason: '本轮还没有开始' };
  }
  const res = submitTest(round.roundMatch, payload);
  if (!res.ok) return res;
  if (res.done) {
    const r = res.matchResult;
    round.status = 'complete';
    round.result = r;
    if(!r.win){
      // V4.1 checkpoints keep the event and its original round seed. A failed
      // round can be attempted again without forfeiting earned earlier rounds.
      round.status='pending';
      round.roundMatch=null;
      round.attempts=(round.attempts||0)+1;
      return {ok:true,roundDone:true,retry:true,result:r,next:round};
    }
    match.roundIndex += 1;
    if (match.roundIndex >= match.rounds.length) return finishNational(match, 'champion');
    return { ok: true, roundDone: true, result: r, next: nationalCurrentRound(match) };
  }
  return res;
}

/** 放弃本届（不伪造成绩，已得轮次保留） */
export function nationalAbandon(match) {
  if (!match || match.done) return { ok: false, reason: '本届已结束' };
  for (const r of match.rounds) {
    if (r.status === 'pending') r.status = 'not-run';
    else if (r.status === 'active') r.status = 'abandoned';
  }
  return finishNational(match, 'abandoned');
}

/**
 * 结算一届。
 * ★ 普通淘汰/放弃 **不** 销毁成刀，也 **不** 套锻造 Risk。
 */
export function finishNational(match, reason = 'eliminated') {
  if (!match || match.done) return { ok: false, reason: '本届已结束' };
  const done = match.rounds.filter((r) => r.status === 'complete' && r.result);
  const wins = done.filter((r) => r.result.win).length;
  const champion = reason === 'champion';
  match.done = true;
  match.result = {
    version: FORMAL_MATCH_VERSION,
    reason,
    champion,
    wins,
    rounds: done.length,
    bladeId: match.blade.id,
    bladeName: match.blade.name,
    /* 普通淘汰保留成刀；正式断刀政策仍待定 */
    bladeDestroyed: false,
    permanentRiskPolicy: 'FORMAL_RISK_TBD',
    roundsDetail: match.rounds.map((r) => ({
      round: r.round, label: r.label, gradient: r.gradient,
      status: r.status,
      composite: r.result?.composite ?? null,
      target: r.result?.target ?? null,
      win: r.result?.win ?? null,
      primary: r.result?.cut?.structure?.primary || 0,
      primaryCompleted: r.result?.cut?.structure?.completed === true,
      projectScores: r.result?.projectScores || [],
      honors:r.result?.honors || [],
    })),
    report: {
      headline: champion ? '全国大赛冠军'
        : reason === 'abandoned' ? '本届主动退出'
          : `止步${(match.rounds[Math.min(match.roundIndex, match.rounds.length - 1)] || {}).label || ''}`,
      lines: [
        `代表刀：${match.blade.name}`,
        `完成 ${done.length}/${match.rounds.length} 轮，胜 ${wins} 轮`,
        ...match.rounds.map((r) => {
          const sub = r.result ? `合成 ${r.result.composite} / 目标 ${r.result.target}` : (r.status === 'pending' ? '未进行' : r.status === 'abandoned' ? '已退出' : '未进行');
          return `${r.label}：${sub}`;
        }),
        champion ? '冠军写入赛事历史与这把刀的履历。' : '普通淘汰不等于断刀：成刀与全部履历保留，可以再战一届。',
      ],
    },
  };
  return { ok: true, done: true, result: match.result };
}

export default {
  FORMAL_MATCH_VERSION, validateApexRoster, createFormalMatch, currentTest, testTask,
  submitTest, abandon, finishMatch, APEX_ROUNDS, createApexMatch, apexAvailable,
  apexDispatch, apexSubmit, apexRetryRound, finishApex,
  NATIONAL_ROUNDS_FORMAL, createNationalMatch, nationalCurrentRound, nationalStartRound,
  nationalSubmit, nationalAbandon, finishNational,
};
