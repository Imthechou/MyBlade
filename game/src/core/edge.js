/**
 * 核心玩法层 · S7 刃线模拟小游戏（rework T05）
 *
 * 「系统根据轨迹贴合度、稳定性与完成度评定 MISS / GOOD / GREAT / PERFECT」
 * 「操作结果**有限**影响开刃质量及最终六维，不直接决定成刀评分或稀有度」
 *   → 只给锋利（与少量工艺）加成，且受 EDGE_SHARP_CAP 约束；
 *     不进评分倍率，不影响稀有度。
 *
 * ★★ rework T05 修了什么（审计问题 9）★★
 *   改造前的三个实际缺陷：
 *   ① UI 把整条轨迹预填 0.5，按钮立刻可提交 →
 *      `accuracy()` 只比较已有的两个等长数组，
 *      **没画过的采样点也算分**，1000 种子默认路径得到 497 次 GOOD / 503 次 MISS。
 *   ② 题目是 `baseline(seed)` 的双正弦随机波形，**与这把刀的刀型/刃线无关**。
 *   ③ 只有偏差均值，没有覆盖率、没有稳定性，也没有处理触摸稀疏采样。
 *
 *   现在：
 *   · 基准线由**刀型的刃线形状**生成（data/bladeEffects.EDGE_SHAPES），
 *     seed 只提供轻微的确定性扰动 —— 同刀同 seed 同一条线；
 *   · `submit()` 接收**真实采样**（{index, value} 数组 + 覆盖信息），
 *     显式区分「未绘制」与「已绘制」；
 *   · 完成度（覆盖率）、贴合度（偏差）、稳定性（抖动）三项分别评定；
 *   · 无操作 → 必然 MISS，不会再有“空白 GOOD”；
 *   · 允许跳过并记 MISS，不强制卡住流程；
 *   · 重复提交取最优差值，不累加收益。
 *
 * 纯逻辑：不碰 DOM。UI 只负责采集采样点并调用 submit()。
 */

import {
  EDGE_TIERS, EDGE_SHARP_CAP, EDGE_TOLERANCE, EDGE_SAMPLES,
  CONTOUR_SAMPLES, CONTOUR_ATTEMPT_MULTIPLIERS,
  EDGE_COVERAGE_MIN, EDGE_STABILITY_TOLERANCE,
} from '../data/balance.js';
import { EDGE_SHAPES, EDGE_SHAPE_FALLBACK } from '../data/bladeEffects.js';
import * as RNG from '../platform/rng.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 取刀型的刃线形状（未知刀型 → 中性直刃，不随机生成） */
export function shapeOf(knifeTypeId) {
  const s = (knifeTypeId && EDGE_SHAPES[knifeTypeId]) || null;
  return { knifeTypeId: knifeTypeId || null, known: !!s, ...(s || EDGE_SHAPE_FALLBACK) };
}

/**
 * 生成基准刃线（确定性）。
 *
 * 形状来自刀型：整体弯曲 curve、中段内凹 recurve、刀尖上翘 tip、中部膨肚 belly、
 * 波浪刃 wave。seed 只在其中加**很小**的确定性扰动，保证
 * 「同一把刀的刃线本质不变，重开不会换一道完全无关的题」。
 *
 * 返回值归一化到 0–1（0 = 下缘，1 = 上缘）。
 */
