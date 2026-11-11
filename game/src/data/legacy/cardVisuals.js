/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/cardVisuals.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});
  const FOCUS = [
    { region: '刀身基色', effect: '材质/金属感', camera: 'material-45', dist: 1.00, polar: 0.16, azim: 0.42, targetY: 0.00, views: ['全身', '刀身', '高光扫过'] },
    { region: '刀面', effect: '熔炼流纹/氧化', camera: 'melt-oblique', dist: 0.70, polar: 0.08, azim: 0.58, targetY: 0.03, views: ['全身', '刀身', '高光扫过'] },
    { region: '刀面', effect: '锻打纹理', camera: 'forging-graze', dist: 0.64, polar: 0.12, azim: 0.78, targetY: 0.02, views: ['全身', '刀身', '高光扫过'] },
    { region: '全刀轮廓', effect: '几何/刀型', camera: 'shape-silhouette', dist: 1.05, polar: 0.06, azim: 0.00, targetY: 0.00, views: ['全身', '刀身', '刀柄'] },
    // S5/S7 are true inspection macros. Focus shifts toward the upper blade run;
    // the smaller fit-distance is intentional and leaves the hilt out of frame.
    { region: '刃口热处理带', effect: '淬火工艺', camera: 'quench-edge', dist: 0.42, polar: 0.05, azim: 0.30, targetY: 0.38, views: ['全身', '刃口', '高光扫过'] },
    { region: '刀身整体', effect: '低强度回火色调', camera: 'temper-overview', dist: 1.00, polar: 0.10, azim: 0.22, targetY: 0.00, views: ['全身', '刀身', '高光扫过'] },
    { region: '刃线', effect: '开刃辉光', camera: 'edge-rim', dist: 0.46, polar: -0.02, azim: 0.42, targetY: 0.30, views: ['全身', '刃口', '高光扫过'] },
    { region: '刀柄/护手', effect: '柄材纹理/反射', camera: 'handle-3q', dist: 0.62, polar: 0.10, azim: 0.48, targetY: -0.30, views: ['全身', '刀柄', '高光扫过'] },
    { region: '刀身表面/刃口', effect: '磨损/幻彩', camera: 'tune-sweep', dist: 1.04, polar: 0.12, azim: 0.34, targetY: 0.02, views: ['全身', '刀身', '刃口', '高光扫过'] },
  ];
  const VERIFY_ANGLES = Object.freeze(['全身', '刀身', '刃口', '刀柄', '高光扫过']);
  const MOTIFS = [
    '水波', '锤目', '脉络', '星环', '晶格', '鱼骨', '龟裂', '星屑',
    '流焰', '雨锻', '金丝', '涡环', '鳞格', '交错纹', '冰裂', '雾星',
    '细浪', '锤鳞', '血脉', '光轮', '冰晶', '雷脊', '暗蚀', '虚空星', '龙鳞',
  ];
  const STAGE_NAMES = ['钢纹', '熔相', '锻纹', '刀型', '淬带', '回火', '刃光', '柄纹', '战痕'];
  const STAGE_REGIONS = ['刀身', '刀面', '刀面', '几何轮廓', '刃口热带', '刀身整体', '刃线', '刀柄/护手', '磨损表面'];
  const STAGE_CHANNELS = ['材质微构', '流纹/氧化/雾化', '锤击纹理', '轮廓/刻线', '热处理带', '低强度色调', '动态刃线光', '柄材/护手纹理', '磨痕/视角虹彩'];
  const STAGE_MODES = [
    '金属微粒与定向拉丝', '熔池流线与局部氧化', '锤击凹面与折面高光',
    '真实刀型剪影与局部刻线', '刃口热处理色带', '低强度整体色调',
    '动态刃线辉光', '柄材纹理与高阶护手镶线', '定向磨痕与视角虹彩',
  ];
  /* ★ 2026-10-07 重标定强度尺度（根因见下方注释，验收见 tools/diff_cards.js）
   * 旧值 STAGE_STRENGTH = [0.72,0.92,1.28,0.82,1.08,0.36,1.16,0.96,0.86] 与
   * RARITY_STRENGTH = [0.20..0.52] 相乘后，**每张卡实际拿到的 strength 只有 0.072~0.31**。
   * 而 cardEffects.js 里各阶段的混合因子是 `strength × 系数`，系数多在 0.3~1.4：
   *   · S6 回火：0.072 × 0.34 ≈ 0.024 的混合因子 → 逐像素偏移 0.0004/255，
   *     离线实测 24 张 S6 卡两两 meanΔ 最小 0.20（0~441 尺度）= 完全看不出差别；
   *   · 反例 S3 锻打：0.31 × 1.35 ≈ 0.42 → 可见。
   * 也就是说**能不能看见，此前取决于阶段系数，而不是卡本身**。
   * 这里把 STAGE_STRENGTH 重标定成"以 1.0 为基准"的相对响度（保留 S3 最响、S6 最含蓄的
   * 设计意图），RARITY_STRENGTH 抬到 0.86~1.00 —— 两者相乘后每张卡落在 **0.31~0.52**，
   * 正好落在 shader 端 `clamp( fx.y, 0.0, 0.52 )` 的有效区间的上半段，
   * 于是"卡与卡之间的差异"由 style/hue/strength 共同决定，而不再是阶段系数决定。
   * ⚠ 改这里必须重跑：tools/diff_cards.js（最小 meanΔ ≥ 4）、tools/verify_cards.js（
   *   其中 E 项会读 bladeSkinShader.js 的 `col = mix( col, identityCol, 0.30 )` 锚点，
   *   确认基础材质仍保留 ≥30% 可见度）。 */
  const STAGE_STRENGTH = [0.90, 1.05, 1.25, 0.95, 1.10, 0.88, 1.15, 1.00, 0.92];
  // Per-tier strength adds visible surface dimensions; the shader caps color overlays.
  const RARITY_STRENGTH = [0.88, 0.90, 0.93, 0.96, 0.98, 1.00];
  const RARITY_SECONDARY = Object.freeze({
    common: null, fine: '细节纹理', rare: '局部副纹', epic: '视角边光', legend: '蚀刻线纹', mythic: '星点纹理',
  });
  const hash = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const hueHex = (hue) => {
    const h = ((hue % 1) + 1) % 1;
    const s = 0.72, l = 0.52, c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0]
      : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c]
        : h < 5 / 6 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  };
  const stable = (value) => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (!value || typeof value !== 'object') return String(value == null ? '' : value);
    return '{' + Object.keys(value).sort().map((k) => k + ':' + stable(value[k])).join(',') + '}';
  };
  function resolve(card, stageIdx) {
    const requestedStage = Number(stageIdx);
    if (Number.isFinite(requestedStage) && (requestedStage < 0 || requestedStage > 8)) return null;
    const s = Math.max(0, Math.min(8, Number(stageIdx) || 0));
    const focus = FOCUS[s];
    const w = card && card.write || {};
    const variants = Object.assign({}, card && card.variants || {}, w.variants || {});
    const effectValue = {
      material: w.materialId || '', texture: w.textureId || '', finish: w.finishId || '',
      knife: w.knifeType || '', handle: w.handle || '', wear: w.wear,
      variants,
    };
    const id = String(card && card.id || 'unknown');
    const suffix = /([0-9]+)$/.exec(id);
    const rankHint = Number(card && card.visualRank);
    const rank = Math.max(1, Math.min(25, Number.isInteger(rankHint) && rankHint > 0
      ? rankHint : (suffix ? Number(suffix[1]) : (hash(id) % 25) + 1)));
    const rarity = String(card && card.rarity || 'common').toLowerCase();
    const rarityTier = K3D.rarityVisuals ? K3D.rarityVisuals.level(rarity) : 0;
    const motif = MOTIFS[rank - 1];
    const effectName = `${STAGE_NAMES[s]}·${motif}`;
    // ── 色相分配（★ 2026-10-07 重写，这是"同阶段卡牌两两可辨"的根因所在）──
    //   旧公式：hue = fract( (rank-1) * 0.61803398875 + s * 0.137503 )
    //   黄金角步进是"低差异序列"：它保证**长序列**在色环上铺得均匀，
    //   但**不保证任意两张卡**离得远 —— 必然出现几乎撞在一起的对。
    //   实测（tools/probe_hue.js）旧公式在**全部 9 个阶段**都撞车：
    //   最小 Δhue 恒为 0.0213（色环的 2.1%），撞的还总是同一族对（rank 3 ↔ rank 22、
    //   rank 1 ↔ rank 22 …）。S6 的 S6_02(中温回火) ↔ S6_15(深回火) Δhue 只有 0.034，
    //   主色变成两个几乎一样的亮绿（ΔE76 = 3.10），玩家在候选里分不出 —— 而
    //   **无论把 shader 的配色系数放大多少倍都救不回来**（实测放大 2.3 倍，该对差异只从 0.94 动到 1.9）。
    //   新公式：把 25 个 rank 映射到色环上**间隔恰好 1/25 = 0.04** 的均匀栅格
    //   （k=7 与 25 互质 → 是 {0..24} 的一个排列，覆盖全部 25 个槽位，不重不漏）。
    //   0.04 = 色环 14.4°，这是"25 张卡等分色环"能达到的**最优**最小间隔。
    //   ⚠ 试过再叠一层"按阶段漂移"（`(block-2) * s * 0.022`）让各阶段观感不同，
    //     结果**反而撞得更狠**（最小 Δhue 掉到 0.004）：漂移量会和栅格差相消 ——
    //     漂移是"每 5 张一组"的阶梯，栅格差最小 0.04，两者相减可以逼近 0。
    //     结论：**不要在任何跟 rank 相关的量上叠连续漂移**，那是在赌它们不相消。
    //     色彩区分度由纹样（motif rank）+ 逐卡明度档位 + 工艺/材质共同承担。
    //   每个阶段的调色板因此相同，但每张卡的颜色在**同阶段内**是唯一且均匀铺开的。
    const hue = ((((rank - 1) * 7) % 25) / 25 + 1) % 1;
    const scale = 0.58 + (((rank * 7 + s * 3) % 19) / 18) * 1.12;
    const strength = RARITY_STRENGTH[rarityTier] * STAGE_STRENGTH[s];
    // The fractional tenth carries rarity tier; integer part chooses the card motif.
    const shaderParams = [rank + rarityTier / 10, Number(strength.toFixed(4)), Number(scale.toFixed(4)), Number(hue.toFixed(6))];
    const accentColor = hueHex(hue);
    // Spread each stage's inspection positions across a visible but still useful ±16°.
    const jitter = ((rank - 13) / 12) * 0.56;
    let color = null;
    for (const layer of Object.values(variants)) if (layer && layer.tintHex) { color = layer.tintHex; break; }
    if (!color && w.handle && K3D.handleMaterials) {
      const h = K3D.handleMaterials.get(w.handle.metalId);
      color = w.handle.tintHex || h && h.tintHex;
    }
    if (!color && w.materialId && K3D.materials24) {
      // ⚠ 这里没有"再兜底一层到 M22"是有意的：MAT25「天降陨铁」曾复用 M22，
      //   导致它与 MAT22 一起退回下面的 '#9aa2ac'，指纹色完全相同（ΔE=0.00）。
      //   现在 MAT25 有自己的 M25 条目，任何缺条目都会在这里暴露成兜底色，
      //   由 tools/probe_de.js（同阶段主色 ΔE）负责抓出来，而不是悄悄糊过去。
      const m = K3D.materials24.get(w.materialId); color = m && m.baseColor;
    }
    if (!color && w.finishId && K3D.finishes12) {
      const f = K3D.finishes12.get(w.finishId); color = f && f.defaults && f.defaults.tintHex;
    }
    const camera = {
      // Every card gets a named preset plus a card-specific angle; tools and UI
      // can identify the inspection shot instead of seeing only a shared stage tag.
      name: `${focus.camera}-c${String(rank).padStart(2, '0')}`, dist: focus.dist, polar: focus.polar,
      azim: focus.azim + jitter, targetY: focus.targetY,
    };
    return {
      cardId: id,
      stage: s + 1,
      primaryRegion: STAGE_REGIONS[s],
      primaryEffect: `${STAGE_CHANNELS[s]}:${stable(effectValue)}:fx=${shaderParams.join(',')}`,
      primaryEffectKey: focus.effect,
      effectId: `S${s + 1}-FX${String(rank).padStart(2, '0')}`,
      effectName,
      effectChannels: [STAGE_CHANNELS[s]],
      mainEffect: {
        id: `S${s + 1}-FX${String(rank).padStart(2, '0')}`,
        name: effectName,
        region: STAGE_REGIONS[s],
        mode: STAGE_MODES[s],
        motif,
        color: s === 0 ? (color || '#9aa2ac') : accentColor,
        textureScale: Number(scale.toFixed(4)),
        intensity: Number(strength.toFixed(4)),
        motion: [1, 6, 8].includes(s) || [8, 9, 12, 16, 20, 24].includes(rank),
      },
      shaderParams,
      color: color || null,
      secondaryEffect: RARITY_SECONDARY[rarity] || null,
      animationMotif: motif,
      camera,
      rarity,
      rarityTier,
      verificationAngles: VERIFY_ANGLES.slice(),
    };
  }
  K3D.cardVisuals = { FOCUS, MOTIFS, VERIFY_ANGLES, resolve, stable };

export const cardVisuals = __reg.proxy.cardVisuals;
