/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/s3TexMaps.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
const K3D = __reg.proxy;

  /** 纹理图尺寸：稀有度越高越细密，尺寸也更大（画质与成本的折中） */
  const SIZE = 512;

  // ── 工具：确定性随机（同一张卡每次生成一致；随机性由贴图变换承担）────────────
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function rng() {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  // ── 工具：值噪声 / fbm（在 CPU 侧烘焙进纹理图，shader 端只做一次采样）────────
  //  ★ 2026-10-11 关键修复：噪声表必须**按种子缓存**。
  //    各 draw() 里写的是 valueNoise(1101) 这种形式，而 draw 是**逐像素**调用的；
  //    早先每次调用都重建一张 256x256 的噪声表（6.5 万元素 + 6.5 万次 RNG），
  //    96x96 的图就是 6 亿次运算 —— 整页直接卡到 Runtime.evaluate 超时。
  const NOISE_CACHE = new Map();
  function valueNoise(seed) {
    const key = seed >>> 0;
    if (NOISE_CACHE.has(key)) return NOISE_CACHE.get(key);
    const rng = makeRng(seed);
    const N = 256;
    const g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const at = (x, y) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
    const fade = (t) => t * t * (3 - 2 * t);
    const noise = function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = fade(x - xi), yf = fade(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
    };
    NOISE_CACHE.set(key, noise);
    return noise;
  }
  function fbm(noise, x, y, oct, gain) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < (oct || 4); i++) {
      sum += noise(x * f, y * f) * amp; norm += amp;
      amp *= (gain == null ? 0.5 : gain); f *= 2;
    }
    return sum / Math.max(1e-6, norm);
  }

  /** 每像素写入灰度：fn(u,v) -> 0..1（u,v ∈ [0,1)） */
  function raster(size, fn) {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        let g = fn(u, v);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        const k = (y * size + x) * 4;
        const b = Math.round(g * 255);
        d[k] = b; d[k + 1] = b; d[k + 2] = b; d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  const TAU = Math.PI * 2;
  const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));
  const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
    return t * t * (3 - 2 * t);
  };
  /** 周期性线条：把坐标折成三角波，得到「等间距线」且可无缝平铺 */
  function stripe(x, period, width) {
    const p = ((x / period) % 1 + 1) % 1;
    const dist = Math.min(p, 1 - p) * period;
    return 1 - smooth(width * 0.35, width, dist);
  }
  /** 往返坐标：用于把域折叠成无缝图案 */
  function fold(x) { const p = ((x % 2) + 2) % 2; return p < 1 ? p : 2 - p; }

  // ── 24 张卡各自的纹理图设计（复杂度按稀有度递进）────────────────────────────
  //   每项：{ id, name, tier, draw(u,v) -> 0..1 }
  const DESIGN = [];

  /* —— 普通（tier 0-1）：自然、克制，重质感 —— */

  // S3_01 素面锻：最朴素的锻面，只有极缓的锻压起伏 + 细砂
  DESIGN.push({ id: 'T01', name: '素面锻', tier: 0, draw: (u, v) => {
    const n = valueNoise(1101);
    const base = 0.52 + (fbm(n, u * 3.2, v * 1.4, 3) - 0.5) * 0.14;
    const sand = (fbm(n, u * 90, v * 90, 2) - 0.5) * 0.05;
    return base + sand;
  } });

  // S3_02 缓波纹：宽而缓的水波，横向铺开
  DESIGN.push({ id: 'T23', name: '缓波纹', tier: 0, draw: (u, v) => {
    const n = valueNoise(2301);
    const w = Math.sin((u * 5.0 + fbm(n, u * 2.0, v * 1.0, 2) * 1.4) * TAU);
    return 0.50 + w * 0.16 + (fbm(n, u * 24, v * 24, 2) - 0.5) * 0.06;
  } });

  // S3_03 定向丝：单向细丝，像拉丝金属
  DESIGN.push({ id: 'T02', name: '定向丝', tier: 0, draw: (u, v) => {
    const n = valueNoise(302);
    const jitter = (fbm(n, u * 2.0, v * 14.0, 3) - 0.5) * 0.05;
    const line = stripe(v + jitter, 0.045, 0.020);
    return 0.50 + (line - 0.5) * 0.22 + (fbm(n, u * 60, v * 60, 2) - 0.5) * 0.05;
  } });

  // S3_04 粗锤痕：大颗粒锤击凹坑
  // 2026-10-12：tier 与卡稀有度对齐（T04 → S3_04 普通 = 0）
  DESIGN.push({ id: 'T04', name: '粗锤痕', tier: 0, draw: (u, v) => {
    const n = valueNoise(404);
    const cell = 0.09;
    const cx = Math.floor(u / cell), cy = Math.floor(v / cell);
    const rng = makeRng(404 * 7919 + cx * 131 + cy * 977);
    const jx = (u / cell - cx) - (0.30 + rng() * 0.40);
    const jy = (v / cell - cy) - (0.30 + rng() * 0.40);
    const d = Math.sqrt(jx * jx + jy * jy) / 0.34;
    const dent = 1 - smooth(0.25, 1.0, d);
    return 0.55 - dent * 0.16 + (fbm(n, u * 70, v * 70, 2) - 0.5) * 0.05;
  } });

  // S3_05 微密纹：密集微细纹，细而不乱
  DESIGN.push({ id: 'T22', name: '微密纹', tier: 1, draw: (u, v) => {
    const n = valueNoise(505);
    const a = stripe(v + fbm(n, u * 3, v * 3, 2) * 0.10, 0.018, 0.008);
    const b = stripe(u + fbm(n, u * 3, v * 3, 2) * 0.10, 0.022, 0.009);
    return 0.50 + ((a + b) * 0.5 - 0.5) * 0.26;
  } });

  // S3_06 宽波纹：更宽的水波 + 层叠
  DESIGN.push({ id: 'T05', name: '宽波纹', tier: 1, draw: (u, v) => {
    const n = valueNoise(606);
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const w = 2.6 + i * 1.9, ph = i * 0.7;
      s += Math.sin((u * w + fbm(n, u * 1.5, v * (0.8 + i), 2) * 1.2 + ph) * TAU) / (i + 1.4);
    }
    return 0.50 + s * 0.16 + (fbm(n, u * 30, v * 30, 2) - 0.5) * 0.05;
  } });

  /* —— 精良（tier 1）：开始出现结构 —— */

  // S3_07 纵丝纹：纵向丝束
  DESIGN.push({ id: 'T20', name: '纵丝纹', tier: 1, draw: (u, v) => {
    const n = valueNoise(707);
    const s = stripe(u + (fbm(n, u * 8, v * 2, 3) - 0.5) * 0.05, 0.05, 0.016);
    return 0.48 + (s - 0.5) * 0.34 + (fbm(n, u * 40, v * 90, 3) - 0.5) * 0.07;
  } });

  // S3_08 六边格：六边形晶格
  DESIGN.push({ id: 'T07', name: '六边格', tier: 1, draw: (u, v) => {
    const n = valueNoise(808);
    const S = 0.10;
    const y = v / (S * Math.sqrt(3) / 2);
    const row = Math.floor(y);
    const x = u / S + (row % 2) * 0.5;
    const hx = x - Math.floor(x), hy = y - row;
    let d = 1e9;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const px = i, py = j;
        const dx = hx - (px + (Math.abs(py) % 2) * 0.5), dy = hy - py;
        d = Math.min(d, Math.sqrt(dx * dx + dy * dy));
      }
    }
    const edge = 1 - smooth(0.16, 0.34, d);
    return 0.55 - edge * 0.26 + (fbm(n, u * 60, v * 60, 2) - 0.5) * 0.05;
  } });

  // S3_09 密层纹：密集层叠（大马士革式）
  // 2026-10-12：tier 与卡稀有度对齐（T15 → S3_09 精良 = 1）
  DESIGN.push({ id: 'T15', name: '密层纹', tier: 1, draw: (u, v) => {
    const n = valueNoise(909);
    const flow = u * 2.4 + Math.sin(v * 6.0 * TAU / 6.0) * 0.55 + fbm(n, u * 2, v * 3, 3) * 1.5;
    const layers = 1 - smooth(0.30, 0.52, Math.abs(((flow * 14) % 1) - 0.5));
    return 0.52 + (layers - 0.5) * 0.44 + (fbm(n, u * 80, v * 80, 2) - 0.5) * 0.05;
  } });

  // S3_10 碎晶分形：碎晶 + 分形裂纹
  DESIGN.push({ id: 'T16', name: '碎晶分形', tier: 2, draw: (u, v) => {
    const n = valueNoise(1010);
    const w = fbm(n, u * 4.0, v * 4.0, 4);
    const shard = Math.abs(((u * 7.0 + v * 4.0 + w * 3.0) % 1) - 0.5) * 2;
    const crack = 1 - smooth(0.06, 0.22, shard);
    const micro = fbm(n, u * 120, v * 120, 3);
    return 0.58 - crack * 0.30 + (micro - 0.5) * 0.12;
  } });

  // S3_11 浅刻线：浅而细的刻线
  DESIGN.push({ id: 'T03', name: '浅刻线', tier: 1, draw: (u, v) => {
    const n = valueNoise(1111);
    const l1 = stripe(v + (fbm(n, u * 2, v * 2, 2) - 0.5) * 0.06, 0.075, 0.010);
    const l2 = stripe(v + 0.037 + (fbm(n, u * 2, v * 2, 2) - 0.5) * 0.06, 0.075, 0.006);
    return 0.52 + ((l1 * 0.7 + l2 * 0.3) - 0.5) * 0.24;
  } });

  // S3_12 矿屑锋面：矿石碎屑的锐利小面
  DESIGN.push({ id: 'T17', name: '矿屑锋面', tier: 2, draw: (u, v) => {
    const n = valueNoise(1212);
    const cell = 0.065;
    const cx = Math.floor(u / cell), cy = Math.floor(v / cell);
    const rng = makeRng(1212 * 31 + cx * 7919 + cy * 104729);
    const ang = rng() * Math.PI;
    const pu = (u / cell - cx) - 0.5, pv = (v / cell - cy) - 0.5;
    const t = pu * Math.cos(ang) + pv * Math.sin(ang);
    const facet = (t + 0.5);
    const edge = 1 - smooth(0.0, 0.16, Math.abs(t) - 0.34);
    return 0.44 + facet * 0.22 - edge * 0.18 + (fbm(n, u * 90, v * 90, 2) - 0.5) * 0.06;
  } });

  // S3_13 深格纹：深而清晰的方网格
  DESIGN.push({ id: 'T06', name: '深格纹', tier: 1, draw: (u, v) => {
    const n = valueNoise(1313);
    const w = 0.010 + fbm(n, u * 3, v * 3, 2) * 0.006;
    const gx = stripe(u, 0.083, w), gy = stripe(v, 0.083, w);
    const grid = Math.max(gx, gy);
    return 0.56 - grid * 0.30 + (fbm(n, u * 70, v * 70, 2) - 0.5) * 0.05;
  } });

  /* —— 稀有（tier 2）：清晰结构 + 层次 —— */

  // S3_14 交脊叠纹：两组交错的脊线（去块状感：改为细而连续的脊）
  DESIGN.push({ id: 'T14', name: '交脊叠纹', tier: 2, draw: (u, v) => {
    const n = valueNoise(1414);
    const warp = fbm(n, u * 2.2, v * 2.2, 3) - 0.5;
    const a = stripe((v + warp * 0.16) * 1.0 + u * 0.55, 0.13, 0.014);
    const b = stripe((v + warp * 0.16) * 1.0 - u * 0.55, 0.13, 0.010);
    const ridge = Math.max(a, b);
    const second = stripe((v + warp * 0.22) * 1.0 + u * 0.20, 0.037, 0.006);
    return 0.54 - ridge * 0.26 - second * 0.06 + (fbm(n, u * 70, v * 70, 2) - 0.5) * 0.05;
  } });

  // S3_15 单向熔纹：单向熔流，带拉长的高光带
  DESIGN.push({ id: 'T08', name: '单向熔纹', tier: 2, draw: (u, v) => {
    const n = valueNoise(1515);
    const flow = fbm(n, u * 3.0, v * 12.0, 4);
    const band = 1 - smooth(0.16, 0.40, Math.abs(flow - 0.5));
    return 0.50 + (band - 0.5) * 0.42 + (fbm(n, u * 30, v * 130, 3) - 0.5) * 0.10;
  } });

  // S3_16 阔晶错层：宽晶层错位堆叠
  DESIGN.push({ id: 'T09', name: '阔晶错层', tier: 2, draw: (u, v) => {
    const n = valueNoise(1616);
    const off = Math.floor(v / 0.16) % 2 ? 0.5 : 0.0;
    const layer = Math.floor(v / 0.16);
    const rng = makeRng(1616 + layer * 977);
    const shear = (rng() - 0.5) * 0.35;
    const t = u + off * 0.5 + shear + (fbm(n, u * 4, v * 4, 3) - 0.5) * 0.25;
    const cell = 1 - smooth(0.10, 0.30, Math.abs(((t * 6.0) % 1) - 0.5));
    const seam = 1 - smooth(0.0, 0.05, Math.abs(((v / 0.16) % 1) - 0.5) * 0.16);
    return 0.54 + (cell - 0.5) * 0.30 - seam * 0.20;
  } });

  // S3_17 深刻聚刃：向刃口汇聚的深刻线
  DESIGN.push({ id: 'T12', name: '深刻聚刃', tier: 3, draw: (u, v) => {
    const n = valueNoise(1717);
    const conv = Math.pow(clamp01(u), 0.6);
    const lines = stripe(v + (fbm(n, u * 3, v * 3, 3) - 0.5) * 0.10, 0.055 - conv * 0.03, 0.009 + conv * 0.006);
    const deep = stripe(v * 1.0 + 0.5, 0.28, 0.05);
    return 0.52 - lines * 0.30 - deep * 0.06 + (fbm(n, u * 80, v * 80, 2) - 0.5) * 0.05;
  } });

  // S3_18 雾界分流：雾与清晰区的分界（硬软交替）
  DESIGN.push({ id: 'T19', name: '雾界分流', tier: 3, draw: (u, v) => {
    const n = valueNoise(1818);
    const bound = 0.5 + (fbm(n, u * 1.6, v * 1.2, 3) - 0.5) * 0.7;
    const side = smooth(bound - 0.06, bound + 0.06, v);
    const mist = fbm(n, u * 8.0, v * 8.0, 4);
    const stream = stripe(v + (fbm(n, u * 5, v * 5, 3) - 0.5) * 0.2, 0.10, 0.02);
    return 0.52 + (1 - side) * (mist - 0.5) * 0.34 + side * (stream - 0.5) * 0.30;
  } });

  // S3_19 云彩偏光：云状柔光带（灰度下的云层与偏光条纹）
  DESIGN.push({ id: 'T13', name: '云彩偏光', tier: 3, draw: (u, v) => {
    const n = valueNoise(1919);
    const cloud = fbm(n, u * 3.4, v * 2.2, 5);
    const ripple = 0.5 + 0.5 * Math.sin((cloud * 9.0 + u * 2.0) * Math.PI);
    const sheen = stripe(cloud * 3.0 + v * 0.5, 0.14, 0.05);
    return 0.48 + (cloud - 0.5) * 0.34 + (ripple - 0.5) * 0.14 + sheen * 0.10;
  } });

  // S3_20 秘锻窄脊：窄而密的脊，带隐秘层次
  DESIGN.push({ id: 'T21', name: '秘锻窄脊', tier: 3, draw: (u, v) => {
    const n = valueNoise(2020);
    const warp = fbm(n, u * 4, v * 2, 4) - 0.5;
    const ridge = stripe(v + warp * 0.22 + u * 0.35, 0.032, 0.007);
    const ridge2 = stripe(v + warp * 0.22 - u * 0.18 + 0.5, 0.055, 0.010);
    return 0.54 - ridge * 0.26 - ridge2 * 0.14 + (fbm(n, u * 110, v * 110, 3) - 0.5) * 0.07;
  } });

  /* —— 史诗 / 传说 / 神话（tier 3-5）：复杂、层次多、辨识度高 —— */

  // S3_21 留白雾境：大面积留白 + 极淡雾界（去掉暗斑：整体保持高亮、无深色团块）
  // 2026-10-12：tier 与卡稀有度对齐（T10 → S3_21 传说 = 4）
  DESIGN.push({ id: 'T10', name: '留白雾境', tier: 4, draw: (u, v) => {
    const n = valueNoise(2121);
    const veil = fbm(n, u * 2.0, v * 1.5, 4);
    const wisps = fbm(n, u * 5.5, v * 4.0, 4);
    // 只用「提亮」不用「压暗」：最暗也保持在 0.58 以上 → 不会出现暗斑
    const bright = 0.66 + (veil - 0.5) * 0.16 + (wisps - 0.5) * 0.10;
    const hair = stripe(v + (fbm(n, u * 3, v * 3, 2) - 0.5) * 0.30, 0.30, 0.020);
    return bright + hair * 0.06;
  } });

  // S3_22 残彩错片：错位碎片的拼贴（灰度下靠明暗层次区分）
  DESIGN.push({ id: 'T18', name: '残彩错片', tier: 4, draw: (u, v) => {
    const n = valueNoise(2222);
    const cell = 0.075;
    const cx = Math.floor(u / cell), cy = Math.floor(v / cell);
    const rng = makeRng(2222 + cx * 7919 + cy * 104729);
    const lv = 0.40 + rng() * 0.24;
    const ang = rng() * Math.PI;
    const pu = (u / cell - cx) - 0.5, pv = (v / cell - cy) - 0.5;
    const t = Math.abs(pu * Math.cos(ang) + pv * Math.sin(ang));
    const bevel = 1 - smooth(0.28, 0.48, t);
    const seam = 1 - smooth(0.0, 0.045, Math.min(Math.abs(pu), Math.abs(pv)));
    return lv + bevel * 0.10 - seam * 0.14 + (fbm(n, u * 100, v * 100, 2) - 0.5) * 0.05;
  } });

  // S3_23 暗脊回廊：暗脊与回廊交替（深色脊线 + 走廊高光）
  DESIGN.push({ id: 'T11', name: '暗脊回廊', tier: 4, draw: (u, v) => {
    const n = valueNoise(2323);
    const warp = fbm(n, u * 2.6, v * 3.4, 4) - 0.5;
    const corridor = stripe(v + warp * 0.26, 0.16, 0.030);
    const spine = stripe(v + warp * 0.26 + 0.5, 0.16, 0.008);
    const cross = stripe(u + warp * 0.20, 0.42, 0.012);
    return 0.52 + corridor * 0.20 - spine * 0.30 - cross * 0.08 + (fbm(n, u * 70, v * 70, 2) - 0.5) * 0.05;
  } });

  // S3_24 异轨天纹：异星轨道带 + 星点（最复杂：多层带 + 细星 + 微尘）
  DESIGN.push({ id: 'T24', name: '异轨天纹', tier: 5, draw: (u, v) => {
    const n = valueNoise(2424);
    const warp = fbm(n, u * 1.8, v * 2.6, 5) - 0.5;
    let bands = 0;
    for (let i = 0; i < 4; i++) {
      const p = 0.34 - i * 0.06;
      bands += stripe(v + warp * (0.34 - i * 0.05) + i * 0.13, p, 0.012 + i * 0.004) / (i + 1.2);
    }
    const star = Math.pow(clamp01(fbm(n, u * 150, v * 150, 2)), 7) * 1.6;
    const dust = (fbm(n, u * 260, v * 260, 2) - 0.5) * 0.06;
    return 0.50 + (bands - 0.35) * 0.34 + star * 0.22 + dust;
  } });

  // ── 稀有度 → 追加层次（越高越复杂：细节叠加层数递增）──────────────────────
  /** 在已画好的图上再叠「高级感」层次：细密晶粒 + 高光走线 + 微层叠 */
  function embellish(cv, tier, seed) {
    if (tier < 2) return cv;
    const size = cv.width;
    const ctx = cv.getContext('2d');
    const base = ctx.getImageData(0, 0, size, size);
    const d = base.data;
    const n1 = valueNoise(seed * 3 + 17);
    const n2 = valueNoise(seed * 7 + 91);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const k = (y * size + x) * 4;
        let g = d[k] / 255;
        if (tier >= 2) g += (fbm(n1, u * 140, v * 140, 2) - 0.5) * 0.05;            // 细晶粒
        if (tier >= 3) {
          const streak = fbm(n2, u * 6.0, v * 40.0, 3);
          g += (streak - 0.5) * 0.07;                                               // 拉长走线
        }
        if (tier >= 4) {
          const micro = Math.pow(clamp01(fbm(n2, u * 320, v * 320, 2)), 4) * 0.9;
          g += micro * 0.10;                                                        // 微高光点
        }
        if (tier >= 5) {
          const halo = Math.sin((v * 9.0 + fbm(n1, u * 2, v * 2, 3) * 4.0) * Math.PI);
          g += halo * 0.035;                                                        // 极淡的整体韵律
        }
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        const b = Math.round(g * 255);
        d[k] = b; d[k + 1] = b; d[k + 2] = b;
      }
    }
    ctx.putImageData(base, 0, 0);
    return cv;
  }

  const CACHE = new Map();

  /** 取某张纹理 id 的纹理图（灰度 canvas）。同 id 只生成一次。 */
  function get(texId) {
    const key = String(texId || '').toUpperCase();
    if (CACHE.has(key)) return CACHE.get(key);
    const d = DESIGN.find((x) => x.id === key);
    if (!d) { CACHE.set(key, null); return null; }
    // 生成成本直接决定「合成皮肤」的耗时（每张卡首次合成时烘焙一次，之后走缓存）：
    // 高稀有度给更高分辨率，普通档给低分辨率 —— 普通档本来就没有细密结构。
    // ⚠ 分辨率直接乘进启动耗时：boot 期预热多把刀会连续烘焙多张图，
    //   曾经用 320/256/192 时整页启动被拖到 Runtime.evaluate 超时。
    const size = d.tier >= 4 ? 256 : (d.tier >= 2 ? 192 : 160);
    const cv = raster(size, d.draw);
    // ⚠ embellish 逐像素再跑一遍 fbm，是纯成本；只在最高档保留
    if (d.tier >= 5) embellish(cv, d.tier, 1000 + DESIGN.indexOf(d));
    CACHE.set(key, cv);
    return cv;
  }

  /** 是否存在该 id 的纹理图（**不触发生成** —— state.js 每帧都会问一次） */
  function has(texId) {
    const key = String(texId || '').toUpperCase();
    if (!key) return false;
    // 用户提供的纹理图（s3TexMapsData，base64 内嵌）优先于本模块的程序化生成
    if (K3D.s3TexMapsData && K3D.s3TexMapsData[key]) return true;
    return DESIGN.some((x) => x.id === key);
  }

  /** 每张卡的复杂度档位（供上层按稀有度决定纹理强度等） */
  function tierOf(texId) {
    const d = DESIGN.find((x) => x.id === String(texId || '').toUpperCase());
    return d ? d.tier : 0;
  }

  K3D.s3TexMaps = {
    SIZE,
    DESIGN,
    ids: DESIGN.map((d) => d.id),
    names: DESIGN.map((d) => d.name),
    get,
    has,
    tierOf,
    /** 供调试/验收：把某张卡纹理图导出为 dataURL */
    dataUrl(texId) { const cv = get(texId); return cv ? cv.toDataURL('image/png') : null; },
  };

export const s3TexMaps = __reg.proxy.s3TexMaps;
