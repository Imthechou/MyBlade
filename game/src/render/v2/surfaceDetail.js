/**
 * 刀身表面细节层（v2 缺失的那一层）
 *
 * ── 为什么需要这个文件 ──────────────────────────────────────────
 *
 * hook 系统一直有 `normalFragment` 注入点（material.js 注入到
 * `#include <normal_fragment_maps>` 之后），柄部（bladeViewer.js）也一直在用，
 * 但 **v2 刀身从未写过它** —— 于是刀面只有解析法线，
 * 无论给多少颜色/粗糙度，表面都是「平的」，这正是「像贴纸而不是金属」的根因。
 *
 * 这一层做两件事（全部走**已有**的 GPU 数据，不新增任何纹理资产）：
 *   ① 用纹样场（烘焙图集 / S3 图像）的**屏幕空间导数**推真实法线扰动
 *      —— 与柄部同一套 dFdx/dFdy 做法，数学上等价于一张高度图的 bump；
 *   ② 叠加**方向性微结构**（拉丝/磨削）作为各向异性的几何基础：
 *      高频沿刀轴的正弦脊，让高光被拉成一条而不是一个点。
 *
 * ⚠ 性能纪律：本层只用已在管线里的 k3dPat[] 与 1 次 sin，
 *   **不引入 fbm、不引入新纹理采样**（v2 的编译预算已被实测校准过）。
 *
 * ⚠ 作用域纪律：注入点在 `#include <normal_fragment_maps>` 之后，
 *   那里**看不到** MAP_FRAGMENT 里的局部变量（如 k3dFres）。
 *   所以 fresnel 必须在这里用 vNormal / vViewPosition 就地算一次。
 */

/**
 * 生成 normalFragment 注入体。
 * 静态字符串（不随卡变化），因此在模块加载时算一次即可。
 */
