/**
 * 固定程序族 v2 —— 「同一份源码服务所有卡」的刀身材质
 *
 * ── 为什么需要这一层（docs/RENDER_REARCHITECTURE_S1_S9.md §4） ─────────────
 * 旧实现的可交互长帧几乎全部来自**按卡换源码**：
 *   `k3dPattern` 24 路 / `k3dCardMotif` 25 路 / `k3dApplyFinish` 12 路 /
 *   `k3dHandleLook` 24 路，全部走"运行时 uniform 整数分派"，
 *   于是编译必须把每条分支都翻译一遍；后来改成"按 id 裁分支"，
 *   代价又变成**换一张卡就换一份 GLSL → 重新链接**（实测 S5 3.8s / S8 4.4s 首次）。
 *
 * v2 的做法（严格按方案的三条硬约束）：
 *   ① 不关闭特化后塞回全部 GLSL —— 这里只保留当前真正会被调用的函数定义，
 *      其余分支连源码都不进；
 *   ② 不靠预热全部组合 —— 唯一随卡变化的 **工艺** 被收敛成一组固定算子
 *      （见 finishRecipe.js），源码不再随卡变化；
 *   ③ 静态图案改纹理输入 —— 刀身纹样走 9 槽烘焙图集（bakedMotif.js），
 *      锻打纹理走既有 S3 图像。
 *
 * 程序键（family）只允许：`v2 / 是否过程模型 / 是否透射 / pass`。
 * **禁止**包含 cardId、纹理 id、finishId、柄 kind、seed、卡牌组合。
 *
 * 视觉继承：S3 纹理公式、阶段卡效果 `k3dApplyStageCardFx`、S6 回火 `k3dApplyTemper`、
 * S7 刃线 `k3dApplyEdgeGlow`、S9 调校 `k3dApplyTune`、Wear 块、稀有度细节
 * 全部沿用旧实现的**同一段数学**（逐字取用），只有 4 处分派被替换：
 *   图案 → 单一 T01（未选纹理时）/ S3 图像
 *   纹样 → 烘焙图集采样
 *   工艺 → 固定算子
 *   柄   → 仍按 kind 特化（S8 一局只用一种柄；不在本次 P1 的换卡热路径上）
 */
import { extractFunctions, extractFunction, specializeStageChain } from './glslSlices.js';
import { finishOperators, resolveS5Effect, applyS5Effect, refineS5BaseFinish, s5CardArt, S5_EFFECTS } from './finishRecipe.js';
import { getS5OpticalTexture, S5_OPTICAL_PALETTES, s5Pattern } from './s5OpticalArt.js';
import { buildNormalFragment, surfaceParamsOf } from './surfaceDetail.js';
import { getSurfaceAtlas, tileRectOf, STAGE_SURFACE_KIND } from './normalAtlas.js';

const K3D = () => globalThis.K3D || {};
let sourceCache = null;

/** 版本号进 signature：改源码必须同时改它（否则 three 会复用旧 program）。 */
/* ★ 2026-10-21：v4 —— 色带改成"空间掩码 + uV2Cover"（方案 §7 覆盖率）。
   版本号进 three 的 program cache key（customProgramCacheKey），源码变了必须跟着变，
   否则同会话里可能命中上一版的 program。 */
/* v5：补回 temper / tune / edgeGlow 三个叠加层（见下方调用点注释），改源码必须 bump */
export const FAMILY_VERSION = 'bladeV2:66';

/** 刀身上真正会用到阶段效果函数的阶段（S8 只作用于柄，不在其中）。 */
export const STAGE_FX = [1, 2, 3, 4, 5, 6, 7, 9];

/** 阶段 → 粗糙度幅度权重（对应旧 k3dApplyCardRoughness 的每档系数）。 */
const STAGE_ROUGH_WEIGHT = new Float32Array([0.34, 0.0, 0.72, 0.30, 0.30, 0.30, 0.30, 0.0, 0.20]);

/** 每阶段：(颜色权重, 粗糙度权重, 形状模式, 辉光权重)。形状见 k3dV2Stage。 */
const STAGE_CFG = new Float32Array([
  /* S1 */ 0.34, 0.34, 0.0, 0.0,
  /* S2 */ 0.16, 0.00, 1.0, 0.0,
  /* S3 */ 0.52, 0.72, 3.0, 0.0,
  /* S4 */ 0.26, 0.30, 1.0, 0.0,
  /* S5 */ 0.40, 0.30, 2.0, 0.0,
  /* S6 */ 0.20, 0.30, 1.0, 0.0,
  /* S7 */ 0.30, 0.30, 2.0, 0.35,
  /* S8 */ 0.00, 0.00, 0.0, 0.0,
  /* S9 */ 0.16, 0.20, 0.0, 0.0,
]);

/** 生成 per-stage 的阶段效果函数签名（去掉 `float stage` 形参）。 */
function stageFxHeader(n) {
  return `void k3dStageFx${n}( vec4 fx, float pat, vec2 p, float edge, float bladeEdge, float fresnel, float time,
                          inout vec3 color, inout float rough, inout float glow, vec3 edgeTint, out float mask )`;
}

/**
 * 阶段粗糙度：**一个**函数 + 每阶段的权重 uniform。
 * 旧实现是 8 路 if/else 链被 8 个调用点内联（= 64 份分支体）；这里每个阶段只是
 * 权重不同的同一段式子 —— 换卡只刷 uV2StageRough[i]，源码不变。
 */
function stageRoughSource() {
  return `
float k3dV2StageRough( vec4 fx, float pat, float baseRough, float weight ) {
  if ( fx.y <= 0.001 || weight <= 0.0005 ) return baseRough;
  /* ★ 2026-10-24（修复卡间强度梯度和失效）
     病象：卡数据给出的 fx.y 实测区间是 **0.774–1.163**（cardVisuals 的
     阶段强度 × 稀有度梯度），而旧式 clamp( fx.y, 0.0, 0.52 ) 把整段**全部顶成 0.52**。
     后果：“这张卡效果更强”这个维度完全失效 —— 所有卡、所有阶段的强度都一模一样，
     只剩 STAGE_CFG 阶段权重与纹样在起作用。这是各阶段视觉效果扁平的直接原因之一。

     ⚠ 为什么不直接把上限抬到 1.2：
       legacy 的分析记录明确写着「mix 上限 1.20 → 0.48」—— 超过 0.48–0.52 会把 S5
       刷成一整块饱和色（实测 10/12 张变“整刀纯色”）。所以上限必须留住。

     修法：把这个**实测区间**映射到 0.36–0.52。
     · 保留卡间约 1.26:1 的相对差异；
     · 平均值保持 0.52（与改前一致）—— 不能为了“恢复差异”而把整体强度压低。

     ⚠ 教训：第一版写成 mix(0.36, 0.52) 只保留了差异却把均值从 0.52 降到 ~0.39，
       全阶段对比度应声下跌 1–27%（实测）。这里改成 0.46–0.58，均值 0.52。 */
  float strength = mix( 0.46, 0.58, clamp( ( fx.y - 0.74 ) / 0.46, 0.0, 1.0 ) );
  return clamp( baseRough + ( pat - 0.5 ) * strength * weight, 0.02, 1.0 );
}`;
}

const V2_UNIFORMS = `
/* ── 纹样烘焙图集（9 槽静态 3×3 + 动画 12 帧条带）──
   声明放在这里而不是 cardEffects 块里：v2 不再保留 25 路过程函数，
   柄的 bladeMask hook 用同一个宏跳过自己的声明（见 bladeViewer）。 */
uniform sampler2D uBakedAtlas;
uniform vec4  uBakedMeta[9];
uniform sampler2D uAnimAtlas;
uniform vec4  uAnimMeta[9];

/* ── v2 固定算子参数（全部是 uniform：换卡只刷值，不换源码）── */
uniform vec4  uV2FinA;      // polish, roughMul, roughAdd, darken
uniform vec4  uV2FinB;      // tintAmt, coverBias, filmAmt, filmThickness
uniform vec4  uV2FinC;      // fresnelPow, fresnelAdd, hueShift, specLift
uniform vec4  uV2FinD;      // axialMix, rampBias, rampAmt, coat
uniform vec3  uV2FinTint;
uniform float uV2Mode;      // baseline operator family
uniform float uV2Look;      // 0 baseline; 1 Doppler; 2 hardened; 3 Fade; 4 Marble; 5 Gem
uniform sampler2D uS5OpticalMap;
uniform vec3 uS5Optical0;
uniform vec3 uS5Optical1;
uniform vec3 uS5Optical2;
uniform vec3 uS5Optical3;
uniform vec4 uV2Art;        // x S5 card ID, y effect fidelity, z freq, w direction
uniform float uV2Micro;     // 微粗糙度幅度（S5 品质轴，0 = 关闭）
uniform float uV2Cover;
uniform float uCardTier;   /* 仅当前 UI 卡：不允许回写已确认阶段 */
uniform float uStageTiers[9]; /* 每阶段各自的卡牌稀有度（0..5） */
uniform float uS4Tier;
uniform float uS5Tier;
uniform float uV2FadeMode; /* 1 = 这张卡走"材质自渐变"（只有 S5_23），下面的重映射只对它生效 */     // 色带覆盖率（方案 §7：起点 10–25%、局部上限 40%）
uniform float uV2Coat;      // 清漆增量（physicalFragment 消费）
uniform float uV2Preserve;  // 1 = 过程模型（调制而非替换）
/* ★ 2026-10-24（表面层）：刀身的真实表面结构
   x = 法线扰动强度（bumpScale）  y = 各向异性强度（拉丝/磨削）
   z = 微脊频率权重            w = 刃面折面强化
   为什么要有它：v2 之前**从未写过 normalFragment**（柄部一直在用），
   于是刀面只有解析法线 —— 颜色/粗糙度再怎么变，表面都是平的。 */
uniform vec4  uV2Surf;
/* ★ 2026-10-24（P2 · 真实贴图层）
   运行时 canvas 生成的**表面高度图集**（2×2 四个 512² 可平铺瓦片）。
   为什么不用 normalMap：P1 已有「采样高度 → 屏幕空间导数 → 法线」这条成熟通路，
   直接喂高度图就能复用，少一条出错可能（且本项目的模型不带切线，没有 TBN 基）。
   P1 的程序化凹凸有两个固有上限 —— 频率单一（像规则波纹）、细节粒度与距离无关，
   贴上真实高度图后这两个问题同时解决。 */
uniform sampler2D uV2SurfaceMap;
uniform vec4  uV2SurfTile;   // (瓦片原点 x, 瓦片原点 y, 瓦片缩放, 贴图权重 0..1)
uniform vec4  uV2SurfUv;     // (沿刀轴重复次数, 横向重复次数, 偏移 x, 偏移 y)
/* ★★ 2026-10-24（P3 · 过程模型专属曲线）

   背景：S1=ore_small / S2=molten_sphere_small / S3=blank_ingot_small
   三个阶段全走 uV2Preserve > 0.5 分支，而那段逻辑**完全一样**：
     染色 + 乘一次亮度。于是三个阶段的观感几乎相同 ——
     基线实测（_p3base）：S2 熔液 metal=0.827 / rough=0.714 / 饱和 0.445，
     **没有任何高温感**，而需求是“钢液具有高温金属光泽”。

   这里给过程模型一个独立参数：
     x = 过程阶段号（0=S1 矿石 / 1=S2 熔液 / 2=S3 胚体；-1 = 不是过程模型）
     y = 热辉光强度（S2 最高 1.0，S3 残余 0.26，S1 = 0）
     z = 颖粒/杂质感（S1 最粗 1.0，S2 0.30，S3 0.55）
     w = 金属流镀倾向（S3 最强 1.0：从矿到铁）

   ⚠ 两个已经踩过的坑（写在这里防止再犯）：
     ① 本段在 JS 模板字符串里 —— 注释中**不能出现反引号**，否则模板提前截断。
     ② 注释只能有一对 斜杠-星号 / 星号-斜杠；
        曾因多写一个闭合符号，导致后面几行注释文本变成裸 GLSL → 编译失败、刀身消失。 */
uniform vec4  uV2Proc;
uniform vec4  uV2StageCfg[9];    // 每阶段：(颜色权重, 粗糙度权重, 形状模式, 辉光权重)
uniform vec3  uV2StageTint[9];   // 每阶段的**身份色**（零 = 回落到 fx.w 的 rank 色相）
uniform float uV2StageRough[9];  // 各阶段对粗糙度的权重（固定算子，不按卡换源码）
/* 阶段纹样缓存：mapFragment 里填一次，roughnessFragment 复用（同一支片元着色器内可见） */
float k3dPat[9];
float k3dPatX;        // 锻打纹样亮度（pat.x）
float k3dS3Surf;      // S3 表面掩码（0..1）

   // S1 mid grain (single-octave)

/* S4 premium card rim glow: written in MAP_FRAGMENT, read in PHYSICAL_FRAGMENT.
   Reason it cannot stay in diffuseColor: S4 metalness is about 0.83, so
   diffuse is only 17 percent of the result and any added light is cut to
   almost nothing. totalEmissiveRadiance is added directly.
   NOTE: keep every comment here plain ASCII. Decorative box-drawing and
   star glyphs in a GLSL comment have already broken this shader once:
   the declarations ended up inside an unterminated comment block and the
   physical stage reported undeclared identifier for all three names. */
float k3dS5Coat = 0.0;
float k3dS5CoatRough = 0.15;
float k3dS5Metal = 0.0;
float k3dS4RimAmt  = 0.0;
float k3dS4SoftAmt = 0.0;
float k3dS4W       = 0.0;
vec3  k3dS4Tint    = vec3( 1.0 );
`;

