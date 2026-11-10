/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/state.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
/* ★ 2026-10-17：已复刻族的 JS/canvas 烘焙（见 bakedMotif.js 顶部长注释） */
import { canBake as bakedCanBake, getBakedAtlas, getAnimAtlas } from './bakedMotif.js';
const K3D = __reg.proxy;

  /* ── 逐卡基色微偏（S2/S3 极轻色偏，用户 2026-10-23 决策）──────────
     ±12° 色相、饱和度 +≤0.08、亮度不动。只认 #rrggbb，其它输入原样返回。
     纯函数，不碰 DOM / GPU；g 由 core/recipe.js#applyCardIdentity 按 STAGE_RANK 给出。 */
  function identityTintHex(hex, identity) {
    if (!identity || !Number.isFinite(identity.g)) return hex;
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g2 = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    let hh = 0, ss = 0;
    if (d > 1e-6) {
      ss = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hh = ((g2 - b) / d) % 6;
      else if (mx === g2) hh = (b - r) / d + 2;
      else hh = (r - g2) / d + 4;
      hh /= 6; if (hh < 0) hh += 1;
    }
    const dg = (identity.g - 0.5) * 2;
    const h2 = (hh + dg * (12 / 360) + 1) % 1;
    const s2 = Math.max(0, Math.min(1, ss + dg * 0.08));
    const hue2rgb = (p, q, t) => {
      let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    let nr, ng, nb;
    if (s2 <= 0) { nr = ng = nb = l; } else {
      const q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
      const pp = 2 * l - q;
      nr = hue2rgb(pp, q, h2 + 1 / 3); ng = hue2rgb(pp, q, h2); nb = hue2rgb(pp, q, h2 - 1 / 3);
    }
    const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return '#' + to(nr) + to(ng) + to(nb);
  }

  // ── 确定性随机（mulberry32：同 seed 永远同序列） ──────────────────
  function seededRandom(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function rand() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 把任意字符串/数字混成 32 位种子（稳定、跨会话一致） */
  function hashSeed(...parts) {
    let h = 2166136261 >>> 0;
    for (const p of parts) {
      const s = String(p);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h >>> 0;
  }
  const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / Math.max(e1 - e0, 1e-6)));
    return t * t * (3 - 2 * t);
  };

  /** seed → 子种子（文档 §13：skinSeed 派生 patternSeed/materialVariantSeed/finishSeed/scratchSeed
   *  以及 §9.7 的 warpSeed / colorPhaseSeed / fresnelVariationSeed） */
  function deriveSeeds(seed) {
    const r = seededRandom(hashSeed('bladeskin', seed));
    const pick = () => Math.floor(r() * 1000000);
    return {
      patternSeed: pick(),
      warpSeed: pick(),
      colorPhaseSeed: r(),          // 0~1：色彩相位（做色相上的相位偏移）
      fresnelSeed: r(),
      scratchSeed: pick(),
      materialVariantSeed: pick(),
      finishSeed: pick(),
    };
  }

  /** Wear 拆解（文档 §12 给了 4 条，这里补 roughnessWear 凑齐 5 路） */
  function wearLevels(wear) {
    const w = Math.min(1, Math.max(0, Number(wear) || 0));
    return {
      edge: smoothstep(0.15, 0.85, w),
      surface: smoothstep(0.20, 0.90, w),
      pattern: smoothstep(0.35, 1.00, w),
      scratch: smoothstep(0.25, 0.80, w),
      roughness: smoothstep(0.20, 0.90, w),
    };
  }

  /** 默认 state（文档 §14）
   *  ★ 2026-10-16（用户：「没选就没有」）：与 core/recipe.js#DEFAULT_SKIN 对齐 ——
   *    textureId T04（粗锤痕）→ **T01（素面锻）**、wear 0.12 → **0**。
   *    这两个默认值以前会让"玩家还没选过的层"直接出现在画面上。 */
  const STATE_DEFAULTS = Object.freeze({
    materialId: 'M01',
    textureId: 'T01',
    finishId: 'F01',
    wear: 0,
    visualTier: 0,
    cardEffects: {},
    seed: 381729,
    patternSeed: null,        // null = 由 seed 派生
    patternScale: 1.0,
    patternRotation: 0,
    patternOffset: { x: 0, y: 0 },
    variantParams: {},
  });

  /** 构造并归一化一个 BladeSkinState */
  function makeState(partial = {}) {
    const s = { ...STATE_DEFAULTS, ...partial };
    s.materialId = (K3D.materials24.get(s.materialId) || {}).id || 'M01';
    s.textureId = (K3D.textures12.get(s.textureId) || {}).id || 'T01';
    s.finishId = (K3D.finishes12.get(s.finishId) || {}).id || 'F01';
    s.wear = Math.min(1, Math.max(0, Number(s.wear) || 0));
    s.visualTier = Math.max(0, Math.min(5, Number(s.visualTier) || 0));
    s.seed = (Number(s.seed) >>> 0) || 381729;
    s.patternScale = Number(s.patternScale) || 1;
    s.patternRotation = Number(s.patternRotation) || 0;
    s.patternOffset = {
      x: Number(s.patternOffset && s.patternOffset.x) || 0,
      y: Number(s.patternOffset && s.patternOffset.y) || 0,
    };
    s.variantParams = { ...(s.variantParams || {}) };
    s.cardEffects = { ...(s.cardEffects || {}) };
    for (const key of Object.keys(s.cardEffects)) {
      const fx = s.cardEffects[key];
      if (!Array.isArray(fx) || fx.length < 4 || !fx.slice(0, 4).every((v) => Number.isFinite(Number(v)))) {
        delete s.cardEffects[key];
      } else {
        s.cardEffects[key] = fx.slice(0, 4).map(Number);
      }
    }
    // ★ visualBonus 透传（2026-10-03）：特性/组合授予的视觉奖励。
    //   此前它只在 run.pendingSkin 里被写入，渲染层从不读取 → 8 个通道全部静默失效，
    //   53 张卡（25%）的视觉奖励为 0。这里透传给 composeBladeSkin 消费。
    s.visualBonus = { ...(s.visualBonus || {}) };
    return s;
  }

  /** 稳定指纹（用于缓存 key / 存档对比；同 state 必同串） */
  function hashState(s) {
    const st = makeState(s);
    return [
      st.materialId, st.textureId, st.finishId,
      st.wear.toFixed(3), st.seed,
      st.visualTier,
      st.patternSeed == null ? 'auto' : st.patternSeed,
      st.patternScale.toFixed(3), st.patternRotation.toFixed(3),
      st.patternOffset.x.toFixed(3), st.patternOffset.y.toFixed(3),
      Object.keys(st.variantParams).sort().map((k) => k + '=' + st.variantParams[k]).join(','),
      Object.keys(st.cardEffects).sort((a, b) => Number(a) - Number(b))
        .map((k) => k + '=' + st.cardEffects[k].join(',')).join(';'),
    ].join('|');
  }

  /**
   * 皮肤组合器（文档 §23）：把 BladeSkinState 组合成渲染层可用的 uniform 包。
   * Viewer 只负责「读 state → 设参数 → 渲染」，不自己决定应该是什么材质（文档 §22）。
   */
  /** 打磨小游戏对刃线锐度的最大影响（与 minigame.SHARPEN_CAP 保持一致，双保险） */
  const SHARPEN_EFFECT_CAP = 0.6;

  /** 两个 #rrggbb 按 t 线性混合（打磨小游戏的色温偏移用） */
  function k3dMixHex(a, b, t) {
    const pa = parseInt(String(a || '#000000').replace('#', ''), 16) || 0;
    const pb = parseInt(String(b || '#000000').replace('#', ''), 16) || 0;
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    const r = Math.round((((pa >> 16) & 255) * (1 - k)) + (((pb >> 16) & 255) * k));
    const g = Math.round((((pa >> 8) & 255) * (1 - k)) + (((pb >> 8) & 255) * k));
    const bl = Math.round(((pa & 255) * (1 - k)) + ((pb & 255) * k));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  /* ★ 2026-10-08（S5 逐卡可辨性）：本地 HSV 工具，给"多普勒调色板色相旋转"用。
   *   为什么不复用 `js/skin/materials.js` 的：那三个函数是模块私有的
   *   （`K3D.materials24` 只导出 DOPPLER_STYLES / MATERIALS / GROUPS /
   *   MATERIAL_DEFAULTS / makeDopplerProfile / list / byGroup / get），
   *   没有导出颜色工具。state 层保持自足，避免为一次旋转去改 skin 的公开契约。
   *   三者的取值约定与 materials.js 完全一致：#rrggbb 进、[0..1] 三元组出。 */
  function hexToRgb01(hex) {
    const h = String(hex || '#000000').replace('#', '');
    return [
      (parseInt(h.slice(0, 2), 16) || 0) / 255,
      (parseInt(h.slice(2, 4), 16) || 0) / 255,
      (parseInt(h.slice(4, 6), 16) || 0) / 255,
    ];
  }
  function rgbToHsv01(rgb) {
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }
  function hsvToRgb01(hsv) {
    let h = ((hsv[0] % 1) + 1) % 1;
    const s = hsv[1], v = hsv[2];
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const out = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return out.map((x) => Math.round(x * 1000) / 1000);
  }
  // 2026-10-12（S3 v12）删除已死代码：rgb01ToHex / k3dTintHex / k3dPaletteTintHex
  //   —— 三者只服务于「纹理色板（tintA/tintB/tintMix）」这条路径，
  //   而该路径自 S3 v7 起被用户口径关闭（texTintMix 恒为 0），永不执行。
  //   （同文件其它色相工具 rgbToHsv01 / hsvToRgb01 / hexToRgb01 / k3dMixHex 仍在用，保留。）

  function composeBladeSkin(state) {
    const st = makeState(state);
    const mat = K3D.materials24.get(st.materialId);
    const tex = K3D.textures12.get(st.textureId);
    const fin = K3D.finishes12.get(st.finishId);
    const seeds = deriveSeeds(st.seed);
    if (st.patternSeed != null) seeds.patternSeed = st.patternSeed >>> 0;
    // ★ wearAccent 由下方 vb 段计算，但 wearLevels 在其之前 —— 先用 st.wear，
    //   下方 uniforms 里会传入 wearAccented 的 5 路结果。
    const wear = wearLevels(st.wear);
    const d = mat.doppler;

    // ── 纹理层双阶段合成（A 方案：熔炼与锻打分槽，见 cardPools.js 槽位归属表）──
    //   阶段 2 熔炼 → variants.melt   ：纹理参数的「基底值」+ 把 contrast 当「纯净度」做乘性调制
    //   阶段 3 锻打 → variants.texture：覆盖 / 精修（后写者胜，符合"锻打让纹理显现"的定位）
    //   两阶段键位重叠（contrast / warp / roughnessStrength …）也不会互相抹掉：
    //     熔炼没被压的键照常生效；被压的键至少还留下「纯净度」这一路乘性影响。
    const melt = { ...(st.variantParams.melt || {}) };
    const meltBase = { ...melt };
    delete meltBase.contrast;                       // contrast 走纯净度调制，避免重复计入
    // ★ 2026-10-11 S2 熔炼「能力回退」：熔炼层写的是**纹理参数**，而每种纹理只认自己那几个键
    //   （T04 大马士革只吃 scale/warp/contrast/roughnessStrength；shard* 只在 T12、mist*/softness 只在 T09、
    //    flowDir/stretch 只在 T08）。S3 锻打之前默认纹理就是 T04，于是「共晶切面(shard*)/星屑悬熔(mist*)/
    //    玄火斜流(flowDir,stretch)」这类卡在 S2 整张不可见（与"没选卡"的渲染几乎逐像素相同）。
    //   回退规则：当前纹理不吃该键时，折算成它**吃**的等价表现；纹理本身支持时保持原样、不重复计入；
    //   写进去的 contrast 仍会被下面的「纯净度」乘性调制一起收敛。
    const texHas = (k) => Object.prototype.hasOwnProperty.call(tex.defaults || {}, k);
    const tval = (k, d) => (meltBase[k] != null ? Number(meltBase[k])
      : (tex.defaults && tex.defaults[k] != null ? Number(tex.defaults[k]) : d));
    const tset = (k, v) => { meltBase[k] = Math.max(0, Math.min(1, v)); };
    if (melt.shardContrast != null && !texHas('shardContrast')) {
      const sc = Math.max(0, Math.min(1, Number(melt.shardContrast) || 0));
      tset('contrast', tval('contrast', 0.5) + 0.50 * sc);              // 块面边界更硬 → 图案对比更高
      tset('roughnessStrength', tval('roughnessStrength', 0.4) + 0.25 * sc); // + 晶面散射
    }
    if (melt.shardScale != null && !texHas('shardScale')) {
      const sk = Math.max(0, Number(melt.shardScale) || 0);
      meltBase.scale = Math.max(0.25, Math.min(4, tval('scale', 1) * (1 + 0.07 * sk))); // 晶格更大 → 图案尺度更大
    }
    if ((melt.mistLarge != null || melt.mistSmall != null || melt.softness != null) && !texHas('mistLarge')) {
      const ms = Math.min(1, Math.max(Number(melt.mistLarge) || 0, Number(melt.mistSmall) || 0));
      const sf = Math.max(0, Math.min(1, Number(melt.softness) || 0));
      tset('roughnessStrength', tval('roughnessStrength', 0.4) + 0.35 * ms);   // 微雾 → 漫反射更强
      tset('contrast', tval('contrast', 0.5) * (1 - 0.45 * Math.max(ms, sf)));  // 雾化柔化纹路
    }
    if ((melt.flowDir != null || melt.stretch != null) && !texHas('flowDir')) {
      const sy = Math.max(0, Number(melt.stretch) || 0);
      const fd = Math.max(0, Math.min(1, Number(melt.flowDir) || 0));
      tset('warp', tval('warp', 0) + 0.16 * sy + 0.20 * fd);           // 拉伸/斜向 → 扭曲走向
      meltBase.scale = Math.max(0.25, Math.min(4, tval('scale', 1) * (1 + 0.05 * sy)));
      tset('roughnessStrength', tval('roughnessStrength', 0.4) + 0.12 * fd);
    }
    // ★ 2026-10-11 S2「净化杂质」主轴（用户定调：熔炼 = 净化杂质；稀有度越高越通透纯净，
    //   低稀有度保留金属杂质感、类似噪声）。`melt.purity`：0 = 多杂质（斑驳 + 颗粒噪声 + 浑浊哑光），
    //   1 = 高纯净（纹理淡出 + 通透镜面）。与其它键的分工：
    //     · purity  —— 稀有度主轴（同时决定「纹理杂质」与「材质通透度」）
    //     · contrast / warp / stretch / mist* / shard* —— 卡片个性，在 purity 给的基调里做变化
    //   purity 缺省（S1 或其它阶段）时本段与下面的材质调整都不生效，行为完全不变。
    const meltPurRaw = (melt.purity != null) ? Number(melt.purity) : null;
    const meltPur = (meltPurRaw == null || !isFinite(meltPurRaw))
      ? null : Math.max(0, Math.min(1, meltPurRaw));
    /* ★ 2026-10-23：这里原本自己加过 `meltRoughAdd = (1-purity)*0.22`，
       但 v1.0 参考实现里没有这一项 —— 纯净度全部由下面的 matEff 换算表达
       （roughness 已经是 −0.22·p + 0.16·(1−p)，量级足够）。已移除，避免叠加过量。 */
    const meltRoughAdd = 0;
    if (meltPur != null) {
      const impT = 1 - meltPur;
      // ⚠ 2026-10-11 修正（用户反馈「稀有及以上出现奇怪纹路和颜色」）：高纯净度一侧要**几乎不留纹路**。
      //   实测（`--tex=T01` 素面复现）：把纹理压到近乎全无后，表面露出的是**默认工艺 F10 的彩色油膜格纹**
      //   —— 玩家看到的「奇怪纹路和颜色」正是"裸表面 + 油膜"的组合，而不是锻纹本身。
      //   所以纯净端**保留锻纹存在感**（对比只降到 0.45 档），只去掉颗粒噪点与斑驳不均：
      //   干净 = 均匀细密的锻纹 + 无颗粒，而不是一张没有纹路的镜面。
      //   ⚠ 2026-10-11 定位更正：`--tex=T01`（素面）与 `--fin=F02`（换工艺）下格纹依然存在，
      //     说明它与纹理层、工艺层都无关 —— 真正来源是**稀有度层**（`uRarityColor` + `uVisualTier`：
      //     tier≥2 流动线、tier≥4 蚀刻线），已在 `bladeSkinShader.js` 整段删除。
      //     因此这里恢复纯净端的正常口径：杂质纹随纯净度淡出。
      tset('contrast', tval('contrast', 0.5) * (0.35 + 0.95 * impT));          // 纯 → 杂质纹淡出
      tset('roughnessStrength', tval('roughnessStrength', 0.4) * (0.15 + 1.60 * impT)); // 脏 → 颗粒噪声
      meltBase.scale = Math.max(0.25, Math.min(4, tval('scale', 1) * (1.06 - 0.18 * meltPur))); // 纯 → 纹理更整
    }
    const tp = { ...tex.defaults, ...meltBase, ...(st.variantParams.texture || {}) };
    if (melt.contrast != null) {
      const purity = Math.min(1, Math.max(0, Number(melt.contrast) || 0));  // 0.15 纯净 … 0.90 多杂
      const c0 = tp.contrast != null ? Number(tp.contrast) : 0.5;
      tp.contrast = Math.min(1, Math.max(0.02, c0 * (0.45 + 1.1 * purity))); // 纯净度 0.5 → ×1.0 中性
      // ★ 注意：purity = 0.50 是**乘性中性点**（×1.0），写它等于没写。
      //   卡表禁止只写 contrast: 0.50 的熔炼卡 —— 由 tools/check_cards.js（静态）
      //   与 tools/verify_visual.js（运行时）双重拦截。改中性点务必同步这两处守卫。
    }
    // 工艺参数 = 该工艺默认值 + 用户覆盖
    const fp = { ...fin.defaults, ...(st.variantParams.finish || {}) };
    // ── 叠加层（阶段 4 定型 / 6 回火 / 7 开刃）：独立槽位，不与基础工艺抢 uFinId ──
    //    开关 `.w`：显式 on 优先；否则"有任意参数即视为启用"
    const tmp = { ...(st.variantParams.temper || {}) };
    const eg = { ...(st.variantParams.edge || {}) };
    // ★ 阶段 4 刀型辉光层（独立槽位，2026-10-04 新增）。
    //   S4 有 12 基础 + 12 进阶 = 24 张卡，但进阶卡**不换模型**（用户要求
    //   「不用真的加模型上的不同」），只靠一层辉光区分 12 种刀型。
    //   为什么必须独立槽位：S4 已有 knifeType + fixedTexture（签名锁定），
    //   而 fixedTexture 会覆盖 S3 的 textureId —— 挤进已有槽位等于抢别人的视觉。
    //   且**不能**用 variants.finish（S5 槽位，会被 S4 自己的签名锁定 delete 掉，
    //   这正是 S9 调校踩过的坑，见下面 tune 的注释）。
    /* ★ 2026-10-13 删除 form（定型辉光）槽位：`variantParams.form` 全项目 **0 处写入**
     * （cardsV11 / cardWrites 都没有 "form" 键，cardsV11 里的 "form" 只是
     *   visualSpec.slots 的槽位名；ghostKnife 只写 variantParams.handle）。
     *   于是 `fm` 恒为空对象 → formOn 恒 0 → uFormGlow 恒关闭。
     *   连带删掉的：uFormGlow / uFormColor 两个 uniform、着色器里的
     *   k3dApplyFormGlow() 及其调用点。
     *   背景（knifeTypes.js 已记录）：S4 旧刀型卡表 KNIFE_CARDS 删除后，
     *   这张表带的那份 variants.form 配方也随之消失；12 张进阶卡的辉光
     *   实际走 render/bladeEffects.js 的多层壳实现（cardEffectRecipes.js），
     *   玩家可见效果不受影响。 */
    // ★ 打磨小游戏结果（S7 阶段内第二段交互，2026-10-03 接入视觉）。
    //   存在 eg.grind 里，**不覆盖**卡已设的 amount / fresnelPower / tintHex ——
    //   卡决定刃线"是什么风格"，小游戏决定"磨得怎么样"，两者叠加。
    //   限幅在 minigame.js 侧（守住「小游戏不逆转构筑」）。
    const grind = eg.grind || null;
    // ★ 阶段 9 调校层（独立槽位）：S9 的「幻彩调校」写 colorPhase / iridescence，
    //   原本混在 variants.finish（S5 槽位）里 → 会被 S4 签名锁定的
    //   `delete state.variantParams.finish` 一起清掉，玩家选择无声消失。
    //   按「新增通道 → 加独立槽位」约定改为 variants.tune。
    const tn = { ...(st.variantParams.tune || {}) };
    const temperOn = tmp.on != null ? (tmp.on ? 1 : 0) : (Object.keys(tmp).length ? 1 : 0);
    const edgeOn = eg.on != null ? (eg.on ? 1 : 0) : (Object.keys(eg).length ? 1 : 0);
    const tuneOn = tn.on != null ? (tn.on ? 1 : 0) : (Object.keys(tn).length ? 1 : 0);
    /* ★ 2026-10-13（S6 彩虹金属光泽，用户口径）：
     *   「S6 不应该是直接改变刀身颜色，而应该是部分位置/全刀加入彩虹金属光泽
     *     （可以是不同色系的彩虹光泽），呈现细腻的多色反射，越高级的卡效果越好。」
     *   逐卡配方来自 data/temperIridescence.js（经 cardPools 并入 variants.temper），
     *   与卡数据自带的三个键并列分工：
     *     temperature → 额外一档干涉相位（让同色系族的两张卡也不同）
     *     hueShift    → 色系族微调
     *     amount      → 总强度闸门
     *     family / cover / bands / strength / flow → 本配方
     *   strength 缺省 0 = 该层自动关闭，老存档与其它阶段行为逐字节不变。 */
    const tIrid = {
      family: Number(tmp.family) || 0,
      cover: tmp.cover != null ? Number(tmp.cover) : 0.45,
      bands: tmp.bands != null ? Math.max(0.6, Number(tmp.bands)) : 1.55,
      strength: tmp.strength != null ? Number(tmp.strength) : 0,
      flow: tmp.flow != null ? Number(tmp.flow) : 0.40,
    };
    /* ★★ 2026-10-17（加载速度 · 烘焙切片）：把一个**活跃槽**里「已复刻的族」交给贴图。
     *   为什么只挑一个：切片阶段的灰度验证，先证明「编译降下来 + 画面不变」；
     *   之后按族铺开（在 bakedMotif.js 的 FAMILY_GEN 里加一个族即可，这里自动多用一格）。
     *   ⚠ 每局随机差异：phase 来自本局种子（fx.w），所以贴图按 (family, rank, scale, phase)
     *     现场生成并缓存 —— 不同局参数不同 → 重新生成，观感仍然「每局不一样」。
     *   ⚠ 包体：全部运行时 canvas 生成，不打包任何贴图资产。 */
    /* 逐槽烘焙登记：slots[i] = {family,rank,scale,phase} 或 null */
    const bakedSlots = new Array(9).fill(null);
    let anyBake = false;
    const cardFx = new Float32Array(9 * 4);
    for (let i = 0; i < 9; i++) {
      const fx = st.cardEffects[i];
      if (!fx) continue;
      cardFx.set(fx.slice(0, 4), i * 4);
      /* 该槽的族若已有 JS 复刻 → 登记烘焙（逐槽，见上方注释） */
      if (fx[1] > 0) {
        const rank = Math.max(1, Math.floor(Number(fx[0]) || 1));
        const family = (((rank - 1) % 25) + 25) % 25;
        if (bakedCanBake(family)) {
          bakedSlots[i] = { family, rank, scale: Number(fx[2]) || 1, phase: Number(fx[3]) || 0 };
          anyBake = true;
        }
      }
    }

    // ── Wear 对工艺/多普勒的衰减（文档 §9.10：磨损要"逐渐失去完整度"，不只是降颜色）──
    // ★ visualBonus（特性/组合授予的视觉奖励，2026-10-03 接通）：
    //   8 个通道在这里映射到真实 uniform。设计原则是**乘性/加性微调**，
    //   不覆盖玩家通过决策卡选的值，只在其之上叠加一层奖励。
    const vb = st.visualBonus || {};
    const vbNum = (k, d) => (Number.isFinite(Number(vb[k])) ? Number(vb[k]) : d);
    // ① impurity 杂质感 → 纹理对比度压低 + 粗糙度抬升（脏、雾面）
    const vbImpurity = Math.max(0, Math.min(1, vbNum('impurity', 0)));
    // ② textureContrast 纹理对比度 → 直接加减 patternContrast
    const vbContrast = vbNum('textureContrast', 0);
    // ③ textureScale 纹理缩放 → 乘到 uTexParam0.x
    const vbScale = 1 + Math.max(0, vbNum('textureScale', 0)) * 0.6;
    // ④ metalness 金属度 → 加到材质金属度（液态金属类）
    const vbMetal = vbNum('metalness', 0);
    // ⑤ emission 自发光 → 加到自发光强度（星尘/月蚀类）
    const vbEmission = Math.max(0, vbNum('emission', 0));
    // ⑥ dopplerBoost 多普勒强度 → 乘到 dopplerStrength
    const vbDoppler = 1 + Math.max(0, vbNum('dopplerBoost', 0));
    // ⑦ edgeGlow 刃线辉光 → 加到 uEdgeGlow.x（并强制开启该层）
    const vbEdge = Math.max(0, vbNum('edgeGlow', 0));
    // ⑧ wearAccent 战损强化 → 加到磨损量（影响 5 路 wearLevels）
    const vbWear = Math.max(0, vbNum('wearAccent', 0));
    // ⑨ roughness 粗糙度微调（TR05 镜面冷光：负值=更镜面）→ 加到材质粗糙度
    const vbRough = vbNum('roughness', 0);
    /* ★★ 2026-10-23（用户：S9 高级卡磨损要更少）
     *   病象：S9 的 wear 由卡数据直接写，且与稀有度**反着来** ——
     *   传说 S9_21 写 1.00（满磨损）、神话 S9_24 写 0.399，普通的 S9_03 却是 0.278。
     *   这里按**构筑稀有档**做一次衰减：tier 5 保留 55%、tier 0 不变（每档 −9%）。
     *   只作用在渲染侧的 wear uniform 上，不动卡数据、不影响任何玩法数值。 */
    /* 用**这张卡自己的稀有档**（identity.tier，由 core/recipe.js 给出），
       而不是整局最高档 —— 整局档位对所有卡是同一个常数，会把磨损整体压下去、
       连带把 S9 的卡间差压掉（实测 21.8 → 16.6）。按卡自己的档位衰减只影响"高级卡"。 */
    const cardTierForWear = (st.identity && Number.isFinite(st.identity.tier))
      ? st.identity.tier : Math.min(5, Math.max(0, Number(st.visualTier) || 0));
    const tierWearKeep = 1 - 0.06 * cardTierForWear;
    const wearAccented = Math.min(1, (st.wear + vbWear * 0.35) * tierWearKeep);

    const dopplerStrength = (fp.strength ?? d.strength) * (1.0 - st.wear * 0.55) * vbDoppler;
    const iridescence = (mat.iridescence || 0) * (1.0 - st.wear * 0.70);
    // patternContrast：visualBonus 的 textureContrast 与 impurity 都在这里落地
    /* ★ 2026-10-22（S2 熔炼可辨）：熔流靠"程序图案的明暗对比"读出来，实测 24 张熔炼卡
       在物体掩膜内只差 30–53/255，且入刀后容易被后续图层吃掉。这里把对比基准抬 15%，
       让熔池流向/分界在整刀取景下真的看得出来。只乘 uniform，不改任何结构。 */
    const patternContrast = Math.max(0.05, Math.min(
      1.0,
      (tp.contrast ?? 0.5) * 1.15 * (1.0 - st.wear * 0.45) + vbContrast - vbImpurity * 0.25));
    const dopplerPreserve = Math.min(0.65, Math.max(0.25, (fp.preserveRatio ?? d.preserveRatio) + st.wear * 0.18));

    /* ★ 2026-10-08（S5 逐卡可辨性）：多普勒调色板整体色相旋转。
     *
     * 为什么需要这个开关：F10 彩色油膜的外观**几乎完全由调色板决定**
     * （`js/skin/shader/finishes.js` 的 F10 分支：`dopColor = k3dPalette4(pal0..pal3, ramp)`），
     * 而调色板是从**材质**派生的（`js/skin/materials.js:308`
     * `cfg.doppler = makeDopplerProfile(cfg.baseColor, cfg.dopplerStyle, …)`）。
     * 于是"同材质 + 同 dopplerStyle"的卡必然同色 —— 实测 S5_14(液氮急淬) 与
     * S5_21(神淬虹彩) 在 21 组 colorPhase/strength 组合下 meanΔ 恒为 1.27，
     * 一个数字都不动（这两张卡是全项目最弱的一对，拖住了"逐卡可辨"验收）。
     *
     * 为什么不能在 shader 里改 ramp 或 colorPhase：F10 的
     *   `ramp = clamp(mask * 1.15 + colorPhase + fresnel * 0.35, 0, 1)` 会被
     *   mask 顶到 1 而饱和，此时 `k3dPalette4` 恒取 paletteEnd 端点色，
     *   **任何相位类参数都失效**（这正是实测扫 21 组不动的原因）。
     *
     * 所以在数据层旋转整个调色板：只作用于"用 F10 的卡"，不动 shader、
     *   不动材质定义、不影响其它 11 种工艺。卡数据通过
     *   `variants.finish.paletteShift`（0~1，0.5 = 旋转半个色环）给出。
     * 取色口径：只转**色相**，饱和度与明度原样保留 —— 保证还是同一个
     *   "彩色油膜"质感，只是配色换了。 */
    const palShift = Number(fp.paletteShift) || 0;
    const palRot = (c) => {
      if (!palShift) return c;
      if (typeof c === 'string') {
        const rgb = hexToRgb01(c);
        const hsv = rgbToHsv01(rgb);
        return hsvToRgb01([((hsv[0] + palShift) % 1 + 1) % 1, hsv[1], hsv[2]]);
      }
      if (Array.isArray(c) && c.length === 3) {
        const hsv = rgbToHsv01(c);
        return hsvToRgb01([((hsv[0] + palShift) % 1 + 1) % 1, hsv[1], hsv[2]]);
      }
      return c;
    };
    const dopPal0 = palRot(d.paletteStart);
    const dopPal1 = palRot(d.paletteMid);
    const dopPal2 = palRot(d.paletteAlt);
    const dopPal3 = palRot(d.paletteEnd);

    // ★ 2026-10-11 S2 净化杂质 → 材质层换算（只在 melt.purity 生效时拷贝材质，其它阶段逐字节不变）：
    //   纯净端：粗糙↓（镜面）· 清漆↑且更锐（玻璃罩面）· 环境反射↑ · 粗糙度更均匀
    //   杂质端：粗糙↑ · 粗糙度不均↑（颗粒感）· 环境反射↓（浑浊哑光）
    //   ⚠ 2026-10-11 修正（用户反馈「稀有及以上出现奇怪纹路和颜色」）：**不再使用透射（transmission）**、
    //     金属度也只微调 —— 高纯净度此前把金属度压到 0.37 并加 0.62 透射，刀身变成折射玻璃：
    //     底色被冲淡成灰白、还出现背景折射亮纹，即用户说的"奇怪纹路和颜色"。
    //     现在改为「抛光纯净金属 + 玻璃罩面」：保持金属本色与反射，只用镜面度/罩面/环境反射表达纯净。
    /* ★★ 2026-10-23（用户：S2 按 10.12 的「锻刀大赛 v1.0」参考实现改）
     *
     *   参考文件：`C://Users//Administrator//Downloads//锻刀大赛10.12//锻刀大赛 v1.0\src\render\legacy\skin\state.js`
     *   它的 S2 纯净度是**一整套材质换算**（不是单一粗糙度）：
     *     metalness −0.55·p · roughness −0.22·p + 0.16·(1−p)
     *     roughnessVariation +0.28·(1−p) − 0.10·p · envIntensity +0.30·p − 0.22·(1−p)
     *     clearcoat +0.75·p · clearcoatRoughness −0.14·p
     *   —— 纯净 = 金属度低、清漆厚而锐、环境反射强、表面均匀；
     *      杂质 = 金属度高、粗糙且不均、环境反射弱（浑浊哑光）。
     *
     *   ⚠ 两处**故意不一致**（都有据）：
     *     ① `transmission` 参考里写 +0.62·p，但同一段注释明确「已修正：不再使用透射，
     *        否则刀身变折射玻璃、底色被冲淡、出现背景折射亮纹」。而且开透射会**新增管线配置**
     *        （首帧 ~1 s，见 RESULT §3.12），违反"加载性能不变差"。所以保持 0。
     *     ② 我们原来的 metalness 只敢 −0.06，比参考弱一个数量级，这正是"S2 看不出来"的原因，
     *        现按参考改成 −0.55。 */
    const matEff = (meltPur == null) ? mat : Object.assign({}, mat, {
      metalness: Math.max(0.05, Math.min(1, (mat.metalness || 0) - 0.55 * meltPur)),
      roughness: Math.max(0.02, Math.min(1, (mat.roughness || 0.4) - 0.22 * meltPur + 0.16 * (1 - meltPur)
        + ((Number(melt.roughnessStrength) || 0.4) - 0.4) * 0.06
        + (Number(melt.mistLarge) || 0) * 0.10 - (Number(melt.shardContrast) || 0) * 0.04)),
      roughnessVariation: Math.max(0, Math.min(1,
        (mat.roughnessVariation || 0) + 0.28 * (1 - meltPur) - 0.10 * meltPur)),
      envIntensity: Math.max(0.2, Math.min(2.4, (mat.envIntensity || 1) + 0.30 * meltPur - 0.22 * (1 - meltPur))),
      clearcoat: Math.max(0, Math.min(1, (mat.clearcoat || 0) + 0.75 * meltPur)),
      clearcoatRoughness: Math.max(0.02, Math.min(1,
        (mat.clearcoatRoughness != null ? mat.clearcoatRoughness : 0.2) - 0.14 * meltPur)),
      transmission: Math.max(0, Math.min(0.85, (mat.transmission || 0))),
    });
    /* 2026-10-12（S3 v12）删除已死代码：纹理色板通道（texTintA/B/Mix + 对应的
     *   k3dTintHex / k3dPaletteTintHex 派生函数 + 着色器里的色板混合块）。
     *   历史：S3 v3 曾用「从刀身金属色派生」的双色渐变，v6 改半透明彩色覆盖层，
     *   v7 用户最终口径「S3 不再使用卡色板」→ tintMix 恒为 0、整条路径永不执行。
     *   现行口径（v12，用户口径）：纹理只做**明暗 + 粗糙度**调制，不改刀身颜色。 */
    /* ★ 2026-10-11（S3 v5，用户口径）：按卡名生成的专属纹理图 + 每局随机变换。
     *   卡有纹理图时（K3D.s3TexMaps）直接采样该图，取代程序化图案；
     *   旋转 / 缩放 / 平移由 patternSeed 派生 —— 同一张卡每次锻造细节都不同。 */
    const s3Id = tex && tex.id ? tex.id : null;
    // has() 只查表、不烘焙纹理图（每帧都会调用，绝不能在这里生成 canvas）
    const s3has = !!(K3D.s3TexMaps && s3Id && K3D.s3TexMaps.has(s3Id));
    const s3r = seededRandom((seeds.patternSeed ^ 0x9e3779b9) >>> 0);
    /* ★ 2026-10-16（用户：「默认纹理那层 S2 没选不应该是没有吗？没选就没有」）：
       纹理是 **S3 决策卡** 的产物 —— 玩家没选过就一层都不许留。
       `textureChosen === false` 时：图像层关掉（uS3On=0），
       配合门面把 `uSkinTexStrength` 压到 0（programmatic 分支也一起静音）。 */
    const textureChosen = st.textureChosen !== false;
    const uS3On = (s3has && textureChosen) ? 1 : 0;
    const uS3TexId = s3Id;
    // 缩放 <1 = 放大纹理（看到的是一张图的一部分），纹路特征更清楚、不像噪点
    const uS3Tier = (K3D.s3TexMaps && K3D.s3TexMaps.tierOf) ? K3D.s3TexMaps.tierOf(s3Id) : 0;
    /* ★ 2026-10-12（S3 v8，用户反馈「没到原图的密度」）：
     *   密度按档位给 —— 普通档约等于原图 1:1，档位越高重复次数越多
     *   （1.00 → 2.40），高稀有度纹路更密、更华丽；每局仍带 ±7% 随机浮动。 */
    // ★ 2026-10-12（S3 v9，用户口径）：**所有档位统一按约 1:1 贴图**（取消按档加密），
    //   只保留每局 ±6% 的随机浮动，保证同一张卡每次锻造细节不同。
    // 旋转从 ±180° 收敛到 ±25°：原来纹路走向每局都随机，看着像"变形"；
    // 现在保留随机感但走向稳定，纹理和刀身结构更容易读。
    // 缩放 1.0 = 一张纹理图正好铺满刀面（投影基准见 bladeViewer 的 frame.bladeUV）。
    /* ★ 2026-10-12（S3 v13）接线卡里已经写了、但图像路径此前忽略的三个纹理键：
     *   scale    → 平铺密度（1 = 一张图正好铺满刀面；>1 更细密）
     *   rotation → 该卡固有的走向（度），叠加在每局 ±25° 的随机旋转之上
     *   warp     → 域扭曲幅度（锻打的不规则感；周期与平铺对齐，接缝依然无缝）
     *   其余键（density / gridScale / cellScale / shard* / mist* / flowDir …）是
     *   **程序化生成器**（s3TexMaps.js，仅在缺图回退时使用）的参数，图像路径不需要。 */
    const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
    const uS3Scale = num(tp.scale, 1);
    const uS3RotBias = num(tp.rotation, 0) * Math.PI / 180;
    const uS3Warp = Math.max(0, Math.min(1, num(tp.warp, 0)));
    // cross = 1：同一张图再转 90° 采一次取较暗者 → 两组脊线交叠（"交脊叠纹"这类卡用）
    const uS3Cross = num(tp.cross, 0) > 0.5 ? 1 : 0;
    // Front-on mobile view needs enough relief to distinguish all forging cards.
    // The same card varies subtly per run; its seed never depends on later knife shapes.
    /* ★ 2026-10-22（S3 纹理密度与可辨）：实测 24 张纹理卡在物体掩膜内只差 12–19/255，
       原因是明暗调制幅度上限太低（0.52~0.68）。这里把基准与递进同时抬高 ——
       只改"调制幅度"，不改覆盖层、不改颜色，刀身结构仍不受影响。 */
    const S3_DENSITY_K = 1.26;
    const S3_ALPHA_K = 1.16;
    /* ★ 2026-10-23（S3 逐卡密度）：试过按身份 g 再乘一档缩放（0.80–1.34）+ 走向 ±0.35 rad，
       **实测反而更差**：S3 撞色对 33 → 44。原因是纹理放大后细节在这个取景下更看不清，
       同族纹理更像了。已回退。⇒ S3 的问题不在"疏密"，在"图案本身太接近"，
       要真正分开只能动色相（会把 S3 变成彩色，与"纹理只调明暗"的既定口径冲突 → 需用户拍板）。 */
    const idG = 0.5;
    const uS3Xf = [(s3r() * 2 - 1) * (Math.PI / 16) + uS3RotBias,
      uS3Scale * (0.94 + s3r() * 0.12) * S3_DENSITY_K, s3r(), s3r()];
    // ★ 2026-10-12（S3 v12）纹理强度权重：普通档含蓄、高稀有度更实（0.52 ~ 0.68）。
    //   它不再控制"覆盖层透明度"（那层已按用户口径删除），而是乘在**明暗调制幅度**上：
    //   纹理只调制明暗与粗糙度，刀身结构与颜色不受影响。
    const uS3Alpha = s3has ? (0.60 + Math.min(5, uS3Tier) * 0.045) * S3_ALPHA_K : 0;
    /* ★ 2026-10-17：把 9 个槽的已复刻族烘成一张 3×3 图集（运行时 canvas，缓存见 bakedMotif.js）
       ⚠ 必须放在 `return {` **之前** —— 上一版插在对象字面量里，整个包解析失败
         （页面报 "Unexpected Identifier 'bakedAtlas'"，引导屏永远停住）。 */
    const bakedAtlas = anyBake ? getBakedAtlas(bakedSlots) : null;
    /* 动画族（6 个）走 12 帧条带 —— 与静态图集分开（布局不同：X=帧、Y=槽） */
    const animAtlas = anyBake ? getAnimAtlas(bakedSlots) : null;
    const bakedMetaFlat = (() => {
      const out = new Float32Array(36);
      if (!bakedAtlas) return out;
      for (let i = 0; i < 9; i++) {
        const m = bakedAtlas.meta[i] || [0, 0, 0, 0];
        out[i * 4] = m[0]; out[i * 4 + 1] = m[1]; out[i * 4 + 2] = m[2]; out[i * 4 + 3] = m[3];
      }
      return out;
    })();

    return {
      state: st,
      /* ★ 2026-10-21（方案 §5「lease / pin / refCount」）：把这两张图集的账本 id 带出去。
         谁持有这份配方，谁就有责任 pin 一次 —— 目前有两个 owner：
           ① 当前显示（index.js#applySkin）
           ② 预热池条目（index.js#_prewarmWork → _removeWarm 里 unpin）
         没有 owner 的日子（refs=0）才允许被预算降级淘汰。 */
      atlasLease: {
        motif: bakedAtlas && bakedAtlas.key ? 'motif-atlas:' + bakedAtlas.key : null,
        anim: animAtlas && animAtlas.key ? 'anim-atlas:' + animAtlas.key : null,
      },
      // ★ S2 净化杂质 → 材质通透度：purity 高走「低金属度 + 透射 + 清漆镜面」，
      //   purity 低走「高粗糙 + 低环境反射 + 粗糙度不均」的浑浊杂质感。
      //   meltPur == null（S1 / 其它阶段）时直接用原材质，逐字节不变。
      material: matEff,
      texture: tex,
      finish: fin,
      seeds,
      wear,
      uniforms: {
        // ── 材质层 ──
    /* ★ 2026-10-23（用户决策：S2/S3 给极轻色偏）
     *
     *   背景：S2 还有 20 对、S3 还有 27 对卡在决策卡尺寸下几乎无法区分（<6/255 且 ΔHue<8°）。
     *   无色相杠杆已试尽：放大纹理疏密 → S3 反而 33→44 对；偏移 roughnessStrength → 只到 27 对。
     *   所以给"熔炼/锻打"两段加一点**极轻的基色色偏**（±12°、饱和度 +≤0.08），
     *   落在 uBladeBaseColor 上，后续阶段自然继承 —— 这是唯一还能动且零成本的通道。
     *   g 来自 recipe 的黄金序列（按 STAGE_RANK），同阶段的卡互不相邻。 */
    /* S2 不染（用户口径）：旗帜由 core/recipe.js 放在 identity.tint 上 —— state 里拿不到 stageIndex */
    uBladeBaseColor: ((st.materialIdentity && st.materialIdentity.tint) ? identityTintHex(mat.baseColor, st.materialIdentity) : mat.baseColor),
    // 2026-10-12（S3 v12）uTexTintA/B/Mix 已随色板路径删除（见上方说明）。
        uVisualTier: st.visualTier,
        /* ★★ 2026-10-23：**这张卡自己的稀有档**（0..5）。
           uVisualTier 是"整局构筑的最高档"（预览时基线是普通卡 → 0），
           拿它去判 S5 效果库会导致"稀有卡也拿不到效果"（实测表面淬火完全不显色）。
           效果库要的是"本卡够不够高级"，所以单独给一个槽位。 */
        uCardTier: (st.identity && Number.isFinite(st.identity.tier)) ? st.identity.tier : st.visualTier,
        uRarityColor: K3D.rarityVisuals ? K3D.rarityVisuals.resolve(st.visualTier).color : '#c5d7e8',
        uCardFx: cardFx,
        /* 图集：uBakedMeta[i].x = family + 1（0 = 该槽未烘焙）、.y = 3×3 图集格号；
           uAnimMeta[i] = (family+1, row, period, rowCount)，动画族走 12 帧条带 */
        uBakedAtlas: bakedAtlas ? bakedAtlas.texture : null,
        /* 9 槽 × vec4 = 36 个 float，扁平传（three 对 vec4 数组要连续内存） */
        uBakedMeta: bakedMetaFlat,
        uAnimAtlas: animAtlas ? animAtlas.texture : null,
        uAnimMeta: animAtlas ? animAtlas.meta : new Float32Array(36),
        uEffectTime: 0,
        uBladeMetalness: Math.min(1, matEff.metalness + vbMetal),
        // ★ visualBonus.roughness（TR05 镜面冷光，负值=更镜面）加到材质粗糙度
        /* ★★ 2026-10-23（用户口径）：「S2 要体现熔炼纯净度，差的卡表面有一点点粗糙，
           S2 阶段不改变刀身颜色」。所以纯净度只落到**基础粗糙度**上：
           purity 越高越光滑（高光紧、反射清），越低越粗糙（高光散、表面发浊）。
           系数 0.22：这批卡 purity 在 0.14–0.42 之间，对应 roughness +0.128 … +0.189
           —— 是"看得出来但不脏"的量级。不碰任何颜色通道。 */
        uBladeRoughness: Math.max(0.02, Math.min(1, matEff.roughness + vbRough + meltRoughAdd)),
        /* ★★ 2026-10-23：原来 S2 这一项被强制置 0，于是"纯净度"只能靠整体粗糙度，
           在纯钢上几乎看不出来。现在按杂质度打开**空间**粗糙度变化
           （shader 里 `rough += uBladeRoughVar * (p - 0.5) * 2.0`），
           低纯净度的卡表面会出现细密的斑驳高光 —— 就是玩家说的"有一点点粗糙"。 */
        /* 试过按杂质度打开**空间**粗糙度颗粒（uBladeRoughVar）→ 反而更像：
           所有卡都变成"细密斑驳"，基线拼图的卡间中位从 20.45 掉到 18.16。已回退。
           结论：S2 的纯净度差异要用**整体粗糙度**表达（高光整体散开），
           空间颗粒在这里是"加噪声"，不是"加差异"。 */
        uBladeRoughVar: !textureChosen && meltPur != null ? 0 : matEff.roughnessVariation,
        uBladeSpecular: matEff.specularIntensity,
        uBladeClearcoat: matEff.clearcoat,
        uBladeClearcoatRough: matEff.clearcoatRoughness,
        uBladeAnisotropy: mat.anisotropy,
        uBladeAnisotropyRot: mat.anisotropyRotation,
        uBladeTransmission: matEff.transmission,
        uBladeIOR: matEff.ior,
        uBladeIridescence: iridescence,                       // 已被 wear 衰减
        uBladeIridThickness: mat.iridescenceThickness || [100, 400],
        uBladeEmission: mat.emissionColor || '#000000',
        // visualBonus.emission（星尘/月蚀类）加到自发光强度上
        uBladeEmissionInt: (mat.emissionIntensity || 0) + vbEmission,
        uBladeEnvIntensity: matEff.envIntensity,
        // ── 纹理层（id 走 int 分支，参数走 vec4 打包，避免 uniform 爆炸）──
        uTexId: K3D.textures12.indexOf(tex.id),
        // ── S3 纹理图（按卡名生成，灰度/无色）：uS3On 开关 + 每局随机变换 ──
        uS3On,
        uS3TexId,
        uS3Xf,
        uS3Alpha,
        uS3Warp,
        uS3Cross,
        // visualBonus.textureScale 乘到纹理缩放
    // ★ 2026-10-11（S3 锻打）同纹理「多次锻造」的确定性微差，直接内联在此处计算
    //   （不在别处声明常量：uniform 打包段在本文件里可能先于其它声明执行，避免 TDZ 报错）：
    //   旋转 ±8°（patternSeed）· 尺度 ±8%（warpSeed）· 扭曲 ±15%（colorPhaseSeed）。
    //   同一 seed 必然复现同一结果；不同 seed（不同局）纹理走向/疏密/尺度略有不同。
    //   旋转生效依赖 patterns.js 的 k3dPattern 入口新增的 L.xy 旋转（此前 rotation 是死键）。
    // ★ 2026-10-11（S3 锻打）：纹理整体放粗 40%（× 0.6）—— 实测 scale≈1 时锻打纹理细到
    //   在游戏取景下几乎读不出来（此前画面里明显的"大马士革线"其实主要来自稀有度蚀刻层，
    //   该层已按要求删除）。放粗后 12 种纹理的走向/疏密才真正可辨，也才谈得上"每张卡一个独特纹理"。
    /* S2 熔炼：试过按身份再拉一档图案疏密（0.82–1.30），实测对卡间差**无效**
       （S2 撞色对 21 → 21）。熔炼的可读差异来自 `purity`/`amp`，不来自图案频率。已回退。 */
    uTexParam0: [(tp.scale ?? 1) * vbScale * 0.6 * (1 + (((seeds.warpSeed % 1000) / 1000) * 2 - 1) * 0.08),
      ((tp.rotation ?? 0) + (((seeds.patternSeed % 1000) / 1000) * 2 - 1) * 8) * Math.PI / 180,
      tp.offsetX ?? 0, tp.offsetY ?? 0],
    uTexParam1: [(tp.warp ?? 0) * 1.2 * (1 + ((seeds.colorPhaseSeed * 2) - 1) * 0.15),
      patternContrast, tp.density ?? 0, tp.direction ?? 0],
        uTexParam2: [tp.flowScale ?? 0, tp.warpStrength ?? 0, tp.layerCount ?? 0, tp.roughnessStrength ?? 0.4],
        uTexParam3: [tp.mistLarge ?? 0, tp.mistSmall ?? 0, tp.softness ?? 0, tp.cellScale ?? 0],
        uTexParam4: [tp.gridScale ?? 0, tp.grooveWidth ?? 0, tp.lineDensity ?? 0, tp.lineWidth ?? 0],
        uTexParam5: [tp.shardScale ?? 0, tp.shardContrast ?? 0, tp.plateThickness ?? 0, tp.frequency ?? 0],
        uTexParam6: [tp.tile ?? 0, tp.flowDir ?? 0, tp.stretch ?? 0, tp.anisotropy ?? 0],
        // ── 工艺层 ──
        uFinId: K3D.finishes12.indexOf(fin.id),
        uFinMix: fin.mix,
        uFinParam0: [st.finishChosen === false ? 0 : (fp.amount ?? 0), fp.darkness ?? 0, fp.gradient ?? 0, fp.heatSpread ?? 0],
        uFinParam1: [fp.phase ?? 0, fp.temperature ?? 0, fp.hueShift ?? 0, fp.coat ?? 0],
        uFinParam2: [dopplerStrength, dopplerPreserve, fp.fresnelPower ?? 2.2, fp.fresnelIntensity ?? 0.45],
        uFinParam3: [fp.colorPhase ?? 0, fp.flowSpeed ?? 0, fp.iridescence ?? 0, tp.colorSpread ?? 0],
        uFinColor: fp.tintHex || '#ffffff',
        /* ★ 2026-10-21：卡的**调色板位置**（S5 写 paletteShift）。
           v2 用它决定多普勒色带落在四段色的哪一段 —— 方案 §7 点名
           S5_20「蓝紫流界」必须真的落在蓝紫段，而不是被 rank 色相带成黄绿。
           老卡没有这个字段 → 0，v2 侧回落到 0.5（色带居中）。 */
        uV2PaletteShift: Number(fp.paletteShift) || 0,
        // ── 叠加层（6 回火 / 7 开刃）──
        // （原「阶段 4 定型辉光」uFormGlow / uFormColor 已于 2026-10-13 删除：
        //   variantParams.form 全项目 0 写入源，该层恒关闭。进阶卡辉光走
        //   render/bladeEffects.js 的多层壳实现。见本文件上方注释。）
        uTemper: [Number(tmp.temperature) || 0, Number(tmp.hueShift) || 0,
                  tmp.amount != null ? Number(tmp.amount) : 0.7, temperOn],
        // ★ 2026-10-13（S6 彩虹金属光泽）：薄膜干涉虹彩层的逐卡配方。
        //   uTemperIrid = ( family, cover, bands, strength )；uTemperFlow = 空间相位漂移。
        //   消费方 = shader/finishes.js 的 k3dApplyTemper()。
        /* ★ 2026-10-22（S6 逐卡可辨）：数据侧 uTemperIrid.strength 本来就从 0.34 到 0.88
           （差 3.5 倍），但被 S5 的着色薄膜整片盖住 —— 实测 24 张回火卡只差 6.5–9.5/255。
           这里把薄膜的覆盖与强度整体抬一档，让"回火"在 S5 之后仍然读得出来。
           仍只是 uniform，不进 program 签名。 */
        /* ★ 2026-10-23（S6）：cover 也试过 ×1.75（实测 0.336→0.525 确实生效），
           但卡间中位仍是 12.32 —— 连"改覆盖面"都不影响卡间差，说明这一层只决定绝对观感。
           保持 ×1.12 + 强度 ×1.55（这一组把 S6 的撞色对从 14 压到 0）。 */
        uTemperIrid: [tIrid.family, Math.min(1, tIrid.cover * 1.12),
                      tIrid.bands, Math.min(1.2, tIrid.strength * 1.55)],
        uTemperFlow: tIrid.flow,
        // ★ visualBonus.edgeGlow（刃线锐利 TR07）加到 S7 开刃层的强度上；
        //   即使玩家没选 S7 卡，只要特性生效也点亮刃线（`.w` 置 1）。
        // ★ grind 是打磨小游戏的结果：磨得好 → 刃线更亮、更锐（fresnelPower 更小）。
        //   两者的增量都有限幅，不会顶掉卡牌本身的视觉。
        //   注意 fresnelPower 是「减去」sharpen —— 必须在 state 侧再夹一次下限，
        //   否则 minigame 的上限（0.6）叠加到很小的卡牌基数上会击穿 0（实测 1.85 < 1.80）。
        /* ★ 2026-10-22（用户：S7 效果小一点）：刃线辉光整体压到 55%。
           只乘强度，不动 fresnelPower / 流动 —— 锐度手感保留，只是不那么"发灯带"。 */
        uEdgeGlow: [Math.min(1.2, ((eg.amount != null ? Number(eg.amount) : 0.45) + vbEdge
                    + (grind ? Number(grind.glow) || 0 : 0)) * 0.55),
                    Math.max(0.8, (eg.fresnelPower != null ? Number(eg.fresnelPower) : 2.6)
                    - (grind ? Math.min(SHARPEN_EFFECT_CAP, Number(grind.sharpen) || 0) : 0)),
                    eg.flowSpeed != null ? Number(eg.flowSpeed) : 0.35,
                    (edgeOn || vbEdge > 0 || grind) ? 1 : 0],
        // 色温：grind.heat 让刃线略偏暖（摩擦生热），与卡片的 tintHex 做加法混合
        uEdgeColor: grind
          ? k3dMixHex(eg.tintHex || '#9fd0ff', '#ffb066', Math.min(0.5, Number(grind.heat) || 0))
          : (eg.tintHex || '#9fd0ff'),
        // ── 阶段 9 调校叠加层（独立槽位，不受 S4 签名锁定影响）──
        uTune: [Number(tn.colorPhase) || 0, Number(tn.iridescence) || 0,
                tn.amount != null ? Number(tn.amount) : 0.7, tuneOn],
        // ── 多普勒调色板（材质派生，文档 §9.2）
        //    ★ paletteShift（卡数据可选）会把整条调色板旋转一个色相量，
        //      见上面 dopPal0..3 的注释：同材质同风格的 F10 卡靠它才能区分。──
        uDopPal0: dopPal0,
        uDopPal1: dopPal1,
        uDopPal2: dopPal2,
        uDopPal3: dopPal3,
        uDopMeta: [d.hueShift, d.saturationBoost, d.brightnessBoost, d.anchorHue],
        uDopStyle: ['D01', 'D02', 'D03', 'D04'].indexOf(d.style) + 1,
        // ── 种子（文档 §9.7：seed 同时影响雾团与色彩相位）──
        /* ★★ 2026-10-13（R12）修正 uSeeds.x 的量纲错误 —— 全项目「每局随机」的根因。
         *
         * 【症状（探针实测，200 个 run.seed）】
         *   uSeeds.x = seeds.patternSeed / 1e6，而 patternSeed 在**正常路径**
         *   （recipe.compose → grain.applyTo → `% 1001`，CSGO pattern index 语义）
         *   只覆盖 0~1000 → uSeeds.x 实测区间 [0, 0.001)，跨 200 局的 span 只有
         *   **0.000996**；而 y/z/w 三路 span 都是 ~0.99。
         *   于是任何 `seeds.x * N` 的写法最多只能得到 N/1000 的偏移 ——
         *   把随机量挂在这个通道上等于**完全没有熵**。
         *
         * 【实测受害者】
         *   · S6 回火虹彩的脊线 k3dRidge2( ... + seeds.x * 7.0 )  → 偏移 ≤ 0.007
         *   · 底层细粒 fineGrain（bladeSkinShader 的 k3dFbm2( ... + uSeeds.x * 17.0 )）
         *   · S9 调校波场 k3dApplyTune 的 k3dFbm2( ... + seeds.x * 11.0 )
         *   三者跨局几乎零变化 —— 而同文件 F06 表面淬火在 R11 也因此踩过坑
         *   （当时只能绕开 x、改用 y/z/w）。
         *
         * 【修法】按 patternSeed 的**真实量纲**归一化：
         *   patternSeed ≤ 1000 → 它是 pattern index，除以 1001 得 0~1；
         *   否则（直接调 composeBladeSkin、patternSeed 由 deriveSeeds 派生）→ 除以 1e6。
         *   两条路径都得到 0~1 的均匀值，**同一个 seed 仍逐位复现**（确定性不变），
         *   既有消费者的量纲仍然是「0~1 相位」，无需逐个改调用点。
         *   ★ 不动 patternSeed 本身：grain.js 的 CSGO pattern index 语义保持原样，
         *     S3 的 uS3Xf 派生（seededRandom(patternSeed ^ 0x9e3779b9)）也一字不改。 */
        uSeeds: [(((Number(seeds.patternSeed) || 0) <= 1000)
                    ? ((Number(seeds.patternSeed) || 0) / 1001)
                    : (((Number(seeds.patternSeed) || 0) % 1000000) / 1000000)),
                 seeds.warpSeed / 1000000, seeds.colorPhaseSeed, seeds.fresnelSeed],
        // ── Wear（文档 §12）──
        // ★ visualBonus.wearAccent（战损美学）强化磨损：用 wearAccented 而非 st.wear
        uWear01: wearAccented,
        uWearLevels: (() => {
          const L = wearLevels(wearAccented);
          return [L.edge, L.surface, L.pattern, L.scratch];
        })(),
        uWearRough: wearLevels(wearAccented).roughness,
      },
    };
  }

  K3D.bladeSkin = {
    seededRandom, hashSeed, deriveSeeds, wearLevels,
    STATE_DEFAULTS, makeState, hashState, composeBladeSkin,
    list: () => ({ materials: K3D.materials24.list(), textures: K3D.textures12.list(), finishes: K3D.finishes12.list() }),
  };

export const bladeSkin = __reg.proxy.bladeSkin;