export function buildNormalFragment() {
  return `
{
  float wB, wG, wH;
  k3dRegionW( wB, wG, wH );
  float wS = k3dSkinW( wB, wG, wH );
  if ( wS > 0.002 && uV2Surf.x > 0.0005 ) {
    /* fresnel：这个注入点拿不到 mapFragment 的局部 k3dFres，就地算一次。
       与 MAP_FRAGMENT 同一公式（1 - |N·V|），保证两层判断一致。 */
    float nFres = 0.35;
    #ifndef FLAT_SHADED
      nFres = 1.0 - clamp( abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
    #endif

    /* ── ① 高度场：纹样亮度 + 方向性微脊 ──
       纹样来自烘焙图集 / S3 图（已在 mapFragment 算好），这里直接复用 k3dPat[]，
       所以凹凸与颜色**天然对齐** —— 亮的地方就是凸起的地方。
       只累加"本局已到达"的槽（step(fx.y) 判断），于是表面结构**随阶段累积**。 */
    float hMain = 0.0;
    float slotCount = 0.0;
    hMain += k3dPat[0] * step( 0.001, uCardFx[0].y ); slotCount += step( 0.001, uCardFx[0].y );
    hMain += k3dPat[1] * step( 0.001, uCardFx[1].y ); slotCount += step( 0.001, uCardFx[1].y );
    hMain += k3dPat[2] * step( 0.001, uCardFx[2].y ); slotCount += step( 0.001, uCardFx[2].y );
    hMain += k3dPat[3] * step( 0.001, uCardFx[3].y ); slotCount += step( 0.001, uCardFx[3].y );
    // S5 is optical treatment; S3 continues to own forged height/normal.
    hMain += k3dPat[5] * step( 0.001, uCardFx[5].y ); slotCount += step( 0.001, uCardFx[5].y );
    hMain += k3dPat[6] * step( 0.001, uCardFx[6].y ); slotCount += step( 0.001, uCardFx[6].y );
    hMain += k3dPat[8] * step( 0.001, uCardFx[8].y ); slotCount += step( 0.001, uCardFx[8].y );
    /* 归一：除以参与槽数，避免后期阶段因为槽多而变成一团噪点 */
    hMain = ( slotCount > 0.5001 ) ? hMain / slotCount : 0.5;
    /* Keep S3 forged relief visible after other stages are added.
       Previously an unweighted average of S1..S9 motifs diluted the
       actual selected S3 texture in the physical normal field. The
       already-sampled S3 height is reused; no extra texture fetch. */
    if ( uS3On > 0.5 ) {
      /* Formed unquenched steel may show stronger forge relief; after S5
         heat treatment, retain only a subtle imprinted normal. Keep
         both weights below the old 2026-10-24 gritty-fabric threshold. */
      float quenched = step( 0.001, uCardFx[4].y );
      float patternWeight = mix( 0.16, 0.26, step( uV2Preserve, 0.5 ) )
                          * mix( 1.0, 0.34, quenched );
      /* The selected S3 height currently shares its normal with seven
         unrelated card motifs, hiding the forged relief in flat reflections.
         Strengthen its weight before quenching; the existing relief clamp,
         fwidth antialias and bevel mask still prevent gritty fabric. */
      hMain = mix( hMain, clamp( k3dPatX, 0.0, 1.0 ), patternWeight );
    }

    /* 方向性微脊（各向异性）。

       ★★ 2026-10-24 隔离测试定位的真凶（格纹/布纹的来源）：

         原式是**两条互相垂直的正弦**：
           hRidge  = sin( vBladeLocal.x * freq )
           hRidge2 = sin( vBladeLocal.y * freq * 0.35 + 1.7 )
         两列垂直波叠加 → 高度场成网格 → 梯度算出 x/y 两个方向交替的亮暗
         → 视觉上就是**格子布**。实测隔离：全关贴图/纹样/法线后，
         周期峰仍有 0.0384（基线 0.0447，只降 14%），说明格纹就是这层自己产的。

         另一个错误是频率量级：vBladeLocal.x 只有 0..0.35，
         乘 46 后仅约 2.5 个周期 —— 这是“大条纹”，不是拉丝。

         修法（真实拉丝的正确做法）：
           ① **只留一个方向**：沿刀轴的丝路，高度在**横向**（y）变化；
           ② 频率拉到 400+：横向 0.35 范围内约 140 个周期 → 真正的细丝；
           ③ 幅度降到 0.18：细丝应当“在高光里闪”，不是“看得见的条纹”；
           ④ 叠一次低频扰动，让丝路不完全均匀（避免机器感）。 */
    float ridgeFreq = 380.0 + 520.0 * clamp( uV2Surf.z, 0.0, 1.0 );

    /* ═══ 2026-10-26：抗锯齿（修复「S1 奇怪波纹」的真因）══════════

       用户线索（决定性）：「放大波纹还会跟着变细」。
       模型空间贴图的纹理会随放大**变粗**；只有屏幕空间欠采样才会让它
       看起来变细、且密度不随缩放改变 —— 这是摩尔纹。

       变焦实验（_s1zoom.mjs，同一相机只改距离 ×0.5）：
         baseline-z1  modelPx 276x263  细密条纹
         baseline-z2  modelPx 583x552  条纹密度几乎没变  ← 摩尔纹特征
         noaniso-z2   关掉微脊          条纹**完全消失**，露出干净石头

       定量：vBladeLocal.y 跨度约 0.6，ridgeFreq = 380+520*0.948 ≈ 873
             → 约 84 个周期；模型只在画布上占 200~280 px
             → 每周期约 2~3 px，低于 Nyquist 下限 → 必然混叠

       修法（标准解析抗锯齿）：用 fwidth() 算出这个量在当前像素上的变化量，
       当它超过半个周期就把这一层**淡出到平均值 0.5**。
       物理含义正确：像素分辨不出的高频细节应当平滑成均值，
       而不是随机采样出一个假的斑纹。

       这样才能同时保留两个好处：
         · 靠近看：纹路正常存在（fw 小 → aa≈1）
         · 拉远看：平滑淡出，不出摩尔纹
       而不是像之前那样要么砍掉整层、要么硬吃混叠。 */
    float ridgeArg = vBladeLocal.y * ridgeFreq;
    float ridgeAA = 1.0 - smoothstep( 0.35, 1.20, fwidth( ridgeArg ) );
    /* 高度沿横向 y 变化 → 脊线沿刀轴 x 延伸 → 高光垂直方向被拉长 */
    float hRidge = mix( 0.5, sin( ridgeArg ) * 0.5 + 0.5, ridgeAA );
    /* 低频扰动：频率是主脊的 11%（约 96）→ 约 9 个周期，本身不易混叠，
       但为了与主脊行为一致，仍按同一条 aa 淡出（避免拉远时出现低频纹）。 */
    float hRidgeJitter = mix(
      0.5,
      sin( vBladeLocal.y * ( ridgeFreq * 0.11 ) + vBladeLocal.x * 7.3 ) * 0.5 + 0.5,
      ridgeAA
    );

    /* 合成高度：主纹样 + 单方向细丝（细丝最多占 22%，不盖掉锻打花纹）*/
    float anisoW = clamp( uV2Surf.y, 0.0, 1.0 );
    float ridgeMix = hRidge * 0.82 + hRidgeJitter * 0.18;
    float h = mix( hMain, hMain * 0.78 + ridgeMix * 0.22, anisoW );

    /* ═══ ③ P2：真实贴图层（运行时生成的可平铺高度图）══════════

       P1 的凹凸来自纯数学（sin + k3dPat），有两个固有上限：
         ① 频率单一 → 看起来像「规则波纹」而不是「真实表面」
         ② 细节粒度不受控 → 远近一样粗
       所以这里叠一层**真实高度图**。它提供大尺度结构，
       程序化那层保留下来当细节（两者互补，不是替代）。

       为什么采样结果能做高度：图集里存的就是高度（0..1），不是颜色。
       uv 构造：vBladeLocal.x 是沿刀轴（0~0.35），.y 是横向，
       两者范围都很小（±0.3 量级），所以必须乘重复次数再取小数部分 ——
       直接拿 vBladeLocal 当 uv 等于只采到图集的一个小角落（实测过）。 */
    float surfW = clamp( uV2SurfTile.w, 0.0, 1.0 );
    if ( surfW > 0.0025 ) {
      vec2 suv = vBladeLocal.xy * uV2SurfUv.xy + uV2SurfUv.zw;

      /* ═══ 2026-10-26：图集采样也要抗锯齿 ══════════════════════

         同一张变焦对比图揭示：关掉图集（noatlas-z2, 25.8KB）比开着（34.0KB）
         干净很多 —— 说明 uV2SurfaceMap 也在贡献欠采样噪点。

         为什么：normalAtlas.js 里
             tex.generateMipmaps = false;
             tex.minFilter = LinearFilter;
         而这里又用 3×2.4 的重复率把它缩小采样 → 远处像素跨过多个 texel，
         又没有 mipmap 可以退，只能拿一个 texel 当整片结果 → 闪斑。

         为什么不用直接开 mipmap：
           这张图集是 2×2 瓦片拼在一张纹理里，
           开 mipmap 后高层会在**瓦片边界**上跨瓦混淆（渗色）。
         所以用与微脊同一套解析抗锯齿：按像素足迹淡出。

         ⚠ 导数必须取在 fract() **之前**：
           fract 在瓦片接缝处不连续，对它求 fwidth 会在每道接缝得到极大值，
           于是一整排像素的 surfW 被归零 → 看得见接缝。
           suv 是 vBladeLocal 的线性函数，连续且无跳变，所以安全。 */
      vec2 fwUv = fwidth( suv );
      /* 瓦片是 256 texel ／ 1 个 suv 单位（见 normalAtlas TILE = 256）*/
      float texPx = max( fwUv.x, fwUv.y ) * 256.0;
      float texAA = 1.0 - smoothstep( 0.40, 1.10, texPx );
      float surfWa = surfW * texAA;

      /* 平铺（RepeatWrapping 已开，这里只负责搬进瓦片内）*/
      vec2 tu = fract( suv ) * uV2SurfTile.z + uV2SurfTile.xy;
      float hTex = texture2D( uV2SurfaceMap, tu ).r;
      /* 中心化后与程序化高度混合。

         ★ 2026-10-24 修正（S9 截图呈“编织布纹”而不是金属）：
           原式是 ( h - 0.5 ) * 0.32 + hTexMid * 0.68 —— 贴图占 68% 高度权重，
           而 hTexMid 是 ×2 归一化的（±1）→ 两者相乘约 ±0.68 的高度摆动，
           推到法线导数后直接发生**翻折**，形成一格一格的亮/暗面，
           视觉上就是织物而不是金属。

           金属表面的凹凸应当是“润物细无声”：它让高光微碎化、反射带微弯，
           而不是本身长出一块块台阶。把贴图权重降到 22%，
           程序化层保留 78%（频率高、幅度小，不会翻折）。

         ⚠ 本段在 JS 模板字符串里 —— 注释中**绝对不能出现反引号**，
           否则模板字符串会被提前截断，后面的 GLSL 当 JS 执行（实测报 h is not defined、页面起不来）。 */
      float hTexMid = ( hTex - 0.5 ) * 2.0;
      h = mix( h, clamp( 0.5 + ( h - 0.5 ) * 0.78 + hTexMid * 0.22, 0.0, 1.0 ), surfWa );
    }

    /* 刃口/折面保护：刃线附近不要起伏（否则看起来"毛"而不是"利"）
       —— 与 k3dS3SurfaceMask 同一思路，复用它的几何判断量。 */
    float reliefMask = clamp( vS3PlanarFace, 0.0, 1.0 );
    reliefMask *= 1.0 - 0.92 * smoothstep( 0.16, 0.66, clamp( vBladeEdge, 0.0, 1.0 ) );
    /* S7 之后（uV2Surf.w = 刃面折面强化）把折面本身当成大尺度结构：
       凸起（vEdge 高）更亮更平，凹面保留颗粒 —— 这正是开刃后的真实观感。 */
    reliefMask *= mix( 1.0, mix( 0.55, 1.25, clamp( vEdge, 0.0, 1.0 ) ), clamp( uV2Surf.w, 0.0, 1.0 ) );

    /* ── ② 屏幕空间导数 → 真实法线扰动 ──
       与柄部（material.js 的 normalFragment）同一套 surface-gradient 做法。

       ❗❗ 2026-10-24 实测踩到的致命数学错误（曾导致本层「注入成功但零效果」）：
         原式  bumped = abs(det) * normal - grad * scale
         的量级是 |det| ≈ 1e-5（像素足迹的叉积），而 normal 是**单位向量**（模长 1）。
         于是 mix( normal, bumped, 0.5 ) = 0.5*normal + 0.5*1e-5*方向
         → normalize 后又变回 normal，**扰动被完全淹没**。
         实测证据：把放大系数 0.55 改成 50 倍，高频能量变化 **0.0%**；
         而把 normal 直接写成常量则画面明显变化 —— 说明 normal 确实被消费，
         只是这一句算完等于没改。

         修法：**先把 bumped 归一化**（只保留方向），再与 normal 混合。
         两个单位向量的 mix 才是真正的角度插值。
         归一化后的倾角由 |grad| / |det| 的比值决定，与绝对量级无关 ——
         所以 uV2Surf.x 才真正成为一个可调的“强度”。 */
    vec3 surfDx = dFdx( vViewPosition );
    vec3 surfDy = dFdy( vViewPosition );
    if ( length( surfDx ) > 1.0e-7 && length( surfDy ) > 1.0e-7 ) {
      vec3 r1 = cross( surfDy, normal );
      vec3 r2 = cross( normal, surfDx );
      float det = dot( surfDx, r1 );
      if ( abs( det ) > 1.0e-12 ) {
        vec3 surfGrad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
        /* ① 先归一化（关键）—— 只留方向，丢掉 1e-5 的量级 */
        vec3 bumped = normalize( abs( det ) * normal - surfGrad * clamp( uV2Surf.x, 0.0, 1.0 ) );
        /* ② 斜看时更明显（与金属直觉一致），再与几何法线按角度插值 */
        float blend = clamp( 0.30 + 0.50 * clamp( nFres, 0.0, 1.0 ), 0.0, 0.90 ) * reliefMask;
        normal = normalize( mix( normal, bumped, blend ) );
      }
    }
  }
}
`;
}

