/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/render/regions.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
const K3D = __reg.proxy;

  /** knifeId → 区域边界（沿长轴归一化）。
   *  可通过 tools/measure_guard.js 重新测量护手位置，或在 App「区域边界」面板拖动滑块
   *  实时预览（1:1 对应 guardStart 位置，可一路拖到 bladeStart 把护手带收成 0）后导出。 */
  const KNIFE_REGIONS = {
    // 蝴蝶刀：双柄 + 中心轴对称，刀身位于中部
    knife_balisong: { bladeStart: 0.5, guardStart: 0.5, angle: -6 },
    // 刺刀
    knife_bayonet:  { bladeStart: 0.39, guardStart: 0.39 },
    // 折刀
    knife_folding:  { bladeStart: 0.45, guardStart: 0.45, angle: -8 },
    // 短剑
    knife_gladius:  { bladeStart: 0.52, guardStart: 0.52, angle: -2 },
    // 爪子刀
    knife_karambit: { bladeStart: 0.45, guardStart: 0.45, angle: -16 },
    // 匕首
    knife_kris:     { bladeStart: 0.33, guardStart: 0.33, angle: 4 },
    // 战壕刀
    knife_machete:  { bladeStart: 0.32, guardStart: 0.315, angle: -5 },
    // 细剑
    knife_saber:    { bladeStart: 0.335, guardStart: 0.335, angle: -4 },
    // 骷髅头战术刀
    knife_skull:    { bladeStart: 0.34, guardStart: 0.34, angle: -5 },
    // 直刃战术刀
    knife_straight: { bladeStart: 0.42, guardStart: 0.42 },
    // 生存刀
    knife_survival: { bladeStart: 0.445, guardStart: 0.445, angle: -5 },
    // 唐刀/弯刀
    knife_tangdao:  { bladeStart: 0.35, guardStart: 0.35, angle: -2 },
  };

  /** 未登记的刀型用这套兜底 */
  const DEFAULT_REGION = { bladeStart: 0.36, guardStart: 0.28 };

  /**
   * ★ 过程模型（阶段 0–3：矿石 / 熔料球 / 刀胚）—— 2026-10-03 新增
   *
   * 背景：这三个模型**不是刀**，没有护手也没有刀柄。但它们没登记在 KNIFE_REGIONS 里，
   *   于是落进 DEFAULT_REGION（bladeStart 0.36）→ 被当成"带柄的刀"分区：
   *   实测只有 64.4% 面积算刀身，**剩下 35.6% 被误判成护手/刀柄**，
   *   走 bladeMask 的「原贴图 × 去饱和 × tint」通道涂成灰白色。
   *   后果：S1 选材 / S2 熔炼 / S3 锻打的视觉在过程模型上大面积被覆盖 → 看起来"没效果"。
   *
   * 修法：过程模型整块都当刀身（bladeStart≈0 / guardStart≈0），
   *   让 BladeSkin 的刀纹 + 工艺 + Wear 全程作用在矿石/熔料球/刀胚上。
   *   护手/刀柄权重压到 ~1%，视觉上等同于"没有柄"。
   */
  const PROCESS_REGION = { bladeStart: 0.015, guardStart: 0.008 };
  const PROCESS_MODELS = ['ore_small', 'molten_sphere_small', 'blank_ingot_small'];

  /** 边界过渡带宽度（归一化长轴）。V2 §3.3 允许 1~3px 柔化，这里用软过渡避免硬切。 */
  const FEATHER = 0.012;

  /**
   * 线外浅铺（消除交界处的"没效果白痕"）—— **固定值，对所有刀型统一生效，不开放参数**
   *
   * 问题：刀身花纹在 bladeStart 处停止后，那条线附近只剩护手/刀柄质感 —— 而护手/刀柄质感是
   *       「模型原贴图 × 去饱和 × tint」的亮金属表现，紧贴彩色皮肤时就是一条亮白痕。
   * 做法：让刀身花纹**统一越过 bladeStart 往柄侧再浅铺一点点**，以低不透明度压在护手/刀柄
   *       质感之上，用皮肤色把这条亮痕盖掉（皮肤在 shader 里是底色，护手/刀柄按权重盖上去，
   *       所以"刀身权重"在浅铺区抬起来 = 那两块盖得少一点 = 皮肤透出来）。
   *
   *   SKIRT 浅铺长度（归一化长轴，柄侧方向）—— "一点点"，约刀长的 5%
   *   BLEED 浅铺区顶到 bladeStart 时的最高不透明度（低透明度，别盖成"护手被染紫"）
   *
   * ⚠ 必须与 js/engine.js（顶点权重）和 js/atlas.js（烘焙 mask）用**同一套公式**，
   *   否则又会出现「图案与区域错位」的白块（历史上踩过）。
   * ⚠ 别超过 0.5：atlas 用 `bw < 0.5` 把纹素分类成刀身/刀柄，浅铺过 0.5 会把分类翻面。
   */
  const SKIRT = 0.05;
  const BLEED = 0.35;

  /**
   * 花纹边界外扩（atlas 烘焙侧专用）
   *
   * 问题：atlas 的花纹是「花纹色 ←→ 刀柄底色（模型亮金属灰）」插值出来的。这个过渡带如果
   *       正好压在可见的 bladeStart 交界线上，就会把花纹冲淡成**一条淡白灰**——
   *       用户看到的就是"各块之间的连接线处发白"。
   * 做法：把 **atlas 的花纹边界整体往柄侧挪 PATTERN_EXTEND**，这样在可见交界处
   *       atlas 已经是满强度花纹（bw=1），过渡带被推进到刀柄质感占主导的那一段里，
   *       被刀柄/护手的着色盖掉 → 交界线上不再有白灰。
   *       多余露出的那一点点花纹，正好就是 SKIRT/BLEED 想要的"低透明度超出"效果。
   *
   * 实测（karambit + fade，820×900 视角）：发白像素 0.51% → 见 tools/analyze_white.js
   */
  const PATTERN_EXTEND = 0.02;

  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / Math.max(e1 - e0, 1e-6)));
    return t * t * (3 - 2 * t);
  };

  /** Single source of truth for the normalized-vertex region weights. */
  function weightsAt(knifeId, tAxis, tAxis2 = 0) {
    const rg = K3D.regions.of(knifeId);
    const angle = (rg.angle || 0) * Math.PI / 180;
    const t = Math.max(0, Math.min(1, tAxis * Math.cos(angle) + tAxis2 * Math.sin(angle)));
    const bladeStart = Number.isFinite(Number(rg.bladeStart)) ? Number(rg.bladeStart) : 0.36;
    const guardStart = Math.max(0.01, Math.min(Number.isFinite(Number(rg.guardStart)) ? Number(rg.guardStart) : bladeStart - 0.06, bladeStart));
    const blade = Math.max(
      smooth(bladeStart - FEATHER, bladeStart + FEATHER, t),
      BLEED * smooth(bladeStart - SKIRT, bladeStart + FEATHER, t),
    );
    const rest = 1 - blade;
    const guard = rest * smooth(guardStart - FEATHER, guardStart + FEATHER, t);
    return { t, blade, guard, handle: rest - guard };
  }

  /** CPU coverage audit using the same weights as the GPU vertex attribute. */
  function measureGeometry(knifeId, positions) {
    if (!positions || positions.length < 3) return { vertices: 0, axis: -1, blade: 0, guard: 0, handle: 0 };
    const count = positions.length / 3;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let d = 0; d < 3; d++) {
      const v = positions[i * 3 + d];
      if (v < mn[d]) mn[d] = v;
      if (v > mx[d]) mx[d] = v;
    }
    const size = [0, 1, 2].map((d) => mx[d] - mn[d]);
    const axis = size[0] >= size[1] && size[0] >= size[2] ? 0 : (size[1] >= size[2] ? 1 : 2);
    const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    const axis2 = order[1], span = Math.max(size[axis], 1e-6), span2 = Math.max(size[axis2], 1e-6);
    const sums = { blade: 0, guard: 0, handle: 0 };
    for (let i = 0; i < count; i++) {
      const p = i * 3;
      const w = weightsAt(knifeId, (positions[p + axis] - mn[axis]) / span, (positions[p + axis2] - mn[axis2]) / span2);
      sums.blade += w.blade; sums.guard += w.guard; sums.handle += w.handle;
    }
    return { vertices: count, axis, blade: sums.blade / count, guard: sums.guard / count, handle: sums.handle / count };
  }

  K3D.regions = {
    KNIFE_REGIONS,
    DEFAULT_REGION,
    FEATHER,
    SKIRT,
    BLEED,
    PATTERN_EXTEND,
    weightsAt,
    measureGeometry,
    /** 每刀型的持久覆盖（UI 滑块调 bladeStart/guardStart/angle 时写入，无竞态）。
     *  优先级：用户 overrideMap > KNIFE_REGIONS 配置 > DEFAULT_REGION。 */
    overrideMap: {},
    /** 取某把刀的区域边界（含用户覆盖） */
    of(knifeId, override) {
      // ★ 过程模型（矿石/熔料球/刀胚）不是刀：整块当刀身，
      //   避免被 DEFAULT_REGION 误判出 35% 的"刀柄"区域（见 PROCESS_REGION 注释）。
      if (PROCESS_MODELS.indexOf(knifeId) >= 0) {
        return { ...PROCESS_REGION, ...(this.overrideMap[knifeId] || {}), ...(override || {}) };
      }
      return { ...DEFAULT_REGION, ...(KNIFE_REGIONS[knifeId] || {}),
               ...(this.overrideMap[knifeId] || {}), ...(override || {}) };
    },
    /** 该模型是否是"过程模型"（整块刀身，无护手/刀柄） */
    isProcess: (id) => PROCESS_MODELS.indexOf(id) >= 0,
  };

export const regions = __reg.proxy.regions;