const V2_HELPERS = `
/* ── v2 固定算子：薄膜干涉（视角相关，不烘进 albedo） ───────────────
   厚度 / 相位只由 uniform 给，色散用三通道相位差近似；这是克制的"油膜/阳极"层，
   不做彩虹贴纸。 */
vec3 k3dV2Film( float fres, float thickness, float hueShift ) {
  float phase = thickness * 6.2831853 * ( 0.55 + 1.35 * clamp( fres, 0.0, 1.0 ) )
              + hueShift * 6.2831853;
  return 0.5 + 0.5 * cos( vec3( phase, phase * 0.86 + 2.0944, phase * 0.72 + 4.1888 ) );
}

/* ── v2 统一阶段算子 ───────────────────────────────────────────────
   S1–S9 的卡效果不再各写一段分支，而是同一段"按纹样调明暗/粗糙 + 沿轴/斑块形状"
   的算子，形状与权重来自 uV2StageCfg。这样 8 个阶段只编译**一份**代码
   （旧实现是 8 路 if/else × 8 个调用点 = 64 份分支体）。 */
void k3dV2Stage( vec4 fx, vec4 cfg, vec3 stageTint, float pat, vec2 p, float fres, float tier,
                 inout vec3 col, inout float rough, inout float glow ) {
  if ( fx.y <= 0.001 || cfg.x <= 0.0005 ) return;
  float m;
  if ( cfg.z < 0.5 ) m = 0.55 + 0.45 * pat;                 // 微纹理（S1 / S9）
  else if ( cfg.z < 1.5 ) m = 0.35 + 0.65 * p.x;            // 沿长轴带（S2 / S4 / S6）
  else if ( cfg.z < 2.5 ) m = pat;                          // 刃侧窄带（S5 / S7）
  else m = smoothstep( 0.45, 0.78, pat );                   // 斑块（S3 锻面）
  float w = mix( 0.46, 0.58, clamp( ( fx.y - 0.74 ) / 0.46, 0.0, 1.0 ) ) * clamp( m, 0.0, 1.0 );
  /* 卡的身份色：
     · 有 uV2StageTint（S5 有调色板的卡）→ 用**卡自己的调色板色**。
       方案 §7 点名 S5_20「蓝紫流界」必须真的呈现蓝紫：旧实现只按 rank 取色相
       （rank 20 → 115° 黄绿），名字与颜色直接打架。
     · 否则回落到 fx.w 的 rank 色相栅格（一行 cos，避免逐阶段重复 mod/abs）。 */
  vec3 rankHue = 0.5 + 0.5 * cos( 6.2831853 * ( fx.w + vec3( 0.0, 0.33, 0.66 ) ) );
  /* ★★ 修复「配色偏艳」：rankHue 是满饱和 cos 波（饱和度≈1），
     一旦回落就会把金属洗成彩漆。实测 S5_25「静镜留底」F01（只该提亮镜面）
     整刀渲成紫色。这里先降饱和到 0.38，再参与混合。 */
  float rankLum = dot( rankHue, vec3( 0.299, 0.587, 0.114 ) );
  rankHue = mix( vec3( rankLum ), rankHue, 0.38 );
  vec3 accent = ( dot( stageTint, stageTint ) > 0.0001 ) ? stageTint : rankHue;
  /* 克制着色：只做"倾向色 + 轻微明暗"，不把底材换成卡的色相。
     早期版本用 mix(col, col*0.80 + accent*0.42, …)，多个阶段叠加后整刀变粉、
     S1 金属底色被吃掉（违反继承合同）。这里改成乘性 + 小量加色。 */
  /* When S5 has a dedicated color/patina recipe, do not overlay a
     second rank-based hue. Roughness and motif remain stage-owned. */
  float dedicatedFinish = ( uV2Mode > 0.5 && cfg.z > 1.5 && cfg.z < 2.5 && cfg.x > 0.35 ) ? 0.10 : 1.0;
  float wa = w * cfg.x * dedicatedFinish;
  /* 刃侧带（S5 / S7）承担"逐卡色相"：旧实现靠一条 mix(color, color*0.64+accent*0.60, heat*…)
     给出每张淬火卡的颜色身份。这里同样只在**带内**着色（乘以 m），带外保持底材。
     ⚠ 本段在 JS 模板字符串里：注释中不能出现反引号。
     ★ 2026-10-24（降低偏艳）：S5/S7 的着色系数从 0.52 降到 0.34，
     乘性压暗从 0.34 降到 0.22 —— 保留"是哪一种热处理"的色倾向，
     但让金属的明暗层次穿过色层，而不是被一层浓色盖住。 */
  float bandAccent = ( cfg.z > 1.5 && cfg.z < 2.5 ) ? 1.0 : 0.35;
  /* A stage can refine color and reflectance, but must never inject fresh
     radiance into the same surface each time a new stage is confirmed.
     Preserve the current pixel's luminance when tinting. */
  float stageLum = max( 0.008, dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  float tintLum = max( 0.008, dot( accent, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec3 neutralTint = accent * ( stageLum / tintLum );
  float tintBlend = min( 0.12, 0.11 * bandAccent * wa );
  col = mix( col, neutralTint, tintBlend );
  rough = clamp( rough + ( pat - 0.5 ) * w * cfg.y, 0.02, 1.0 );
  glow += w * cfg.w * ( 0.35 + 0.65 * clamp( fres, 0.0, 1.0 ) );
}

/* ── v2 统一工艺算子 ───────────────────────────────────────────────
   12 种工艺 = 同一组算子的不同权重：
     ① 抛光/镜面/喷砂 → 粗糙度目标（乘子 + 加量）
     ② 发黑          → 压暗（保结构）
     ③ 染色          → 用原亮度调制的目标色（不刷平）
     ④ 色带走位      → 四段调色板（多普勒 / 回火 / 表面淬火 / 渐变）
     ⑤ 薄膜          → 视角相关色散
     ⑥ 高光提亮 + 视角加光
   覆盖率 cover 由纹样门控（F03 拉丝 / F06 斑块），其余工艺接近全覆盖。 */
void k3dV2Finish( vec3 local, float tAxis, vec3 pat, float fres,
                  vec4 A, vec4 B, vec4 C, vec4 D, vec3 tint, float wBlade,
                  inout vec3 col, inout float rough, inout float glow ) {
  float pat0 = clamp( pat.x, 0.0, 1.0 );
  float cover = mix( 1.0, smoothstep( 0.10, 0.90, pat0 ), clamp( B.y, 0.0, 1.0 ) );
  float amt = clamp( A.x, 0.0, 1.0 ) * cover;

  /* ① 粗糙度：抛光 / 镜面 / 喷砂 / 拉丝 */
  float target = clamp( rough * A.y + A.z, 0.02, 1.0 );
  rough = mix( rough, target, amt );
  /* 微粗糙度：让"抛光"不是一整块塑料镜面，而是有细微起伏的真实金属 */
  rough = clamp( rough + ( pat0 - 0.5 ) * uV2Micro * amt, 0.02, 1.0 );

  /* ② 压暗（发黑氧化）：只压明度，不动反射结构 */
  col *= 1.0 - clamp( A.w, 0.0, 1.0 ) * cover * 0.82;

  /* ③ 染色：用原亮度调制目标色，保住明暗结构 */
  if ( B.x > 0.002 ) {
    float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
    vec3 tinted = tint * ( 0.30 + 1.05 * lum );
    col = mix( col, tinted, clamp( B.x, 0.0, 1.0 ) * cover * 0.92 );
  }

  /* ④ 色带走位（四种固定模式，全部由 uniform 选择，不按卡换源码）：
        0 = 无
        1 = 多普勒：与纹理无关的低频液态场推动色环（稳定复现，不吃纹路）
        2 = 表面淬火：斑块，低段留底钢（不着色）
        3 = 沿刀轴渐变（渐变之色 / 回火带） */
  float rampW = clamp( D.z, 0.0, 1.0 );
  if ( rampW > 0.002 && uV2Mode > 0.5 && uV2Look < 0.5 && uV2Art.x < 0.5 ) {
    /* ★★ 2026-10-23（真斑块）：mode 2（表面淬火 / 翡翠 / 深渊 / 赤铜）的斑块场。
       ⚠ 必须声明在 field 之前 —— 第一次写的时候我把它放在 zone 之后，
       而 field 在 zone 之前使用它，GLSL 里属于"先用后声明" → 整支着色器编译失败、刀直接不渲染。
       它同时承担两个角色：① 覆盖率掩码（zone）② 色带位置（field）。 */
    float blobCell = 0.0;
    if ( uV2Mode > 1.5 && uV2Mode < 2.5 ) {
      /* local 是模型空间坐标，实测这把刀的刀面只有 ±0.3 量级 —— 直接喂 fbm 等于喂常数，
         斑块场恒为一个值，zone 不是 0 就是 1（实测就是全 0 → 整刀没有色带）。
         这里把坐标放大 9 倍，fbm 才有结构。 */
      float blobScale = mix( 0.70, 2.60, clamp( D.x, 0.0, 1.0 ) ) * 9.0;
      float blobN = k3dFbm2( local.xy * blobScale + vec2( D.y * 11.0, D.y * 5.0 ) );
      blobCell = smoothstep( 0.34, 0.72, blobN * 1.25 + 0.10 * sin( local.y * 6.2831853 + D.y * 4.0 ) );
    }
    float field = pat0;
    if ( uV2Mode < 1.5 ) {
      /* 单次 fbm（3 octave）。早期版本在这里叠了两层域扭曲 + Voronoi，
         编译时间从亚秒涨到 10s 量级（ANGLE 会把嵌套噪声全部内联）——
         性能优先：液态场只用一次低频 fbm，靠 motif 提供大块走向。 */
      /* 尺度由 D.x 给（逐效果 / 稀有模板不同），模板因此不只是换色、形态也变。 */
      float dScale = mix( 0.85, 1.70, clamp( D.x, 0.0, 1.0 ) ) * 9.0;   /* 同斑块：local 太小，必须放大 */
      float w = k3dFbm2( local.xy * vec2( 2.2, 1.25 ) * dScale + vec2( D.y * 3.0, D.y * 1.7 ) );
      field = clamp( mix( pat0, w, 0.75 ), 0.0, 1.0 );
    } else if ( uV2Mode < 2.5 ) {
      /* 表面淬火：斑块直接由**已烘焙的纹样场**阈值化 —— 不新增 Voronoi 循环。
         低段留底钢：色块边缘退回底材（旧 F06 的关键对比来源）。 */
      /* 斑块要**铺满四段色域**（留底钢/深蓝/金/紫），否则整刀只剩调色板起点那一档
         （实测 S5_16/S5_18 看起来与素钢几乎一样）。cell 直接当色域选择器。 */
      /* ★★ 2026-10-23（用户：要 CSGO 那种真斑块 + 稀有模板要有形态差异）
         旧实现拿 pat0 阈值化，而 pat0 在**没有 S3 锻打纹理时是常量 0.5**
         → 只剩一条 sin 条带，根本不像表面淬火的斑块。
         现在改为一次低频 fbm 做域扭曲：斑块是随机的、但由 D.y（每局 seed）驱动，
         所以同一张卡每局的斑块分布天然不同。
         斑块尺度由 D.x 给 —— 各效果、以及稀有模板各有一套尺度（不只换色）。 */
      field = clamp( blobCell * 0.94 + pat0 * 0.16, 0.0, 1.0 );
    } else {
      field = clamp( tAxis + D.y, 0.0, 1.0 );
    }
    /* 色带位置：多普勒分支把 D.y 当**绝对位置**（卡的 paletteShift），
       渐变/斑块分支仍当加性偏置 —— 两者语义不同，分开算。 */
    float ramp;
    if ( uV2Mode > 0.5 && uV2Mode < 1.5 ) {
      ramp = D.y + ( mix( pat0, field, 0.75 ) - 0.5 ) * 0.55 + fres * 0.22;
    } else if ( uV2Mode > 2.5 ) {
      /* ★ 2026-10-23：mode 3 的色带**空间变化**来自 field = clamp(tAxis + D.y)。
         实测 v2 里 tAxis（aBladeT）在刀面上近似常数，所以这里无论怎么重映射都得到单一颜色；
         真正要做"整刀通铺渐变"必须先拿到一个沿刀身变化的参数（见 RESULT §3.37）。
         保持原式，观感与改动前一致。 */
      /* tAxis 现在是真的沿刀身参数（0~0.977），重映射到 0~1 才能走完整条色环 */
      /* 只有"材质自渐变"（S5_23）走这条按实测分布的重映射：
         aBladeT 绝大多数顶点落在 0~0.45，按 0~1 铺只会用到调色板前 30%。
         其它卡的 mode 3 保持原式 —— 否则 05/11 这类会跟着变（用户已指出）。 */
      if ( uV2FadeMode > 0.5 || uS5Tier > 1.5 ) {
        /* 实测：aRegion=1（刀身）的顶点 aBladeT 从 **0.40** 起，到 0.98；
           按 0~1 铺只用到调色板末段（读成一片奶金）。这里把刀身的真实区间铺满 0~1。 */
        ramp = clamp( ( tAxis - 0.40 ) / 0.58 + fres * 0.05, 0.0, 1.0 );
      } else {
        ramp = clamp( tAxis + D.y, 0.0, 1.0 ) * 1.08 + fres * 0.28;
      }
    } else {
      ramp = field * 1.08 + fres * 0.28;
    }
    ramp = clamp( ramp, 0.0, 1.0 );
    vec3 rampCol = k3dPalette4( uDopPal0, uDopPal1, uDopPal2, uDopPal3, ramp );
    /* ★ 2026-10-21（方案 §7「颜色覆盖起点 10–25%、局部上限 40%」）
       旧实现是**一整刀 wash**（系数 0.80–0.90，实测覆盖 63–100%，把 S3 纹理压平）。
       现在色带只落在「纹样带 ∪ 沿轴条带」的联合掩码里：
         · 有 S3 纹理 → 掩码由纹样场 pat0 阈值化（色带跟着锻纹走，像真实回火色，
           而不是均匀糊一层）；
         · 没有 S3 纹理 → pat0 恒为 0.5，阈值化会整刀为 0，所以改用沿轴条带兜底。
       覆盖率由 uV2Cover 给（默认 0.34，落在 §7 的 10–25% 起点与 40% 上限之间），
       阈值旁 ±0.12 做羽化，避免出现硬边色块。 */
    float covAmt = clamp( uV2Cover, 0.0, 1.0 );
    float lo = clamp( 1.0 - covAmt - 0.12, 0.0, 0.98 );
    float hi = clamp( lo + 0.24, 0.02, 1.0 );
    float motifZone = smoothstep( lo, hi, pat0 );
    /* 沿轴两条带（周期 2 次/全长），带内 1、带外 0 —— 无纹理卡的兜底形状 */
    float axisZone = smoothstep( 0.30, 0.72, 0.5 + 0.5 * sin( ( tAxis + D.y ) * 12.566371 ) );
    float zone = mix( axisZone, motifZone, clamp( uS3On, 0.0, 1.0 ) );
    if ( uV2Mode > 1.5 && uV2Mode < 2.5 ) zone = blobCell;
    if ( uV2Mode > 2.5 ) zone = 1.0;   /* 沿轴渐变本来就该整刀通铺 */
    /* ★★ 2026-10-23（真斑块）：mode 2（表面淬火 / 翡翠 / 深渊 / 赤铜）的**覆盖率**
       必须由斑块场本身决定，否则 fbm 只影响颜色、外形仍是 axisZone 的 sin 条带
       （实测：看上去还是"竖条"，不是斑块）。这里把斑块场提前算出来当 zone。 */

    /* ★★ 2026-10-23（用户：要"完全 CSGO 渐变之色"）
     *
     *   病象：mode 3（沿轴渐变）也被 zone 门控 —— 没有 S3 纹理时 zone 走 axisZone
     *   （sin 的两段横带），于是渐变被切成两条带子，读不出 CSGO Fade 那种"整刀一条通铺"。
     *
     *   修法：mode 3 **完全绕过 zone**（zone=1），并把峰值抬到 0.92 —— 沿轴渐变本来就是
     *   "整刀铺满、颜色沿刀身走"，不存在"只在纹样处出现"的语义。
     *   影响面：mode 3 只有 fade / fadeColdHot / auroraRibbon 三套用，正是需要通铺的那几套。 */
    /* ★ 2026-10-23 回退：试过让 mode 3 通铺（zone=1 / peak 0.92），
       但 aBladeT 在模型上是常数 → 色带没有空间变化，整片刀面被染成**单一颜色**
       （纯紫），比原来的"两段带"更差。已恢复门控。 */
    /* 峰值：CSGO 那种"贴皮"质感需要色带权重接近 1，0.62~0.78 只能给出"若有若无"的一层。
       mode 2（斑块）与 mode 3（渐变）都抬到 0.92 —— 这两类本来就是要整片显色的；
       mode 1（多普勒）保持 0.62，它靠视角流动取胜、不需要铺满。 */
    /* 峰值：0.92 只给**稀有+（效果库接管）**的卡，普卡保持原档 0.72/0.78/0.62 ——
       否则 05/11 这类（精良、没被效果库接管）自己的工艺色带也会被一起放大（用户已指出）。 */
    float peakBase = ( uV2Mode > 2.5 ) ? 0.78 : ( ( uV2Mode > 1.5 ) ? 0.72 : 0.62 );
    float peak = ( uS5Tier > 1.5 ) ? 0.92 : peakBase;
    /* ★★ 2026-10-23（用户：只变刀身、不变刀柄）
     *   走过的两个坑：
     *     ① 乘 wBlade（刀身权重）→ 这把刀的 wBlade 在刀面上接近 0，色带权重被乘成 0，渐变消失；
     *     ② 不乘任何权重 → 渐变把**刀柄**也染了（用户："只变了刀柄没变刀身"）。
     *   现在改成乘 (1 - wH)：wH 是刀柄区域权重，只在刀柄处为 1 —— 于是
     *   刀身照常上色、刀柄保持材质本色。只对 mode 3（沿轴渐变）生效，其它模式不变。 */
    /* 刀柄权重由参数传入（wHandle = wH）：k3dV2Finish 是独立函数，
       函数体里直接写 wH 会"未声明"→ 整支着色器编译失败、刀不渲染（踩过）。 */
    /* 刀柄不再靠权重切（aRegion 不存在、wH 不可靠）—— 改由调色板末端回落本色解决。
       这里只留"材质自渐变"的开关，保证改动**只作用于 S5_23**。 */
    float wRamp = rampW * cover * zone * peak;
    /* ★★ 2026-10-23（23 的刀柄仍然发紫）：实测刀柄落在 ramp≈0.55~0.7 这一段
       （调色板的中后段 = 紫/品红），而"末端第 4 段改中性"只覆盖 ramp≈1，管不到它。
       所以直接按 ramp 做回落：ramp 越高越退回材质本色 —— 刀身（低 ramp）保留色环，
       刀柄（高 ramp）回到钢色。只对 fadeMode（S5_23）生效。 */
    /* ★★ 2026-10-23（终于查准）：knife_mesh 的 aRegion 是**单分量 0..1**，
       实测 aRegion=1 对应刀身（高 aBladeT）、=0 对应刀柄（低 aBladeT）。
       所以直接乘刀身权重 wB 就是"只染刀身"。只对 fadeMode（S5_23）生效。 */
    float bladeOnly = mix( 1.0, clamp( wBlade, 0.0, 1.0 ), step( 0.5, uV2FadeMode ) );
    col = mix( col, rampCol, wRamp * bladeOnly * 0.90 );
    /* 视角虹彩：斜看时色环前进；只加一点，避免把金属洗成自发光 */
    float fwR = pow( clamp( fres, 0.0, 1.0 ), max( 0.8, C.x ) );
    col += rampCol * fwR * wRamp * 0.22;
    /* Avoid perfectly flat clear-coat roughness: the pre-existing S3
       microstructure should remain visible through metallic reflection. */
    rough = mix( rough, clamp( rough * 0.76 + abs( pat.y ) * 0.035, 0.025, 0.94 ),
                 wRamp * 0.65 );
  }

  /* S5 is an optical finish over S1 metal and S3 forging. R/G/B/A
     describe spectral position / treatment / polish / clearcoat. No S5
     height or normal map: S3 alone retains its forged surface identity.
     One filtered lookup replaces all premium FBM and per-card branches. */
  if ( uV2Art.x > 0.5 ) {
    vec2 uv = vec2( clamp((local.x-0.40)/0.58,0.0,1.0),
                    clamp(local.y,0.0,1.0) );
    vec4 optical = texture2D( uS5OpticalMap, uv );
    float card = uV2Art.x;
    float isPremium = step(0.5,uV2Look);
    float q = clamp(uS5Tier/5.0,0.0,1.0);
    float structure = (pat0-0.5)*clamp(uS3On,0.0,1.0);
    float spectral = clamp(optical.r + structure*0.075,0.0,1.0);
    // Interference belongs to thin oxide films, not every metallic card.
    float irid = (1.0-step(7.5,card))*step(6.5,card)
               + (1.0-step(13.5,card))*step(12.5,card);
    spectral = clamp(spectral + irid*fres*0.20,0.0,1.0);
    vec3 filmCol = k3dPalette4(uS5Optical0,uS5Optical1,
                              uS5Optical2,uS5Optical3,spectral);
    // Exposed steel at etched valleys binds the treatment to the SAME S3.
    float bond = clamp(0.88 + structure*0.22 - abs(pat.y)*0.10,0.65,1.0);
    float filmAmt = optical.g*bond*mix(0.69,0.90,isPremium);
    filmAmt *= mix(0.94,1.0,q);
    // Neutral signatures alter metal reflectance; no opaque neutral paint.
    vec3 neutralFilm = filmCol * (0.38 + 0.76*sqrt(max(0.0,
      dot(uBladeBaseColor,vec3(0.2126,0.7152,0.0722)))));
    filmCol = mix(neutralFilm,filmCol,isPremium);
    // S3 grain modulates both color and real PBR roughness through the film.
    filmCol *= 1.0 + structure*0.21 + clamp(pat.y,-0.8,0.8)*0.11;
    col = mix(col,filmCol,clamp(filmAmt,0.0,0.93));
    float polish = clamp(optical.b + uBladeRoughness*0.17
                         + abs(pat.y)*0.045,0.075,0.78);
    rough = mix(rough,polish,optical.g*0.84);
    k3dS5Coat = optical.a*filmAmt*clamp(wBlade,0.0,1.0)*0.72;
    k3dS5CoatRough = clamp(0.10 + optical.b*0.28
                           + abs(structure)*0.08,0.10,0.32);
    // Patterned oxide remains metallic, with a dielectric coat above it.
    k3dS5Metal = filmAmt*0.06;
  }

  /* ⑤ 薄膜：视角相关色散 + 一点点加光（克制上限 0.35） */
  if ( B.z > 0.002 && uV2Art.x < 0.5 ) {
    vec3 film = k3dV2Film( fres, B.w, C.z );
    col = mix( col, col * film * 1.45, clamp( B.z, 0.0, 1.0 ) * cover * 0.70 );
    glow += clamp( B.z, 0.0, 0.35 ) * pow( clamp( fres, 0.0, 1.0 ), max( 0.5, C.x ) ) * 0.12;
  }

  /* ⑥ 视角加光 + 抛光提亮 */
  col *= 1.0 + clamp( C.w, 0.0, 1.0 ) * amt * 0.08;
  float fw = pow( clamp( fres, 0.0, 1.0 ), max( 0.4, C.x ) );
  col += tint * fw * clamp( C.y, 0.0, 1.0 ) * 0.10;
}
`;

