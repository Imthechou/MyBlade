/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/shader/patterns.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../_registry.js';
const K3D = __reg.proxy;

  // ============================================================
  // 12 种刀身纹理
  // ============================================================

  const funcs = `

/* ============================================================
 * T01 素面
 * 精密金属基础表面
 * ============================================================ */

vec3 k3dTexT01(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d = k3dTexDomain(L, p0);

  float micro =
    k3dNoise3(
      d * 42.0 +
      sd.x * 20.0
    );

  float micro2 =
    k3dNoise3(
      d * 84.0 +
      sd.y * 31.0
    );

  float pattern =
    0.5
    + (micro - 0.5) * 0.08
    + (micro2 - 0.5) * 0.04;

  float rough =
    (micro - 0.5)
    * 0.20
    * p2.w;

  return vec3(
    pattern,
    rough,
    0.5 + (micro - 0.5) * 0.04
  );
}


/* ============================================================
 * T02 拉丝
 *
 * 保留原版
 * ============================================================ */

vec3 k3dTexT02(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float ang =
    p1.w * 3.14159265 / 180.0;

  vec2 dirV =
    vec2(
      cos(ang),
      sin(ang)
    );

  float along =
    dot(d.xy, dirV);

  float across =
    dot(
      d.xy,
      vec2(
        -dirV.y,
        dirV.x
      )
    );

  float dens =
    max(1.0, p1.z)
    * 0.05;

  float stretch =
    mix(
      0.25,
      3.0,
      p6.w
    );

  float f =
    k3dFbm2(
      vec2(
        across * dens * 1.5,
        along * stretch * 0.4
      )
      + sd.x * 13.0
    );

  float f2 =
    k3dNoise2(
      vec2(
        across * dens * 4.0,
        along * stretch * 0.2
      )
      + sd.y * 9.0
    );

  float f3 =
    k3dFbm2(
      vec2(
        across * dens * 0.5,
        along * stretch * 0.8
      )
      + sd.z * 7.0
    );

  float pattern =
    k3dApplyContrast(
      mix(
        mix(f, f2, 0.4),
        f3 * 0.5 + 0.5,
        0.3
      ),
      p1.y
    );

  float rough =
    (pattern - 0.5)
    * 1.0
    * p2.w;

  return vec3(
    pattern,
    rough,
    pattern
  );
}


/* ============================================================
 * T03 锻打纹 V4
 *
 * 视觉目标：
 *
 * 1. 随机锤击坑
 * 2. 锤坑外围轻微隆起
 * 3. 多尺度锻打痕迹
 * 4. 金属流向
 * 5. 不规则锤击密度
 * 6. 微观金属颗粒
 *
 * 不再使用规则排列的圆形锤点。
 * ============================================================ */

vec3 k3dTexT03(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);


  // ------------------------------------------------------------
  // 1. 锻造空间
  // ------------------------------------------------------------

  vec2 q =
    d.xy
    * max(
        3.0,
        p3.w * 0.78
      );


  // ------------------------------------------------------------
  // 2. 随机旋转
  // ------------------------------------------------------------

  float ang =
    0.32
    + sd.w * 1.25;

  mat2 R =
    mat2(
      cos(ang),
      -sin(ang),

      sin(ang),
      cos(ang)
    );

  q =
    R * q;


  // ------------------------------------------------------------
  // 3. 大尺度空间扭曲
  //
  // 模拟金属被反复锻打后的流动
  // ------------------------------------------------------------

  vec2 warp;

  warp.x =
    k3dFbm2(
      d.xy * 1.35
      + sd.x * 2.0
    )
    - 0.5;

  warp.y =
    k3dFbm2(
      d.xy * 1.75
      + sd.y * 3.0
    )
    - 0.5;

  q +=
    warp
    * mix(
        0.16,
        0.62,
        k3dSaturate(p0.w)
      );


  // ------------------------------------------------------------
  // 4. 金属锻造流向
  // ------------------------------------------------------------

  float flow0 =
    k3dFbm2(
      vec2(
        q.x * 0.55,
        q.y * 1.35
      )
      + sd.z * 2.0
    );

  float flow1 =
    k3dFbm2(
      vec2(
        q.x * 1.15,
        q.y * 0.48
      )
      + sd.w * 4.0
    );

  float flow =
    flow0 * 0.72
    + flow1 * 0.28;


  // ------------------------------------------------------------
  // 5. 第一层主锤印
  // ------------------------------------------------------------

  float cidA;

  float distA =
    k3dVoronoi2(
      q * vec2(
        1.05,
        0.92
      )
      + sd.xy * 5.0,
      cidA
    );


  // ------------------------------------------------------------
  // 6. 锤印尺寸随机化
  // ------------------------------------------------------------

  float sizeA =
    mix(
      0.52,
      0.86,
      k3dFbm2(
        q * 1.8
        + sd.z * 7.0
      )
    );


  // ------------------------------------------------------------
  // 7. 主锤坑
  // ------------------------------------------------------------

  float dentA =
    1.0
    -
    smoothstep(
      0.08,
      sizeA,
      distA
    );


  // ------------------------------------------------------------
  // 8. 锤坑边缘隆起
  // ------------------------------------------------------------

  float rimA =
    smoothstep(
      sizeA * 0.46,
      sizeA * 0.72,
      distA
    )
    *
    (
      1.0
      -
      smoothstep(
        sizeA * 0.72,
        sizeA * 0.98,
        distA
      )
    );


  // ------------------------------------------------------------
  // 9. 第二层细小锤痕
  // ------------------------------------------------------------

  float cidB;

  float distB =
    k3dVoronoi2(
      q * 2.55
      + sd.zw * 6.0,
      cidB
    );

  float dentB =
    1.0
    -
    smoothstep(
      0.05,
      0.30,
      distB
    );


  // ------------------------------------------------------------
  // 10. 控制小锤痕出现区域
  // ------------------------------------------------------------

  float smallMask =
    smoothstep(
      0.30,
      0.72,
      k3dFbm2(
        q * 0.75
        + sd.y * 9.0
      )
    );

  dentB *=
    smallMask;


  // ------------------------------------------------------------
  // 11. 锻打力度不均匀
  // ------------------------------------------------------------

  float breakup =
    k3dFbm2(
      q * 1.95
      + sd.x * 11.0
    );

  dentA *=
    mix(
      0.48,
      1.0,
      breakup
    );

  rimA *=
    mix(
      0.32,
      0.95,
      breakup
    );


  // ------------------------------------------------------------
  // 12. 微观锻打颗粒
  // ------------------------------------------------------------

  float micro =
    k3dFbm2(
      q * 8.5
      + sd.y * 17.0
    );

  float grain =
    k3dNoise3(
      d * 42.0
      + sd.w * 29.0
    );


  // ------------------------------------------------------------
  // 13. 最终颜色 / Pattern
  // ------------------------------------------------------------

  float pattern =
      0.50

    + (flow - 0.5)
      * 0.18

    - dentA
      * 0.25

    - dentB
      * 0.10

    + rimA
      * 0.16

    + (micro - 0.5)
      * 0.055

    + (grain - 0.5)
      * 0.018;


  pattern =
    k3dApplyContrast(
      k3dSaturate(pattern),
      max(
        0.82,
        p1.y
      )
    );


  // ------------------------------------------------------------
  // 14. Roughness
  //
  // 锤坑更粗糙
  // 边缘稍微光滑
  // ------------------------------------------------------------

  float rough =
    (
        0.06

      + dentA
        * 0.78

      + dentB
        * 0.36

      + rimA
        * 0.22

      + (micro - 0.5)
        * 0.10
    )
    * p2.w;


  // ------------------------------------------------------------
  // 15. Height
  //
  // 真正形成锻打凹凸
  // ------------------------------------------------------------

  float height =
    clamp(
        0.52

      - dentA
        * 0.40

      - dentB
        * 0.12

      + rimA
        * 0.19

      + (flow - 0.5)
        * 0.08,

      0.0,
      1.0
    );


  return vec3(
    pattern,
    rough,
    height
  );
}


/* ============================================================
 * T04 大马士革
 *
 * 保留原版
 * ============================================================ */

vec3 k3dTexT04(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float scale =
    max(
      0.3,
      p0.x
    );

  float warpAmt =
    max(
      0.0,
      p1.x
    );

  float contrast =
    max(
      0.0,
      p1.y
    );

  float roughStr =
    max(
      0.0,
      p2.w
    );

  vec2 q =
    k3dWarp2(
      d.xy * scale
      + sd.x * 7.0,
      warpAmt,
      sd.y
    );

  float darkLayer =
    k3dFbm2(
      q * 2.0
      + sd.z * 5.0
    );

  darkLayer =
    k3dApplyContrast(
      darkLayer,
      contrast
    );

  float lightLayer =
    k3dFbm2(
      q * 4.5
      + sd.w * 3.0
    );

  lightLayer =
    k3dApplyContrast(
      lightLayer,
      contrast * 0.7
    );

  float pattern =
    mix(
      darkLayer,
      lightLayer,
      0.45
    );

  float grain =
    k3dFbm2(
      q * 18.0
      + sd.x * 41.0
    );

  grain =
    (grain - 0.5)
    * 0.20;

  pattern =
    clamp(
      pattern + grain,
      0.0,
      1.0
    );

  float rough =
    (0.5 - pattern)
    * 1.2
    * roughStr;

  return vec3(
    pattern,
    rough,
    pattern
  );
}


/* ============================================================
 * T05 水波纹
 *
 * 保留原版
 * ============================================================ */

vec3 k3dTexT05(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float freq =
    max(
      0.5,
      p5.w
    );

  vec2 w =
    k3dWarp2(
      d.xy * freq
      + sd.x * 4.0,
      p0.w * 0.9,
      sd.y
    );

  float r =
    length(
      (w.xy - 0.5)
      * vec2(
        1.0,
        2.2
      )
    );

  float ring =
    sin(
      r * 18.0
      + w.x * 5.0
    );

  float line =
    sin(
      (w.x * 2.4
      + w.y * 1.1)
      * 22.0
    );

  float wobble =
    sin(
      r * 8.0
      + w.y * 3.0
      + sd.x * 2.0
    )
    * 0.3;

  float pattern =
    k3dApplyContrast(
      mix(
        ring,
        line,
        0.45
      )
      * 0.5
      + 0.5
      + wobble,
      p1.y
    );

  float rough =
    (
      0.5
      - abs(ring)
    )
    * 0.9
    * p2.w;

  return vec3(
    pattern,
    rough,
    pattern
  );
}


/* ============================================================
 * T06 大理石纹
 *
 * 保留原版
 * ============================================================ */

vec3 k3dTexT06(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float cellScale =
    max(
      0.5,
      p3.w
    );

  vec2 q =
    k3dWarp2(
      d.xy * cellScale
      + sd.x * 8.0,
      mix(
        0.15,
        1.2,
        p0.w
      ),
      sd.y
    );

  float cid;

  float f1 =
    k3dVoronoi2(
      q,
      cid
    );

  float veins =
    1.0
    -
    smoothstep(
      0.0,
      max(
        0.04,
        p0.w * 0.4 + 0.15
      ),
      abs(
        f1 - 0.5
      )
    );

  float grain =
    k3dFbm2(
      q * 6.0
      + sd.y * 17.0
    );

  float pattern =
    k3dApplyContrast(
      mix(
        grain,
        mix(
          cid,
          1.0 - veins,
          0.65
        ),
        0.5
      ),
      p1.y
    );

  float rough =
    (veins - 0.35)
    * 1.2
    * p2.w;

  return vec3(
    pattern,
    rough,
    clamp(
      mix(
        grain,
        veins,
        0.6
      ),
      0.0,
      1.0
    )
  );
}


/* ============================================================
 * T07 几何纹 V4
 *
 * 高级机械雕纹
 *
 * 视觉结构：
 *
 * 主几何面
 * ↓
 * 倒角
 * ↓
 * 沟槽
 * ↓
 * 第二层细雕纹
 * ↓
 * 局部断裂 / 磨损
 *
 * 不再是简单的黑白几何贴图。
 * ============================================================ */

vec3 k3dTexT07(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);


  // ------------------------------------------------------------
  // 1. 几何尺度
  // ------------------------------------------------------------

  float gs =
    max(
      2.0,
      p4.x * 0.62
    );


  // ------------------------------------------------------------
  // 2. 沟槽宽度
  // ------------------------------------------------------------

  float width =
    clamp(
      p4.y * 0.58,
      0.012,
      0.14
    );


  // ------------------------------------------------------------
  // 3. 几何类型
  //
  // 0 = 六边
  // 1 = 三角
  // 2 = 菱格
  // 3 = 工业网格
  // ------------------------------------------------------------

  int tile =
    int(
      p6.x + 0.5
    );


  // ------------------------------------------------------------
  // 4. 基础网格
  // ------------------------------------------------------------

  vec2 q =
    d.xy * gs
    + sd.xy * 1.7;


  // ------------------------------------------------------------
  // 5. 轻微 Warp
  //
  // 保留机械感，但避免贴图复制感
  // ------------------------------------------------------------

  q =
    k3dWarp2(
      q,
      mix(
        0.018,
        0.14,
        k3dSaturate(p0.w)
      ),
      sd.z
    );


  vec2 f =
    fract(q)
    - 0.5;

  vec2 a =
    abs(f);

  float shape;


  // ------------------------------------------------------------
  // 6. 六边形
  // ------------------------------------------------------------

  if (tile == 0) {

    shape =
      max(
        a.y * 1.70,
        a.x + a.y * 0.58
      );


  // ------------------------------------------------------------
  // 7. 三角形
  // ------------------------------------------------------------

  } else if (tile == 1) {

    shape =
      max(
        a.x + a.y,
        a.y * 1.52
      );


  // ------------------------------------------------------------
  // 8. 菱格
  // ------------------------------------------------------------

  } else if (tile == 2) {

    shape =
      a.x + a.y;


  // ------------------------------------------------------------
  // 9. 工业网格
  // ------------------------------------------------------------

  } else {

    shape =
      max(
        a.x,
        a.y
      )
      * 1.72;
  }


  // ------------------------------------------------------------
  // 10. 几何主体
  // ------------------------------------------------------------

  float face =
    1.0
    -
    smoothstep(
      0.26,
      0.46,
      shape
    );


  // ------------------------------------------------------------
  // 11. 外侧倒角
  // ------------------------------------------------------------

  float bevelOuter =
    smoothstep(
      0.16,
      0.29,
      shape
    );


  // ------------------------------------------------------------
  // 12. 内侧倒角
  // ------------------------------------------------------------

  float bevelInner =
    1.0
    -
    smoothstep(
      0.29,
      0.40,
      shape
    );


  float bevel =
    bevelOuter
    * bevelInner;


  // ------------------------------------------------------------
  // 13. 几何沟槽
  // ------------------------------------------------------------

  float groove =
    1.0
    -
    smoothstep(
      width,
      width + 0.045,
      abs(
        shape - 0.405
      )
    );


  // ------------------------------------------------------------
  // 14. 第二层细几何
  // ------------------------------------------------------------

  vec2 q2 =
    q * 2.35
    + vec2(
      0.31,
      0.17
    );

  vec2 f2 =
    abs(
      fract(q2)
      - 0.5
    );

  float mini =
    f2.x
    + f2.y;

  float microEdge =
    1.0
    -
    smoothstep(
      0.30,
      0.40,
      mini
    );


  // ------------------------------------------------------------
  // 15. 细几何只在部分区域出现
  // ------------------------------------------------------------

  float microMask =
    smoothstep(
      0.43,
      0.78,
      k3dFbm2(
        d.xy * 2.4
        + sd.w * 9.0
      )
    );

  microEdge *=
    microMask
    * 0.38;


  // ------------------------------------------------------------
  // 16. 局部断裂
  //
  // 防止整个刀面像无限复制的瓷砖
  // ------------------------------------------------------------

  float breakup =
    k3dFbm2(
      d.xy * gs * 0.34
      + sd.x * 8.0
    );

  float broken =
    smoothstep(
      0.36,
      0.74,
      breakup
    );


  groove *=
    mix(
      0.40,
      1.0,
      broken
    );


  // ------------------------------------------------------------
  // 17. 倒角轻微随机化
  // ------------------------------------------------------------

  bevel *=
    mix(
      0.82,
      1.04,
      k3dFbm2(
        d.xy * 4.5
        + sd.y * 7.0
      )
    );


  // ------------------------------------------------------------
  // 18. 微观机械加工纹
  // ------------------------------------------------------------

  float fine =
    k3dFbm2(
      vec2(
        d.x * gs * 1.8,
        d.y * gs * 0.52
      )
      + sd.z * 19.0
    );


  // ------------------------------------------------------------
  // 19. 最终 Pattern
  // ------------------------------------------------------------

  float pattern =
      0.49

    + face
      * 0.12

    + bevel
      * 0.18

    - groove
      * 0.19

    + microEdge
      * 0.055

    + (fine - 0.5)
      * 0.042;


  pattern =
    k3dApplyContrast(
      k3dSaturate(pattern),
      max(
        0.88,
        p1.y
      )
    );


  // ------------------------------------------------------------
  // 20. Roughness
  // ------------------------------------------------------------

  float rough =
    (
        0.04

      + groove
        * 0.78

      + bevel
        * 0.14

      + microEdge
        * 0.26

      + (fine - 0.5)
        * 0.06
    )
    * p2.w;


  // ------------------------------------------------------------
  // 21. Height
  // ------------------------------------------------------------

  float height =
    clamp(
        0.42

      + face
        * 0.12

      + bevel
        * 0.28

      + microEdge
        * 0.08

      - groove
        * 0.34,

      0.0,
      1.0
    );


  return vec3(
    pattern,
    rough,
    height
  );
}


/* ============================================================
 * T08 火焰纹
 * ============================================================ */

vec3 k3dTexT08(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float stretch =
    max(
      0.5,
      p6.z
    );

  vec2 q =
    vec2(
      d.x * stretch,
      d.y
    );

  q =
    k3dWarp2(
      q * 3.0
      + sd.y * 7.0,
      max(
        0.1,
        p0.w
      ) * 1.3,
      sd.x
    );

  float flame =
    k3dFbm2(
      vec2(
        q.x * 0.5,
        q.y * 3.5
      )
      +
      vec2(
        0.0,
        q.x * 1.2
      )
    );

  float flame2 =
    k3dFbm2(
      vec2(
        q.x * 1.2,
        q.y * 5.0
      )
      + sd.z * 3.0
    );

  flame =
    mix(
      flame,
      flame2,
      0.35
    );

  flame =
    pow(
      k3dSaturate(flame),
      1.2
    );

  float grad =
    mix(
      0.6,
      1.0,
      k3dSaturate(
        d.x * 0.8
        + p6.y * 0.3
      )
    );

  float pattern =
    k3dApplyContrast(
      k3dSaturate(
        flame * grad
      ),
      p1.y
    );

  float rough =
    (1.0 - flame)
    * 1.0
    * p2.w;

  return vec3(
    pattern,
    rough,
    flame
  );
}


/* ============================================================
 * T09 雾状流体
 * ============================================================ */

vec3 k3dTexT09(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float bigScale =
    mix(
      0.8,
      4.5,
      k3dSaturate(p3.x)
    );

  float smallAmt =
    k3dSaturate(p3.y);

  float soft =
    k3dSaturate(p3.z);

  vec2 dir =
    vec2(
      0.7 + sd.y * 0.6,
      0.35 + sd.x * 0.5
    );

  vec2 base =
    d.xy * bigScale
    + dir * d.x * 2.2;

  vec2 wBig =
    k3dWarp2(
      base + sd.x * 12.0,
      mix(
        0.2,
        1.1,
        p0.w
      ),
      sd.y
    );

  float big =
    k3dFbm2(
      wBig * 1.15
      + sd.y * 5.0
    );

  vec2 wSmall =
    k3dWarp2(
      base * 2.7
      + 17.3
      + sd.y * 8.0,
      mix(
        0.1,
        0.7,
        p0.w
      ),
      sd.x
    );

  float small =
    k3dFbm2(
      wSmall * 2.3
      + 3.7
    );

  float m =
    mix(
      big,
      small,
      0.35 * smallAmt
    );

  m =
    k3dApplyContrast(
      m,
      p1.y
    );

  float lo =
    mix(
      0.15,
      0.50,
      soft
    );

  float hi =
    mix(
      0.65,
      0.92,
      soft
    );

  float mist =
    smoothstep(
      lo,
      hi,
      m
    );

  float patterned =
    mix(
      mist,
      k3dSaturate(
        big * 1.15
      ),
      k3dSaturate(p3.x)
      * 0.35
    );

  float rough =
    (0.5 - mist)
    * 0.50
    * p2.w;

  return vec3(
    patterned,
    rough,
    mist
  );
}


/* ============================================================
 * T10 彩色云纹
 * ============================================================ */

vec3 k3dTexT10(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float cs =
    max(
      0.5,
      p3.w
    );

  vec2 q =
    k3dWarp2(
      d.xy * cs
      + sd.x * 15.0,
      mix(
        0.25,
        1.15,
        p0.w
      ),
      sd.y
    );

  float cloud =
    k3dFbm2(
      q * 1.6
      + sd.y * 6.0
    );

  float detail =
    k3dFbm2(
      q * 5.2
      - sd.x * 4.0
    );

  float soft =
    k3dSaturate(
      p3.z
    );

  float m =
    smoothstep(
      mix(
        0.15,
        0.45,
        soft
      ),
      mix(
        0.58,
        0.92,
        soft
      ),
      mix(
        cloud,
        detail,
        0.45
      )
    );

  float pattern =
    k3dApplyContrast(
      m,
      p1.y
    );

  float rough =
    (0.5 - m)
    * 0.55
    * p2.w;

  return vec3(
    pattern,
    rough,
    m
  );
}


/* ============================================================
 * T11 蚀刻纹
 *
 * 保留原版
 * ============================================================ */

vec3 k3dTexT11(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float dens =
    max(
      2.0,
      p4.z
    );

  float lw =
    clamp(
      p4.w,
      0.005,
      0.3
    );

  float jitter =
    k3dFbm2(
      d.xy * 6.0
      + sd.x * 9.0
    )
    * 0.08;

  float l1 =
    abs(
      fract(
        (d.x + jitter)
        * dens
      )
      - 0.5
    )
    * 2.0;

  float l2 =
    abs(
      fract(
        (d.y + jitter)
        * dens
        * 0.75
      )
      - 0.5
    )
    * 2.0;

  float g1 =
    1.0
    -
    smoothstep(
      lw,
      lw + 0.15,
      l1
    );

  float g2 =
    (
      1.0
      -
      smoothstep(
        lw,
        lw + 0.15,
        l2
      )
    )
    * 0.5;

  float depth =
    k3dSaturate(
      p4.y
      + g1
      + g2
    )
    *
    k3dSaturate(
      p0.w * 2.0
      + 0.4
    );

  float pattern =
    1.0
    - depth * 0.7;

  float rough =
    depth
    * 1.5
    * p2.w;

  return vec3(
    pattern,
    rough,
    1.0 - depth
  );
}


/* ============================================================
 * T12 碎片纹
 * ============================================================ */

vec3 k3dTexT12(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {

  vec3 d =
    k3dTexDomain(L, p0);

  float ss =
    max(
      1.0,
      p5.x
    );

  vec2 q =
    k3dWarp2(
      d.xy * ss
      + sd.x * 11.0,
      p0.w * 0.6,
      sd.y
    );

  float cid;

  float f1 =
    k3dVoronoi2(
      q,
      cid
    );

  float plateW =
    clamp(
      p5.z,
      0.02,
      0.9
    );

  float plate =
    1.0
    -
    smoothstep(
      0.0,
      plateW,
      f1
    );

  float grain =
    k3dFbm2(
      q * 9.0
      + sd.y * 13.0
    );

  float cellMix =
    mix(
      cid,
      1.0 - cid,
      0.35
    );

  float pattern =
    k3dApplyContrast(
      mix(
        cellMix,
        grain,
        0.35
      )
      * 0.65
      + plate * 0.45,
      p1.y * p5.y
    );

  float rough =
    (grain - 0.5)
    * 1.1
    * p2.w;

  return vec3(
    pattern,
    rough,
    plate
  );
}

`;


  // ============================================================
  // 统一 Dispatch
  // ============================================================

  const dispatch = `

/* ★ 2026-10-11（S3 v2）：T13–T16 的前置声明。
 *   GLSL 要求「先声明后使用」：这四个函数的定义在图案源串末尾（见文件末的追加块），
 *   而 k3dPattern 在本串里先出现，故必须先给出原型，否则整个着色器编译失败、刀身不渲染。 */
vec3 k3dTexT13( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT14( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT15( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT16( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT17( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT18( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT19( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT20( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT21( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT22( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT23( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );
vec3 k3dTexT24( vec3, vec4, vec4, vec4, vec4, vec4, vec4, vec4, vec4 );

vec3 k3dPattern(
  int texId,
  vec3 L,

  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,

  vec4 sd
) {
  // An initialized accumulator avoids ANGLE's X4000 warning for translated early
  // returns, while preserving the same texture-id dispatch and fallback to T12.
  // 2026-10-11: make uTexParam0.y (rotation, radians) actually work.
  //   (temporarily reverted: the L.xy rotation made patterns disappear entirely --
  //   suspected GLSL/ANGLE issue, being isolated. ASCII only for GLSL comments.)
  vec3 result = vec3(0.0);
  if (texId <= 1) result = k3dTexT01(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 2) result = k3dTexT02(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 3) result = k3dTexT03(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 4) result = k3dTexT04(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 5) result = k3dTexT05(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 6) result = k3dTexT06(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 7) result = k3dTexT07(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 8) result = k3dTexT08(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 9) result = k3dTexT09(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 10) result = k3dTexT10(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 11) result = k3dTexT11(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 12) result = k3dTexT12(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 13) result = k3dTexT13(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 14) result = k3dTexT14(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 15) result = k3dTexT15(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 16) result = k3dTexT16(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 17) result = k3dTexT17(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 18) result = k3dTexT18(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 19) result = k3dTexT19(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 20) result = k3dTexT20(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 21) result = k3dTexT21(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 22) result = k3dTexT22(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else if (texId == 23) result = k3dTexT23(L, p0,p1,p2,p3,p4,p5,p6, sd);
  else result = k3dTexT24(L, p0,p1,p2,p3,p4,p5,p6, sd);
  return result;
}

`;


  // ============================================================
  // 暴露给 K3D
  // ============================================================

  K3D.shaderPatterns = {
    funcs,
    dispatch,
    common: funcs + dispatch
  };