export function baseline(seed, knifeTypeId = null, n = EDGE_SAMPLES) {
  const shape = shapeOf(knifeTypeId);
  const rng = RNG.stream(seed, 'edge-shape', knifeTypeId || 'none');

  // 确定性微扰（幅度 < 形状本身的 12%，不会改变刀型辨识）
  const jCurve = (rng() - 0.5) * 0.06;
  const jTip = (rng() - 0.5) * 0.05;
  const jBelly = (rng() - 0.5) * 0.05;
  const wavePhase = rng() * Math.PI * 2;

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    // 整体弯曲：沿长度线性抬升
    let v = (shape.curve + jCurve) * t;
    // 中部膨肚：对称的钟形，峰值在 t=0.55
    const belly = (shape.belly + jBelly) * Math.exp(-Math.pow((t - 0.55) / 0.30, 2));
    v += belly;
    // 中段内凹（S 形刃）
    const recurve = shape.recurve * Math.exp(-Math.pow((t - 0.32) / 0.22, 2));
    v -= recurve;
    // 刀尖上翘：靠近末端快速抬升
    v += (shape.tip + jTip) * Math.pow(t, 3.2);
    // 波浪刃（马来剑）
    if (shape.wave) v += shape.wave * 0.12 * Math.sin(t * Math.PI * 5 + wavePhase);
    out[i] = v;
  }

  // 归一化到 0–1
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) { if (v < min) min = v; if (v > max) max = v; }
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < n; i++) out[i] = (out[i] - min) / span;
  return out;
}

/** 生成题目（UI 用） */
export function makeTask(run) {
  const points = baseline(run.seed, run.knifeTypeId);
  return {
    points,
    id: `edge-${run.seed}-${run.knifeTypeId || 'none'}`,
    knifeTypeId: run.knifeTypeId || null,
    shape: shapeOf(run.knifeTypeId),
    n: points.length,
  };
}

/**
 * 把 UI 的原始采样归一成「已绘制」的定长轨迹。
 *
 * @param {Array} samples  [{index, value}] 或 {index: value} 或等长定长数组
 * @param {number} n      题目采样数
 * @returns {{values:Float64Array, covered:Uint8Array, coverage:number, density:number, gaps:number}}
 */
export function normalizeSamples(samples, n = EDGE_SAMPLES) {
  const values = new Float64Array(n);
  const covered = new Uint8Array(n);
  let drawn = 0;
  let minIdx = Infinity;
  let maxIdx = -Infinity;

  const put = (i, v) => {
    const idx = Math.round(Number(i));
    if (!Number.isFinite(idx) || idx < 0 || idx >= n) return;
    const val = Number(v);
    if (!Number.isFinite(val)) return;
    values[idx] = clamp01(val);
    if (!covered[idx]) drawn += 1;
    covered[idx] = 1;
    if (idx < minIdx) minIdx = idx;
    if (idx > maxIdx) maxIdx = idx;
  };

  if (Array.isArray(samples)) {
    if (samples.length && typeof samples[0] === 'object' && samples[0] !== null) {
      for (const s of samples) if (s) put(s.index ?? s.i, s.value ?? s.v ?? s.y);
    } else {
      // 裸数组：无法区分「未绘制」，全部视为已绘制（旧调用方兼容路径）
      for (let i = 0; i < Math.min(n, samples.length); i++) put(i, samples[i]);
    }
  } else if (samples && typeof samples === 'object') {
    for (const [k, v] of Object.entries(samples)) put(k, v);
  }

  /* 覆盖连续性：把首个与末个绘制点之间视为「应该覆盖的区间」，
     区间内没画到的点算空洞。稀疏采样（触摸事件合并）由插值补齐，
     但**空洞比例**仍会进入完成度评价 —— 不画就不是完美。 */
  let gaps = 0;
  if (drawn >= 2 && maxIdx > minIdx) {
    for (let i = minIdx; i <= maxIdx; i++) {
      if (covered[i]) continue;
      // 两侧都有已绘制点 → 插值补齐（触摸稀疏采样）
      let l = i - 1;
      while (l >= minIdx && !covered[l]) l--;
      let r = i + 1;
      while (r <= maxIdx && !covered[r]) r++;
      if (l >= minIdx && r <= maxIdx) {
        const t = (i - l) / (r - l);
        values[i] = values[l] + (values[r] - values[l]) * t;
        covered[i] = 1;
      } else {
        gaps += 1;
      }
    }
  }

  const span = drawn >= 2 ? (maxIdx - minIdx + 1) : 0;
  const coverage = n > 1 ? span / n : 0;
  const density = span > 0 ? drawn / span : 0;
  return { values, covered, coverage, density, gaps, drawn, minIdx, maxIdx };
}