function buildSource() {
  /* 诊断：K3D_V2_NOVEL=1 时给源码加一段唯一注释 —— 用来**击穿驱动着色器缓存**，
     测真实的冷编译成本（否则第二次运行同一个源会命中 D3D11 shader cache，
     得到一个假的"127ms"）。生产路径永不开启。 */
  const novel = (typeof globalThis !== 'undefined' && globalThis.K3D_V2_NOVEL)
    ? `\n/* novel:${Math.random().toString(36).slice(2)} */` : '';
  if (sourceCache && !novel) return sourceCache;
  const K = K3D();
  const uniformDecls = K.bladeSkinShader?.UNIFORM_DECLS || '';
  const noise = K.shaderNoise?.common || '';
  const patterns = K.shaderPatterns?.common || '';
  const finishes = K.shaderFinishes?.common || '';
  const card = K.shaderCardEffects?.functions || '';

  /* 图案：只留 T01（未选纹理时的中性细锻痕）。用户没选 S3 纹理时，
     旧实现也走 T01；选了纹理则走 S3 图像 —— 24 路分派整段不需要。 */
  const patternFn = extractFunctions(patterns, ['k3dTexT01']);
  if (!patternFn) console.warn('[render/v2] k3dTexT01 missing; falling back to legacy'); 

  /* 工艺：不用 k3dApplyFinish（12 路），只取三个固定叠加层。 */
  /* ★ 2026-10-23：temper/tune/edgeGlow 这三支在 v2 里保持**不调用**。
     S6 的回火用片元里的内联轻量实现（见 k3dApplyTemper 调用点注释）；
     S7/S9 本来就已对齐 legacy，补调用只会让冷启动变贵（实测 +230 ms）。 */
  const finishFns = extractFunctions(finishes, ['k3dApplyTemper', 'k3dApplyTune', 'k3dApplyEdgeGlow']);

  /* 卡纹样：保留 hash / 磨损 / 阶段效果；k3dSlotMotif 换成**只读图集**版本，
     这样 k3dCardMotif 的 25 路 if/else 不再被调用（源码里也不出现）。
     ★ 阶段效果按阶段拆成独立函数：旧实现是"一条 8 路 if/else 链被 8 个调用点内联"
       = 64 份分支体进编译；拆完后每个阶段只剩自己那一段（实测这是 v2 首帧
       3.2s → 亚秒的主因，见 docs/render-v2-2026-10-20/）。 */
  const stageChain = specializeStageChain(card, 'k3dApplyStageCardFx', 'stage',
    STAGE_FX.map((n) => ({ value: n, name: 'k3dStageFx' + n, header: stageFxHeader(n) })),
    { includeTail: false });
  const stageFns = STAGE_FX.map((n) => extractFunction(stageChain.source, 'k3dStageFx' + n))
    /* 纹样由调用方算好传进来（k3dPat[i]）—— 去掉函数内部的重复取样，
       否则 8 个阶段函数各内联一份 k3dSlotMotif，ANGLE 翻译时间会翻倍。 */
    .map((text) => text.replace(/float\s+pat\s*=\s*k3dSlotMotif\([^;]*\);/, ''))
    .join('\n');
  const cardFns = extractFunctions(stageChain.source, ['k3dCardHash', 'k3dS9Abrasion'])
    + '\n' + stageFns + '\n' + stageRoughSource();
  /* ★ 每个阶段一个**常量槽号**的取样函数。
     为什么不能用一个 `k3dSlotMotif(stage, …)`：函数体里的 `uAnimMeta[si]` / `uBakedMeta[si]`
     在 ANGLE→HLSL 下会退化成 uniform 数组的**动态索引**，驱动必须为它生成可索引副本 +
     分支表，实测是这支着色器最大的编译成本（5.2s 里的大头）。
     阶段号在每个调用点都是编译期常量，直接展开成 9 个函数即可消除动态索引。 */
  const slotStub = [0,1,2,3,4,5,6,7,8].map((i) => `
float k3dSlotMotif${i}( vec2 p ) {
  vec4 am = uAnimMeta[${i}];
  vec4 m = uBakedMeta[${i}];
  vec2 pp = clamp( ( p - vec2( -0.3 ) ) / 1.6, 0.0, 1.0 );
  float v = 0.5;
  if ( am.x > 0.5 ) {
    const float FRAMES = 12.0;
    float period = max( 0.2, am.z );
    float ph = fract( uEffectTime / period ) * FRAMES;
    float f0 = floor( ph );
    float w = ph - f0;
    float f1 = mod( f0 + 1.0, FRAMES );
    float rr = 1.0 / max( 1.0, am.w );
    float fr = 1.0 / FRAMES;
    vec2 inset = vec2( 0.5 / 1536.0, rr * 0.5 / 128.0 );
    vec2 inner = vec2( fr, rr ) - 2.0 * inset;
    float v0 = texture2D( uAnimAtlas, vec2( f0 * fr, am.y * rr ) + inset + pp * inner ).r;
    float v1 = texture2D( uAnimAtlas, vec2( f1 * fr, am.y * rr ) + inset + pp * inner ).r;
    v = mix( v0, v1, w );
  } else if ( m.x > 0.5 ) {
    float tile = m.y;
    vec2 off = vec2( mod( tile, 3.0 ), floor( tile / 3.0 ) ) * ( 1.0 / 3.0 );
    float inset = 1.0 / 1536.0;
    v = texture2D( uBakedAtlas, off + vec2( inset ) + pp * ( 1.0 / 3.0 - 2.0 * inset ) ).r;
  }
  return clamp( v, 0.0, 1.0 );
}`).join('\n');

  const common = [
    V2_UNIFORMS,
    uniformDecls,
    noise,
    patternFn,
    finishFns,
    /* ⚠ slotStub 必须在 cardFns **之前**：k3dApplyStageCardFx / k3dApplyCardRoughness
       会调用 k3dSlotMotif，而 GLSL 要求"先声明后使用"（否则 driver 报
       'no matching overloaded function found'，整支片元编译失败 → 静默白屏）。 */
    slotStub,
    cardFns,
    V2_HELPERS,
  ].filter(Boolean).join('\n');
  if (novel) return { common: common + novel, parts: { patternFn: patternFn.length, finishFns: finishFns.length, cardFns: cardFns.length, uniformDecls: uniformDecls.length, noise: noise.length } };
  sourceCache = { common, parts: { patternFn: patternFn.length, finishFns: finishFns.length, cardFns: cardFns.length, uniformDecls: uniformDecls.length, noise: noise.length } };
  return sourceCache;
}

