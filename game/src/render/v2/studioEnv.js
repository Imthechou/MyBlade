/**
 * 程序化产品摄影棚环境（P2 · 金属感的真正来源）
 *
 * ── 为什么必须做这件事 ──────────────────────────────────────────
 *
 * 实测链条（全部可复现）：
 *   ① 镜面参数（rough 0.10 / metal 0.98 / env 1.55）下画面仍像"粉灰塑料"
 *   ② 查环境：HDR 亮度均值 0.1408，**91.4% 的像素亮度 < 0.19** → 暗棚
 *   ③ 拉高 envMapIntensity 到 3.5：高光占比 6.1% → 84.3%，
 *      但**对比σ 从 0.1009 跌到 0.0787**；拉到"全开"更跌到 0.0655
 *      → 整体发白，不是金属，是过曝
 *
 * 结论：金属的 diffuse ≈ 0，画面里几乎全是**环境反射**。
 *       环境是均匀暗棚 → 反射均匀暗灰 → 只有色调映射把暗部抬成灰 → 塑料感。
 *       拉强度只是把这片灰提亮，永远提不出"高光点"。
 *
 * 真正的解法：环境里必须**有可反射的明暗结构** ——
 *   暗底 + 几个明确的亮光源（柔光箱 / 条灯 / 轮廓光）。
 *   这样镜面就能反射出清晰的高光形状，粗糙面则把它们晕开，
 *   roughness 才真正变成"看起来不同的金属"。
 *
 * ── 为什么不用现成 HDR 资产 ──────────────────────────────────
 *
 * 仓库只有一张 environment.hdr（暗棚，1.44MB）。再塞一张专业棚 HDR
 * 会扩大包体、要外部工具链，且不好针对"细长刀具"调光源位置。
 * 程序化生成：零资产、可精调、成本一次性（实测 < 60ms）。
 *
 * ── HDR 值怎么办（canvas 只能 0–255）────────────────────────────
 *
 * 计算时用 Float32，再编码到 **DataTexture + HalfFloatType**，仍可保存超过 1 的 HDR 亮度。
 * 这才是 HDR —— 只有真 HDR 值才能让金属高光"亮得有层次"，
 * 8bit 贴图上限 1.0 会被 ACES 直接压成灰。
 */

/** 赤道贴图尺寸（512×256 = 131k px，一次性成本可接受）。 */
const W = 512;
const H = 256;