/**
 * 三项评价（T05 核心）。
 *
 * @returns {{fidelity:number, coverage:number, stability:number, quality:number, drawn:number, gaps:number}}
 *   fidelity  —— 贴合度（已绘制点上的平均偏差）（0–1）
 *   coverage  —— 完成度（沿刃线覆盖的区间占比 × 空洞惩罚）（0–1）
 *   stability —— 稳定性（相邻采样点的抖动越小越高）（0–1）
 *   quality   —— 综合质量 = 三项加权（未绘制时强制 0）
 */
export function evaluate(base, normalized) {
  const n = Math.min((base || []).length, normalized?.values?.length || 0);
  if (n < 2) {
    return { fidelity: 0, coverage: 0, stability: 0, quality: 0, drawn: 0, gaps: 0 };
  }

  // ── ① 贴合度：只在**已绘制**的点上算偏差 ──
  let devSum = 0;
  let devN = 0;
  for (let i = 0; i < n; i++) {
    if (!normalized.covered[i]) continue;
    devSum += Math.abs(base[i] - normalized.values[i]);
    devN += 1;
  }
  /* ★ 关键：一个点都没画 → fidelity 必须为 0。
     改造前 accuracy() 把预填的 0.5 当真实轨迹，于是“不操作也有概率 GOOD”。 */
  const fidelity = devN === 0 ? 0 : clamp01(1 - (devSum / devN) / EDGE_TOLERANCE);

  // ── ② 完成度：覆盖区间 × 空洞惩罚 ──
  const holePenalty = normalized.gaps > 0
    ? Math.max(0, 1 - normalized.gaps / Math.max(1, n * 0.15))
    : 1;
  const coverage = devN === 0 ? 0 : clamp01(normalized.coverage * holePenalty);

  // ── ③ 稳定性：相邻已绘制点的二阶差分（相对基准本身的平滑度） ──
  let jitter = 0;
  let jN = 0;
  for (let i = 1; i < n - 1; i++) {
    if (!normalized.covered[i] || !normalized.covered[i - 1] || !normalized.covered[i + 1]) continue;
    // 玩家的二阶差分 - 基准的二阶差分 = 额外抖动
    const p2 = normalized.values[i - 1] - 2 * normalized.values[i] + normalized.values[i + 1];
    const b2 = base[i - 1] - 2 * base[i] + base[i + 1];
    jitter += Math.abs(p2 - b2);
    jN += 1;
  }
  const stability = jN === 0 ? 0 : clamp01(1 - (jitter / jN) / EDGE_STABILITY_TOLERANCE);

  // ── 综合质量：贴合 55% + 完成度 30% + 稳定 15% ──
  let quality = devN === 0 ? 0 : clamp01(fidelity * 0.55 + coverage * 0.30 + stability * 0.15);

  /* ★ rework T05：完成度硬门槛。
     光靠加权平均，只画了 30% 但完全贴合也能摸到 GREAT（0.80）——
     这与「完成程度」的承诺不符。覆盖不足 EDGE_COVERAGE_MIN 时，
     质量封顶在 GOOD 门槛以下（EDGE_TIERS 里 GOOD 的 min 是 0.35）。 */
  if (devN === 0) quality = 0;
  else if (coverage < EDGE_COVERAGE_MIN) {
    const goodMin = (EDGE_TIERS.find((t) => t.id === 'good') || { min: 0.35 }).min;
    quality = Math.min(quality, goodMin - 0.01);
  }

  return { fidelity, coverage, stability, quality, drawn: devN, gaps: normalized.gaps };
}

/**
 * 兼容入口：等长数组 → 贴合度（旧调用方/单测用）。
 * ⚠ 已知这是「全部视为已绘制」的口径；真实玩法请用 evaluate()。
 */