/** 供诊断：当前 v2 源码的体量与分块大小。 */
export function v2SourceStats() {
  const src = buildSource();
  return { chars: src.common.length, ...src.parts };
}

export function clearV2SourceCache() { sourceCache = null; }

const VERTEX_COMMON = `
varying vec3 vBladeLocal;
uniform mat3 uBladeBasis;
uniform vec3 uBladeOrigin;
uniform vec3 uBladeSpan;
varying float vS3PlanarFace;
varying vec3 vS3Local;
`;

const VERTEX_BODY = `
{
  vec3 k3dLocalRaw = uBladeBasis * ( position - uBladeOrigin );
  vBladeLocal = vec3( aBladeT,
                      k3dLocalRaw.y / max( uBladeSpan.y, 1.0e-5 ),
                      k3dLocalRaw.z / max( uBladeSpan.z, 1.0e-5 ) );
  vS3Local = vec3( k3dLocalRaw.x / max( uBladeSpan.x, 1.0e-5 ),
                   k3dLocalRaw.y / max( uBladeSpan.y, 1.0e-5 ),
                   k3dLocalRaw.z / max( uBladeSpan.z, 1.0e-5 ) );
  vec3 k3dS3NormalLocal = normalize( uBladeBasis * normal );
  vS3PlanarFace = abs( k3dS3NormalLocal.z );
}
`;

/* 刀身颜色链：纹理 → 阶段卡效果 → 工艺算子 → 叠加层 → 磨损 → 刃光 → 稀有度。
   与旧 MAP_FRAGMENT 的执行顺序逐段对应（见文件头"视觉继承"）。 */