/** 归一化浮点数据 → DataTexture（HalfFloat，省一半显存）。 */
function makeEquirectTexture(THREE) {
  const data = new Float32Array(W * H * 4);

  /* ── ① 底部环境：暗冷灰 + 地平线渐变 ──
     天顶偏冷暗、地平线略亮、地面最暗。整体压得很低，
     这样后面的高光源才有"对比"可言。

     ★★ 2026-10-27（展品照明重做）：
       前几版一直在调「光源强度」，但用户反馈始终是「打光太强、不柔和、光源不对」。
       查了展品照明资料（IES RP-30 / CIE LG8 / 刀具摄影实务），问题不在强度，
       在于**光源尺寸**：
         · 金属几乎不靠漫反射，画面里全是环境反射；
         · 柔光的本质是「发光面相对被摄体足够大」——
           小光源 = 硬光 = 刺眼白点，大光源 = 柔光 = 渐变。
       旧参数是 0.030×0.040 半径 + 强度 180 的**点光源**，
       所以打到镜面上就是一个死白斑块，形不成层次。
       新方案：放大发光面积、大幅降低峰值、拉开主辅比例。 */
  for (let y = 0; y < H; y++) {
    /* v: 0 = 天顶, 1 = 地面 */
    const v = (y + 0.5) / H;
    let lum;
    if (v < 0.5) {
      lum = 0.044 + 0.012 * Math.pow(v / 0.5, 1.4);
    } else {
      const t = (v - 0.5) / 0.5;
      lum = 0.050 * (1 - t * t * 0.64) + 0.010;
    }
    /* 冷灰基调（金属反射出来的环境色） */
    const r = lum * 0.92, g = lum * 0.97, b = lum * 1.10;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
    }
  }

  /**
   * 往贴图上叠一个椭圆柔光区。
   * @param {number} cx 中心经度 0..1
   * @param {number} cy 中心纬度 0..1
   * @param {number} rx 经度半径
   * @param {number} ry 纬度半径
   * @param {number} inten 峰值强度（HDR，可 > 1）
   * @param {number[]} tint RGB 比例
   * @param {number} soft 边缘柔和度（越大越硬）
   */
  const addLight = (cx, cy, rx, ry, inten, tint, soft = 2.2) => {
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const dy = (v - cy) / ry;
      if (Math.abs(dy) > 1.6) continue;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        /* 经度环绕：取最近镜像，避免接缝处出现硬切 */
        let dx = u - cx;
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        const dxn = dx / rx;
        const r2 = dxn * dxn + dy * dy;
        if (r2 > 1) continue;
        /* 高斯衰减：中心最亮，边缘平滑到 0 */
        const falloff = Math.pow(1 - r2, soft);
        const k = inten * falloff;
        const i = (y * W + x) * 4;
        data[i] += tint[0] * k;
        data[i + 1] += tint[1] * k;
        data[i + 2] += tint[2] * k;
      }
    }
  };

  /* ── ② 主光：左上大型柔光箱（暖白）──

     ★★ 2026-10-27（第三次校准 —— 前两次在两头振荡，这次想清原理了）：

       实测三个锚点（同几何，只改光源）：
         小面 120 + 核 180（旧） → hiPct 12.5%，但刺眼（用户：太强、不柔和）
         大面 28，无核          → hiPct 15.3%，亮度 0.511（仍偏高）
         大面 17，无核          → hiPct **0.55%**，柔和了但变成**平光**

       根因：我把“柔”理解成了“暗”。影棚里的柔光箱其实是
       **又大又亮**的 —— 面积大让过渡平滑，亮度高让镜面有可读的峰。
       金属几乎不靠漫反射，**形体感就来自那个镜面反射峰**：
       没有峰 → 反射是平的 → 看起来像塑胶。

       所以正确结构是「大面渐变 + 中央亮核」二者共存，不是二选一：
         · 外层 0.190×0.260 @ 17  → 过渡柔和（就是用户要的“柔”）
         · 内核 0.048×0.062 @ 62  → 给出可读镜面峰（形体）
       内核强度远低于旧值 180，面积却是旧值的 1.7 倍，
       所以是“柔和的亮”而不是“刺眼的点”。 */
  /* ★★ 2026-10-27（第四次）：收窄动态范围。

     用户反馈：「亮部太亮，暗部太暗」。实测也印证：
       S2 p10=0.032 / max=0.878；S4 p10=0.119 / max=**0.952**（近过曝）
     两头撑得太开，所以这次不是整体平移，而是**压缩两端**：
       · 削峰：亮核 34 → 19（峰值是过曝的直接来源）
       · 抬底：由下面的 frontAmbient 与旗板底噪负责 */
  addLight(0.29, 0.17, 0.210, 0.275, 4.7, [1.00, 0.97, 0.92], 1.35);
  /* 主光内核：柔光箱的亮心（形体感来源，不能省） */
  addLight(0.29, 0.17, 0.080, 0.092, 10.5, [1.00, 0.98, 0.94], 1.15);

  /* ── ③ 右侧柔光箱（冷白，辅光）──
     主辅比 ≈ 2.5:1 —— 在展品照明推荐的 2:1~4:1 区间内。
     同样是“外柔 + 内亮”：大面抬暗部，小核给第二条高光带
     （圆柱面出现两条亮带是金属的关键特征）。 */
  addLight(0.755, 0.30, 0.175, 0.295, 2.8, [0.90, 0.95, 1.00], 1.40);
  addLight(0.755, 0.30, 0.065, 0.100, 4.0, [0.92, 0.96, 1.00], 1.20);

  /* ── ④ 顶部轮廓光（窄条）──
     只负责让刃口/刀背出现一条细亮线，强化"锋利"读数。 */
  addLight(0.52, 0.055, 0.300, 0.048, 4.0, [1.00, 1.00, 1.00], 1.25);

  /* ── ⑤ 正面大范围环境补光 ──

     ★ 2026-10-27（第五次：专治“暗部太暗”）：0.45 → 2.4。

     修正测量方式后的真实数据（剔除轮廓带，只看内部像素）：
       S1  dark%(<0.10) = 15.0%
       S2  dark%(<0.10) = **27.0%**   ← 用户说的“暗部太暗”就是这个
       同时 hi%(>0.784) ≈ 0             ← 亮部已经不过曝了

     病根：S1/S2 金属度 0.92，暗部反射的是**暗背景**，于是直接死黑。
     旗板硬压暗部只会更黑，抬高必须靠大面积的弱环境光。
     既然亮部已有余量（hi%≈0），这次只抬暗部，不动亮核。 */
  addLight(0.50, 0.42, 0.480, 0.330, 3.8, [0.96, 0.97, 1.00], 1.10);

  /* ── ⑥ 地面反光（暖、弱）──
     给下缘一点亮度，避免整把刀下半截死黑。 */
  addLight(0.50, 0.88, 0.420, 0.110, 1.0, [1.00, 0.94, 0.86], 1.30);

  /* ── ⑦ 黑色旗板（暗部结构）—— 这是第一版缺的关键 ────────

     摄影棚里拍金属，“黑色旗板”和灯一样重要：它们把环境光挡掉，
     在反射里形成**暗带**。明暗交替才有体积感；只有一片均匀亮光
     就是“平光”，金属会看起来像描了一层灰塑胶。

     DataTexture 不能减光，所以用“低亮度区域要盖在高亮区之上”来模拟：
     这里直接把两块区域的亮度压到近底噪。
     位置选在左中与右下 —— 与两个柔光箱错开，于是反射里出现
     “亮-暗-亮-暗”的条带，这正是刀具摄影里让刃面有体积感的做法。

     ⚠ 必须在所有 addLight 之后执行，才能盖住前面叠上去的高光。 */
  const darkFlag = (cx, cy, rx, ry, floorLum) => {
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const dy = (v - cy) / ry;
      if (Math.abs(dy) > 1.6) continue;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        let dx = u - cx;
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        const dxn = dx / rx;
        const r2 = dxn * dxn + dy * dy;
        if (r2 > 1) continue;
        /* 中心完全压暗，边缘平滑放过 */
        const k = Math.pow(1 - r2, 1.6);
        const i = (y * W + x) * 4;
        data[i] = data[i] * (1 - k) + floorLum * 0.94 * k;
        data[i + 1] = data[i + 1] * (1 - k) + floorLum * 0.97 * k;
        data[i + 2] = data[i + 2] * (1 - k) + floorLum * 1.08 * k;
      }
    }
  };
  /* 左中旗板：在主光与相机之间挡出一道暗带
     ★ 2026-10-27：底噪 0.012 → 0.042 → 0.085。旗板是用来“压出暗带”的，
     不是用来把区域磨成纯黑的。实测把它留在 0.042 时，
     S1 仍有 15% 的像素亮度 < 0.10（直接死黑）。 */
  darkFlag(0.075, 0.46, 0.125, 0.300, 0.19);
  /* 右下旗板：把轴侧压暗，强化圆柱体的明暗交界线 */
  darkFlag(0.985, 0.62, 0.110, 0.270, 0.19);

  /* PMREM input: use real half-float bytes, not Float32 + FloatType.
     Several iOS WebKit/WebGL versions cannot linearly sample 32-bit float
     textures even when a capability flag is present; broken sampling can
     silently turn the studio reflection nearly black. WebGL2 supports
     half-float linear sampling. Keep HDR values > 1 (do not quantize to 8bit). */
  const toHalf = THREE.DataUtils?.toHalfFloat;
  if (typeof toHalf !== 'function') {
    throw new Error('THREE.DataUtils.toHalfFloat missing; cannot prepare safe HDR studio');
  }
  const halfData = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) halfData[i] = toHalf(data[i]);
  const tex = new THREE.DataTexture(halfData, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * PMREM / WebGLRenderTarget 属于创建它的 WebGLRenderer 上下文。
 * 不能像普通 Image/DataTexture 一样跨 WebGLRenderer 共用！
 *
 * 主舞台先初始化摄影棚，然后藏刀阁和详情分别创建自己的 Renderer。
 * 旧的全局单例将主舞台 RT.texture 直接交给其他 GL context，纹理无法在
 * 新 context 上传/采样，纯金属（metalness≈1）因此显示成黑色剪影。
 * 缓存必须以 renderer 为键，并在 viewer 销毁时释放其 RT。
 */
const studioEnvs = new Map();
let nextStudioEnvId = 0;
let lastGenMs = 0;

/** 为当前 WebGL 上下文取得专属 PMREM 贴图。 */
export function getStudioEnv(renderer) {
  const THREE = globalThis.THREE;
  if (!THREE || !renderer) return null;
  const cached = studioEnvs.get(renderer);
  if (cached) return cached.texture;

  const now = () => ((globalThis.performance && performance.now) ? performance.now() : Date.now());
  const t0 = now();
  const equirect = makeEquirectTexture(THREE);
  let pmrem;
  let target;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    target = pmrem.fromEquirectangular(equirect);
    if (!target?.texture) throw new Error('studio PMREM target unavailable');
  } finally {
    equirect.dispose();
    pmrem?.dispose();
  }

  lastGenMs = now() - t0;
  const key = ++nextStudioEnvId === 1 ? 'studio-env:v1' : `studio-env:v1:${nextStudioEnvId}`;
  const entry = { target, texture: target.texture, key, genMs: lastGenMs };
  studioEnvs.set(renderer, entry);

  try {
    const K3D = globalThis.K3D || {};
    K3D.rLedger?.track?.(key, {
      kind: 'studio-env', tex: entry.texture, renderer,
      bytesMiB: K3D.rLedger.textureMiB ? K3D.rLedger.textureMiB(entry.texture) : 4,
      optional: true, evictable: false,
      note: '当前渲染器的程序化摄影棚环境',
    });
  } catch (_) { /* 诊断账本不影响出图 */ }

  return entry.texture;
}