export function accuracy(base, path) {
  const n = Math.min((base || []).length, (path || []).length);
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(base[i] - path[i]);
  const m = sum / n;
  return Math.max(0, Math.min(1, 1 - m / EDGE_TOLERANCE));
}

/** Mobile 3D projected edge: only coverage and proximity, no speed/stability penalty. */
export function projectedQuality(fidelity, coverage) {
  if (coverage >= .90 && fidelity >= .84) return .90;
  if (coverage >= .80 && fidelity >= .65) return .70;
  if (coverage >= .60 && fidelity >= .45) return .45;
  return 0;
}
export function tierOf(quality) {
  for (let i = EDGE_TIERS.length - 1; i >= 0; i--) if (quality >= EDGE_TIERS[i].min) return EDGE_TIERS[i];
  return EDGE_TIERS[0];
}

/**
 * 提交一次刃线操作。
 *
 * @param {object} run
 * @param {Array|object} samples 真实采样（见 normalizeSamples）；跳过时传 null
 * @param {object} [opts]
 * @param {boolean} [opts.skipped] 玩家主动跳过 → 按 MISS 处理
 *
 * ★ 多次提交取**最优**（不累加），防止反复提交刷分，也守住「小游戏不逆转构筑」。
 */
/**
 * S7 contour: one number (fit %) drives the entire award.
 * Coverage is only an eligibility guard; it never adds score.
 * Each sample encodes the shortest on-screen distance to the ACTUAL contour:
 * .5 means perfect contact, 1 means outside the 28 px soft band.
 */
export function contourPreview(samples, attemptsUsed = 1, specialist = null) {
  const normalized = normalizeSamples(samples, CONTOUR_SAMPLES);
  const coverage = normalized.coverage;
  const deviations = [];
  for(let i = 0;i < CONTOUR_SAMPLES;i++){
    if(normalized.covered[i]) deviations.push(Math.min(1, Math.abs(normalized.values[i] - 0.5) * 2));
  }
  const fit = deviations.length ? clamp01(1 - deviations.reduce((a,b)=>a+b,0) / deviations.length) : 0;
  const eligible = coverage >= .78 && normalized.gaps <= 2;
  const attempts = Math.max(1,Math.min(3,Math.round(Number(attemptsUsed)||1)));
  const multiplier = attempts===2 && specialist?.id==='edge'
    ? specialist.boost : CONTOUR_ATTEMPT_MULTIPLIERS[attempts-1];
  const baseSharp = eligible ? Math.round(120 * fit) : 0;
  const sharp = Math.min(EDGE_SHARP_CAP, Math.round(baseSharp * multiplier));
  return {fit,coverage,eligible,attempts,multiplier,baseSharp,bonus:sharp-baseSharp,sharp};
}
function submitContour(run,samples,{skipped=false,attemptsUsed=1}={}) {
  const score = contourPreview(skipped?[]:samples,attemptsUsed,run.specialist);
  const prev = run.edge || {sharp:0,craft:0};
  const delta = score.sharp - (prev.sharp||0);
  if(delta>0) run.stats.sharpness = Math.max(0,(run.stats.sharpness||0)+delta);
  const mastery=score.sharp/EDGE_SHARP_CAP;
  const skin=run.pendingSkin||(run.pendingSkin={});
  const variants=skin.variants||(skin.variants={});
  variants.edge={...(variants.edge||{}),
    grind:{glow:.22*mastery,sharpen:.45*mastery,heat:.08*(1-mastery)}};
  run.edge={...score,quality:score.fit,acc:Math.round(score.fit*100)/100,
    fidelity:score.fit,coverage:score.coverage,sharp:score.sharp,craft:0,
    tier:score.eligible?'contour':'miss',tierName:score.eligible?'轮廓开刃':'失误',done:true,skipped:!!skipped};
  return run.edge;
}