const MAP_FRAGMENT = `
{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  float wS = k3dSkinW( wB, wG, wH );
  if ( wS > 0.002 ) {
    vec3 L = vBladeLocal;
    /* 锻打纹样：选了纹理走 S3 图像；未选则用中性常量（不再编译 T01 的 3D 噪声）。
       合并到这一步的原因见文件头：编译成本 ∝ 每像素实际执行的数学量。 */
    vec3 pat = ( uS3On > 0.5 ) ? k3dS3Sample( vS3Local ) : vec3( 0.5, 0.0, 0.5 );
    float p = clamp( pat.x, 0.0, 1.0 );
    float texC = clamp( uTexParam1.y, 0.0, 1.0 );
    /* Forge steel owns Blade + Guard + Grip before S8. At S8 only Grip is
       replaced; the previously forged Guard remains the same steel. */
    float s3Surface = ( uS3On > 0.5 )
       ? mix( k3dS3SurfaceMask( wB ), 0.54,
              clamp( wG + wH * uSkinCoverAll, 0.0, 1.0 ) ) : 1.0;
    k3dPatX = p; k3dS3Surf = s3Surface;
    float sig = clamp( pat.y * 1.1111, -1.0, 1.0 );
    /* S3 is a forged surface, not a color overlay. On a formed knife,
       the same card's existing grayscale engraving reads more clearly;
       the molten/billet stages retain their subtle process texture. */
    float amp = clamp( ( 0.34 + 0.66 * texC ) * ( uS3Alpha / 0.60 ), 0.0, 1.30 )
              * mix( 0.38, 0.66, step( uV2Preserve, 0.5 ) );
    /* On the S3 billet only, reinforce the original selected grayscale
       engraving on the planar front/back steel. Preserve the bevel and
       side faces so no broad hard sticker appears on the geometry. */
    if ( uV2Proc.x > 1.5 && uV2Proc.x < 2.5 && uS3On > 0.5 ) {
      float billetFace = smoothstep( 0.25, 0.80, clamp( vS3PlanarFace, 0.0, 1.0 ) );
      amp *= mix( 0.84, 1.18, billetFace );
    }
    float textureMix = ( uS3On > 0.5 ) ? clamp( uSkinTexStrength, 0.0, 1.0 ) * s3Surface : 0.0;
    vec3 col = uBladeBaseColor * mix( 1.0, 1.0 + amp * sig, textureMix );
    vec3 identityCol = col;
    float tier = clamp( uVisualTier, 0.0, 5.0 );
    float k3dFres = 0.35;
    #ifndef FLAT_SHADED
      k3dFres = pow( 1.0 - clamp( abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 0.0, 1.0 ), 1.0 );
    #endif
    float rough = uBladeRoughness;
    float glow = 0.0;

    /* ① 工艺：固定算子（S5 品质的主承载：抛光 / 微粗糙度 / 薄膜 / 克制色带） */
    /* ★★ 2026-10-23：v2 里**没有给 vBladeT 赋值**（它恒为 0），
       真正沿刀身走的参数是 vBladeLocal.x（顶点着色器里 vBladeLocal = vec3(aBladeT, ...)）。
       之前所有"沿轴渐变"渲成纯色，根因就在这 —— 传进去的 tAxis 永远是 0。
       这里改传 L.x（= vBladeLocal.x = aBladeT）。 */
    /* 沿轴参数：只对"材质自渐变"（S5_23，uV2FadeMode）用真实的 aBladeT（L.x）；
       其它卡保持原来的 vBladeT —— 否则 05/11 这类它们自己的工艺色带会跟着变
       （用户已指出"11 和 05 一模一样了"，实测它们色差从 Δ7 被压到 Δ3）。 */
    /* Premium longitudinal fades need the real, per-vertex blade axis.
       Basic finishes retain their legacy art-directed soft color bands. */
    float tAxisUse = ( uV2FadeMode > 0.5 || ( uV2Mode > 2.5 && uS5Tier > 1.5 ) )
                   ? L.x : vBladeT;
    k3dV2Finish( L, tAxisUse, pat, k3dFres,
                 uV2FinA, uV2FinB, uV2FinC, uV2FinD, uV2FinTint, wS,
                 col, rough, glow );

    /* ★★ 2026-10-23（对齐 10.12 / v1.0，用户要求）
     *
     *   病象：v2 的 S5 卡间差 21.5、S6 只有 11.9，而同机位 legacy 是 32.6 / 20.7；
     *   S7/S9 因为数据本身就小，看不太出来。
     *   根因：k3dApplyTemper / k3dApplyTune / k3dApplyEdgeGlow 这三个函数
     *   在 v2 里**只被 extractFunctions 抽进来，从未被调用**（grep 全文件只有两处：注释 + 抽取列表）。
     *   于是 v2 只剩 k3dV2Finish 一层，S6 回火 / S7 刃线 / S9 调校三层全部丢失，
     *   温度被折进 uFinParam1 里当普通工艺参数 —— 与 legacy 的四层结构不是一回事。
     *
     *   修法：照 legacy 的调用顺序补回来（finish → temper → tune → edgeGlow），
     *   参数逐个对齐（tier 用已有的 uVisualTier，seeds 用 uSeeds，fresnel 用 k3dFres）。
     *   三个函数与 legacy 共用同一份 finishes.js 源码，只是 v2 之前没接线。
     *   ⚠ k3dFinishRoughDelta 必须放在 temper **之后** —— 回火会改 rough。 */
    /* ★★ 2026-10-23（S6 回火 · 内联轻量版，对齐 10.12/v1.0 的第三版）
     *
     *   前两版都不合格：
     *     ② 直接把 legacy 的 k3dApplyTemper 调起来 → 冷启动 +230 ms（A/B 2585→2817）；
     *     ③ 把它的 fbm/ridge 换成烘焙纹样场（便宜版）→ 仍 +165~229 ms（A/B 2065→2230/2294）。
     *   贵的根源不是那几行颜色，而是把 legacy 那支函数**整支拉进管线**时，
     *   连带它依赖的调色板/噪声辅助一起内联（+6.8K 片元）。
     *
     *   这一版只用**已经存在的 uniform 槽位**（uTemper / uTemperIrid / uTemperFlow）
     *   与**已在管线里的** pat / k3dFres，做薄膜干涉的相位环 —— 不新增任何函数，
     *   不拉进调色板与噪声。语义与 legacy 一致：cover 决定"通铺还是局部出膜"，
     *   fresnel 让斜看时相位走远，flow 让它缓慢流动，tier 通过 strength 体现。
     *   实测：S6 卡间中位 11.92 → 22 以上，冷启动回到不补时同一水平（见 RESULT §3.32）。 */
    {
      float tOn = uTemper.w * clamp( uTemper.z, 0.0, 1.0 );
      float tStr = clamp( uTemperIrid.w, 0.0, 1.0 ) * tOn;
      if ( tStr > 0.002 ) {
        /* 与 legacy 同构：cover 决定"通铺 / 局部出膜"，fresnel 让斜看相位走远，
           高级卡（tier≥2）追加**第二层互补色环**，tier≥3 再补一点闪辉。
           legacy 原式：duo = clamp((tier-2)/3)、亮度项 (0.10+0.045*tier)、
           glow += gate*strength*viewW*0.10*max(0,tier-3)。 */
        float tTier = clamp( uStageTiers[5], 0.0, 5.0 );
        float tDuo = clamp( ( tTier - 2.0 ) / 3.0, 0.0, 1.0 );
        float tCover = clamp( uTemperIrid.y, 0.0, 1.0 );
        float tGate = clamp( mix( smoothstep( 0.52, 0.90, pat.x ), 1.0, tCover ), 0.0, 1.0 );
        float tPhase = uTemperFlow * 6.2831853 + k3dFres * 2.20
                     + pat.y * 1.60 + uTemper.x * 3.10;
        vec3 filmA = 0.5 + 0.5 * cos( 6.2831853 * ( tPhase + vec3( 0.00, 0.33, 0.67 ) ) );
        vec3 filmB = 0.5 + 0.5 * cos( 6.2831853 * ( tPhase + 0.50 + vec3( 0.50, 0.83, 0.17 ) ) );
        vec3 film = mix( filmA, filmB, tDuo * 0.60 );
        float tW = tStr * tGate * ( 0.10 + 0.045 * tTier ) * ( 0.42 + 0.58 * k3dFres );
        /* Thin-film coloration is a limited multiplicative Fresnel layer;
           old additive film made every later stage brighter. */
        vec3 filmGain = 1.0 + ( film - 0.5 ) * min( 0.24, tW * 0.32 );
        col *= filmGain;
        glow += tGate * tStr * k3dFres * 0.10 * max( 0.0, tTier - 3.0 );
      }
    }
    /* ★★ 2026-10-24（S9 调校 · 补回完全失效的一层）

       病象（实测取证）：v2 里 uTune 只在 uniform 表里被写入，
       **全文件没有任何消费点** —— k3dApplyTune( 调用数 = 0，uTune.x/yz/w 引用数 = 0。
       实测九个阶段 uTune 恒为 [0, 0, 0.7, 0]（w = on = 0）。
       而 S9_12/17/20/22/23/24 六张卡确实带了 tune 数据（colorPhase / iridescence）——
       也就是说：**数据在、槽位在、着色器不读** → S9 选卡后刀身零变化。

       为何不直接调 k3dApplyTune：与 S6 同一个理由（整支函数拉进管线连带噪声/调色板，
       实测 +230ms 冷启动）。这里与 S6 回火同构，只用**已有槽位**做相位环：
         uTune.x = colorPhase（色相位置）
         uTune.y = iridescence（干涉强度）
         uTune.z = amount（总强度，默认 0.7）
         uTune.w = on（**数据侧开关，0 = 不生效**）

       ℹ 实测本局抽到的 S9 卡没有 tune 数据（w=0）→ 本层不会亮，这是正确行为；
         只有抽到带 tune 的那六张卡（如 S9_20/23）才会看到调校色。 */
    {
      float uOn = clamp( uTune.w, 0.0, 1.0 );
      if ( uOn > 0.5 ) {
        float uAmt = clamp( uTune.z, 0.0, 1.0 );
        float uIrid = clamp( uTune.y, 0.0, 1.0 );
        /* 色相环：colorPhase 决定起点，fresnel + 纹样给空间变化 */
        float uPhase = uTune.x + k3dFres * 0.55 + pat.x * 0.30;
        vec3 uRing = 0.5 + 0.5 * cos( 6.2831853 * ( uPhase + vec3( 0.00, 0.33, 0.67 ) ) );
        /* 只加膜色，不压暗底材（与 S6 同一纪律：颜色层不得吞掉金属明暗） */
        float uW = uAmt * ( 0.045 + 0.075 * uIrid ) * ( 0.40 + 0.60 * k3dFres );
        col *= 1.0 + ( uRing - 0.5 ) * min( 0.18, uW * 0.45 );
        /* 高级卡（tier≥3）补一点视角斜光，让“精校到位”看得出来 */
        glow += uOn * uAmt * uIrid * clamp( ( clamp( uStageTiers[8], 0.0, 5.0 ) - 2.0 ) / 3.0, 0.0, 1.0 )
              * k3dFres * 0.06;
      }
    }

    /* ⚠ 只补回**回火**这一层。S7 刃线 / S9 调校**不补**：
       实测它们在 v2 里本来就已对齐 legacy（S7 13.62 vs 13.48；S9 22.11 vs 22.70），
       补了不会更接近，却会让着色器可达代码变多 —— 三个一起补时冷启动 1600 → **2703 ms**。
       回火单独补的代价见下面 RESULT §3.32 的实测。 */
    k3dFinishRoughDelta = rough - uBladeRoughness;

    /* 阶段纹样：逐槽读烘焙图集（常量槽号 → 无动态索引）。这是逐卡身份的来源：
       同一工艺的两张卡靠它区分；不读它时只剩 fx.w 的色相差异（实测可辨性不足）。 */
    k3dPat[0] = 0.5; k3dPat[1] = 0.5; k3dPat[2] = 0.5; k3dPat[3] = 0.5;
    k3dPat[4] = 0.5; k3dPat[5] = 0.5; k3dPat[6] = 0.5; k3dPat[7] = 0.5; k3dPat[8] = 0.5;
    if ( uCardFx[0].y > 0.001 ) k3dPat[0] = k3dSlotMotif0( L.xy );
    if ( uCardFx[1].y > 0.001 ) k3dPat[1] = k3dSlotMotif1( L.xy );
    if ( uCardFx[2].y > 0.001 ) k3dPat[2] = k3dSlotMotif2( L.xy );
    if ( uCardFx[3].y > 0.001 ) k3dPat[3] = k3dSlotMotif3( L.xy );
    if ( uCardFx[4].y > 0.001 ) k3dPat[4] = k3dSlotMotif4( L.xy );
    if ( uCardFx[5].y > 0.001 ) k3dPat[5] = k3dSlotMotif5( L.xy );
    if ( uCardFx[6].y > 0.001 ) k3dPat[6] = k3dSlotMotif6( L.xy );
    if ( uCardFx[8].y > 0.001 ) k3dPat[8] = k3dSlotMotif8( L.xy );

    /* ② S1–S9 阶段效果：一个通用算子 + 每阶段权重（不再有 per-stage 分支体） */
    k3dV2Stage( uCardFx[0], uV2StageCfg[0], uV2StageTint[0], k3dPat[0], L.xy, k3dFres, uStageTiers[0], col, rough, glow );
    k3dV2Stage( uCardFx[1], uV2StageCfg[1], uV2StageTint[1], k3dPat[1], L.xy, k3dFres, uStageTiers[1], col, rough, glow );
    k3dV2Stage( uCardFx[2], uV2StageCfg[2], uV2StageTint[2], k3dPat[2], L.xy, k3dFres, uStageTiers[2], col, rough, glow );
    k3dV2Stage( uCardFx[3], uV2StageCfg[3], uV2StageTint[3], k3dPat[3], L.xy, k3dFres, uStageTiers[3], col, rough, glow );
    k3dV2Stage( uCardFx[4], uV2StageCfg[4], uV2StageTint[4], k3dPat[4], L.xy, k3dFres, uStageTiers[4], col, rough, glow );
    k3dV2Stage( uCardFx[5], uV2StageCfg[5], uV2StageTint[5], k3dPat[5], L.xy, k3dFres, uStageTiers[5], col, rough, glow );
    k3dV2Stage( uCardFx[6], uV2StageCfg[6], uV2StageTint[6], k3dPat[6], L.xy, k3dFres, uStageTiers[6], col, rough, glow );
    k3dV2Stage( uCardFx[8], uV2StageCfg[8], uV2StageTint[8], k3dPat[8], L.xy, k3dFres, uStageTiers[8], col, rough, glow );

    /* ③ Wear：边缘先磨、表面失纹、露底材（幅度沿用旧分层，去掉高频 fbm 划痕） */
    vec3 baseTex = diffuse * texture2D( uSkinBaseMap, vMapUv ).rgb;
    float hl = dot( baseTex, vec3( 0.2126, 0.7152, 0.0722 ) );
    vec3 substrate = baseTex * clamp( 0.42 / max( hl, 0.06 ), 0.75, 1.15 );
    float edgeGate = smoothstep( 0.55, 0.95, clamp( vEdge, 0.0, 1.0 ) );
    float eW = uWearLevels.x * mix( 0.10, 1.0, edgeGate );
    float sW = uWearLevels.y;
    float pW = uWearLevels.z;
    col = mix( col, uBladeBaseColor * 1.06, pW * 0.80 );
    col = mix( col, substrate, sW * 0.55 );
    col *= mix( 1.0, 0.42, sW * 0.92 );
    col = mix( col, substrate * ( 1.02 + 0.10 * edgeGate ), eW * 0.85 );
    rough = clamp( rough + uWearRough * 0.50 * ( 0.35 + 0.65 * edgeGate ), 0.02, 1.0 );

    /* ④ 刃线（S7）：真实刃口掩码 + 沿长轴扫光 */
    float eg = uEdgeGlow.w * clamp( uEdgeGlow.x, 0.0, 1.2 )
             * clamp( vBladeEdge, 0.0, 1.0 )
             * pow( clamp( k3dFres, 0.0, 1.0 ), max( 0.8, uEdgeGlow.y ) )
             * ( 0.55 + 0.45 * sin( vBladeT * 15.0 - uEffectTime * ( 1.5 + uEdgeGlow.z * 2.0 ) ) );
    col = mix( col, col * 0.58 + uEdgeColor * 0.80, clamp( eg, 0.0, 0.40 ) );
    glow += eg * 0.35;

    /* ⑤ 稀有度：只保留视角边光（不再有彩色线/星点） */
    col = mix( col, uRarityColor, pow( clamp( k3dFres, 0.0, 1.0 ), 1.4 ) * step( 3.0, uS4Tier ) * 0.20 );

    /* ⑥ S4 高级决策卡：刀型轮廓光晕

       ★★ 2026-10-26（重做）：以前这里根本没有任何光晕。

         病象（用户口径）：「S4 高级决策卡刀型的光晕太简陋了」。
         根因有两层，缺一不可：
           ① STAGE_CFG 里 S4 的第 4 分量（辉光权重）**一直是 0**，
              而 k3dV2Stage 的 glow 只能由 w * cfg.w 产生 → 恒定无光晕；
           ② v2 走的是通用算子 k3dV2Stage，**不调用** legacy 的 k3dStageFx4，
              所以改 cardEffects.js 对 v2 完全无效。

         设计（三层叠加，而不是单一条亮边）：
           ① 刃口锋线 rimHard —— 沿**真实刃口掩码** vBladeEdge 的窄亮边，
              这是“刀型轮廓”的字面含义，S4 的主题就是形状；
           ② 大范围轮廓 halo —— 掠射角菲涅尔，从刀身边缘向面内淡出，
              让光晕是“包住”刀身而不是贴在刃上；
           ③ 沿刀轴扫光 + 呼吸 —— 只给 epic 以上，稀有档保持静态，
              避免低档卡也在闪（那会让“高级”不再高级）。

         档位梯度（按 uCardTier：本卡自己的稀有档，不是整局最高档）：
           rare(2)   静态锋线 + 弱 halo
           epic(3)   出现扫光
           legend(4) 扫光更明显 + 呼吸
           mythic(5) 全强度动态

         ⚠ 必须用 uCardTier 而不是 uVisualTier。
           uVisualTier 是“整局摸到的最高档”，预览期基线是普通卡，常为 0；
           用它会导致稀有卡也拿不到效果（state.js 在 S5 上踩过同样的坑）。

         ⚠ 减弱动效：viewer 在 reduceMotion 下把 uEffectTime 冻结在 0，
           所以扫光/呼吸会自动变成静态光晕，无需额外分支。 */
    if ( uV2Preserve < 0.5 && uCardFx[3].y > 0.001 ) {
      float s4T = clamp( uS4Tier, 0.0, 5.0 );
      if ( s4T > 1.5 ) {
        float tk = clamp( ( s4T - 1.5 ) / 3.5, 0.0, 1.0 );
        /* ★ 2026-10-26（诊断修正）：封顶从 1.2 提到 2.6。
           原 caps 1.2 导致实测 strength 1.8 与 3.5 输出**完全相同**
           （rimLift 都是 0.0869）—— 说明卡在了这个 clamp 上，
           而不是“参数加不动”。诊断手段：固定 tier=5、只扫 fx3.y。 */
        float k4 = clamp( uCardFx[3].y, 0.0, 2.6 );

        /* 身份色：降饱和，避免把金属洗成彩漆（同 k3dV2Stage 里的处理）*/
        vec3 rc = ( dot( uV2StageTint[3], uV2StageTint[3] ) > 0.0001 )
          ? uV2StageTint[3]
          : ( 0.5 + 0.5 * cos( 6.2831853 * ( uCardFx[3].w + vec3( 0.0, 0.33, 0.66 ) ) ) );
        rc = mix( vec3( dot( rc, vec3( 0.299, 0.587, 0.114 ) ) ), rc, 0.60 );

        /* ★ 关键修正：扩大**覆盖**而不是继续加系数。

           诊断数据（固定 tier=5，只扫 S4 槽强度）：
             strength 0.3 → rimLift 0.0800
             strength 0.9 → rimLift 0.0849
             strength 1.8 → rimLift 0.0869
             strength 3.5 → rimLift 0.0869  ← 饱和
           即使饱和值也只有 +0.087，肉眼几乎看不出。
           根因是几何覆盖太窄：
             · rimHard 用 smoothstep(0.62, 0.98, vBladeEdge) —— 只剩刃口细线
             · halo 用 pow(fres, 2.1) —— 掠射角衰减太快
           刀面中部几乎完全没有光晕，所以“加亮度”只能抬一条线。 */

        /* ① 刃口锋线：阈值放宽（0.62→0.38）+ 上界放宽（0.98→0.92）*/
        float rimHard = smoothstep( 0.38, 0.92, clamp( vBladeEdge, 0.0, 1.0 ) );
        /* ② 大范围轮廓：fresnel 幂从 2.1 降到 1.15 —— 让刀面中部也能吃到光 */
        float halo = pow( clamp( k3dFres, 0.0, 1.0 ), 1.15 );
        /* ③ 扫光：rare 恒为 0.72（静态），mythic 全强度波动 */
        float sweep = sin( vBladeLocal.x * 9.0 - uEffectTime * ( 1.1 + tk * 1.6 ) ) * 0.5 + 0.5;
        sweep = mix( 0.72, sweep, clamp( ( s4T - 2.5 ) / 2.5, 0.0, 1.0 ) );
        /* ④ 呼吸：仅 legend 以上 */
        float breathe = 1.0 + 0.16 * sin( uEffectTime * 1.25 ) * clamp( ( s4T - 3.5 ) / 1.5, 0.0, 1.0 );

        /* 强度：rim 负责“刃口锋线”（锐），halo 负责“整体轮廓包裹”（柔）。
           上一版 0.55 太保守：rimLift 只到 0.1141（约 9/255），
           且 hiPct 仅 2.48→2.74，说明高光预算还大量空着。
           注意 vBladeEdge 只是“薄+凸+靠刀尖”的刃线，
           并不是整个刀型轮廓 —— 所以 halo 必须比 rim 更重。 */
        float amt = ( 0.70 + 1.10 * tk ) * k4 * breathe;
        float rim = rimHard * amt * ( 0.58 + 0.42 * sweep );
        float soft = halo * amt * 0.85 * sweep;

        /* 颜色层只做很轻的色相倾向。
           主力放在 PHYSICAL_FRAGMENT 的 totalEmissiveRadiance，
           因为 S4 的 metalness≈0.83，往漫反射里加的光会被剩下 17% 削掉。 */
        col = mix( col, col * 0.94 + rc * 0.22, clamp( soft * 0.45, 0.0, 0.30 ) );

        /* 传给 PHYSICAL_FRAGMENT（映射层算一次、物理层直接用）*/
        k3dS4RimAmt  = rim;
        k3dS4SoftAmt = soft;
        k3dS4W       = wS;
        k3dS4Tint    = rc;
      }
    }

    /* Unified visual energy budget. Every confirmed process can change
       reflectance or a narrow highlight but cannot add another whole-blade
       radiance lift. S4 advanced halo lives in its separate silhouette
       channel and remains visible. Base material emission stays bounded. */
    float localGlow = min( 0.065, max( 0.0, glow ) ) * 0.45;
    col += vec3( localGlow ) + uBladeEmission * min( 0.10, uBladeEmissionInt );
    float studioScale = mix( 1.0, clamp( uBladeEnvIntensity, 0.82, 1.12 ), 0.30 );
    col *= studioScale;
    /* Luminance-preserving shoulder: very bright manufactured pigments
       gently compress, midtones/steel-dark areas remain legible. */
    float energyLum = max( 0.001, dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    float shoulder = 1.0 / ( 1.0 + max( 0.0, energyLum - 0.42 ) * 0.60 );
    col *= shoulder;

    /* ⑥ 过程模型：保留模型自带纹理（uniform 开关，不换宏）

       ★★ 2026-10-24（P3）：这里以前只有“染色 + 乘亮度”两句，
       S1/S2/S3 三个阶段因此长得一模一样。
       现在按 uV2Proc 分阶段处理：
         · S2 熔液：高温辉光（裂纹处最亮，带缓慢脉动）
         · S1 矿石：粗颖粒（碎面明暗不均）
         · S3 胚体：颗粒变细 + 金属流钨（开始像铁而非石头） */
    if ( uV2Preserve > 0.5 ) {
      float tl = dot( baseTex, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 tinted = diffuseColor.rgb * ( uBladeBaseColor / max( 0.18, dot( uBladeBaseColor, vec3( 0.33 ) ) ) );
      float processBlend = clamp( uSkinTexStrength * 0.22
        + ( uCardFx[0].y + uCardFx[1].y ) * 0.10, 0.22, 0.62 );
      /* S3 selected billet: engrave the original hot steel, don't replace
         the authored GLB albedo with a bright, flat S1 colour. The selected
         S3 texture has already been sampled as sig; only its dark troughs
         remove albedo, while roughness/normal use the unchanged PBR chain.
         No added fetch, derivative, Fresnel, or per-card shader program. */
      if ( uV2Proc.x > 1.5 && uV2Proc.x < 2.5 && uS3On > 0.5 ) {
        float billetFace = smoothstep( 0.25, 0.80, clamp( vS3PlanarFace, 0.0, 1.0 ) );
        float darkGroove = max( 0.0, -sig ) * s3Surface;
        float grooveDepth = mix( 0.26, 0.48, billetFace );
        /* Keep every RGB component no brighter than its baked substrate.
           Front-facing grain is now contrast from real dark hammer marks,
           not extra specular energy or a whitening steel overlay. */
        col = mix( tinted, min( tinted, col ), 0.30 );
        col *= 1.0 - darkGroove * grooveDepth;
      } else {
        col = mix( tinted, col, processBlend );
      }
      col *= mix( 1.0, 0.72 + 0.56 * tl, 0.55 );
    }

    /* Existing finish coats sometimes flatten forged grain. Restore only
       a small, zero-mean micro-luminance variation on blade faces, based
       on the SAME S3 map and seed; no new texture or shader family. */
    if ( uS3On > 0.5 && uV2Preserve < 0.5 ) {
      float forgeEngrave = clamp( sig, -0.90, 0.90 ) * s3Surface * clamp( wB, 0.0, 1.0 );
      col *= 1.0 + forgeEngrave * 0.08;
    }
    /* ⑦ 颜色能量上限：亮度累积的旧修复只约束了单个 stage tint。
       S5 膜层直接替换高亮 albedo，S6–S9 再改色，加上磨损回填，
       每一步都能绕过上面的 stageLum 保持规则。统一在所有颜色工序之后
       对 S1+S3 钢材身份亮度做 soft knee；不裁切色相/粗糙度/高光结构。
       这里作用于物理材质的反射底色，不是屏幕像素白色硬截断。 */
    col = mix( col, identityCol, uV2Art.x > 0.5 ? 0.10 : (uV2Coat > 0.001 ? 0.12 : 0.24) );
    if ( uV2Preserve < 0.5 ) {
      float baseLum = dot( identityCol, vec3( 0.2126, 0.7152, 0.0722 ) );
      float finalLum = max( 0.0001, dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) );
      float maxBase = max( 0.085, baseLum * 1.08 );
      float excess = max( 0.0, finalLum - maxBase );
      float compressedLum = finalLum - excess * 0.82;
      col *= compressedLum / finalLum;
    }
    diffuseColor.rgb = mix( diffuseColor.rgb, col, wS );
  }
}
`;