/* ★ 2026-10-11（S3 v2）：T13–T16 四个新图案的 GLSL 源码，追加到图案源串末尾
 *   （bladeSkinShader.js 组装着色器时读的是 K3D.shaderPatterns.common，
 *    本文件先于 hook 构建执行，故追加内容会被编译进着色器）。 */
K3D.shaderPatterns.common += `
/* ============================================================
 * T13 Fade (gradient) -- 2026-10-11 (S3 v2)
 *
 * A smooth colour ramp running along the blade with soft banding and a satin
 * brush underneath. pat.z carries the ramp position so the shader tint palette
 * paints a real gradient (fade / fade-marble family) instead of a flat colour.
 *   p0.x scale  p0.y rotation  p0.z/w offset
 *   p1.x warp (band wobble)    p1.y contrast   p1.z density (band count)  p1.w axis
 *   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT13(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {
  vec3 d = k3dTexDomain( L, p0 );
  float axis = mix( d.y, d.x, clamp( p1.w, 0.0, 1.0 ) );
  float bands = max( 1.0, p1.z * 0.5 );
  float wob = k3dNoise3( d * 3.2 + sd.x * 7.0 ) - 0.5;
  float ramp = clamp( axis + wob * p1.x * 0.35, 0.0, 1.0 );
  float step = fract( ramp * bands + sd.y * 0.13 );
  float band = smoothstep( 0.0, 0.42, step ) * smoothstep( 1.0, 0.58, step );
  float brush = k3dNoise3( vec3( d.x * 9.0, d.y * 230.0, sd.z * 12.0 ) );
  float pattern = clamp( 0.34 + band * 0.62 + ( brush - 0.5 ) * 0.12 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - band ) * 0.22 + ( brush - 0.5 ) * 0.16 ) * p2.w;
  return vec3( pattern, rough, ramp );
}


/* ============================================================
 * T14 Crimson Web (voronoi net) -- 2026-10-11 (S3 v2)
 *
 * Irregular web: distance between the two nearest jittered cell sites draws the
 * silk line, a second tighter threshold draws the bright core. Dark web body,
 * bright threads -- the crimson look comes from the shader tint palette.
 *   p4.x gridScale (web density)   p4.y grooveWidth (thread thickness)
 *   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT14(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {
  vec3 d = k3dTexDomain( L, p0 );
  float gs = max( 2.0, p4.x );
  vec2 q = vec2( d.x * gs, d.y * gs * 0.62 );
  vec2 cell = floor( q );
  vec2 f = fract( q );
  float best = 8.0;
  float second = 8.0;
  for ( int i = -1; i <= 1; i++ ) {
    for ( int j = -1; j <= 1; j++ ) {
      vec2 nb = cell + vec2( float( i ), float( j ) );
      float h = k3dNoise3( vec3( nb * 0.71, sd.x * 5.0 ) );
      vec2 site = vec2( float( i ), float( j ) ) + vec2( h, fract( h * 7.13 ) ) * 0.86 + 0.07;
      float dist = length( site - f );
      if ( dist < best ) { second = best; best = dist; }
      else if ( dist < second ) { second = dist; }
    }
  }
  float gap = second - best;
  float silk = 1.0 - smoothstep( 0.0, max( 0.03, p4.y * 0.55 ) + 0.02, gap );
  float core = 1.0 - smoothstep( 0.0, 0.02, gap );
  float jitter = k3dNoise3( d * 26.0 + sd.y * 9.0 ) - 0.5;
  float pattern = clamp( 0.30 + silk * 0.46 + core * 0.24 + jitter * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - silk ) * 0.20 + jitter * 0.14 ) * p2.w;
  return vec3( pattern, rough, clamp( silk * 0.75 + core * 0.25, 0.0, 1.0 ) );
}


/* ============================================================
 * T15 Doppler (domain-warped flow) -- 2026-10-11 (S3 v2)
 *
 * Two octaves of noise are warped by each other to give the slow liquid flow of
 * a doppler finish; a soft threshold splits it into colour zones. pat.z is the
 * flow field, so the tint palette paints cool-to-warm doppler bands.
 *   p3.w cellScale   p3.z softness   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT15(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 0.6, p3.w );
  vec2 w = vec2(
    k3dNoise3( d * cs * 1.7 + sd.x * 3.0 ),
    k3dNoise3( d * cs * 1.7 + 17.3 + sd.y * 3.0 )
  ) - 0.5;
  float swirl = k3dNoise3( vec3( d.x * cs + w.x * p1.x * 3.0, d.y * cs * 0.55 + w.y * p1.x * 3.0, sd.z ) );
  float bands = k3dNoise3( vec3( swirl * 3.1, d.y * 0.7 + sd.x, sd.y * 2.0 ) );
  float soft = clamp( p3.z, 0.05, 0.95 );
  float flow = smoothstep( 0.5 - soft * 0.5, 0.5 + soft * 0.5, mix( swirl, bands, 0.55 ) );
  float grain = k3dNoise3( d * 60.0 + sd.w * 11.0 );
  float pattern = clamp( 0.26 + flow * 0.70 + ( grain - 0.5 ) * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - flow ) * 0.24 + ( grain - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( flow * 0.82 + 0.09, 0.0, 1.0 ) );
}


/* ============================================================
 * T16 Marble Fade (veins + zones) -- 2026-10-11 (S3 v2)
 *
 * Turbulence-distorted sine veins over a low-frequency zone field: the marble
 * structure of a marble-fade finish. pat.z blends zones with veins so the tint
 * palette sweeps across the blade instead of colouring uniformly.
 *   p3.w cellScale   p4.y veinWidth   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT16(
  vec3 L,
  vec4 p0,
  vec4 p1,
  vec4 p2,
  vec4 p3,
  vec4 p4,
  vec4 p5,
  vec4 p6,
  vec4 sd
) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 1.0, p3.w );
  float turb = k3dNoise3( d * cs * 0.9 + sd.x * 4.0 ) - 0.5;
  float turb2 = k3dNoise3( d * cs * 2.3 + sd.y * 6.0 ) - 0.5;
  float phase = ( d.y * ( 5.0 + cs * 1.6 ) + d.x * 1.6 ) + turb * p1.x * 3.4 + turb2 * p1.x * 1.1;
  float vein = 0.5 + 0.5 * sin( phase * 3.14159 );
  float vw = max( 0.03, p4.y * 0.5 );
  float veinLine = 1.0 - smoothstep( 0.0, vw, abs( vein - 0.5 ) );
  float zones = smoothstep( 0.34, 0.72, k3dNoise3( d * 0.8 + 41.0 + sd.z * 2.0 ) );
  float grain = k3dNoise3( d * 70.0 + sd.w * 8.0 );
  float pattern = clamp( 0.30 + vein * 0.34 + veinLine * 0.30 + zones * 0.14 + ( grain - 0.5 ) * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - veinLine ) * 0.18 + ( grain - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( zones * 0.55 + vein * 0.45, 0.0, 1.0 ) );
}
/* ============================================================
 * T17 Case Hardened patches -- blotchy irregular patches with a bright rim
 *   p3.w cellScale   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT17( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 0.8, p3.w );
  vec3 q = vec3( d.xy * cs, sd.x * 3.0 );
  float field = k3dNoise3( q * 0.9 ) * 0.68 + k3dNoise3( q * 2.4 + 11.0 + sd.y ) * 0.32;
  float blotch = smoothstep( 0.36, 0.62, field + ( k3dNoise3( d * 6.0 ) - 0.5 ) * p1.x * 0.4 );
  float rim = 1.0 - smoothstep( 0.0, 0.10, abs( field - 0.49 ) );
  float grain = k3dNoise3( d * 55.0 + sd.z * 7.0 );
  float pattern = clamp( 0.30 + blotch * 0.52 + rim * 0.22 + ( grain - 0.5 ) * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( blotch * 0.26 + ( grain - 0.5 ) * 0.14 ) * p2.w;
  return vec3( pattern, rough, clamp( blotch * 0.80 + rim * 0.20, 0.0, 1.0 ) );
}

/* ============================================================
 * T18 Stardust -- dense star points inside a soft galactic band
 *   p4.x starScale   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT18( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float gs = max( 20.0, p4.x * 6.0 );
  vec2 g = d.xy * gs;
  vec2 id = floor( g );
  vec2 f = fract( g ) - 0.5;
  float h = k3dNoise3( vec3( id * 0.37, sd.x * 2.0 ) );
  float star = 1.0 - smoothstep( 0.0, 0.10 + h * 0.16, length( f ) );
  float band = smoothstep( 0.30, 0.80, k3dNoise3( d * 3.4 + sd.y * 5.0 ) );
  float grain = k3dNoise3( d * 90.0 + sd.z );
  float pattern = clamp( 0.22 + band * 0.36 + star * 0.46 + ( grain - 0.5 ) * 0.08 * p1.y, 0.0, 1.0 );
  float rough = ( star * 0.22 + ( grain - 0.5 ) * 0.10 ) * p2.w;
  return vec3( pattern, rough, clamp( band * 0.55 + star * 0.45, 0.0, 1.0 ) );
}

/* ============================================================
 * T19 Frost -- dendritic crystal lattice (crossed sine lattice)
 *   p3.w cellScale   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT19( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 2.0, p3.w );
  vec2 q = d.xy * cs;
  float a = sin( q.x * 3.14159 ) * sin( q.y * 3.14159 );
  float b = sin( ( q.x + q.y ) * 2.2 ) * sin( ( q.x - q.y ) * 2.2 );
  float t = k3dNoise3( d * 2.6 + sd.x * 4.0 ) - 0.5;
  float frost = 1.0 - smoothstep( 0.0, 0.16 + t * p1.x * 0.3, abs( a * 0.6 + b * 0.4 ) );
  float micro = k3dNoise3( d * 48.0 + sd.y * 6.0 );
  float pattern = clamp( 0.30 + frost * 0.56 + ( micro - 0.5 ) * 0.12 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - frost ) * 0.20 + ( micro - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( frost, 0.0, 1.0 ) );
}

/* ============================================================
 * T20 Dragon scale -- offset brick lattice of overlapping scales
 *   p4.x scaleDensity   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT20( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 2.0, p4.x * 0.6 );
  vec2 q = d.xy * cs;
  q.x += floor( q.y * 0.5 ) * 0.5;
  vec2 id = floor( q );
  vec2 f = fract( q ) - 0.5;
  float r = length( vec2( f.x, f.y * 1.25 ) );
  float scale = 1.0 - smoothstep( 0.18, 0.46, r );
  float lip = 1.0 - smoothstep( 0.0, 0.07, abs( r - 0.40 ) );
  float wob = k3dNoise3( vec3( id * 0.5, sd.x * 3.0 ) ) - 0.5;
  float grain = k3dNoise3( d * 62.0 + sd.y * 4.0 );
  float pattern = clamp( 0.26 + scale * 0.48 + lip * 0.24 + ( grain - 0.5 ) * 0.10 * p1.y + wob * 0.12 * p1.x, 0.0, 1.0 );
  float rough = ( ( 0.5 - scale ) * 0.22 + ( grain - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( scale * 0.80 + lip * 0.20, 0.0, 1.0 ) );
}

/* ============================================================
 * T21 Circuit -- right-angle traces with nodes (per-cell axis choice)
 *   p4.x gridScale   p4.y grooveWidth   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT21( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float gs = max( 3.0, p4.x );
  vec2 q = d.xy * gs;
  vec2 id = floor( q );
  vec2 f = fract( q );
  float axisPick = step( 0.5, k3dNoise3( vec3( id * 0.61, sd.x * 2.0 ) ) );
  float w = p4.y + 0.02;
  float line = mix( 1.0 - smoothstep( 0.0, w, abs( f.y - 0.5 ) ),
                    1.0 - smoothstep( 0.0, w, abs( f.x - 0.5 ) ), axisPick );
  float node = 1.0 - smoothstep( 0.0, 0.16, length( f - 0.5 ) );
  float micro = k3dNoise3( d * 70.0 + sd.y * 3.0 );
  float pattern = clamp( 0.30 + line * 0.44 + node * 0.26 + ( micro - 0.5 ) * 0.08 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - line ) * 0.18 + ( micro - 0.5 ) * 0.10 ) * p2.w;
  return vec3( pattern, rough, clamp( line * 0.70 + node * 0.30, 0.0, 1.0 ) );
}

/* ============================================================
 * T22 Layered swirl -- anisotropic layered bands (cloud brocade)
 *   p3.w layerScale   p1.x warp   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT22( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 1.5, p3.w );
  float lay = k3dNoise3( vec3( d.x * cs, d.y * cs * 0.35, sd.x * 4.0 ) );
  float warp = k3dNoise3( d * cs * 0.6 + sd.y * 5.0 ) - 0.5;
  float swirl = sin( ( lay * 6.0 + d.y * 1.2 + warp * p1.x * 3.0 ) * 3.14159 );
  float bands = 0.5 + 0.5 * swirl;
  float edge = 1.0 - smoothstep( 0.0, 0.10, abs( swirl ) );
  float grain = k3dNoise3( d * 58.0 + sd.z );
  float pattern = clamp( 0.28 + bands * 0.42 + edge * 0.24 + ( grain - 0.5 ) * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - bands ) * 0.20 + ( grain - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( bands * 0.75 + edge * 0.25, 0.0, 1.0 ) );
}

/* ============================================================
 * T23 Aurora ribbons -- flowing vertical light ribbons
 *   p3.w ribbonScale   p3.z softness   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT23( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 1.0, p3.w );
  float n1 = k3dNoise3( vec3( d.x * cs * 0.8, d.y * cs * 2.2, sd.x * 3.0 ) );
  float n2 = k3dNoise3( vec3( d.x * cs * 1.9 + 5.0, d.y * cs * 0.9, sd.y * 3.0 ) );
  float band = sin( ( d.y * 2.4 + n1 * 2.6 + n2 * 1.2 ) * 3.14159 );
  float ribbon = 0.5 + 0.5 * band;
  float glow = pow( ribbon, 2.2 );
  float soft = smoothstep( 0.42, 0.62, n2 + p3.z * 0.2 );
  float grain = k3dNoise3( d * 64.0 + sd.z );
  float pattern = clamp( 0.24 + glow * 0.52 + soft * 0.18 + ( grain - 0.5 ) * 0.08 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - glow ) * 0.18 + ( grain - 0.5 ) * 0.10 ) * p2.w;
  return vec3( pattern, rough, clamp( glow * 0.70 + soft * 0.30, 0.0, 1.0 ) );
}

/* ============================================================
 * T24 Widmanstatten -- three crossed lamella families (meteor iron)
 *   p3.w lamellaScale   p4.y lamellaWidth   p1.y contrast   p2.w roughnessStrength
 * ============================================================ */
vec3 k3dTexT24( vec3 L, vec4 p0, vec4 p1, vec4 p2, vec4 p3, vec4 p4, vec4 p5, vec4 p6, vec4 sd ) {
  vec3 d = k3dTexDomain( L, p0 );
  float cs = max( 1.2, p3.w );
  vec2 q = d.xy * cs;
  float a1 = abs( sin( ( q.x + q.y * 0.6 ) * 1.7 + sd.x * 2.0 ) );
  float a2 = abs( sin( ( q.x * -0.7 + q.y * 1.1 ) * 2.3 + sd.y * 2.0 ) );
  float a3 = abs( sin( ( q.x * 0.3 - q.y * 1.4 ) * 3.1 + sd.z * 2.0 ) );
  float lat = min( min( a1, a2 ), a3 );
  float lam = 1.0 - smoothstep( 0.0, 0.10 + p4.y * 0.4, lat );
  float core = 1.0 - smoothstep( 0.0, 0.03, lat );
  float grain = k3dNoise3( d * 80.0 + sd.w * 6.0 );
  float pattern = clamp( 0.26 + lam * 0.46 + core * 0.24 + ( grain - 0.5 ) * 0.10 * p1.y, 0.0, 1.0 );
  float rough = ( ( 0.5 - lam ) * 0.22 + ( grain - 0.5 ) * 0.12 ) * p2.w;
  return vec3( pattern, rough, clamp( lam * 0.80 + core * 0.20, 0.0, 1.0 ) );
}
`;

export const shaderPatterns = __reg.proxy.shaderPatterns;