/** Read-only labels shared by appraisal and old archived blades. Does not regrade the operation. */
export function resultView(edge) {
  if (!edge) return null;
  const names = {miss:'失误',good:'良好',great:'优异',perfect:'完美',contour:'轮廓开刃'};
  const label = names[edge.tier] || edge.tierName || '已开刃';
  const fit = clamp01(edge.fit ?? edge.acc ?? edge.quality);
  return { label, fitText: `${Math.round(fit * 100)}%`, sharp: Number(edge.sharp) || 0 };
}

export function submit(run, samples, { skipped = false, projected = false, attemptsUsed = 1 } = {}) {
  if(projected) return submitContour(run,samples,{skipped,attemptsUsed});
  const base = projected ? new Array(EDGE_SAMPLES).fill(0.5) : baseline(run.seed, run.knifeTypeId);
  const n = base.length;
  const normalized = normalizeSamples(skipped ? [] : samples, n);
  const ev = skipped
    ? { fidelity: 0, coverage: 0, stability: 0, quality: 0, drawn: 0, gaps: 0 }
    : evaluate(base, normalized);
  if (projected && !skipped) ev.quality = projectedQuality(ev.fidelity, ev.coverage);
  const tier = tierOf(ev.quality);

  const prev = run.edge || { tier: null, acc: 0, sharp: 0, craft: 0 };
  const prevQuality = Number(prev.quality ?? prev.rawAcc ?? 0);
  // 重复提交：质量不更高、档位不更高 → 原样返回，不重复加收益
  if (prev.done && ev.quality <= prevQuality && tier.sharp <= (prev.sharp || 0)) return prev;

  const sharp = Math.min(EDGE_SHARP_CAP, Math.max(prev.sharp || 0, tier.sharp));
  const craft = tier.craft;

  // 只补差值：已注入过的部分不重复加
  const sharpDiff = sharp - (prev.sharp || 0);
  if (sharpDiff > 0) run.stats.sharpness = Math.max(0, (run.stats.sharpness || 0) + sharpDiff);
  const craftDiff = craft - (prev.craft || 0);
  if (craftDiff !== 0) run.stats.craft = Math.max(0, (run.stats.craft || 0) + craftDiff);

  run.edge = {
    tier: tier.id,
    tierName: tier.name,
    /* acc 保留为「综合质量」的百分数，UI 与历史档案沿用这个字段名 */
    acc: Math.round(ev.quality * 100) / 100,
    quality: ev.quality,
    fidelity: Math.round(ev.fidelity * 100) / 100,
    coverage: Math.round(ev.coverage * 100) / 100,
    stability: Math.round(ev.stability * 100) / 100,
    drawn: ev.drawn,
    gaps: ev.gaps,
    skipped: !!skipped,
    rawAcc: ev.quality,
    sharp, craft,
    done: true,
  };

  // Card choice owns the edge style; the minigame adds only bounded polish.
  // Persist the existing grind slot so S8/S9 and archived knives inherit it.
  const mastery = { miss: 0, good: 0.40, great: 0.72, perfect: 1 }[tier.id] || 0;
  const skin = run.pendingSkin || (run.pendingSkin = {});
  const variants = skin.variants || (skin.variants = {});
  variants.edge = {
    ...(variants.edge || {}),
    grind: { glow: 0.22 * mastery, sharpen: 0.45 * mastery, heat: 0.08 * (1 - mastery) },
  };
  return run.edge;
}

/** 无交互时的确定性兜底（冒烟/单测用）：按质量模拟一条真实轨迹 */
export function autoPlay(run, quality = 0.7) {
  const base = baseline(run.seed, run.knifeTypeId);
  const rng = RNG.stream(run.seed, 'edge-auto');
  const noise = (1 - clamp01(quality)) * 0.10;
  const samples = base.map((v, i) => ({ index: i, value: clamp01(v + (rng() - 0.5) * noise) }));
  return submit(run, samples);
}

export default {
  baseline, makeTask, shapeOf, normalizeSamples, evaluate, accuracy, tierOf, contourPreview, submit, autoPlay,
  EDGE_COVERAGE_MIN,
};