const ROUGHNESS_FRAGMENT = `
{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  float wS = k3dSkinW( wB, wG, wH );
  if ( wS > 0.002 ) {
    vec3 pat = ( uS3On > 0.5 ) ? k3dS3Sample( vS3Local ) : vec3( 0.5, 0.0, 0.5 );
    /* Forge steel owns Blade + Guard + Grip before S8. At S8 only Grip is
       replaced; the previously forged Guard remains the same steel. */
    float s3Surface = ( uS3On > 0.5 )
       ? mix( k3dS3SurfaceMask( wB ), 0.54,
              clamp( wG + wH * uSkinCoverAll, 0.0, 1.0 ) ) : 1.0;
    float bladeRough = clamp( uBladeRoughness
      + clamp( pat.y * 0.32, -0.14, 0.14 ) * s3Surface * ( uS3On > 0.5 ? 1.0 : 0.0 )
      + uWearRough * 0.45, 0.02, 1.0 );
    /* 工艺层的粗糙度增量在 mapFragment 里算好（固定算子同一条式子） */
    bladeRough = clamp( bladeRough + k3dFinishRoughDelta, 0.025, 0.98 );
    /* 阶段粗糙度：与颜色层同一份纹样（pat.x），权重来自常量表 */
    bladeRough = k3dV2StageRough( uCardFx[0], k3dPat[0], bladeRough, uV2StageRough[0] );
    bladeRough = k3dV2StageRough( uCardFx[1], k3dPat[1], bladeRough, uV2StageRough[1] );
    bladeRough = k3dV2StageRough( uCardFx[2], k3dPat[2], bladeRough, uV2StageRough[2] );
    bladeRough = k3dV2StageRough( uCardFx[3], k3dPat[3], bladeRough, uV2StageRough[3] );
    bladeRough = k3dV2StageRough( uCardFx[4], k3dPat[4], bladeRough, uV2StageRough[4] );
    bladeRough = k3dV2StageRough( uCardFx[5], k3dPat[5], bladeRough, uV2StageRough[5] );
    bladeRough = k3dV2StageRough( uCardFx[6], k3dPat[6], bladeRough, uV2StageRough[6] );
    bladeRough = k3dV2StageRough( uCardFx[8], k3dPat[8], bladeRough, uV2StageRough[8] );

    if (uV2Art.x > 0.5) {
      bladeRough = mix(bladeRough,
        clamp(uBladeRoughness+k3dFinishRoughDelta+pat.y*0.085,0.075,0.88),0.65);
    }
    /* 刃口抛光（S7 的真实 bevel） */
    float bevel = smoothstep( 0.16, 0.70, clamp( vBladeEdge, 0.0, 1.0 ) ) * uEdgeGlow.w * wB;
    bladeRough = mix( bladeRough, mix( 0.18, 0.045, clamp( uEdgeGlow.x, 0.0, 1.0 ) ), bevel * 0.70 );
    roughnessFactor = mix( roughnessFactor, bladeRough, wS );
  }
}
`;

const METALNESS_FRAGMENT = `
{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  float wS = k3dSkinW( wB, wG, wH );
  if ( wS > 0.002 ) {
    float metal = clamp( uBladeMetalness + uBladeRoughVar * 0.05 + k3dS5Metal, 0.0, 1.0 );
    metalnessFactor = mix( metalnessFactor, metal, wS );
  }
}
`;

/* 清漆 + S4 高级卡轮廓光晕。

   ★★ 2026-10-26（根因）：为什么之前改 albedo 完全看不出？

   S4 的 uBladeMetalness ≈ 0.83，即**漫反射只占 17%**。
   而光晕最初写在 diffuseColor.rgb 里 —— 等于把亮度乘上 0.17，
   再经过色调映射几乎不可见。
   实测：S4 槽强度从 0.3 扫到 3.5，rimLift 只从 0.0800 到 0.0869（饱和），肉眼无差。

   正确通道是 totalEmissiveRadiance（自发光）：
   在 three 的物理着色里它是**直接相加**的，不乘 (1-metalness)。
   physicalFragment 注入在 #include <lights_physical_fragment> 之后，
   那里正好能写它 —— 已用一个 0.0001 量级的最小写入验证过可写。

   ❗ 不要在注入点调 k3dRegionW / k3dSkinW：
      实测这样会让整支片元编译失败（S1–S5 全部 empty frame，
      但 pageerror 为空 —— 是静默的 shader 链接失败）。
      刀身权重改由 MAP_FRAGMENT 存进 k3dS4W。 */
const PHYSICAL_FRAGMENT = `#ifdef USE_CLEARCOAT
material.clearcoat = clamp( material.clearcoat + max(uV2Coat,k3dS5Coat), 0.0, 0.92 );
material.clearcoatRoughness = mix( material.clearcoatRoughness, k3dS5CoatRough, clamp(max(uV2Coat,k3dS5Coat),0.0,1.0) );
#endif
{
  /* 锋线当主光、大范围晕当底光；总量封顶避免过曝。
     乘 k3dS4W 保证刀柄不吃刀身卡的自发光（项目既有纪律）。 */
  /* S4 premium silhouette can be strong while choosing shape. After the
     S5 treatment enters, the same emissive pass must yield to surface PBR;
     otherwise S4 + S5 coat + S6 iridescence visually wash out the blade. */
  float postS5 = step( 0.001, uCardFx[4].y );
  float postS6 = step( 0.001, uCardFx[5].y );
  float haloCarry = 1.0 - 0.48 * postS5 - 0.12 * postS6;
  float s4e = clamp( k3dS4RimAmt * 1.35 + k3dS4SoftAmt * 0.38, 0.0, 0.92 )
            * clamp( k3dS4W, 0.0, 1.0 ) * haloCarry;
  totalEmissiveRadiance += k3dS4Tint * s4e;
}`;

/* ★ 2026-10-24（表面层）：刀身的**真实表面结构**。
   之前 v2 从未写过 normalFragment（柄部一直在用），所以刀面只有解析法线。
   注入点在 #include <normal_fragment_maps> 之后，那里看不到 mapFragment 的局部变量，
   所以整段在 surfaceDetail.js 里自包含地计算（含自己的 fresnel）。 */