/** 供诊断/默认值参考（没有该 uniform 时不要炸） */
export const SURFACE_DEFAULTS = Object.freeze({
  relief: 0.0,      // uV2Surf.x：法线扰动量（0 = 关闭，保持旧观感）
  aniso: 0.0,       // uV2Surf.y：各向异性强度
  ridge: 0.0,       // uV2Surf.z：微脊频率权重
  edge: 0.0,        // uV2Surf.w：刃面折面强化
});

/* ── JS 侧：按工艺 / 纹理 / 已到达阶段数推导表面参数 ──────────────────
 *
 * 设计原则（不重蹈"拍脑袋数值"的覆辙）：
 *   · 基准值来自**工艺语义**，不是随机；
 *   · 各向异性来自**纹理自带的 anisotropy 参数**（拉丝/磨削天然有方向性）；
 *   · 表面结构强度随**已到达阶段数**递增 —— 越往后做，表面越有内容。
 */

/** 各工艺的表面颗粒基准：抛光类细、喷砂/发黑类粗。 */
const FINISH_RELIEF = {
  F01: 0.13,  // 精抛光：几乎光滑
  F02: 0.09,  // 镜面
  F03: 0.24,  // 拉丝：有方向性细纹
  F04: 0.30,  // 发黑氧化：粗糙
  F05: 0.20,  // 蓝化
  F06: 0.28,  // 表面淬火：斑块起伏
  F07: 0.22,  // 回火彩
  F08: 0.20,  // 阳极氧化
  F09: 0.18,  // PVD 镀层
  F10: 0.16,  // 彩色油膜：膜面较平
  F11: 0.42,  // 喷砂：最粗
  F12: 0.15,  // 动态边缘光
};

