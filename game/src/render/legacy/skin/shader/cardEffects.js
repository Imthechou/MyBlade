/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/shader/cardEffects.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});
  const functions = `
float k3dCardHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}

// Twenty-five authored pattern families. The integer card rank selects one family;
// scale, phase and rarity are additional dimensions rather than the only differences.
/* ★★ 2026-10-17（加载速度 · 烘焙切片）
 *   已烘焙族（目前只有 family 1）**不再走下面的 25 路 if/else** —— 直接采样 JS/canvas
 *   生成的值场贴图（见 src/render/legacy/skin/bakedMotif.js）。
 *   为什么值这一改：实测单支 program 编译 3094ms 里 99% 来自这一层的函数体，
 *   换成采样后 → 38ms（tools/probe-bake-sim.mjs）。
 *   保真：JS 复刻与 GLSL 逐像素对拍 MAE 0.17/255（tools/probe-motif-replica.mjs）。
 *   ⚠ uBakedMeta.x = family + 1（0 = 本材质没烘焙）；rank/scale/phase 已烘进贴图，
 *     所以这里的采样不依赖它们，只按 p（blade-local 0..1）取。
 *   ⚠ 未烘焙族仍走原链，逐族灰度替换、随时可回滚。 */
uniform sampler2D uBakedAtlas;
/* uBakedMeta[i] = ( family + 1, tile, 0, 0 )；family+1 == 0 表示该槽没烘焙（静态） */
uniform vec4  uBakedMeta[9];
/* 动画族（带 time 的 6 个）：12 帧条带。
   uAnimMeta[i] = ( family + 1, row, period 秒, rowCount ) */
uniform sampler2D uAnimAtlas;
uniform vec4  uAnimMeta[9];

float k3dCardMotif( vec2 p, float style, float scale, float phase, float time ) {
  float rank = max( 1.0, floor( style ) );
  float family = mod( rank - 1.0, 25.0 );
  float freq = ( 5.0 + mod( rank * 1.73, 17.0 ) ) * max( 0.45, scale );
  float angle = rank * 0.6180339 + phase * 6.2831853;
  float cs = cos( angle ), sn = sin( angle );
  vec2 q = vec2( p.x * cs - p.y * sn, p.x * sn + p.y * cs ) * freq;
  float n = k3dCardHash( floor( q ) + vec2( rank ) );
  float v = 0.5;
  float radius = length( q );
  float wave = sin( q.x + sin( q.y * 0.43 + phase * 6.2831853 ) * 1.8 );
  if ( family < 0.5 ) {                                      // 01 water ripples
    v = 0.5 + 0.5 * sin( q.x * 0.48 + sin( q.y * 0.3 ) * 2.5 + phase * 6.2831853 );
  } else if ( family < 1.5 ) {                               // 02 hammer dimples
    vec2 cell = abs( fract( q ) - 0.5 );
    v = 1.0 - smoothstep( 0.12, 0.48, length( cell ) );
  } else if ( family < 2.5 ) {                               // 03 branching veins
    v = 0.5 + 0.5 * sin( sin( q.x * 0.58 + sin( q.y * 0.26 ) * 2.4 ) * 3.2 + q.y * 0.12 );
  } else if ( family < 3.5 ) {                               // 04 star rings
    float a = atan( q.y, q.x );
    v = 0.5 + 0.5 * sin( radius * 1.65 + sin( a * 5.0 ) * 0.8 + phase * 6.2831853 );
  } else if ( family < 4.5 ) {                               // 05 crystal lattice
    v = abs( sin( q.x * 0.62 ) * sin( q.y * 0.62 ) );
  } else if ( family < 5.5 ) {                               // 06 fishbone
    v = 0.5 + 0.5 * sin( q.x + q.y ) * sin( q.x - q.y );
  } else if ( family < 6.5 ) {                               // 07 cracked glaze
    float crack = abs( sin( q.x * 0.37 + sin( q.y * 0.31 ) * 2.1 ) );
    v = 1.0 - smoothstep( 0.05, 0.24, crack );
  } else if ( family < 7.5 ) {                               // 08 star dust
    v = step( 0.86, n ) * ( 0.5 + 0.5 * sin( time * 1.7 + n * 6.2831853 ) );
  } else if ( family < 8.5 ) {                               // 09 vertical flame
    v = 0.5 + 0.5 * sin( q.x * 0.42 + sin( q.y * 0.22 + time * 0.65 ) * 2.7 );
  } else if ( family < 9.5 ) {                               // 10 rain-forged strokes
    v = 1.0 - smoothstep( 0.03, 0.18, abs( fract( q.x * 0.48 + q.y * 0.16 ) - 0.5 ) );
  } else if ( family < 10.5 ) {                              // 11 golden filigree
    v = 1.0 - smoothstep( 0.025, 0.12, abs( sin( q.x * 0.44 + sin( q.y * 0.2 ) * 1.5 ) ) );
  } else if ( family < 11.5 ) {                              // 12 vortex
    v = 0.5 + 0.5 * sin( radius * 1.15 + atan( q.y, q.x ) * 2.4 + time * 0.28 );
  } else if ( family < 12.5 ) {                              // 13 overlapping scales
    vec2 cell = fract( q * vec2( 1.0, 0.62 ) + vec2( 0.5 * floor( q.y * 0.62 ), 0.0 ) );
    v = 1.0 - smoothstep( 0.28, 0.48, length( cell - vec2( 0.5, 0.34 ) ) );
  } else if ( family < 13.5 ) {                              // 14 crossed engraving
    v = max( abs( sin( ( q.x + q.y ) * 0.52 ) ), abs( sin( ( q.x - q.y ) * 0.52 ) ) );
  } else if ( family < 14.5 ) {                              // 15 ice fracture
    float crack = abs( sin( q.x * 0.31 + sin( q.y * 0.19 ) * 3.1 + sin( q.y * 0.71 ) ) );
    v = 1.0 - smoothstep( 0.035, 0.16, crack );
  } else if ( family < 15.5 ) {                              // 16 mist star field
    float cloud = 0.5 + 0.5 * sin( q.x * 0.18 + sin( q.y * 0.21 + time * 0.18 ) * 1.7 );
    float speck = step( 0.89, n ) * ( 0.5 + 0.5 * sin( time + n * 6.2831853 ) );
    v = mix( cloud, 1.0, speck * 0.7 );
  } else if ( family < 16.5 ) {                              // 17 fine parallel waves
    v = 0.5 + 0.5 * sin( q.x * 1.45 + sin( q.y * 0.13 ) * 0.55 );
  } else if ( family < 17.5 ) {                              // 18 hammered scales
    float d = length( fract( q * vec2( 1.0, 0.72 ) ) - vec2( 0.5 ) );
    v = 0.5 + 0.5 * sin( d * 18.0 + sin( q.y * 0.25 ) * 2.0 );
  } else if ( family < 18.5 ) {                              // 19 blood veins
    float vein = abs( sin( q.x * 0.23 + sin( q.y * 0.13 ) * 2.8 ) );
    v = 1.0 - smoothstep( 0.08, 0.26, vein );
  } else if ( family < 19.5 ) {                              // 20 halo rings
    float a = atan( q.y, q.x );
    v = 0.5 + 0.5 * sin( radius * 1.3 + sin( a * 3.0 + time * 0.25 ) * 0.45 );
  } else if ( family < 20.5 ) {                              // 21 ice facets
    vec2 g = abs( fract( q * 0.42 ) - 0.5 );
    v = smoothstep( 0.04, 0.46, abs( g.x - g.y ) );
  } else if ( family < 21.5 ) {                              // 22 lightning spine
    float bolt = abs( fract( q.x * 0.22 + sin( q.y * 0.24 + phase * 6.2831853 ) * 0.28 ) - 0.5 );
    v = 1.0 - smoothstep( 0.025, 0.12, bolt );
  } else if ( family < 22.5 ) {                              // 23 dark erosion
    float pits = k3dCardHash( floor( q * 0.7 ) + vec2( rank * 3.0 ) );
    v = smoothstep( 0.22, 0.78, pits + wave * 0.22 );
  } else if ( family < 23.5 ) {                              // 24 void orbit
    float a = atan( q.y, q.x );
    float orbit = abs( sin( radius * 1.1 + a * 3.5 ) );
    v = max( step( 0.93, n ) * ( 0.5 + 0.5 * sin( time * 1.8 + n * 6.2831853 ) ),
             1.0 - smoothstep( 0.035, 0.11, orbit ) * 0.62 );
  } else {                                                   // 25 dragon scales
    vec2 cell = fract( q * vec2( 0.65, 0.48 ) + vec2( 0.0, floor( q.x * 0.65 ) * 0.5 ) );
    float arc = abs(length(cell - vec2(0.5, 0.28)) - 0.34);
    v = 1.0 - smoothstep( 0.04, 0.13, arc + max(0.0, cell.y - 0.62) * 0.4 );
  }
  return clamp( v, 0.0, 1.0 );
}

/* 槽级取纹样：该槽已烘焙 → 采样图集（3×3 格）；否则走原程序化链。
   ★ 2026-10-17（加载速度·烘焙全量化）：把「哪些族走贴图」从"整个材质一个"升级为**逐槽**，
   这样 S1..S9 九个槽各自都能烘焙——否则只有第一个槽受益，其余族的代码仍会进源码。 */
float k3dSlotMotif( float stage, vec2 p, float style, float scale, float phase, float time ) {
  int si = int( clamp( stage - 1.0, 0.0, 8.0 ) );
  /* ① 动画族：12 帧条带 + 相邻两帧线性插值（避免看到 12 档步进） */
  vec4 am = uAnimMeta[si];
  if ( am.x > 0.5 ) {
    const float FRAMES = 12.0;
    float period = max( 0.2, am.z );
    float ph = fract( uEffectTime / period ) * FRAMES;
    float f0 = floor( ph );
    float w = ph - f0;
    float f1 = mod( f0 + 1.0, FRAMES );
    float rr = 1.0 / max( 1.0, am.w );
    float fr = 1.0 / FRAMES;
    vec2 pp = clamp( ( p - vec2( -0.3 ) ) / 1.6, 0.0, 1.0 );
    /* 半像素内缩（横向 12*128 = 1536；纵向按行高 rr 折算） */
    vec2 inset = vec2( 0.5 / 1536.0, rr * 0.5 / 128.0 );
    vec2 inner = vec2( fr, rr ) - 2.0 * inset;
    vec2 uv0 = vec2( f0 * fr, am.y * rr ) + inset + pp * inner;
    vec2 uv1 = vec2( f1 * fr, am.y * rr ) + inset + pp * inner;
    float v0 = texture2D( uAnimAtlas, uv0 ).r;
    float v1 = texture2D( uAnimAtlas, uv1 ).r;
    return clamp( mix( v0, v1, w ), 0.0, 1.0 );
  }
  /* ② 静态族：3×3 图集 */
  vec4 m = uBakedMeta[si];
  if ( m.x > 0.5 ) {
    float tile = m.y;
    vec2 off = vec2( mod( tile, 3.0 ), floor( tile / 3.0 ) ) * ( 1.0 / 3.0 );
    /* 半像素内缩：图集里相邻格之间走双线性，不内缩会串到隔壁格。
       图集 = 3 格 × 256 = 768 像素/边 → **半像素 = 1/1536**。 */
    float inset = 1.0 / 1536.0;   // 图集 3×256 = 768 像素/边 → 半像素 = 1/1536（TILE 见 bakedMotif.js）
    /* 图集每格覆盖 p ∈ [-0.3, 1.3]（外扩 30%，见 bakedMotif.js 的 PMIN/PMAX 注释）：
       刀身局部坐标会溢出 0..1，只按 0..1 采样再 clamp 会在刀尖/边缘失真。 */
    vec2 pp = clamp( ( p - vec2( -0.3 ) ) / 1.6, 0.0, 1.0 );
    vec2 uv = off + vec2( inset, inset ) + pp * ( 1.0 / 3.0 - 2.0 * inset );
    return clamp( texture2D( uBakedAtlas, uv ).r, 0.0, 1.0 );
  }
  return k3dCardMotif( p, style, scale, phase, time );
}

// S9 uses scattered, finite scuffs, not a periodic stripe across the blade.
// Share the support with the physical roughness pass; no off-scuff recolouring.
float k3dS9Abrasion( vec2 p, float style, float phase ) {
  vec2 q = p * vec2( 7.0 + mod( style, 5.0 ) * 0.43, 13.0 + mod( style, 7.0 ) )
             + vec2( phase * 17.0, style * 0.37 );
  vec2 cell = floor( q );
  float id = k3dCardHash( cell + vec2( style * 3.1, phase * 29.0 ) );
  vec2 center = vec2( 0.30 + id * 0.40,
                      0.28 + k3dCardHash( cell + vec2( 19.7, style ) ) * 0.44 );
  vec2 d = fract( q ) - center;
  float slant = ( k3dCardHash( cell + vec2( phase, 41.3 ) ) - 0.5 ) * 0.64;
  float crossStroke = abs( d.y + d.x * slant + sin( d.x * 11.0 + id * 6.28 ) * 0.018 );
  float width = 0.028 + id * 0.035;
  float stroke = 1.0 - smoothstep( width * 0.30, width, crossStroke );
  float ends = 1.0 - smoothstep( 0.10 + id * 0.08, 0.23 + id * 0.14, abs( d.x ) );
  return stroke * ends * smoothstep( 0.40, 0.66, id );
}

/**
 * 把一个阶段的卡牌视觉指纹应用到刀身。
 *
 * @param stage      1-based 阶段号（S1=1 … S9=9）。⚠ 不是 0-based 的 stageIdx。
 * @param bladeEdge  真实刃口掩码 0..1（vBladeEdge，来自 aBladeEdge 顶点属性）。
 *                   S5 淬火带 / S7 刃线都用它定位刃线；此前用 min(p.y,1-p.y) 猜，
 *                   而 p.y 是**次长轴 = 刀身厚度方向**，刃线命中率实测 0%~28%（4 把刀为 0）。
 * @param mask       [out] 本阶段效果的**覆盖率** 0..1，供上层统计/验收用（离线取样域靠它）。
 *                   ⚠ 曾经只写了 mask = band; 却没把它加进出参列表 →
 *                   GLSL 报 'mask' : undeclared identifier + 'assign' : l-value required
 *                   (can't modify a const)，碎片着色器编译失败 → **整个 3D 舞台空白**。
 *                   加出参时务必同步 8 处调用点（bladeSkinShader.js）与 tools/geomviz.js 端口。
 * @param edgeTint   刃线色（= uEdgeColor，即 S7 卡自己的 variants.edge.tintHex）。
 *                   ★ 2026-10-08 新增。**只有 S7 分支读它**，其它阶段忽略，所以对 S1–S6/S9
 *                   逐位无影响。加它是因为 S7 此前有**两条互不相干的色源**：
 *                     ① k3dApplyEdgeGlow 用 uEdgeColor（卡的 tintHex）做"着色 + 自发光"；
 *                     ② 本函数的 S7 分支用 accent（由 fx.w 色相栅格派生的 25 槽色环）。
 *                   同一条刃线上同时叠了两个色相，两条阶梯互不对齐 → 同一张卡
 *                   的"刃线到底什么颜色"无法自洽，逐卡可辨也依赖于一套玩家看不见的颜色。
 *                   现在 S7 分支的 accent 也走 edgeTint，刃线回到**单一色源**。
 */
void k3dApplyStageCardFx( float stage, vec4 fx, vec2 p, float edge, float bladeEdge,
                          float fresnel, float time, inout vec3 color, inout float rough,
                          inout float glow, vec3 edgeTint, out float mask ) {
  mask = 1.0;                       // 默认"全覆盖"，各阶段按需收窄（S5/S7 会覆写成窄带）
  if ( fx.y <= 0.001 ) return;
  float style = floor( fx.x );
  float tier = clamp( ( fx.x - style ) * 10.0, 0.0, 5.0 );
  float strength = clamp( fx.y, 0.0, 0.52 );
  float pat = k3dSlotMotif( stage, p, style, fx.z, fx.w, time );
  vec3 accent = vec3(
    clamp( abs( mod( fx.w * 6.0 + 0.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
    clamp( abs( mod( fx.w * 6.0 + 4.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
    clamp( abs( mod( fx.w * 6.0 + 2.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 )
  );
  /* accent2：hue 偏 30% 的**互补色**。
   * 为什么需要它：只用单一 accent 做"变色带"时，+offset 与 −offset 处的色调相同，
   * 整把刀的**空间平均色**被钉死在材质底色附近 —— 于是"两张卡"的差异只剩 ±offset 之差，
   * 逐像素平均后互相抵消（离线实测 S6 的 276 对平均 meanΔ 只有 4.7、最小 0.94）。
   * 用 accent2 让带的两侧分别是"暖侧/冷侧"，同一张卡内的平均也随之离开底色，
   * 不同 hue 的卡就真正落在不同的平均色上。*/
  vec3 accent2 = vec3(
    clamp( abs( mod( fx.w * 6.0 + 1.8, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
    clamp( abs( mod( fx.w * 6.0 + 5.8, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
    clamp( abs( mod( fx.w * 6.0 + 3.8, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 )
  );
  if ( stage < 1.5 ) {
    // S1: preserve the selected alloy color; distinguish it with directional grain and polish.
    float grain = 0.5 + 0.5 * sin( p.x * ( 34.0 + style ) + ( pat - 0.5 ) * 5.0 );
    color *= 1.0 + ( grain - 0.5 ) * strength * 0.72;
    rough = clamp( rough + ( pat - 0.5 ) * strength * 0.42, 0.02, 1.0 );
  } else if ( stage < 2.5 ) {
    // S2 is a clean molten alloy, not a forging-pattern layer.
    // A broad thermal sheen retains card identity without oxide/etching motifs.
    float warmth = 0.5 + 0.5 * sin( p.x * 1.8 + p.y * 0.7 + fx.w * 6.2831853 );
    color *= 0.98 + warmth * strength * 0.10;
    color = mix( color, color * vec3(1.09, 0.99, 0.90), warmth * strength * 0.22 );
    return;
  } else if ( stage < 3.5 ) {
    // S3: hammer facets, impact dimples and directional ridges; deliberately strongest process layer.
    float facet = smoothstep( 0.38, 0.78, pat );
    float impact = 1.0 - smoothstep( 0.12, 0.42, abs( fract( p.x * ( 8.0 + style ) ) - 0.5 )
      + abs( fract( p.y * ( 5.0 + style * 0.35 ) ) - 0.5 ) );
    float forge = clamp( facet * 0.68 + impact * 0.52, 0.0, 1.0 );
    color = mix( color * 0.78, color * 1.18 + accent * 0.12, forge * strength * 1.35 );
    // 锤痕方向脊：斜向的明暗条纹（**只调亮度、不引入 accent 色**），
    // 让"锻打"在移动端小尺寸下也能一眼看出 —— 纯 facet 是低频大色块，缩到手机上会糊掉。
    float ridge = 0.5 + 0.5 * sin( ( p.x * 0.72 + p.y * 0.38 ) * ( 26.0 + style * 1.6 ) + pat * 3.0 );
    color *= 1.0 + ( ridge - 0.5 ) * strength * 0.46;
    rough = clamp( rough + ( impact - 0.28 ) * strength * 0.92, 0.02, 1.0 );
  } else if ( stage < 4.5 ) {
    // S4: silhouette-safe engraved geometry accents; actual knife mesh remains the primary shape.
    float line = 1.0 - smoothstep( 0.025, 0.095, abs( fract( ( p.y + p.x * ( 0.18 + fx.w ) ) * ( 8.0 + style * 0.6 ) ) - 0.5 ) );
    float inset = smoothstep( 0.12, 0.38, pat );
    color = mix( color, color * 0.58 + accent * 0.52, line * strength * ( 0.45 + tier * 0.09 ) );
    rough = clamp( rough + line * ( inset - 0.5 ) * strength * 0.4, 0.02, 1.0 );
  } else if ( stage < 5.5 ) {
    // S5: the cross-section coordinate locates the cutting side; curvature (edge)
    // is not a blade-edge mask and produced spots over the face on some models.
    // ★ 2026-10-07 重写：原实现用 min( p.y, 1.0 - p.y )（次长轴两端）当刃口 ——
    //   p.y 实际是**刀身厚度方向**（模型次长轴，跨度仅长轴的 14%~17%），
    //   等价于"跨过刀身厚度打一条竖带"，与刃线无关。tools/measure_edge.js 实测刃口
    //   召回率 0%~28%（balisong/gladius/straight/tangdao 全为 0）。
    //   现在改用真实刃口掩码 bladeEdge（顶点属性：薄 + 凸 + 靠刀尖）。
    float tipFade = 1.0 - smoothstep( 0.90, 1.0, p.x );
    float edgeBand = clamp( bladeEdge * tipFade, 0.0, 1.0 );
    /* ★ 2026-10-13（S5 逐卡可辨，用户口径「很多决策卡的3d效果都差不多，得稍微调整得有
     *   差异一点，特别是高级的」）：
     *   旧实现**只有** bladeEdge 这一条窄带 → 同工艺不同参数的卡（F04×3 / F08×4 / F11×3）
     *   在整刀上只差"整体更黑一点 / 更哑一点"，两两分不开；
     *   高级档里 F06×2（S5_16 史诗 / S5_18 史诗）、F04×2（S5_17 史诗 / S5_22 传说）、
     *   F08×2（S5_19 史诗 / S5_23 神话）三组尤其明显。
     *   现在叠一条**沿刀身中段展开的热带**（沿长轴推进、刻意避开刀尖与根部，
     *   不让它糊到刀面中线上 —— 那正是 2026-10-07 修掉的"长在刀面中部"的坑）。
     *   再由卡自己的专属纹样 pat 调制，于是每张卡唯一的 motif + 色相栅格才真正读得出来。 */
    float span = smoothstep( 0.05, 0.26, p.x ) * ( 1.0 - smoothstep( 0.82, 0.97, p.x ) );
    /* ★ 2026-10-13 第二版：让中段热带的**覆盖率随稀有度递进**。
     *   低档 0.22（与旧值 0.24 基本持平，不动"整体可以"的基准线），
     *   高档 0.34 → 史诗/传说/神话的色区明显更铺得开，
     *   补上「特别是高级的」这条要求（幅度上限 0.48 不变，避免退回整刀刷色）。 */
    float spanW = mix( 0.22, 0.34, clamp( tier / 5.0, 0.0, 1.0 ) );
    float band = clamp( edgeBand * 0.94 + span * spanW * ( 0.25 + 0.75 * pat ), 0.0, 1.0 );
    float heat = clamp( band * ( 0.60 + 0.40 * pat ), 0.0, 1.0 );
    /* ★ 稀有度连续加成：cardVisuals 的 STAGE_STRENGTH × RARITY_STRENGTH 相乘后
     *   （S5 ≈ 0.97~1.10）会被下面 fx.y 的 clamp(…, 0.52) 全部顶死 ——
     *   也就是说"强度"这个轴对本阶段的**每一张卡都相同**，稀有度只剩 tier 阶梯
     *   （tier≥1/2/3/4/5 的附加维度）在起作用。
     *   这里补一条连续项：普通 0.82× → 神话 1.26×，让「越高级越强」真正读得出来。 */
    float rr = mix( 0.82, 1.26, clamp( tier / 5.0, 0.0, 1.0 ) );
    /* ★★ 2026-10-13 第一版实测修正：mix 上限 1.20 → 0.48。
     *   第一版把上限提到 1.35*rr（≈0.55~0.70），叠加加宽后的 band（覆盖大半刀面）
     *   → 每一张 S5 卡都被刷成一整块饱和色（实测渲出来 10/12 张是"整刀红"），
     *   完全违背「S5 整体可以、只是差异太小」的原始口径。
     *   现在：覆盖率仍随稀有度递进，但**混合强度收敛回 0.48**，
     *   卡的身份主要靠 edgeBand（窄带、强）承担，刃面只吃一层克制的倾向色。 */
    color = mix( color, color * 0.64 + accent * 0.60, clamp( heat * strength * 1.05 * rr, 0.0, 0.48 ) );
    rough = clamp( rough + heat * strength * 0.20, 0.02, 1.0 );
    mask = band;
  } else if ( stage < 6.5 ) {
    // S6: temper colour — 沿刀身推进的回火色带 + 卡专属纹样调制。
    // ★ 2026-10-07 重写：原实现是 mix( color, color*(0.94+pat*0.12) + accent*0.10, strength*0.34 )，
    //   在 S6 的 strength（STAGE_STRENGTH[5]=0.36）下混合因子只有 ~0.02，
    //   逐像素偏移 ≈0.0004 —— 离线实测 24 张 S6 卡的最小 meanΔ = 0.20/441，
    //   等于玩家完全看不出这一阶段选了什么（tools/diff_cards.js --stage 6）。
    //   回火在真刀上本来就是**大面积渐变变色**，所以这里改成"沿长轴的色带 + 纹样"：
    //   两条低频带（周期/相位吃 style 与 hue，所以每张卡不同）+ accent 上色。
    //   ⚠ 系数必须放大：S6 卡的实测 strength（shaderParams.y）只有 0.072~0.11
    //     （成长起点档 rarityTier 0/1），乘 0.62 只有 0.05 的混合因子 = 看不见。
    //     这里用 2.60 / 1.35，把混合因子推到 ~0.12~0.28，同时材质底色仍占 70% 以上。
    // ⚠⚠ 这一段注释里**绝对不能出现反引号**：本函数的 GLSL 整体在 JS 模板字符串里，
    //   注释中的一个反引号就会提前结束模板 → 浏览器 SyntaxError → 整个文件不执行 →
    //   白屏 / "启动失败：K3D.bladeViewer is not a constructor"。
    //   守卫：node tools/check_syntax.js（真的用 vm.Script 解析一遍，不是数反引号）。
    float band1 = sin( p.x * ( 6.0 + style * 0.55 ) + p.y * ( 2.2 + fx.w * 3.4 )
                       + fx.w * 6.2831853 + pat * 1.35 );
    float band2 = sin( p.x * ( 15.0 + style * 0.9 ) - p.y * ( 5.0 + fx.w * 2.0 )
                       - time * 0.11 + pat * 2.2 );
    float temper = 0.5 + 0.5 * band1;
    float grain = 0.5 + 0.5 * band2;
    //   ⚠ 关键教训：最初用 temper = 0.5+0.5*sin(...) 这类**对称振荡带**做主色，
    //     它的空间均值恒等于 0.5（相位只平移波形，不改变整周期均值），
    //     于是"整把刀的平均色"被钉死在材质底色上 —— 不同 hue 的卡平均色几乎相同，
    //     离线实测 276 对平均 meanΔ 只有 4.7、最小 0.94（= 看不出区别）。
    //     改用 **pat（卡专属纹样）** 驱动：实测 25 个 motif 的空间均值分布 0.03~0.85，
    //     每张卡的 DC 分量天然不同 → 平均色真正被卡的身份决定。
    //     temper 带保留，只负责"沿长轴的渐变观感"，不再主导颜色。
    float dc = clamp( pat * 0.5 + temper * 0.5, 0.0, 1.0 );
    vec3 glaze = mix( accent, accent2, 0.5 + 0.5 * ( 2.0 * dc - 1.0 ) );
    //   ③ 逐卡明度/饱和档位 —— **与色相正交的第二个身份维度**。
    //     实测教训：hue = fract((rank-1)*0.618 + s*0.1375) 会让某些相邻 rank 撞到很近的色相
    //     （S6_02 hue 0.306 vs S6_15 hue 0.340，只差 0.034 = 色环的 3.4%）。
    //     这种卡对**无论把配色系数放大多少倍都分不开**（放大只会一起变浓）：
    //     离线实测把系数从 0.42 加到 0.95，该对 meanΔ 只从 0.94 动到 1.9，仍在阈值下。
    //     所以必须加一个不吃色相的档位：用 rank 做低频明度/饱和度差，
    //     相邻 rank 之间至少差几 %，肉眼是"同一色系、深浅不同"的两把刀 —— 这正是回火的本意。
    //     ⚠ 不要从 hue 反推档位。踩过两次：
    //       ① dy = sin(style*2.39996)：style=2 与 style=15 都落在 sin≈−1（采样撞车）。
    //       ② dy = fx.w - floor(fx.w) - 0.5 与 dy = fract(fx.w*3.7+0.25)：fx.w 就是 hue，
    //          而 hue 是"每张卡一个槽位"的均匀栅格（间隔 1/25），于是这两个式子的结果
    //          随 rank **线性**推进：相邻 rank 的 dy 只差 0.036，撞在同一档；
    //          更糟的是它与色相变化完全同步，色相接近的两张卡档位必然也接近 = 白加。
    //     现在直接用卡自己的视觉序号（fx.x 的整数部分 = visualRank）经黄金角散开，
    //     它是低差异序列、与色相无关，保证相邻 rank 落到互不相邻的档位。
    float vrank = floor( fx.x );
    float dy = fract( vrank * 0.61803398875 );
    float tint = 1.0 + ( dy - 0.5 ) * strength * 0.34;
    /* ★★ 2026-10-13（用户口径重做）：上面这三行「整刀刷 accent / glaze 色」正是
     *   「S6 几乎所有卡都直接改变了刀身颜色」的来源 —— 它把回火做成了**换颜色**。
     *   现在的分工：
     *     · 颜色话语权 → finishes.js 的 k3dApplyTemper()（薄膜干涉彩虹金属光泽，
     *       逐卡色系族 + 视角相关，越高级越强）
     *     · 本函数只保留**结构与明暗**：沿长轴的低频回火带 + 卡专属纹样的明暗调制
     *     · 色相倾向从 0.95 收到 0.16 —— 只留一点"这把刀偏暖/偏冷"的倾向
     *   逐卡明度档位 tint 保留（它是与色相正交的第二个身份维度，见上方注释教训）。 */
    color *= 0.90 + temper * ( 0.10 + 0.22 * dc ) * strength;
    color = mix( color, color * ( 0.88 + 0.20 * grain ), pat * strength * 0.45 );
    color = mix( color, color * 0.80 + glaze * 0.62, dc * strength * 0.16 );
    //   ⚠ 逐卡明度档位必须放在**最后**。放在前面时，后面 *= 0.93 + temper*0.16
    //     这类"围绕 1.0 抖动的乘性项"会在求平均时把它抵消掉：
    //     离线实测放在前面时，两张卡的平均色差只剩 0.94/441，等于没加。
    //     放到最后 → 它是纯 DC 增益，不被后续乘法稀释，才真正改变"整把刀的深浅"。
    color *= tint;
    rough = clamp( rough + ( grain - 0.5 ) * strength * 0.45, 0.02, 1.0 );
  } else if ( stage < 7.5 ) {
    // S7: animate the line along the normalized blade boundary, then modulate by view angle.
    // ★ 2026-10-07 重写：原实现同样用 min( p.y, 1.0 - p.y ) 定位刃线（见 S5 注释），
    //   辉光因此长在刀面中部而不是刃口上。现在：
    //     · 位置 = 真实刃口掩码 bladeEdge
    //     · 走向 = 沿长轴（p.x）推进的扫掠，看起来才是"沿刀刃跑的一道光"
    float edgeLine = clamp( bladeEdge * ( 1.0 - smoothstep( 0.95, 1.0, p.x ) ), 0.0, 1.0 );
    /* ★ 2026-10-13（S7 小幅调整，用户口径「稍微改一下就行了，不是主要视觉效果」）：
     *   只动两点，不碰结构：
     *     ① Fresnel 带宽随稀有度放宽（系数 1.35 → 1.35 + 0.10*tier，指数 0.72 → 0.60）
     *        → 高档卡的刃线在正常观察角度下更宽；tier 0 时两个数都是原值，低档逐像素不变。
     *     ② 着色上限与自发光系数的档位跨度拉开（0.32 → 0.40 / 0.22 → 0.32 档位系数），
     *        配合 bladeSkinShader 里 glow 上限 0.24 → 0.30，高档开刃卡不再在最后一步被摊平。 */
    float tierW = clamp( tier / 5.0, 0.0, 1.0 );
    edgeLine *= mix(0.24 + 0.10 * tierW, 1.0, pow( clamp( fresnel * ( 1.35 + 0.10 * tier ), 0.0, 1.0 ), mix( 0.72, 0.60, tierW ) ));
    float sweep = 0.55 + 0.45 * sin( p.x * ( 15.0 + style ) - time * ( 1.5 + style * 0.12 ) + fx.w * 6.2831853 );
    float pulse = edgeLine * sweep * strength;
    // ★ 2026-10-08：这里原来是 accent（fx.w 色相栅格），与下方 k3dApplyEdgeGlow 用的
    //   uEdgeColor（卡自己的 tintHex）是**两条互不相干的色源**。现在统一成 edgeTint，
    //   刃线的着色与自发光由同一个颜色驱动 —— "你看到的刃线颜色"就是卡上写的那一个。
    color = mix( color, color * 0.52 + edgeTint * 0.82, clamp( pulse * 1.35, 0.0, mix( 0.32, 0.40, tierW ) ) );
    glow += pulse * ( 0.22 + tier * 0.025 ) * ( 0.90 + 0.22 * tierW );
    mask = edgeLine;
  } else if ( stage < 9.5 ) {
    // S9: local low-chroma scuffs. Protect the S7 edge and earlier heat treatment.
    float scratch = k3dS9Abrasion( p, style, fx.w )
                    * ( 1.0 - smoothstep( 0.18, 0.70, bladeEdge ) );
    // Also constrain the shared rarity details below, including etched/star tiers.
    accent = mix( vec3( 0.56, 0.58, 0.60 ), accent, 0.045 );
    float rim = pow( clamp( fresnel, 0.0, 1.0 ), 1.2 );
    float sweep = 0.5 + 0.5 * sin( p.x * ( 9.0 + style * 0.31 )
                                  - time * ( 0.65 + style * 0.035 ) + fx.w * 6.2831853 );
    float glint = pow( sweep, 7.0 ) * rim * scratch;
    color = mix( color, color * 0.92 + accent * 0.10, scratch * strength * 0.38 );
    color = mix( color, color * 1.08 + accent * 0.08, glint * strength * ( 0.18 + tier * 0.025 ) );
    glow += glint * strength * 0.018;
    rough = clamp( rough + scratch * strength * 0.20, 0.02, 1.0 );
    mask = scratch;
  }
  // Rarity adds dimensions, not just brightness: fine grain, secondary pattern,
  // view-rim, etched lattice, then sparse star points. All remain local and capped.
  float micro = 0.5 + 0.5 * sin( p.x * ( 40.0 + style * 2.0 ) + p.y * 7.0 );
  color = mix( color, color * ( 0.90 + micro * 0.18 ), step( 1.0, tier ) * strength * 0.28 * mask );
  float secondary = 0.5 + 0.5 * sin( ( p.x * 9.0 + p.y * 13.0 + fx.w * 5.0 ) * 6.2831853 );
  color = mix( color, color * 0.76 + accent * 0.42, step( 2.0, tier ) * smoothstep( 0.78, 0.98, secondary ) * strength * 0.26 * mask );
  float viewRim = pow( clamp( fresnel, 0.0, 1.0 ), 1.15 );
  color = mix( color, color * 0.82 + accent * 0.38, step( 3.0, tier ) * viewRim * strength * 0.30 * mask );
  float etch = 1.0 - smoothstep( 0.025, 0.10, abs( fract( ( p.x + p.y ) * ( 7.0 + style * 0.2 ) ) - 0.5 ) );
  color = mix( color, color * 0.52 + accent * 0.54, step( 4.0, tier ) * etch * strength * 0.30 * mask );
  float stars = step( 0.94, k3dCardHash( floor( p * ( 36.0 + style ) ) + vec2( fx.w * 91.0 ) ) );
  color += accent * stars * step( 5.0, tier ) * strength * 0.12 * mask;
}

float k3dApplyCardRoughness( float stage, vec4 fx, vec2 p, float baseRough ) {
  if ( fx.y <= 0.001 || (stage > 1.5 && stage < 2.5) ) return baseRough;
  float style = floor( fx.x );
  float tier = clamp( ( fx.x - style ) * 10.0, 0.0, 5.0 );
  float strength = clamp( fx.y, 0.0, 0.52 );
  float pat = k3dSlotMotif( stage, p, style, fx.z, fx.w, 0.0 );
  float amount = 0.0;
  if ( stage < 1.5 ) amount = ( pat - 0.5 ) * strength * 0.34;
  else if ( stage < 2.5 ) amount = ( smoothstep( 0.55, 0.92, pat ) - 0.25 ) * strength * 0.46;
  else if ( stage < 3.5 ) amount = ( pat - 0.38 ) * strength * 0.72;
  else if ( stage < 5.5 ) amount = ( pat - 0.5 ) * strength * 0.30;
  else if ( stage > 8.5 ) amount = k3dS9Abrasion( p, style, fx.w ) * strength * ( 0.16 + tier * 0.012 );
  return clamp( baseRough + amount, 0.02, 1.0 );
}
`;
  K3D.shaderCardEffects = { functions };

export const shaderCardEffects = __reg.proxy.shaderCardEffects;