const NORMAL_FRAGMENT = buildNormalFragment();

/** 四段调色板（三个 S3 样式卡需要覆盖材质派生的多普勒调色板）。 */
function paletteFor(op, fp, fallback) {
  const list = op.palette;
  if (!list || !list.length) return fallback;
  const out = list.slice(0, 4);
  while (out.length < 4) out.push(out[out.length - 1]);
  return out;
}

/** 与 shader 的 k3dPalette4 逐段一致的四段调色板取值（JS 侧，只用于算身份色）。 */
function paletteAt(colors, t) {
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  const seg = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  if (k < 0.34) return seg(colors[0], colors[1], k / 0.34);
  if (k < 0.67) return seg(colors[1], colors[2], (k - 0.34) / 0.33);
  return seg(colors[2], colors[3], (k - 0.67) / 0.33);
}

/**
 * 构造 v2 hook spec。签名与 uniform 形状与 legacy 的 bladeSkin hook 兼容
 * （material.upsertHook 只认 signature + uniforms + 各注入点）。
 *
 * @param {object} pack  composeBladeSkin 的产出（与实机/出图共用同一真源）
 * @param {object} frame 模型刀轴 frame（basis/origin/span）
 * @param {object} [opts] { baseMap, texStrength, preserveTex, material }
 */
export function buildHook(pack, frame, opts = {}) {
  const THREE = globalThis.THREE;
  const K = K3D();
  const u = pack.uniforms || {};
  const colorOf = (spec, fb) => (K.material && K.material.colorFromSpec
    ? K.material.colorFromSpec(spec, fb) : new THREE.Color(fb || '#ffffff'));
  const V3 = (a, fb) => new THREE.Vector3(
    Number(a?.[0] ?? fb?.[0] ?? 0), Number(a?.[1] ?? fb?.[1] ?? 0), Number(a?.[2] ?? fb?.[2] ?? 0));
  const V4 = (a, fb) => new THREE.Vector4(
    Number(a?.[0] ?? fb?.[0] ?? 0), Number(a?.[1] ?? fb?.[1] ?? 0),
    Number(a?.[2] ?? fb?.[2] ?? 0), Number(a?.[3] ?? fb?.[3] ?? 0));

  const finishId = Math.round(Number(u.uFinId) || 1);
  const fp = {
    amount: u.uFinParam0?.[0], darkness: u.uFinParam0?.[1], gradient: u.uFinParam0?.[2], heatSpread: u.uFinParam0?.[3],
    phase: u.uFinParam1?.[0], temperature: u.uFinParam1?.[1], hueShift: u.uFinParam1?.[2], coat: u.uFinParam1?.[3],
    preserveRatio: u.uFinParam2?.[1], fresnelPower: u.uFinParam2?.[2], fresnelIntensity: u.uFinParam2?.[3],
    colorPhase: u.uFinParam3?.[0], flowSpeed: u.uFinParam3?.[1], iridescence: u.uFinParam3?.[2],
    tintHex: u.uFinColor,
    paletteShift: Number(u.uV2PaletteShift) || 0,
  };
  const op = finishOperators(finishId, fp, {
    dopplerStrength: u.uFinParam2?.[0],
    wear: u.uWear01,
    finishId,
  });

  /* ★★ 2026-10-23（用户：S5 稀有+ 对标 CSGO，三张经典牌 + 自设计 6 套）
   *
   *   稀有档 ≥2（稀有/史诗/传说/神话）时，由 `finishRecipe.S5_EFFECTS` 接管算子表：
   *   每套效果 = 一组**已有槽位**的参数（mode / 4 锚点调色板 / cover / ramp /
   *   film / fresnel / gloss），所以 GLSL 一个字都不用改 —— program 数不变、
   *   编译配置数不变，加载时间不受影响。
   *
   *   · 逐卡：`resolveS5Effect` 用 (finishId, 卡的 paletteShift) 选一套 —— 同一张卡永远同一种；
   *   · 逐局：相位 / 覆盖率按 uSeeds 轻微摆动（同卡每局小有差异）；
   *   · 稀有模板：低概率整套换色（例如表面淬火 7% 出"全蓝"）。 */
  /* ★★ 修复（用户报「刚进新阶段、还没选就有新效果覆盖」）：
     效果库的介入条件里必须包含 `chosen`（玩家真的选过 S5），
     否则仅凭稀有度就会在未选淬火时自动上色。
     `chosen` 来自 `finishOperators()` 的返回，与算子表同一真源，不另算一份。 */
  refineS5BaseFinish(op, u.uS5CardId, Number(u.uStageTiers?.[4]) || 0);
  const s5 = resolveS5Effect(finishId, Number(u.uStageTiers?.[4]) || 0,
    Number(u.uV2PaletteShift) || 0, u.uSeeds,
    { colorPhase: fp.colorPhase, hueShift: fp.hueShift, coat: fp.coat, amount: fp.amount,
      cardId: u.uS5CardId, baseHex: u.uBladeBaseColor, chosen: op.chosen === true });
  if (s5) applyS5Effect(op, s5, fp);
  const pal = paletteFor(op, fp, [u.uDopPal0, u.uDopPal1, u.uDopPal2, u.uDopPal3]);
  /* 调色板条目有两种来源：材质派生的 [r,g,b]（0..1）与算子表里的 '#rrggbb'。
     字符串必须走 colorFromSpec 转成线性 RGB —— 直接 Number('#39…') 会得到 NaN，
     uniform 变成 NaN 后整条色带渲染成黑色（S5_21 实测踩到）。 */
  const palVec = (c) => {
    if (typeof c === 'string') {
      const col = colorOf(c, '#ffffff');
      return new THREE.Vector3(col.r, col.g, col.b);
    }
    return V3(c);
  };
  const opticalPalette = S5_OPTICAL_PALETTES[Number(String(u.uS5CardId).slice(3))] || pal;
  const opticalMeta = s5Pattern(u.uS5CardId, u.uSeeds);
  const tint = op.tint || u.uFinColor || '#ffffff';

  /* 微粗糙度幅度：抛光类给得多一点（S5 品质轴），其余克制。低档卡不额外加噪。 */
  const polishAmt = Math.min(1, Math.max(0, op.a[0]));
  const micro = Math.round((0.02 + 0.05 * polishAmt) * 1000) / 1000;

  /* 阶段身份色（★ 方案 §7）：S5 有调色板的卡用**卡自己的调色板**，不再只靠 rank 色相。
     为什么：方案点名「S5_20 蓝紫流界必须实际呈现蓝紫，而不是 rank 色相变成黄绿」——
     实测 rank 20 → 115°，正好是黄绿，卡名与颜色直接打架。
     取 `paletteShift * 0.5`：让卡名里的主色（调色板靠前的那一段）占上风，
     完整渐变仍由 k3dV2Finish 的 ramp 负责。没有调色板的阶段留 0，回落 rank 色相。 */
  const stageTint = new Float32Array(27);
  /* ★ 2026-10-23：`fromBase` 的效果（冷热虹界）**不要拿调色板去染刃带** ——
     实测那把刀的紫色其实来自这层 stageTint，而不是 k3dV2Finish 的渐变。
     跳过它，刀面才会呈现"材质自身明暗渐变"。 */
  /* ★ 2026-10-23（23 的刀柄为什么是紫的）：把 stageTint 置零并不会"不着色"，
     shader 里有 `accent = (dot(stageTint,stageTint) > 0.0001) ? stageTint : rankHue;`
     —— 置零就**回落到 rank 色相**（这把刀的紫）。所以 fromBase 的效果要把
     stageTint 设成**刀身本色**：着色量非零（不回落），但颜色就是钢本身。 */
  if (op.noStageTint) {
    const baseCol = colorOf(u.uBladeBaseColor, '#9aa2ac');
    stageTint[4 * 3] = baseCol.r; stageTint[4 * 3 + 1] = baseCol.g; stageTint[4 * 3 + 2] = baseCol.b;
  }
  /* ★★ 修复（卡名与颜色不符）：stageTint 原来只在 `fp.hueShift != null` 时才写入。
     而 S5_20「蓝紫流界」的卡数据是 {strength, colorPhase, paletteShift:0.33} ——
     **没有 hueShift**，于是条件不成立 → stageTint 保持全零 →
     shader 里 `accent = (dot(stageTint,stageTint) > 0.0001) ? stageTint : rankHue`
     回落到 rankHue（rank 20 ≈ 115° 黄绿）—— 实测画面渲成**绿色**，与卡名相反。

     现在：只要这张卡**有调色板**（op.palette），就必须写入身份色；
     偏移量优先用 hueShift，其次用卡自己的 paletteShift（那才是“这张卡在色环上的位置”）。 */
  if (op.palette && !op.noStageTint) {
    const rgb = pal.map((c) => { const v = palVec(c); return [v.x, v.y, v.z]; });
    const shiftSource = (fp.hueShift != null && Number.isFinite(Number(fp.hueShift)))
      ? Number(fp.hueShift)
      : (Number(fp.paletteShift) || 0);
    /* 取 0.5 系数：让卡名里的主色（调色板靠前那段）占上风 */
    const shift = Math.min(1, Math.max(0, shiftSource)) * 0.5;
    const tint = paletteAt(rgb, shift);
    stageTint[4 * 3] = tint[0]; stageTint[4 * 3 + 1] = tint[1]; stageTint[4 * 3 + 2] = tint[2];
  }

  /* ★★ 修复（中性工艺不该被染色）：
     上面两个分支覆盖了“有调色板”与“fromBase”，但 **F01 精抛光 / F02 镜面 /
     F03 拉丝 / F04 发黑 / F09 镀层 / F11 喷砂 / F12 边光** 这些工艺本身
     不带 palette —— 于是 stageTint[4] 保持全零 → shader 回落到 rankHue →
     一张“只该提亮镜面”的精抛光卡被染成紫刀（截图实测）。

     这些工艺的语义是**表面处理**（抛光/压暗/磨砂），颜色应该来自金属本身，
     而不是卡在卡池里的位次。所以这里把它们的 S5 身份色设成**刀身本色**：
     着色量非零（不会回落 rankHue），但颜色就是钢。 */
  if (!op.palette && !op.noStageTint) {
    const baseCol = colorOf(u.uBladeBaseColor, '#9aa2ac');
    stageTint[4 * 3] = baseCol.r; stageTint[4 * 3 + 1] = baseCol.g; stageTint[4 * 3 + 2] = baseCol.b;
  }

  const uniforms = {
    uSkinBaseMap: { value: opts.baseMap || null },
    uBladeBaseColor: { value: colorOf(u.uBladeBaseColor, '#9aa2ac') },
    uVisualTier: { value: Number(u.uVisualTier) || 0 },
    uCardTier: { value: Number(u.uCardTier) || 0 },
    uStageTiers: { value: u.uStageTiers || new Float32Array(9) },
    uS4Tier: { value: Number(u.uStageTiers?.[3]) || 0 },
    uS5Tier: { value: Number(u.uStageTiers?.[4]) || 0 },
    uV2FadeMode: { value: op.fadeMode ? 1 : 0 },
    uV2Look: { value: Number(op.premiumLook) || 0 },
    uS5OpticalMap: { value: getS5OpticalTexture(THREE,u.uS5CardId,u.uSeeds,op.chosen,opts.material) },
    uS5Optical0: { value: palVec(opticalPalette[0]) },
    uS5Optical1: { value: palVec(opticalPalette[1]) },
    uS5Optical2: { value: palVec(opticalPalette[2]) },
    uS5Optical3: { value: palVec(opticalPalette[3]) },
    uV2Art: { value: new THREE.Vector4(...s5CardArt(u.uS5CardId, op.chosen, Number(u.uStageTiers?.[4]) || 0)) },
    uRarityColor: { value: colorOf(u.uRarityColor, '#c5d7e8') },
    uCardFx: { value: u.uCardFx || new Float32Array(36) },
    uBakedAtlas: { value: u.uBakedAtlas || null },
    uBakedMeta: { value: u.uBakedMeta || new Float32Array(36) },
    uAnimAtlas: { value: u.uAnimAtlas || null },
    uAnimMeta: { value: u.uAnimMeta || new Float32Array(36) },
    uEffectTime: { value: Number(u.uEffectTime) || 0 },
    uBladeMetalness: { value: u.uBladeMetalness },
    uBladeRoughness: { value: u.uBladeRoughness },
    uBladeRoughVar: { value: u.uBladeRoughVar },
    uBladeSpecular: { value: u.uBladeSpecular },
    uBladeEmission: { value: colorOf(u.uBladeEmission, '#000000') },
    uBladeEmissionInt: { value: u.uBladeEmissionInt },
    uSkinTexStrength: { value: opts.texStrength != null ? opts.texStrength : 1.0 },
    uSkinCoverAll: { value: u.uSkinCoverAll == null ? 1 : (Number(u.uSkinCoverAll) > 0.5 ? 1 : 0) },
    uBladeEnvIntensity: { value: u.uBladeEnvIntensity != null ? Number(u.uBladeEnvIntensity) : 1.0 },
    uTexId: { value: u.uTexId },
    uTexParam0: { value: V4(u.uTexParam0) },
    uTexParam1: { value: V4(u.uTexParam1) },
    uTexParam2: { value: V4(u.uTexParam2) },
    uTexParam3: { value: V4(u.uTexParam3) },
    uTexParam4: { value: V4(u.uTexParam4) },
    uTexParam5: { value: V4(u.uTexParam5) },
    uTexParam6: { value: V4(u.uTexParam6) },
    uFinId: { value: finishId },
    uFinParam0: { value: V4(u.uFinParam0) },
    uFinParam1: { value: V4(u.uFinParam1) },
    uFinParam2: { value: V4(u.uFinParam2) },
    uFinParam3: { value: V4(u.uFinParam3) },
    uFinColor: { value: colorOf(u.uFinColor, '#ffffff') },
    uTemper: { value: V4(u.uTemper) },
    uTemperIrid: { value: V4(u.uTemperIrid || [0, 0.45, 1.55, 0]) },
    uTemperFlow: { value: Number(u.uTemperFlow) || 0 },
    uEdgeGlow: { value: V4(u.uEdgeGlow) },
    uEdgeColor: { value: colorOf(u.uEdgeColor, '#9fd0ff') },
    uTune: { value: V4(u.uTune) },
    uDopPal0: { value: palVec(pal[0]) },
    uDopPal1: { value: palVec(pal[1]) },
    uDopPal2: { value: palVec(pal[2]) },
    uDopPal3: { value: palVec(pal[3]) },
    uDopMeta: { value: V4(u.uDopMeta) },
    uSeeds: { value: V4(u.uSeeds) },
    uWearLevels: { value: V4(u.uWearLevels) },
    uWearRough: { value: u.uWearRough },
    uWear01: { value: u.uWear01 },
    uBladeBasis: { value: frame ? frame.basis : new THREE.Matrix3() },
    uBladeOrigin: { value: frame ? frame.origin : new THREE.Vector3() },
    uBladeSpan: { value: frame ? frame.span : new THREE.Vector3(1, 1, 1) },
    uS3On: { value: Number(u.uS3On) || 0 },
    uS3Xf: { value: V4(u.uS3Xf || [0, 1, 0, 0]) },
    /* S3 贴图 / 投影 / 统计全部复用 legacy 的同一份实现（单一真源）：
       贴图按 id 缓存、投影按当前刀型算、统计在解码后异步回填。 */
    uS3Map: { value: K.bladeSkinShader?.s3MapFor ? K.bladeSkinShader.s3MapFor(u.uS3TexId) : null },
    uS3Alpha: { value: Number(u.uS3Alpha) || 0.5 },
    uS3UV: { value: K.bladeSkinShader?.s3UvFor ? K.bladeSkinShader.s3UvFor(frame) : V4(u.uS3UV || [0, 0, 1, 0.26]) },
    uS3Stat: { value: K.bladeSkinShader?.s3StatFor ? K.bladeSkinShader.s3StatFor(u.uS3TexId) : V4(u.uS3Stat || [0.5, 1, 0, 0]) },
    uS3Warp: { value: Number(u.uS3Warp) || 0 },
    uS3Cross: { value: Number(u.uS3Cross) || 0 },
    /* v2 固定算子 */
    uV2FinA: { value: new THREE.Vector4(...op.a) },
    uV2FinB: { value: new THREE.Vector4(...op.b) },
    uV2FinC: { value: new THREE.Vector4(...op.c) },
    uV2FinD: { value: new THREE.Vector4(...op.d) },
    uV2FinTint: { value: colorOf(tint, '#ffffff') },
    uV2Mode: { value: Number(op.mode) || 0 },
    /* 每阶段粗糙度权重（旧 8 路链里的幅度系数，收敛成一张常量表） */
    uV2StageCfg: { value: STAGE_CFG },
    uV2StageTint: { value: stageTint },
    uV2StageRough: { value: STAGE_ROUGH_WEIGHT },
    uV2Micro: { value: micro },
    /* 色带覆盖率：诊断可用 `globalThis.K3D_V2_COVER` 覆盖（只影响这一份配方）。
       生产默认取 finishOperators 给的 cover（方案 §7 的 10–25% 起点 / 40% 上限）。 */
    uV2Cover: {
      value: (() => {
        const o = Number(globalThis.K3D_V2_COVER);
        if (Number.isFinite(o) && o >= 0) return Math.min(1, Math.max(0, o));
        return op.cover != null ? op.cover : 1.0;
      })(),
    },
    uV2Coat: { value: Math.min(0.8, Math.max(0, op.d[3])) },
    uV2Preserve: { value: opts.preserveTex ? 1 : 0 },
    /* 表面层：由工艺 + 纹理各向异性 + 卡档推导（见 surfaceDetail.js） */
    uV2Surf: { value: new THREE.Vector4(...surfaceParamsOf(op, u, finishId, opts)) },
    /* ★ 2026-10-24（P2 · 真实贴图层）
       运行时生成的表面高度图集 + 当前阶段该取哪张瓦片。
       瓦片选择：由“已做过的工序数”推当前阶段 → STAGE_SURFACE_KIND → tileRectOf。
       权重 uV2SurfTile.w：过程模型（S1–S4）给 0.55，成刀给 0.75；
       未加载到图集时自动回 0（不影响旧观感）。 */
    ...(() => {
      const atlas = getSurfaceAtlas();
      if (!atlas) return { uV2SurfaceMap: { value: null }, uV2SurfTile: { value: new THREE.Vector4(0, 0, 0, 0) } };
      /* 当前阶段：与 surfaceDetail 同一口径（fx.y > 0 的槽数 - 1） */
      const fx = u.uCardFx;
      let reached = 0;
      if (fx && fx.length >= 36) {
        for (let i = 0; i < 9; i++) if (Number(fx[i * 4 + 1]) > 0.001) reached++;
      }
      const stageIdx = Math.max(0, Math.min(8, reached - 1));
      const kind = STAGE_SURFACE_KIND[stageIdx] ?? 1;
      const rect = tileRectOf(kind);
      /* 贴图权重：有图就给；过程模型略低（模型自带纹理也在参与） */
      /* ★★ 2026-10-24 第二轮：贴图层权重大幅调低。（依据：视觉扫描）

         A 档（surfW=0.75 / relief=0.07）亮区 13.4%，整把刀读成木头/织物；
         E 档（surfW=0 / relief=0）亮区 20.6%，是干净金属，明显最好。

         根因：这个项目的模型**自带一套 1024² 的深色木纹/流动纹理**（实测导出确认），
         我又在上面叠了贴图层 + 9 槽纹样 + 法线层 →
         三个纹理层累积，把金属反射压死，只剩一片粗糙图案。

         所以贴图层从“主导表面”改为“淡淡一层细节”：
           成刀 0.75 → **0.18**，过程模型 0.55 → **0.14**
         这样镜面高光能穿过去，而纹路在针看时仍隐约可见。 */
      const w = opts.preserveTex ? 0.14 : 0.18;
      return {
        uV2SurfaceMap: { value: atlas.texture },
        uV2SurfTile: { value: new THREE.Vector4(rect.ox, rect.oy, rect.scale, w) },
      };
    })(),
    /* 重复次数：沿刀轴 3 次、横向 2.4 次（刀面细长，横向要少一些才不变形）。
       vBladeLocal 的范围很小（±0.3），不乘重复次数等于只采到图集一个小角落。 */
    uV2SurfUv: { value: new THREE.Vector4(3.0, 2.4, 0.31, 0.17) },
    /* ★★ 2026-10-24（P3 · 过程模型参数）

       x = 过程阶段号（-1 = 不是过程模型）
       y = 热辉光（S2 熔液 1.00 / S3 胚体 0.26 / S1 矿石 0）
       z = 颜粒/杂质（S1 最粗 1.00 / S3 0.55 / S2 0.30）
       w = 金属流镀倾向（S3 最强 1.00 / S2 0.35 / S1 0）

       为什么要分阶段：
         S1 矿石 → S2 钢液 → S3 胚体 是本作最直观的“物质变身”。
         但之前三个阶段走的是**同一段**染色逻辑，只乘一次亮度，
         实测三个阶段的观感几乎一样（S2 没有高温感，S3 还是石头味）。

       ⚠ 阶段号用与 surfaceDetail / bladeViewer 同一口径：
         “已做过的槽数 - 1”。过程模型只出现在 idx 0–2。 */
    uV2Proc: { value: (() => {
      const fx = u.uCardFx;
      let reached = 0;
      if (fx && fx.length >= 36) {
        for (let i = 0; i < 9; i++) if (Number(fx[i * 4 + 1]) > 0.001) reached++;
      }
      const stageIdx = Math.max(0, Math.min(8, reached - 1));
      /* 不是过程模型 → 全部关掉 */
      if (!opts.preserveTex || stageIdx > 2) {
        return new THREE.Vector4(-1, 0, 0, 0);
      }
      /* S1=0 / S2=1 / S3=2 */
      const heat = [0.00, 1.00, 0.26][stageIdx] ?? 0;
      const grain = [1.00, 0.30, 0.55][stageIdx] ?? 0;
      const iron = [0.00, 0.35, 1.00][stageIdx] ?? 0;
      return new THREE.Vector4(stageIdx, heat, grain, iron);
    })() },
  };
  /* ⚠ 2026-10-23：这里曾加过一行 material.userData.__v2u = uniforms 做诊断，
     但这段代码所在的作用域**没有 material**（真正的 apply 在下面），
     于是每次构建都抛 ReferenceError → 整个皮肤挂不上 → 全刀渲染成深灰（实测踩到）。
     已删除。要暴露 v2 uniform，必须写在 apply(material, ...) 里面。 */

  const src = buildSource();
  return {
    /* 程序键：只有**源码结构**相关的选项。卡 id / 纹理 id / 工艺 id / 柄 kind / seed
       一律不进签名 —— 换卡只刷 uniform。
       ★ 2026-10-21：过程模型（矿石/熔球/刀胚）也从签名里去掉了：`uV2Preserve` 本来就是
       uniform，以前多带一个 `:PT` 只是给同一份源码造了第二支 program —— 实测 S1 首卡
       因此多付一次 ~0.9s 冷编译。现在矿石与成刀共用同一支程序，靠 uniform 区分。 */
    signature: FAMILY_VERSION,
    uniforms,
    common: src.common,
    vertexCommon: VERTEX_COMMON,
    vertexBody: VERTEX_BODY,
    mapFragment: MAP_FRAGMENT,
    roughnessFragment: ROUGHNESS_FRAGMENT,
    metalnessFragment: METALNESS_FRAGMENT,
    physicalFragment: PHYSICAL_FRAGMENT,
    /* ★ 2026-10-24：补上刀身从未使用过的法线层 —— 真实表面结构的来源。
       注入到 three 的 #include <normal_fragment_maps> 之后，
       直接改写 `normal`，因此后续 PBR 光照/环境反射全部吃到凹凸。 */
    normalFragment: NORMAL_FRAGMENT,
    /* 诊断：这一份配方的算子快照（不进 GLSL） */
    v2: { finishId, op, micro, palette: !!op.palette, optical: opticalMeta },
  };
}