/**
 * 各阶段的**表面起伏强度**（主驱动）。
 *
 * ★★ 2026-10-24（修正一个我自己引入的设计错误）
 *
 *   初版只按工艺查表（FINISH_RELIEF），结果完全反了：
 *     S1–S4 恰好用 F01（精抛光 0.13）→ relief 0.11–0.12
 *     S5–S9 恰好用 F11（喷砂 0.42）→ relief 0.42–0.48
 *   而工序语义要求的是：
 *     S1 原料颗粒粗（0.52）→ S3 锤痕**最深**（0.68）→ S9 最细（0.14）。
 *   即“工序越往后表面越细”，但表里给的是“越往后越粗”。
 *
 *   根因：工艺（finsh）描述的是**最终表面处理手法**，与“此刻刀还粗不粗”
 *         是两件事 —— 同一道精抛光放在粗糙刀胚上与成品上，含义不同。
 *
 *   修法：改为**以阶段曲线为主**（占 65%）、工艺只做调制（占 35%）。
 *   这样 S3 真的最深、S9 真的最细，而工艺仍能拉开同阶段内的差异。
 */
const STAGE_RELIEF = [
  0.075, // S1 原料：未加工的矿石/锭料（仍需看得出的粗）
  0.060, // S2 熔炼：钢液流动
  0.095, // S3 锻打：**锤痕最深**（本阶段主角）
  0.055, // S4 定型：锤痕被压平
  0.042, // S5 淬火：晶粒变细密
  0.030, // S6 回火：氧化膜覆盖
  0.045, // S7 开刃：刃面折面 + 磨削纹
  0.028, // S8 装配：刀身趋于完成
  0.015, // S9 精校：最细腻（几乎光滑）
];
/** 有方向性表面处理的工艺（拉丝/磨削/缎面）→ 给各向异性 */
const FINISH_ANISO = {
  F03: 0.85,  // 拉丝
  F01: 0.30,  // 精抛光（轻微方向性）
  F02: 0.18,  // 镜面
  F11: 0.45,  // 喷砂
  F12: 0.35,  // 边缘光
};

