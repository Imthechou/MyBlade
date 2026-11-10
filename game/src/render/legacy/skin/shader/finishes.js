/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/shader/finishes.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../_registry.js';
const K3D = __reg.proxy;

  const funcs = `
// ── F01 精抛光：降低 roughness、增强反射（不改色相）
// ── F02 镜面抛光：roughness 压到很低
// ── F03 拉丝处理：按纹理的方向性调制 roughness（各向异性本体在 CPU 侧设置）
// ── F04 发黑氧化：压暗 + 抬粗糙
// ── F05 蓝化：蓝灰氧化层（沿花纹 Mask）
// ── F06 表面淬火：金→紫→蓝 热色带
// ── F07 回火彩：黄→紫→蓝（温度决定偏移）
// ── F08 阳极氧化：彩色 + 虹彩
// ── F09 PVD 镀层：高光洁度薄层 + 轻微色偏
// ── F10 彩色油膜 / 多普勒
// ── F11 喷砂磨砂：粗糙度提升
// ── F12 动态边缘光：Fresnel 边缘光 + 空间流动
void k3dApplyFinish(
  int finId,
  vec3 local, float tAxis, vec3 pat,
  vec4 f0, vec4 f1, vec4 f2, vec4 f3, vec3 fColor,
  vec3 pal0, vec3 pal1, vec3 pal2, vec3 pal3,
  vec4 dopMeta, vec4 seeds, float fresnel,
  inout vec3 color, inout float rough, inout float metal, inout float glow )
{
  float amount = f0.x;
  float pattern = pat.x;
  float height = pat.z;
  /* ★ 2026-10-12（用户需求 3）「淬火阶段对刀身颜色影响太大，需要小一点」：
   *   本项目所有工艺（F01~F12）都只由 S5 淬火阶段的 25 张卡写入（其它阶段不写 finishId），
   *   所以这里统一给**颜色层**乘一个折扣：结构（粗糙度/高光/边缘光）保持原强度，
   *   只有"改颜色"的那部分按 K3D_FIN_COLOR 缩放 —— 玩家仍能看出每张淬火卡的区别，
   *   但不会再被一层颜色盖掉刀身材质本身。调这一个常量即可整体加减。 */
  const float K3D_FIN_COLOR = 0.78;

  /* ══════════════════════════════════════════════════════════════════════
   * ★★ 2026-10-13（R12）S5「同卡不同局」统一随机层
   * ──────────────────────────────────────────────────────────────────────
   * 【问题（探针实测，200 个 run.seed）】
   *   S5 的 25 张卡里**只有 F06 / F12 两个分支读过 uSeeds**；
   *   其余 10 种工艺（F01~F05 / F07~F11）打包出来的 uFinParam0..3 / uFinColor
   *   **逐位相同**（探针逐个字段比对，changed/total = 0）→
   *   同一张淬火卡换一局重新锻造，渲染结果**逐像素一致**。
   *   S3 本来就有（uS3Xf 旋转 ±25° / 缩放 ×0.94~1.06 / 平移全幅），
   *   S6 也有（云雾 + 漂移）—— S5 是三者里唯一缺的。
   *
   * 【做法：三层，都不碰卡的身份参数（色相 / 强度 / 相对明暗）】
   *   ① 【覆盖率每局重排】—— 主杠杆。
   *      把卡自己的 amount 乘上一个**逐局不同的大尺度空间场**（低频 fbm 云影）：
   *        amount *= ( 0.62 + 0.76 * runFld )   均值 ≈ 1.0
   *      于是"这一局淬火/抛光到了哪一片"随局改变 —— 同一张卡不同对局会露出不同的
   *      亮暗区块。这是唯一能同时作用到**所有 12 种工艺**的一条（无论它是改颜色
   *      还是只改粗糙度）。物理上就是手工锻造的残余不均。
   *   ② 【花纹落点】把 pattern / height 按「每局相位」做一次重映射 ——
   *      对应 CSGO 的 Pattern Index：同一款皮肤，花纹落在不同位置。
   *   ③ 【手工微差】文件末尾的低频表面调制（roughness / 明度），
   *      给 F01/F02/F04/F11 这类**纯幅度类**工艺补一枚"每局指纹"。
   *
   * 【量纲】uSeeds 四路都是 0~1 相位（uSeeds.x 的 1000 倍量纲错误已在本轮修好，
   *   见 skin/state.js 的 uSeeds 打包处）→ 这里的 fract(...) 是满量程的。
   * ══════════════════════════════════════════════════════════════════════ */
  float k3dRunPh  = fract( seeds.y * 0.731 + seeds.z * 0.517 + seeds.w * 0.293 );
  // 逐局空间场（大尺度云影，约 2.4 个周期铺满刀身）→ 会读出"这一局的不均匀分布"
  float k3dRunFld = k3dFbm2( local.xy * 2.35 + vec2( seeds.z * 8.7, seeds.w * 6.1 ) );
  float k3dRunG   = clamp( ( k3dRunFld - 0.5 ) * 2.0, -1.0, 1.0 );   // -1..1
  float k3dAmt0   = amount;                                          // 卡的原始 amount（后面 ③ 要用）
  amount *= ( 0.62 + 0.76 * clamp( k3dRunFld, 0.0, 1.0 ) );          // ① 均值 ≈ 1.0
  pattern = clamp( pattern * ( 0.86 + 0.28 * k3dRunPh ) + ( k3dRunPh - 0.5 ) * 0.24, 0.0, 1.0 );
  height  = clamp( height  * ( 0.92 + 0.16 * k3dRunPh ), 0.0, 1.0 );

  if ( finId <= 1 ) {
    // F01 精抛光
    rough = mix( rough, rough * 0.32, amount );
    color = color * ( 1.0 + 0.06 * amount );
  } else if ( finId == 2 ) {
    // F02 镜面抛光
    rough = mix( rough, 0.045, amount );
    color = color * ( 1.0 + 0.10 * amount );
  } else if ( finId == 3 ) {
    // F03 拉丝处理：沟槽更糙、丝面更光（方向来自纹理自身）
    float dir = pat.y;                                   // roughDelta 已带方向性
    rough = mix( rough, clamp( rough + dir * 0.35, 0.02, 1.0 ), amount );
  } else if ( finId == 4 ) {
    // F04 发黑氧化
    float dk = clamp( f0.y, 0.0, 1.0 );
    color = mix( color, color * ( 1.0 - 0.82 * dk ), amount * K3D_FIN_COLOR );
    rough = mix( rough, clamp( rough + 0.28 * dk, 0.0, 1.0 ), amount );
    /* ★ 2026-10-13（S5_22「玄蚀紫界」，用户口径「要是紫色的」）：
     *   旧 F04 **只压暗**（上面两行）——在近黑底材（M06 黑曜钢 #2c3037）上渲出来
     *   就是一团黑/橄榄，完全读不出卡名里的"紫"。
     *   这里接通 F04 此前**从不读取**的两个 uniform 槽位：
     *     f0.z   (gradient) → 染色强度 tintAmt
     *     fColor (tintHex)  → 染色目标色
     *   染色方式**保持明暗结构**（用原亮度调制目标色），不是把刀身刷平；
     *   并在纹理脊线处留一道更亮的紫边 —— 对应卡面文案「暗化表层带细微紫黑边界」。
     *   反光依旧压到极低：本段只动 baseColor，粗糙度仍由上面的发黑逻辑决定。
     *
     *   零回归：F04 全项目只有 S5 的几张卡写入，且都没写 gradient（默认 undefined→0）
     *   → tintAmt = 0 → 整个 if 跳过，逐像素与改动前一致。
     *   （tintHex 的其它消费方 F09/F12 在互斥分支里，不受影响。）
     *   签名增益 1.55：本项目对"改颜色"的层统一乘 K3D_FIN_COLOR=0.5 折扣
     *   （2026-10-12 用户口径「淬火对刀身颜色影响太大」）。这两张卡是用户点名要
     *   "认得出是什么效果"的定向精修，所以折扣之后放回一档，把混合权重顶到 ~0.6。 */
    float tintAmt = clamp( f0.z, 0.0, 1.0 );
    if ( tintAmt > 0.002 ) {
      vec3 tint = k3dSatVal( fColor, 1.28, 1.0 );
      float lum = dot( color, vec3( 0.299, 0.587, 0.114 ) );
      vec3 tinted = tint * ( 0.26 + 1.16 * lum );
      color = mix( color, tinted, clamp( tintAmt * 1.55 * K3D_FIN_COLOR, 0.0, 0.86 ) );
      color += tint * smoothstep( 0.55, 1.0, pattern ) * tintAmt * 0.22;
    }
  } else if ( finId == 5 ) {
    // F05 蓝化：蓝灰氧化层沿花纹铺（gradient 决定渐变跨度）
    vec3 tint = fColor;
    float g = clamp( pattern * ( 0.55 + f0.z ) + tAxis * 0.25, 0.0, 1.0 );
    vec3 oxidized = mix( color * 0.35, tint, g );
    color = mix( color, oxidized, amount * 0.9 * K3D_FIN_COLOR );
    rough = mix( rough, clamp( rough + 0.16, 0.0, 1.0 ), amount );
  } else if ( finId == 6 ) {
    /* F06 表面淬火 ★★ 2026-10-13 重写：CSGO「表面淬火（Case Hardened）」式**随机斑块**
     * ── 用户口径：「找到 S5 里对标 CSGO 表面淬火的决策卡，看看每局不同的随机效果明显不，
     *    需要 CSGO 那种感觉」。本卡 = S5_16 赤金临界 / S5_18 横贯热带。
     *
     * 【改动前实测】（同卡 × 6 个不同 run.seed，刀身裁切口径）
     *   S5_16 pairDiff 3.26 / minPairDiff 3.12 ；S5_18 pairDiff 4.66 / minPairDiff 4.33。
     *   但看图：6 局是**同一套竖向色带**，差别只是整体色相略微漂移 ——
     *   完全没有"每局图案不同"的观感，数字主要来自色相漂移而不是图案重排。
     * 【根因】旧实现
     *   band = fract( pattern * spread + phase + tAxis * 0.35 + seeds.x * 0.13 );
     *   ① 随机性只来自 seeds.x 的 0.13（约十二分之一圈相位），肉眼几乎无感；
     *   ② 形状是**一维色带**（只沿 tAxis 变化），结构上不可能是"块状"；
     *   ③ 还依赖 pattern —— S5 预览底是 T01 素面、pattern 近乎常量，
     *      真机里也要玩家先拿到强纹理才看得见。
     *   注：js/skin/finishes.js 里 F06 的注册描述本来就写着
     *   「随机块状分布由 T12/Seed 决定」—— 设计意图从未落地。
     *
     * 【新实现】三层，全部由 uSeeds 驱动（uSeeds 四路全部派生自 run.seed，
     *   而 core/forge.js 每局默认 seed = Date.now()%1e8 → 天然"每局不同"）：
     *     ① 域扭曲 k3dWarp2        —— 斑块边界有机、不规则（seed 决定扭曲场）
     *     ② Voronoi 斑块 k3dVoronoi2 —— 每块用自己的 cellId 决定色相（真·"块状"）
     *     ③ 低频 macro 偏置        —— 相邻斑块色相成片，出现"整片蓝宝石 / 整片金"的区域感
     *   色域收敛在 CSGO 表面淬火的四段：留底钢(青灰) / 深蓝 / 金 / 紫，
     *   **不是连续彩虹**；斑心饱和、斑边退回原材质（就是那层"留底钢"）。
     *
     * 【坐标系（关键，2026-10-13 实测纠错）】刀身局部坐标按 vBladeLocal 的定义是
     *   （沿长轴 t 0~1, **横向**, **厚度**）。用 knife_straight 的 bladeFrame.span 实测：
     *   span = [1.1896, 0.2027, 0.0938] → y(0.203) 是**横向刀宽**、z(0.094) 才是**厚度**；
     *   再按面法线分组统计：法线沿 z 的那组顶点上 local.z 呈 0/1 双峰（sd 0.316，面内近乎常量），
     *   而 local.x / local.y 在面内连续变化 → **可见刀面 = x–y 平面，法线 = z**。
     *   ⚠ 第一版误用了 local.xz（长度×厚度）→ 厚度在面内是常量 → 斑块退化成一维条带，
     *     正是"看起来还是竖色带"的原因。**这里必须用 local.xy。**
     *   各刀型宽长比不同（1/12 把刀 y 不是横向），所以用 uniform uBladeSpan 现算宽长比，
     *   让斑块在**世界尺度上近似各向同性**，12 把刀都成立。
     *
     * 【零回归】F06 全项目只有 S5_16 / S5_18 两张卡写入（见 core/recipe.js 槽位归属表），
     *   其它阶段不写 finishId → 本分支改动不触及任何其它卡。 */
    float spread = clamp( f0.w, 0.0, 1.0 );        // heatSpread → 斑块密度
    float phase  = f1.x;

    /* ★★ 2026-10-13 二轮精修（用户口径「表面淬火也是，需要能有几率出纯净的大块」）。
     *   一轮版（上面那段注释描述的 Voronoi 斑块）解决了"每局图案不同"，
     *   但还有两个问题：
     *   ① **块太小太碎** —— kx = mix(6,14,spread) 是"每单位 local.x 里塞几块"，
     *      再叠 0.55 的域扭曲，渲出来是一层细密花斑，
     *      没有 CSGO 表面淬火那种「一整片蓝宝石 / 一整片金」的大色域观感；
     *   ② **块内不纯** —— hue 里挂了 macro(低频 fbm) 的 0.62 权重，
     *      同一个块内部还在连续变色 → 看着是"脏"，不是"纯净"。
     *   对策（两条都挂在 uSeeds 上 → 天然每局不同）：
     *   A) 【有几率出大块】每局先抽一个"开料档位"：
     *        mood = fract( seeds.y*2.31 + seeds.z*1.73 + seeds.w*0.91 + phase*0.37 )
     *      ⚠ 实测坑（2026-10-13，探针 v2 读真实 uniform 才发现的）：
     *        uSeeds.x = patternSeed/1e6，而实测 patternSeed 只有 ~1e2~1e3
     *        → seeds.x 实际挤在 0.0000~0.0008，**几乎没有熵** —— 把随机量挂在
     *        seeds.x 上等于没挂（第一版 mood 就吃了 seeds.x*5.73，贡献 < 0.005）。
     *        现在只用 seeds.y/z/w（y=warpSeed/1e6、z/w 是两个 0~1 浮点相位），
     *        三者都满量程。
     *        big  = smoothstep(0.30, 0.70, mood)  ≈ 32% 对局
     *        huge = smoothstep(0.84, 0.97, mood)  ≈ 12% 对局（更极端的大色域）
     *      big≈1 → 整把刀只剩 3~6 块大色域；huge≈1 → 2~3 块（blue gem 级）；
     *      big≈0 → 回到细密花斑（≈50% 对局）。smoothstep 保证档位连续过渡。
     *   B) 【块纯净】色相只由 cellId 决定 —— k3dVoronoi2 的 cellId 本来就是
     *      每个胞元一个常量哈希 → **同一块内部色相完全相同**；只留极小的
     *      面内噪声做呼吸（big 越大越小：0.10 → 0.012 → 0.006）。
     *   尺度也改成**直接按"期望块数"给**，不再拿宽长比硬凑：
     *      local.x 是整刀参数、刀身约占 0.62；local.y 已按刀宽归一化到 0~1
     *      → 细密档 11×3.2 块 / 大块档 3.4×1.55 块 / 极大档 2.6×1.20 块。
     *      大块档再配 0.88（极大档 0.92）的覆盖上限，让色域真正"填满"而不是
     *      被底材压暗成半透明 —— 这是"纯净"的另一半。 */
    float mood = fract( seeds.y * 2.31 + seeds.z * 1.73 + seeds.w * 0.91 + phase * 0.37 );
    float big  = smoothstep( 0.30, 0.70, mood );
    float huge = smoothstep( 0.84, 0.97, mood );

    float along  = mix( mix( 11.0, 3.4, big ), 2.6, huge );
    float across = mix( mix( 3.2, 1.55, big ), 1.20, huge );
    vec2  q = vec2( local.x * ( along / 0.62 ), local.y * across );

    float sd = seeds.x * 11.0 + seeds.y * 23.0 + phase * 7.0;
    vec2  wp = k3dWarp2( q, mix( mix( 0.55, 0.25, big ), 0.18, huge ), sd );
    float cellId = 0.0;
    float d1 = k3dVoronoi2( wp + vec2( seeds.z * 13.0, seeds.w * 17.0 ), cellId );

    /* 块内色相 = cellId 常量 + 极小面内噪声（档位越大越纯净） */
    float micro = ( k3dFbm2( local.xy * 3.4 ) - 0.5 ) * mix( mix( 0.10, 0.012, big ), 0.006, huge );
    float hue = fract( cellId * 1.37 + micro + seeds.z * 0.71 + phase * 0.5 );
    /* 「留底钢」段：hue 的低段**直接不着色**（cover→0），让原材质色（近黑钢）自己露出来。
     *   ★ 别把"留底钢"写进调色板：第一版把 0 号色设成中灰 (0.30,0.34,0.41)，
     *   在近黑底材上等于把斑心**整体提亮** → 渲出来是一把发白的刀（2026-10-13 实测踩到）。
     *   CSGO 表面淬火的关键正是这层高对比：饱和的蓝/金/紫斑块压在**原钢**上。
     *   ★ 现在 hue 是"每块一个常量"，steel 也随之变成"整块是钢 / 整块着色"——
     *     这恰好就是 CSGO 里那块大面积露底的原钢大块。 */
    float steel = 1.0 - smoothstep( 0.10, 0.30, hue );
    vec3 heat = k3dPalette4( vec3( 0.06, 0.22, 0.78 ),    // 深蓝（blue gem）
                             vec3( 0.86, 0.60, 0.16 ),    // 金
                             vec3( 0.42, 0.18, 0.66 ),    // 紫
                             vec3( 0.34, 0.46, 0.68 ),    // 冷钢蓝（次级小斑）
                             clamp( ( hue - 0.30 ) / 0.70, 0.0, 1.0 ) );
    /* 边界：档位越大越"利落"（起步 0.08→0.42→0.46、收口 0.46→0.53→0.55） */
    float core = 1.0 - smoothstep( mix( mix( 0.08, 0.42, big ), 0.46, huge ),
                                   mix( mix( 0.46, 0.53, big ), 0.55, huge ), d1 );
    float cover = amount * ( 0.34 + 0.66 * core ) * ( 1.0 - steel );
    /* 签名增益（理由同 F04 分支上方那段注释）：本项目对"改颜色"的层统一乘
     * K3D_FIN_COLOR=0.5 折扣，而这两张卡是用户点名要"CSGO 那种感觉"的定向精修，
     * 折扣之后按档位放回 —— 大块档 2.60 / 极大档 3.00、上限 0.60→0.88→0.92，
     * 让大色域真正"填满"，才读得出"纯净的大块"。 */
    float w = clamp( cover * mix( mix( 1.35, 2.60, big ), 3.00, huge ) * K3D_FIN_COLOR,
                     0.0, mix( mix( 0.60, 0.88, big ), 0.92, huge ) );
    color = mix( color, heat, w );
    rough = mix( rough, clamp( rough + 0.12 * core, 0.0, 1.0 ), cover );
  } else if ( finId == 7 ) {
    // F07 回火彩：黄 → 紫 → 蓝（temperature 越低越黄）
    float temp = clamp( f1.y, 0.0, 1.0 );
    float tt = clamp( temp * 0.6 + pattern * 0.4 + tAxis * 0.2, 0.0, 1.0 );
    vec3 temper = k3dPalette4( vec3( 0.95, 0.84, 0.42 ), vec3( 0.86, 0.56, 0.22 ),
                               vec3( 0.52, 0.28, 0.66 ), vec3( 0.26, 0.44, 0.88 ), tt );
    color = mix( color, temper, amount * 0.85 * K3D_FIN_COLOR );
  } else if ( finId == 8 ) {
    // F08 阳极氧化 ★：彩色氧化层 + 虹彩（颜色由材质色相偏移得到）
    float hueShiftAmt = f1.z;
    vec3 tinted = k3dHueShift( color, hueShiftAmt + 0.05 * sin( pattern * 6.2831853 ) );
    tinted = k3dSatVal( tinted, 1.0 + 0.35 * amount * K3D_FIN_COLOR, 1.0 + 0.08 * amount );
    float cover = amount * mix( 0.6, 1.0, pattern );
    color = mix( color, tinted, cover * K3D_FIN_COLOR );
    /* ★ 2026-10-13（S5 逐卡可辨性）：接通此前**完全未被消费**的 f3.z（iridescence）。
     *   卡数据里 4 张 F08 卡分别写了 iridescence = 0.4 / 0.5 / 0.7 / 0.8
     *   （S5_13 转角虹膜 / S5_15 阳极纹彩 / S5_19 幻彩氧层 / S5_23 冷热虹界），
     *   但 F08 分支从不读它 —— 于是四张卡只剩 hueShift 一个维度，
     *   其中 S5_19(史诗, 0.6) 与 S5_23(神话, 0.85) 参数接近，两两几乎分不开。
     *   现在把它变成一条**视角相关**的阳极氧化虹彩：正面几乎无感、斜看时色相沿
     *   fresnel 前进 → 转动刀身时四张卡各自走不同的色环段。
     *   零回归说明：f3.z 在其它工艺里也没人读（F10 读 f3.x / f3.y，F12 读 f3.y），
     *   没写这个键的 F08 卡恒为 0 → 下面的 if 直接跳过，逐像素与改动前一致。 */
    float irid = clamp( f3.z, 0.0, 1.0 );
    if ( irid > 0.002 ) {
      float fw = pow( clamp( fresnel, 0.0, 1.0 ), 1.6 );
      vec3 sheen = k3dHsv2Rgb( vec3(
        fract( hueShiftAmt * 1.7 + fw * ( 0.55 + 0.45 * irid ) + pattern * 0.18 ), 0.62, 1.0 ) );
      color = mix( color, color * sheen * 1.22, fw * irid * 0.55 );
      color += sheen * fw * irid * 0.10;
    }
    rough = mix( rough, rough * ( 0.7 - 0.16 * irid ), amount );
  } else if ( finId == 9 ) {
    // F09 PVD 镀层：薄层色偏 + 更光洁（不盖掉金属反射）
    vec3 coatTint = mix( color, fColor, 0.55 );
    float cover = amount * mix( 0.35, 0.75, pattern );
    color = mix( color, coatTint, cover * K3D_FIN_COLOR );
    rough = mix( rough, rough * ( 1.0 - 0.45 * clamp( f1.w, 0.0, 1.0 ) ), amount );
  } else if ( finId == 10 ) {
    // F10 彩色油膜 / 多普勒 ★★（文档 §9.5）
    float strength = clamp( f2.x, 0.0, 1.0 );            // 已按 wear 衰减
    float preserve = clamp( f2.y, 0.0, 1.0 );            // 原材质保留
    float fresPow = max( 0.2, f2.z );
    float fresInt = f2.w;
    float colorPhase = f3.x + dopMeta.w;                 // 材质锚点色相 + 用户相位
    // ① 形状：T09/T10 的雾团就是 mask；其它纹理则用花纹强度当 mask
    float mask = clamp( mix( pattern, height, 0.35 ), 0.0, 1.0 );
    // ② 颜色：沿调色板取色（雾团 + 相位 + 视角共同推动）
    float ramp = clamp( mask * 1.15 + colorPhase + fresnel * 0.35, 0.0, 1.0 );
    vec3 dopColor = k3dPalette4( pal0, pal1, pal2, pal3, ramp );
    dopColor = k3dSatVal( dopColor, dopMeta.y, dopMeta.z );
    // ③ 合成：preserve 是原材质保留比例；避免旧恒等式让该参数完全失效。
    float dopplerMix = mask * strength * ( 1.0 - preserve );
    color = mix( color, dopColor, clamp( dopplerMix * K3D_FIN_COLOR, 0.0, 0.70 ) );
    // ④ 视角相关虹彩（正面/斜看不同）
    float f = pow( clamp( fresnel, 0.0, 1.0 ), fresPow );
    color += dopColor * f * fresInt * ( 1.0 - preserve ) * 0.35 * K3D_FIN_COLOR;
    // ⑤ 多普勒区更光洁一点（雾团处像油膜）
    rough = mix( rough, rough * 0.72, mask * strength );

    /* ★ 2026-10-13（S5_21「神淬虹纹」，用户口径「要做成 csgo 渐变之色的感觉」）：
     *   接通 F10 此前**从不读取**的 f0.z(gradient) 作为 Fade 开关。
     *
     *   为什么原来的 F10 读不出"渐变"：上面 ①~④ 的全部形状都来自 mask，而
     *   mask = mix( pattern, height, 0.35 ) —— 依赖纹理。S5 预览底是 T01 素面、
     *   pattern/height 近乎常量 → 整把刀是均匀一层，没有"渐变"可言。
     *
     *   新分支完全**不依赖纹理**：一条沿刀身长轴（tAxis）的平滑宽幅渐变，
     *   叠一点点刀高方向(local.z)的倾斜做出 CSGO Fade 那种斜切感，
     *   色环走 紫 → 品红 → 橙 → 金，高饱和、色带宽而干净。
     *
     *   零回归：没写 gradient 的 F10 卡（如 S5_20 蓝紫流界）fade = 0 → 整个 if 跳过，
     *   逐像素与改动前一致。 */
    float fade = clamp( f0.z, 0.0, 1.0 );
    if ( fade > 0.002 ) {
      /* ★ 2026-10-13 二轮精修（用户口径「现在的渐变之色配色有点土，
       *   而且该效果需要自动让刀面颜色纯净一点点」）。三个改动：
       *   ① 【去土】旧版走裸 HSV 色环（hz = fract(0.72 + g*0.46)）再
       *      k3dSatVal(..., 1.06, 1.02) 加饱和 —— 玫红段被顶到 s≈0.93、v>1，
       *      渲出来是一圈"廉价口红粉"（还会在尖端飘出一撮绿）。现在 根→尖 走
       *      7 档**手工锚点**（二轮再压深一档，去掉浅粉与奶白金）：
       *        深紫罗兰 #391D73 → 紫晶 #6527AA → 深洋红 #A51C80 → 绯红 #D02850
       *        → 朱橙 #E55618 → 琥珀 #ED9E14 → 金 #F2C935
       *      段内 RGB 线性插值，每档自带 sat/value，明度沿带子由深到亮 ——
       *      色相走位仍是 Fade，但读起来是"深色金属"而不是"喷漆"。
       *   ② 【纯净】旧版是纯 alpha 混合（w≈0.71），还留着 29% 的底纹杂色；
       *      而且权重里乘了 mask = mix(pattern, height, 0.35)，mask 依赖纹理
       *      → 会把底纹形状透出来，越看越"花"。现在覆盖面抬到 0.90 且**不再乘 mask**
       *      → 刀面色相统一干净。金属高光/明暗照旧由后续 PBR 光照给，这里不找。
       *   ③ 粗糙度压得更亮面一点（0.78 → 0.62），更像上釉的金属。
       *   零回归：没写 gradient 的 F10 卡（如 S5_20 蓝紫流界）fade = 0
       *   → 整个 if 跳过，逐像素与改动前一致。 */
      // 轴向主导 + 一点横向倾斜(local.y = 刀宽方向) → CSGO Fade 的斜切感。
      // ⚠ 三个坑（2026-10-13 实测）：
      //   ① 不能用 local.z —— z 是**厚度**，在可见刀面上近乎常量，加它等于没加；
      //   ② g **必须先铺满 0~1**，不能加一个大常数偏移。第一版是
      //      tAxis*0.94 + colorPhase*0.45，而 colorPhase = colorPhase + paletteShift ≈ 1.06
      //      → 常数项就有 0.48，g 全程 0.48~1.0；k3dPalette4 内部 k3dSaturate(t) 一夹，
      //      整把刀只剩最后一段（橙→金）→ 渲出来是**一片均匀的金**；
      //   ③ tAxis (=aBladeT) 是**整刀**归一化参数，刀身只占其中一段 ——
      //      实测 5 个刀型的刀身区间：straight [0.42,1.0] / kris [0.33,1.0] /
      //      machete [0.32,0.913] / bayonet [0.39,1.0]。直接当 0~1 用 → 渐变只走完
      //      色环的一小段（实测渲成"绿→黄"）。这里按实测区间重映射到刀身 0~1。
      /* ★ 2026-10-13（R12）「同卡不同局」：Fade 是纯轴向渐变，不吃上面的每局空间场，
       *   所以单独给一条**每局落点滑动** —— 色带整体沿刀身前后滑 ±0.14（约 8% 刀长）。
       *   色路、饱和度、明度一个字不改（用户明确要求「刀面颜色纯净」），
       *   只是"这一局的渐变从哪里开始"不同。 */
      float tb = clamp( ( tAxis - 0.38 + ( k3dRunPh - 0.5 ) * 0.14 ) / 0.60, 0.0, 1.0 );
      // 左右 ±0.10 的横向倾斜 → CSGO Fade 的斜切感（local.y 是刀宽方向，0.06~0.93）
      float g  = clamp( tb + ( local.y - 0.5 ) * 0.20, 0.0, 1.0 );

      // 7 档手工锚点色带：根 g=0 → 尖 g=1
      // ★ 二轮再调（第一轮渲出来粉段偏浅、尖端发奶）：
      //   全部锚点压深约 10~15%、粉段收窄到 深洋红→绯红（不再是浅粉），
      //   尖端由 #F8D44A 的浅金改成 #F2C935 的琥珀金 —— 明度峰值不再糊成一片奶白。
      vec3 fadeCol;
      if ( g < 0.18 ) {
        fadeCol = mix( vec3( 0.224, 0.114, 0.451 ), vec3( 0.396, 0.153, 0.667 ), g / 0.18 );
      } else if ( g < 0.36 ) {
        fadeCol = mix( vec3( 0.396, 0.153, 0.667 ), vec3( 0.647, 0.110, 0.502 ), ( g - 0.18 ) / 0.18 );
      } else if ( g < 0.52 ) {
        fadeCol = mix( vec3( 0.647, 0.110, 0.502 ), vec3( 0.816, 0.157, 0.310 ), ( g - 0.36 ) / 0.16 );
      } else if ( g < 0.68 ) {
        fadeCol = mix( vec3( 0.816, 0.157, 0.310 ), vec3( 0.898, 0.337, 0.094 ), ( g - 0.52 ) / 0.16 );
      } else if ( g < 0.84 ) {
        fadeCol = mix( vec3( 0.898, 0.337, 0.094 ), vec3( 0.929, 0.620, 0.078 ), ( g - 0.68 ) / 0.16 );
      } else {
        fadeCol = mix( vec3( 0.929, 0.620, 0.078 ), vec3( 0.949, 0.788, 0.208 ), ( g - 0.84 ) / 0.16 );
      }
      // 极轻的纹理高度调制（T01 素面近乎常量 → 预览几乎无感；有纹理的底材才有起伏）
      fadeCol *= ( 0.96 + 0.08 * clamp( height, 0.0, 1.0 ) );

      /* 签名增益 1.95（理由同 F04 分支上方那段注释）：Fade 是"整刀换色"级效果，
       * 本项目对"改颜色"的层有 K3D_FIN_COLOR=0.5 的全局折扣；用户这轮明确要求
       * "刀面颜色纯净一点点"，所以折扣后放回、并把上限抬到 0.90 ——
       * 刀面色相基本由 Fade 独占，只剩 10% 底材。 */
      color = mix( color, fadeCol, clamp( fade * 1.95 * K3D_FIN_COLOR, 0.0, 0.90 ) );
      rough = mix( rough, rough * 0.62, fade * 0.85 );
    }

    /* ★ 2026-10-13（R12）⑥ 多普勒大理石（Doppler Marble）—— 纹理无关的流动色块
     *   用户口径：「需要有决策卡组合能稳定复现 csgo 的多普勒效果」。
     *
     *   为什么原来出不来（R12 实测证据 bf_r12/doppler/多普勒探索_正面.jpg：
     *   8 材质 × 4 图案源 × 正/斜两机位 = 64 格**全是均匀色块**）：
     *     ①~④ 的形状**全部**来自 mask = mix( pattern, height, 0.35 )，
     *     而 pattern / height 来自 S3 纹理；S5 预览底是 T01 素面、明暗差极小
     *     → mask 近似常量 → ramp = mask*1.15 + colorPhase + fresnel*0.35
     *     只在四段调色板的一小段里游走 → 整把刀是"一片平涂"。
     *
     *   现在：另起一条**完全不依赖纹理**的双八度域扭曲场（与 data/textures.js 的
     *   T15「多普勒」程序化生成器同构：大尺度液态大理石），用 k3dApplyContrast
     *   拉出大块软边界，**直接走满四段色环**（pal0 → pal3）——
     *   这才是 CSGO 多普勒的"深底 + 大块流动彩斑"。
     *
     *   ── 为什么它"稳定可复现" ──
     *   色块**布局**只由「卡参数 + 刀坐标」决定，**完全不读 seeds**：
     *     · colorPhase（逐卡）→ 域偏移，换卡 = 换大理石走向
     *     · dopMeta.w（S1 材质锚点色相）→ 域偏移，换材质 = 换走向
     *   于是同一张卡**每局都是同一个多普勒**，只有调色板随 S1 材质派生
     *   （灰系材质走 D01~D04 锚点）→ 换材质 = 蓝宝石 / 红宝石 / 紫相位等不同变体，
     *   与 CSGO「同一套大理石纹、不同 Phase 只是配色比例不同」完全一致。
     *   ── 同时满足 R12「同卡不同局」──
     *   只加一个**极小**（±0.18 域单位）的每局偏移：色块微微挪动，
     *   但一眼仍是同一个效果，不破坏"稳定复现"。
     *
     *   ⚠ 零回归（逐像素可证）：gate 用 f3.z。
     *     实测（bf_r12 扫描 cardWrites）：全项目**仅 F08 的 4 张卡**写 iridescence；
     *     而 F10 一共只有 3 张卡（S5_14 / S5_20 / S5_21），**没有一张**写 iridescence
     *     → marble = 0 → 整个 if 跳过，逐像素与改动前一致。
     *   ⚠ 本注释里**不许出现反引号** —— GLSL 整体在 JS 模板字符串里，
     *     一个反引号就会提前结束模板、整个文件不执行（本项目 2026-10-07 真实事故）。
     *   ⚠ tools/geomviz.js 已于 2026-10-10 归档；若日后恢复该 CPU 同构工具，
     *     需同步移植本段（applyFinish 的 F10 分支）。 */
    float marble = clamp( f3.z, 0.0, 1.0 );
    if ( marble > 0.002 ) {
      /* ★★ 临时扫描旋钮（R12 调参期专用，定稿后删除）★★
       *   f1.y(temperature) = 长轴频率倍数，默认 5.0
       *   f1.z(hueShift)    = 横向频率倍数，默认 2.2
       *   f0.y(darkness)    = 饱和度增益，默认 1.35
       *   正式卡（S5_20）不写这三个键 → 走默认值。 */
      float kMFx = ( f1.y > 0.002 ) ? f1.y * 10.0 : 7.0;
      float kMFy = ( f1.z > 0.002 ) ? f1.z * 6.0 : 2.4;
      float kMSat = ( f0.y > 0.002 ) ? 1.0 + f0.y * 0.9 : 1.65;
      /* ── ① 大理石场：三频叠加 = 大块 + 中块 + 纤维 ──────────────────
       *   CSGO 多普勒的观感不是"2~3 个大色斑"，而是"大色块 + 内部纤维状纹路"，
       *   所以除了两个域扭曲八度，再叠一层**高频细纹**（fiber）当"石脉"。 */
      vec2 mp = vec2( local.x * kMFx + local.y * 0.9, local.y * kMFy );
      // 逐卡 / 逐材质的域偏移（决定"这套大理石从哪儿切开"）
      mp += vec2( colorPhase * 3.7 + dopMeta.w * 2.3, dopMeta.w * 1.7 + 1.3 );
      // 每局微移（±0.18 域单位 ≈ 色块挪动几个像素，满足"同卡不同局"但不破坏辨识）
      mp += vec2( ( k3dRunPh - 0.5 ) * 0.36, ( k3dRunPh - 0.5 ) * 0.24 );
      // 双八度域扭曲：第一层定大块走向，第二层把边界揉碎成"液态大理石"
      float mw1 = k3dFbm2( mp * 1.22 );
      mp += vec2( ( mw1 - 0.5 ) * 1.70, ( mw1 - 0.5 ) * 0.92 );
      float mw2 = k3dFbm2( mp * 0.94 + vec2( 5.2, 2.7 ) );
      // 纤维层：高频、只占小权重 —— 给大色块内部加"石头纹理"，避免"塑料渐变"感
      float mfib = k3dFbm2( mp * 3.30 + vec2( 11.3, 6.1 ) );
      float mv  = clamp( mw1 * 0.48 + mw2 * 0.38 + mfib * 0.14, 0.0, 1.0 );
      // 拉开对比 → 大块边界清晰（多普勒的斑块是"软边界 + 高对比"）
      mv = k3dApplyContrast( mv, 0.76 );

      /* ── ② 深底：先把刀身压到近黑 ──────────────────────────────────
       *   这是"像不像 CSGO"的第一分水岭。旧版直接在**亮金属底**上 mix 调色板
       *   → 无论怎么调都是"淡彩喷涂"。CSGO 多普勒的暗区就是接近黑，
       *   彩块只在"大理石的亮部"出现。marble 越大压得越深。 */
      color *= mix( 1.0, 0.26, marble );

      /* ── ③ 彩块：四段调色板全走满 + 高饱和 ───────────────────────── */
      float rampM = clamp( mv * 0.96 + colorPhase * 0.04, 0.0, 1.0 );
      vec3 dopM = k3dPalette4( pal0, pal1, pal2, pal3, rampM );
      // 饱和度抬、明度压 → 深色宝石而不是"淡彩"
      dopM = k3dSatVal( dopM, dopMeta.y * kMSat, dopMeta.z * 0.82 );
      /* 覆盖率随 mv 摆动：mv 低的区域**保持深底**（几乎不上色），
       * mv 高的区域上满饱和色 → 这才是"深底 + 彩色流动块"的强对比。
       * 1.9 增益理由同 F04 / Fade 分支：K3D_FIN_COLOR=0.5 是"改颜色"层的全局折扣，
       * 多普勒本身是"整刀换色"级效果，这里折扣后放回来。 */
      float cover = smoothstep( 0.30, 0.86, mv );
      float wMix = clamp( marble * cover * strength * 1.9 * K3D_FIN_COLOR, 0.0, 0.90 );
      color = mix( color, dopM, wMix );
      // 深色边界线：大理石块之间压一道暗脉（CSGO 多普勒的"黑线"）
      float seam = 1.0 - smoothstep( 0.02, 0.13, abs( mv - 0.52 ) );
      color *= ( 1.0 - 0.55 * seam * marble );
      // 视角虹彩叠加：彩块内部再吃一点 fresnel（转刀时色相游走 = "颜色跟着角度走"）
      float fm = pow( clamp( fresnel, 0.0, 1.0 ), max( 0.6, fresPow * 0.85 ) );
      color += dopM * fm * fresInt * marble * 0.34 * K3D_FIN_COLOR;
      // 彩块处略光洁，但保留金属底反射（不要糊成镜面高光）
      rough = mix( rough, rough * 0.84, marble * cover );
    }
  } else if ( finId == 11 ) {
    // F11 喷砂磨砂
    //   ★ 2026-10-08（S5 逐卡可辨性）f1.w（coat）→ 磨砂色调。
    //   为什么需要：F11 原先**只改粗糙度**（下面第一行），颜色只做 5% 的明度微调，
    //   于是 S5 里三张 F11 卡（S5_02 水淬 / S5_08 砂淬 / S5_12 深淬，只有 amount 不同）
    //   在整把刀上实测 meanΔ 只有 0.27（0~441 尺度）—— 玩家完全看不出是三张不同的卡。
    //   为什么用 f1.w 而不是新加一个 uniform：f1.w 就是 coat，F11 此前**完全不读**它、
    //   默认值为 0，所以 mix(v, v*tone, 0) 是恒等变换 —— **没写这个字段的 F11 卡
    //   （其它阶段）逐位不受影响**，零回归风险。（F09 也读 f1.w，但两者分支互斥。）
    //   ⚠ 改这里必须同步改 tools/geomviz.js 的 applyFinish F11 分支（CPU 同构移植）。
    //   ⚠ 本注释里**不许出现反引号** —— GLSL 整体在 JS 模板字符串里，
    //     一个反引号就会提前结束模板、整个文件不执行（本项目 2026-10-07 真实事故）。
    rough = mix( rough, clamp( rough + 0.55, 0.0, 1.0 ), amount );
    color = color * ( 1.0 - 0.05 * amount );
    float f11Coat = clamp( f1.w, 0.0, 1.0 );
    vec3 f11Tone = vec3( 0.84, 0.92, 1.06 );
    color = mix( color, color * f11Tone, f11Coat );
  } else {
    // F12 动态边缘光：Fresnel 边缘 + 空间流动，只在边缘出现
    float fresPow = max( 0.2, f2.z );
    float f = pow( clamp( fresnel, 0.0, 1.0 ), fresPow );
    float flowSpeed = max( 0.0, f3.y );
    float flow = k3dFbm2( vec2( local.x * 3.4 - local.y * 1.2, local.y * 2.6 ) + seeds.z * 9.0 );
    float gate = f * amount * ( 0.65 + 0.35 * flow ) * mix( 0.5, 1.0, flowSpeed + 0.5 );
    glow += length( fColor ) * gate * 0.9;
    color += fColor * gate * 0.35 * K3D_FIN_COLOR;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * ★★ 2026-10-13（R12）② 手工微差 —— 把"每局不同"补齐到**纯幅度类**工艺
   * ──────────────────────────────────────────────────────────────────────
   *   为什么要它：上面 ① 的花纹落点重映射只对"有空间图案"的工艺有效。
   *   F01 精抛光 / F02 镜面抛光 / F04 发黑氧化 / F11 喷砂磨砂 只改
   *   roughness 与明度，**没有任何空间图案可以随机** —— 探针确认它们的 uniform
   *   跨局逐位相同，如果不补这一条，它们在"同卡不同局"上仍然是死的。
   *
   *   形态：一条低频 fbm 云影（每局相位不同），乘在 roughness 与明度上。
   *   幅度刻意很小 —— roughness 增量按当前值缩放（抛光面上绝对值更小）、
   *   明度 ±3%：在镜面上是一层淡淡的锻打云影，不会把镜面变成哑光。
   *   为什么是"物理诚实"的：真手工锻造的每一把刀，抛光后的残余应力/晶粒
   *   分布都不一样，正是一层很淡的低频不均。这比硬塞噪点更符合本项目语言。
   *
  *   幅度乘 amount：没写 amount / amount=0 时是恒等变换（零回归）。
   *   只由 uSeeds 驱动 → 同 seed 复现、跨局必不同。
   *   ⚠ 这里用的是 k3dAmt0（卡的**原始** amount），不是上面被每局场乘过的 amount ——
   *     否则两处每局扰动会互相叠加、幅度失控。
   * ══════════════════════════════════════════════════════════════════════ */
  float k3dJit = k3dFbm2( local.xy * 3.30 + vec2( seeds.z * 9.7, seeds.w * 7.3 ) ) - 0.5;
  float k3dJw  = clamp( k3dAmt0, 0.0, 1.0 );
  rough = clamp( rough + k3dRunG * ( 0.055 + 0.26 * rough ) * k3dJw, 0.02, 1.0 );
  color = color * ( 1.0 + k3dRunG * 0.17 * k3dJw );
}

// ══════════════════════════════════════════════════════════════════════════
// 叠加层（overlay）—— 不占 uFinId 槽位，作用在「基础工艺」之上
//
//   为什么需要：阶段 5 淬火「表面处理在此定型」= 基础 finish（uFinId，唯一持有人）；
//   阶段 6 回火「色泽与释压」= 色相/温度叠加；阶段 7 开刃「刃线光效」= 边缘光叠加。
//   旧实现把三者都写进 finishId，导致 S7 恒定覆盖 S5/S6（48 张卡视觉作废）。
//
//   tmp / eg 的 .w 是开关位（0 = 该层未启用，直接 early-out，零开销）
// ══════════════════════════════════════════════════════════════════════════

// ── 回火层（阶段 6）：★ 2026-10-13 重写为**薄膜干涉式彩虹金属光泽** ──
//    用户口径：「S6 不应该是直接改变刀身颜色，而应该是部分位置/全刀加入彩虹金属光泽
//    （可以是不同色系的彩虹光泽），呈现细腻的多色反射，越高级的卡效果越好。」
//
//    旧实现 = k3dPalette4 热色带**整体染色**（color = mix(color, color*0.55 + temper*0.62, a)）：
//      逐像素把刀身刷成 黄→紫→蓝 的渐变 —— 等于换了个颜色，且完全没有视角相关性，
//      于是 24 张卡里"同温度档"的几张看上去就是同一把刀。
//
//    新实现 = 三层叠加，全程**乘进**刀身色而不是替换它：
//      ① 覆盖 gate：低频云雾/脊线 mask（+ 纹理），cover = 1 才通铺整刀。
//         本工程的 cover 由逐卡配方给：只有最高档给 1.0，其余都是局部虹彩。
//      ② 干涉相位：视角(fresnel) 主导 + 沿刀轴向 + 空间低频漂移 + 卡自己的色系族。
//         视角主导是关键 —— 转动刀身时色带沿色环流动，这才是「细腻的多色反射」。
//      ③ 金属化合成：mix 上限 0.62，彩虹区粗糙度压低（油膜比裸钢更光洁），
//         **金属度完全不动**（守住「工艺不能改变基础金属是谁」这条硬约束）。
//
//    参数：
//      tm = ( temperature, hueShift, amount, on )   卡数据 variants.temper
//      ir = ( family, cover, bands, strength )      data/temperIridescence.js 逐卡配方
//      flow = 空间相位漂移 0~1
//      tier = 当前构筑稀有档 0~5（越高级：色带越密、追加第二层互补色、亮部更足）
//
//    ⚠ 本段注释里**一个反引号都不能有** —— 整段 GLSL 内联在 JS 模板字符串里，
//      一个反引号就会提前结束模板、整个文件不执行（本项目 2026-10-07 真实事故）。
void k3dApplyTemper( vec3 local, float tAxis, vec3 pat, vec4 tm, vec4 ir, float flow,
                     float fresnel, vec4 seeds, float tier,
                     inout vec3 color, inout float rough, inout float glow )
{
  float on = tm.w * clamp( tm.z, 0.0, 1.0 );        // amount 是卡数据里的总强度闸门
  float strength = clamp( ir.w, 0.0, 1.0 ) * on;
  if ( strength <= 0.002 ) return;

  // ── ① 覆盖 gate：cover = 1 → 整刀；cover 低 → 只在云雾/脊线/纹理处浮出 ──
  float cloud = k3dFbm2( local.xy * 3.05 + seeds.y * 13.0 );
  float ridge = k3dRidge2( local.xy * 6.40 + seeds.x * 7.0 );
  float shape = clamp( cloud * 0.46 + ridge * 0.30 + clamp( pat.x, 0.0, 1.0 ) * 0.24, 0.0, 1.0 );
  float cover = clamp( ir.y, 0.0, 1.0 );
  float gate = clamp( mix( smoothstep( 0.52, 0.90, shape ), 1.0, cover ), 0.0, 1.0 );

  // ── ② 视角项：薄膜干涉的核心 —— 斜看(fresnel→1) 时相位走得远、亮部更足 ──
  float view = clamp( fresnel, 0.0, 1.0 );
  float viewW = pow( view, 1.15 ) * 0.85 + view * 0.15;

  // ── ③ 干涉相位：视角主导 + 轴向 + 空间漂移 + 色系族 ──
  float fam = fract( ir.x + tm.y * 0.25 );           // 色系族（卡的 hueShift 做微调）
  float bands = max( 0.60, ir.z );
  float drift = k3dFbm2( local.xy * 2.40 + seeds.z * 9.0 ) - 0.5;
  float phase = viewW * ( 0.95 + 0.55 * bands )
              + tAxis * ( 0.30 + 0.45 * fract( fam * 5.0 ) )
              + drift * clamp( flow, 0.0, 1.0 ) * 1.10
              + clamp( tm.x, 0.0, 1.0 ) * 0.55    // 温度再做一档相位（同色系族的两张卡也不同）
              + fam;
  float ramp = fract( phase * bands * 0.5 + fam );
  vec3 rainbow = k3dHsv2Rgb( vec3( ramp, 0.78, 1.0 ) );
  // 稀有档 ≥3 追加第二层：色环错开 1/3 → 「多色反射」而不是单条色带
  float duo = clamp( ( tier - 2.0 ) / 3.0, 0.0, 1.0 );
  if ( duo > 0.01 ) {
    vec3 alt = k3dHsv2Rgb( vec3( fract( ramp + 0.3333333 ), 0.70, 1.0 ) );
    rainbow = mix( rainbow, alt, duo * 0.50 );
  }
  rainbow = k3dSatVal( rainbow, 0.80, 1.0 );

  // ── ④ 合成：乘进刀身色（保金属本色）+ 视角相关的镜面提亮 ──
  /* ★★ 2026-10-13 第一版实测修正（非常重要，别再踩）：
   *   第一版把**幅度**也乘了 viewW（= f(fresnel)）。但刀身主平面正对镜头，fresnel≈0
   *   → viewW≈0 → 幅度≈0；只有极掠射的棱线才有一点。实测 24 张 S6 卡渲出来
   *   全是"一块深灰近黑的刀"，与"没选卡"几乎一致 —— 虹彩完全读不出来。
   *   正确做法：**幅度不吃 viewW**（薄膜干涉在正面本来就有色），
   *   viewW 只负责 ① 推动色环相位（转动刀身时颜色流动 = 细腻的多色反射）
   *              ② 掠射角额外提亮。 */
  /* ★ 2026-10-13 第二版：第一版幅度偏保守（w 上限 ≈0.57、mix 系数 1.42），
   *   实测刀身裁切后 avgSat 只有 0.098 / hueSpread 151°，跨卡差异被压平到
   *   minPairDiff 2.39 —— 比"改动前"的整刀纯色（avgSat 0.159）还平，
   *   玩家仍会觉得"S6 的卡差不多"。这里把幅度顶起来（w 上限 0.85、
   *   mix 系数 1.50、加法项同步上调），让虹彩真正「读得出来」，
   *   同时因为仍是 mix 进刀身本色（不是覆盖），不会退回"整刀刷色"的老毛病。 */
  float w = clamp( gate * strength * 1.35, 0.0, 0.85 );
  /* ★★ 2026-10-16（用户：「S6 的效果把刀身弄得很脏，应该只要保留颜色变化的光泽质感」）
   *
   *   原式「color * rainbow * 1.50 + rainbow * 0.24」会把**明度**一起乘下去：
   *   rainbow = HSV(hue, sat 0.80, val 1.0) → 各通道落在 0.20~1.00 之间，
   *   白刀底（≈1.0）乘完直接掉到 0.30~1.50 —— 那些 0.30 的通道就是玩家看到的
   *   "一块块深色脏斑"（低档卡 cover 0.30~0.55，脏斑还成片）。
   *
   *   修正只针对「亮底被乘暗」这一条，深底行为保持不变：
   *     · 乘法项 → **保明度**的色相偏移 tint = rainbow · (lumC / lumR)：
   *       与当前颜色同明度 → 白底上只剩"颜色变化"，不再变脏；
   *       深底 lumC 本来就低 → tint 同步变暗，等价于原来的乘法项。
   *     · 加法项 → 只补**暗底**（× (1-lumC)）：深底（M06 黑曜钢 #2c3037）仍读得出虹彩，
   *       亮底几乎不再叠一层色，避免"白刀糊色"。
   *   ⚠ 改的是注入进 bladeSkin hook 的 GLSL —— 已同步给 bladeSkin signature 加版本号
   *     （见 bladeSkinShader.js 的 'bladeSkin:v2'），否则 three 会复用旧 program、静默不改画面。 */
  float lumC = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  float lumR = max( 0.02, dot( rainbow, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec3 tint = rainbow * ( lumC / lumR );
  color = mix( color, tint * 1.10, w );
  color += tint * ( 1.0 - clamp( lumC, 0.0, 1.0 ) ) * gate * strength * ( 0.10 + 0.045 * tier ) * ( 0.42 + 0.58 * viewW );
  // 虹彩区更光洁（薄膜比裸钢平），但绝不动金属度
  rough = clamp( rough - gate * strength * 0.20, 0.02, 1.0 );
  // 最高两档给一点极淡的自发光，让「多色反射」在暗部也读得出来（总上限仍由 mapFragment 统一截断）
  glow += gate * strength * viewW * 0.10 * max( 0.0, tier - 3.0 );
}

// ── 调校层（阶段 9）：色泽微调 + 幻彩增强。独立槽位，不占 uFinId ──
//    ★ 为什么单独一层：S9 的「幻彩调校」需要 colorPhase / iridescence，
//      但这两键原本写在 variants.finish（S5 淬火槽位）里；
//      S4 签名锁定时 recipe.js 会把整个 finish 变体组清空，于是 S9 的选择被连带吞掉。
//      按项目约定「新增视觉通道 → 加独立槽位（叠加层优先）」，这里开 tune 层。
//    tn = ( colorPhase, iridescence, amount, on )
void k3dApplyTune( vec3 local, vec4 tn, vec4 seeds, inout vec3 color )
{
  float amount = tn.z * tn.w;
  if ( amount <= 0.002 ) return;
  // ① 色泽相位：沿空间做低频色相偏移，形成"同一把刀不同区域颜色流转"的观感
  float phase = clamp( tn.x, 0.0, 1.0 );
  float wave  = k3dFbm2( local.xz * 2.1 + local.y * 1.4 + seeds.x * 11.0 );
  float shift = ( phase - 0.5 ) * 0.30 * amount * ( 0.45 + 0.55 * wave );
  color = k3dHueShift( color, shift );
  // ② 幻彩增强：按相位给两段互补色镀上极淡的干涉色（不覆盖基础色相）
  float irid = clamp( tn.y, 0.0, 1.0 ) * amount;
  if ( irid > 0.002 ) {
    vec3 tintA = k3dPalette4( vec3( 0.35, 0.72, 0.95 ), vec3( 0.62, 0.45, 0.92 ),
                              vec3( 0.95, 0.55, 0.42 ), vec3( 0.48, 0.88, 0.70 ),
                              clamp( phase + wave * 0.18, 0.0, 1.0 ) );
    color = mix( color, color * 0.82 + tintA * 0.30, clamp( irid * 0.85, 0.0, 1.0 ) );
  }
}

// ── 开刃层（阶段 7）：Fresnel 边缘光 + 空间流动（等价原 F12 动态边缘光）──
//    eg = ( amount, fresnelPower, flowSpeed, on )
void k3dApplyEdgeGlow( vec3 local, vec4 eg, vec3 egColor, vec4 seeds, float fresnel,
                       inout vec3 color, inout float glow )
{
  float amount = eg.x * eg.w;
  if ( amount <= 0.002 ) return;
  // ★ fresnel 指数收敛：pow(f, 2.6) 时只有极掠射角才亮，正面看几乎为零。
  //   这里对 fresnel 先做一次增强再取幂，让刃线在**正常观察角度**也有可见宽度。
  //   ★★ 2026-10-13（S7 小幅调整）：指数系数 0.55 → 0.38、前置放大 1.25 → 1.45。
  //   为什么必须动这里：卡的 fresnelPower（eg.y）是**从普通档 2.0 递增到神话档 5.0**，
  //   而 fresPow = eg.y * 0.55 把这理解成"越高档刃线越锐"——于是**越高级的卡刃线越窄、
  //   越看不见**，稀有度在这条通道上是反的。0.38 把指数压到 0.76~1.90，
  //   高档卡终于有一条看得见的刃线，低档卡同时被 1.45 的放大补上一点宽度。
  float fresPow = max( 0.2, eg.y * 0.38 );
  float f = pow( clamp( fresnel * 1.45, 0.0, 1.0 ), fresPow );
  float flowSpeed = max( 0.0, eg.z );
  float flow = k3dFbm2( vec2( local.x * 3.4 - local.y * 1.2, local.y * 2.6 ) + seeds.z * 9.0 );
  float gate = f * amount * ( 0.65 + 0.35 * flow ) * mix( 0.5, 1.0, flowSpeed + 0.5 );
  /* ★ 幅度：0.9/0.35 → 1.5/0.85。
   *   实测（旧值）amount 0→1.0 刀身平均色相只动 1~4°、饱和度动 0.005 → 玩家看不出选没选开刃卡。
   *   原因：① 边缘只覆盖极窄的 vEdge 掠射角，像素占比太小；
   *        ② color += egColor * gate * 0.35 之后又被 col*1.30 摊薄。
   *   修法：把「着色」（col）权重提到 0.85、「自发光」（glow）提到 1.5，
   *        让刃线在正常视角下就能读出来，同时仍由 fresnel 控制不糊成一片。
   *
   * ★★ 2026-10-08：自发光项**必须归一化颜色**，不能直接乘「length(egColor)」。
   *   原来的写法是「glow += length( egColor ) * gate * 1.5」，而 length() 把
   *   **颜色本身的明度**混进了亮度：S7 的 24 张卡 tintHex 从 #5f9fff（|c| = 1.236）
   *   到 #f0f8ff（|c| = 1.683），于是**同样大的一档开刃，浅色卡的自发光强 1.36×**，
   *   刃线的"亮不亮"取决于"你挑的色调浅不浅"，而不是 fresnel 与 amount。
   *   （这正是"**调色板的明度不该泄漏到发光强度**"这条通用原则的实例。）
   *   修法：用 normalize( egColor ) —— 长度恒为 1，发光只由 gate 决定，
   *   **每个色调的发光总能量完全相同**；色相仍然由下一行的「color += egColor * gate * 0.85」
   *   逐字提供（那里用的是**原始色**，不走归一化 —— 着色必须保留色相的浓淡关系）。
   *   改这一行不会影响"有没有自发光"的判定：tools/verify_cards.js 查的是
   *   glow 这一行在源码里**是否存在**（它断言的是"每张卡都有自发光通道"，不是数值），
   *   所以断言仍然成立，不需要放宽阈值。
   *   ⚠ 本段注释里**一个反引号都不能有** —— 这段 GLSL 整体内联在 JS 模板字符串里，
   *     一个反引号就会提前结束模板（第一版就是这么把 finishes.js 写崩的，
   *     check_syntax 报 "Unexpected identifier 'length'"）。用「」代替。 */
  glow += length( normalize( egColor ) ) * gate * 1.5;
  color += egColor * gate * 0.85;
}

`;

  K3D.shaderFinishes = { common: funcs };

export const shaderFinishes = __reg.proxy.shaderFinishes;