/** 把棚环境挂到场景内所有材质（与 viewer._applyEnvMapToScene 同一口径）。 */
export function applyStudioEnvToScene(renderer, scene) {
  const env = getStudioEnv(renderer);
  if (!env || !scene) return false;
  let touched = false;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.envMap === env) continue;
      m.envMap = env;
      m.needsUpdate = true;
      touched = true;
    }
  });
  /* scene.environment 也换掉：背景/透射采样保持一致 */
  scene.environment = env;
  return touched;
}

/** 当前各 renderer 的环境状态；默认报告第一个舞台。 */
export function studioEnvInfo(renderer = null) {
  const entry = renderer ? studioEnvs.get(renderer) : studioEnvs.values().next().value;
  return entry ? {
    key: entry.key, genMs: +entry.genMs.toFixed(2),
    size: `${W}x${H}`, inputType: 'HalfFloatType', contexts: studioEnvs.size,
  } : null;
}

/**
 * 按 renderer 释放对应 render target。
 * 无参用于全局重置（兼容旧调用），不会因关闭一张详情卡而清理主舞台。
 */
export function releaseStudioEnv(renderer = null) {
  if (renderer) {
    const entry = studioEnvs.get(renderer);
    if (!entry) return false;
    studioEnvs.delete(renderer);
    try { entry.target.dispose(); } catch (_) { /* context may already be lost */ }
    try { (globalThis.K3D?.rLedger)?.untrack?.(entry.key); } catch (_) { /* ignore */ }
    return true;
  }
  let released = false;
  for (const owner of [...studioEnvs.keys()]) released = releaseStudioEnv(owner) || released;
  return released;
}

/* 挂到 globalThis.K3D 上，供 legacy 层（viewer.js）直接取用。
   这是本项目 legacy ↔ v2 互访的既有约定（同 K3D.bladeSkinShader 等）。 */
try {
  const K = (globalThis.K3D = globalThis.K3D || {});
  K.studioEnv = { getStudioEnv, applyStudioEnvToScene, studioEnvInfo, releaseStudioEnv };
} catch (_) { /* ignore */ }

export default { getStudioEnv, applyStudioEnvToScene, studioEnvInfo, releaseStudioEnv };