/**
 * @param {object} op      finishOperators 的输出（a/b/c/d/mode/cover/micro/palette）
 * @param {object} u       来自 state.js 的 uniform 源
 * @param {number} finishId 1..12
 * @param {object} opts    buildHook 的 opts
 * @returns {number[]} [relief, aniso, ridge, edge]
 */
export function surfaceParamsOf(op, u = {}, finishId = 1, opts = {}) {
  const fid = `F${String(Math.max(1, Math.min(12, Number(finishId) || 1))).padStart(2, '0')}`;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  /* ① 已到达阶段数 → 推当前阶段索引
     uCardFx 里 fx.y > 0 的槽数就是“本局已做过的工序数”。
     例：S1/S2/S3 三个槽都有值 → 当前正在 S3（索引 2）。 */
  const fx = u.uCardFx;
  let reached = 0;
  if (fx && fx.length >= 36) {
    for (let i = 0; i < 9; i++) if (Number(fx[i * 4 + 1]) > 0.001) reached++;
  }
  const stageIdx = Math.max(0, Math.min(8, reached - 1));

  /* ② 表面起伏：**阶段曲线为主 + 工艺做乘性调制**

     ★★ 2026-10-24 最终方向（四轮试错后的结论）：

       前三轮一直在加纹理，视觉验收全部不过：
         S3 像石头、S5 像水泥、S9 像木纹/织物。

       实测阈值扫描（S9，surfW 固定 0.18）：
         relief 0.070 → 亮度 0.486，仍是木纹
         relief 0.000 → 亮度 0.492，**干净金属**（截图对比确认）
         但在 0.015–0.07 区间，亮度只差 0.6% → 这个旋钮在低值区几乎不起作用

       根因：这个项目的模型**自带一套 1024² 的深色木纹贴图**（已导出确认），
       它已经提供了大量表面“图案”。再叠任何法线/高度层，都只会把它推得更脏。

       所以最终把 relief 整体系到 0.015–0.095（比最初小 4–7 倍）：
         · S1/S3 保留看得出的粗（原料/锤痕，这是玩法需要的信息）
         · S5 之后快速降到 0.015–0.045，让镜面高光穿过去
       金属感靠“干净表面 + 强环境反射”而立，不靠堆纹理。 */
  const stageRelief = STAGE_RELIEF[stageIdx] ?? 0.30;
  const finRelief = FINISH_RELIEF[fid] ?? 0.20;
  /* 工艺相对中性的偏移（±，0.25 为中性）*/
  const finishDelta = (finRelief - 0.25) * 0.5;
  let relief = stageRelief * Math.max(0.70, 1 + finishDelta);

  /* ③ 磨损：磨损让表面更粗糙、也更有“手感”（只加成，不改变阶段排序） */
  const wear = num(u.uWear01, 0);
  relief *= 1 + 0.35 * clamp01(wear);

  /* ④ 各向异性：纹理自带参数优先（拉丝 T02 的 anisotropy 已写在 uTexParam6.w） */
  const texAniso = num(u.uTexParam6 && u.uTexParam6[3], 0);
  let aniso = Math.max(FINISH_ANISO[fid] ?? 0.15, clamp01(texAniso));
  /* 只有真选了纹理才开方向性结构，否则给一个很低的基线，
     避免"没选纹理却有拉丝"这种自相矛盾的观感。 */
  const s3On = num(u.uS3On, 0) > 0.5;
  if (!s3On) aniso *= 0.45;
  aniso = clamp01(aniso);

  /* ⑦ P3：过程模型的各向异性。

     计划里写的是「S3 锻打：锤痕法线 + 方向性各向异性（这一阶段的主角）」。
     锤痕在 normalFragment 里已经是一条固定方向的条带，
     所以这里给 S3 拉高 aniso，让那条高光真的被拉成一条线而不是一个点。

     ★★ 2026-10-26（P3.5 实测修正）：上限从 0.72 降到 0.32。

       0.72 是错的。在 normalFragment 里：
         h = mix( hMain, hMain * 0.78 + ridgeMix * 0.22, anisoW )
       anisoW=0.72 意味着**微脊占到高度场的 16%**，而微脊是
           sin( vBladeLocal.y * ridgeFreq )   ridgeFreq = 380~900
       这种规则正弦叠加在主纹样上，在 S3 的 relief 0.26 下
       就把锻打棱面覆盖成一层**细密斜向网格纹**（_p3relief.mjs 拍的 S3 可见）。

       判定依据（S3 单变量扫描，同一份代码只改 uV2Surf.x）：
         relief    σ        hf        图
         0        0.1573   0.0723   ✔ 只有模型本身的锻打棱面，干净
         0.08     0.1662   0.1491   ✔ 微细节，无网格
         0.14     0.1708   0.1682   ⚠ 网格开始可见
         0.20     0.1734   0.1774   ✗ 明显
         0.26     0.1749   0.1822   ✗ 强（即当时现状）

       注意 S3 与 S1 的规律**相反**：S1 加 relief 会把 σ 压低且出编织纹，
       S3 加 relief 则 σ/hf 单调上升 —— 因为 S3 的棱面是模型几何提供的，
       法线层只是“锦上添花”。所以两阶段的调法不能同步。

        0.32 的取值：比 S1 的 0.135 高（S3 确实需要方向性），
       却远低于开始出网格的阈值，同时保住韧面高光的方向感。 */
  /* ★★ 2026-10-26（P3.5 复审）：S3 恢复为 0.72。

     我先前把它降到 0.32，理由是「0.72 会让微脊占到高度场的 16%,
     在 S3 造成细密斜向网格纹」。但那个网格已被 _p3alias.mjs 证明是
     **截图强制正方形**造成的摩尔纹（S3 模型原生仅 101×404 px）。

     用自然比例重新采样后，S3 在 relief=0.26 下是干净的；
     而 aniso 降低的副作用是犧牲了“锻打面高光被拉成条”的观感 ——
     那是 P3 计划里 S3 的明确目标。所以恢复 0.72。 */
  /* ⑤ 微脊频率：粗表面用低频大脊，细表面用高频细脊。
     映射到 0..1（0 = 极低频大脊，1 = 高频细脊），并留出两端余量。 */
  const ridge = clamp01(1.05 - relief * 1.35);

  /* ⑥ 刃面折面强化：只在本局已做过 S7（槽 6）之后才明显 */
  const edgeReached = fx && fx.length >= 36 && Number(fx[6 * 4 + 1]) > 0.001;
  const edge = edgeReached ? 0.75 : 0.0;

  return [
    +clamp01(relief).toFixed(3),
    +aniso.toFixed(3),
    +ridge.toFixed(3),
    +edge.toFixed(3),
  ];
}