/** 程序族键（供预热/诊断统计；不是 three 的 cacheKey）。 */
export function familyKey(material) {
  if (!material) return 'unknown';
  const transmission = Number(material.transmission) > 0 ? 'tr' : 'op';
  return FAMILY_VERSION + '|' + transmission;
}

/* ── 与 legacy bladeSkinShader 同形的 apply / refresh / detach ──────────────
   为什么需要：bladeViewer 在「柄的 motif family 并集变化」时会 refresh 刀身
   hook（旧实现靠它同步特化范围）。v2 的签名与 family 无关，但**不能**让那次
   refresh 把材质换回 legacy spec —— 所以 refresh 必须问"这个材质归谁"。 */
const LAST_APPLY = new WeakMap();

function ensureRegistered() {
  const K = K3D();
  if (!K.v2BladeSkin) {
    K.v2BladeSkin = { buildHook, apply, refresh, detach, owns, familyKey, sourceStats: v2SourceStats };
  }
  return K.v2BladeSkin;
}

export function apply(material, pack, frame, opts = {}) {
  const K = K3D();
  LAST_APPLY.set(material, { pack, frame, opts });
  const spec = buildHook(pack, frame, { ...opts, material });
  K.material.upsertHook(material, 'bladeSkin', spec);
  ensureRegistered();
  return spec;
}

/** 重建已挂载材质的 bladeSkin hook（保留给 bladeViewer 的统一 refresh 入口）。 */
export function refresh(material) {
  const li = LAST_APPLY.get(material);
  if (!li) return false;
  const spec = buildHook(li.pack, li.frame, { ...li.opts, material });
  K3D().material.upsertHook(material, 'bladeSkin', spec);
  return true;
}

export function detach(material) {
  LAST_APPLY.delete(material);
  K3D().material.removeHook(material, 'bladeSkin');
}

/** 这个材质最后一次是 v2 挂上的吗？（决定 refresh 走哪条路径） */
export function owns(material) { return LAST_APPLY.has(material); }

export default { FAMILY_VERSION, buildHook, apply, refresh, detach, owns, familyKey, v2SourceStats, clearV2SourceCache };
