/**
 * 运行时生成的可平铺表面高度图集（P2 · 真实贴图层）
 *
 * ── 为什么需要这个文件 ──────────────────────────────────────────
 *
 * P1 修好程序化法线层之后，刀面终于有凹凸了。但那层凹凸来自
 * **数学式**（`sin(vBladeLocal.x * ridgeFreq)`），有两个固有上限：
 *   ① 频率单一 → 看起来像「规则波纹」而不是「真实表面」
 *   ② 分辨率不受控 → 细节粒度固定，与物体远近无关
 *
 * CS2 刀皮的层次来自**真实贴图**。本项目仓库里 0 张 normal map，
 * 也不适合凭空塞 1–2MB 二进制资产（会扩大改动面、要外部工具链）。
 * 所以在运行时用 canvas 生成可平铺的高度图集：
 * 零二进制资产、零构建步骤、可离线调参。
 *
 * ── 为什么生成「高度图」而不是「法线图」────────────────────────
 *
 * P1 的 normalFragment 已经有一条成熟通路：采样高度 → 屏幕空间导数 → 法线。
 * 直接喂高度图就能复用那条通路（且本项目模型不带切线，没有 TBN 基可用）。
 *
 * ── 无缝平铺怎么保证 ────────────────────────────────────────────
 *
 * 全部用**整数频率的正弦/余弦叠加**，加上按周期取模的格点抖动：
 * 格点值索引 `((i % period) + period) % period` → 边界与对侧完全一致。
 * ⚠ 不要用 Math.random() —— 它不保证周期性，必有接缝。
 *
 * ── 性能纪律（这是第一版踩过的坑）────────────────────────────────
 *
 * 第一版 512²×4 瓦片、锤痕逐像素循环 64 个格点且每点算 2 次噪声
 * → 实测**生成耗时 1795ms**，直接卡住首帧。
 *
 * 现在改成：
 *   · 瓦片 256²（像素数 ÷4，显存 ÷4）
 *   · 锤痕**按锤点栅格化**（每锤只碰它自己的包围盒），而不是逐像素扫 64 个锤
 *   · 每瓦片的抖动/半径/深度表**预先算一次**，不进像素循环
 *   · fbm 最多 3–4 阶
 * 目标：单次生成 < 80ms（一次性成本，可放在加载屏里）。
 */

/** 图集规格：2×2 四个 256² 瓦片 = 512²。 */
const ATLAS = 512;
const TILE = 256;
const GRID = 2;

/** 瓦片类型（顺序即 tile 编号）。 */
export const SURFACE_KINDS = Object.freeze({
  HAMMER: 0,   // S2/S3：锻打锤痕（格点凹坑 + 中频起伏）
  GRAIN: 1,    // S4–S6：细密晶粒（高频均匀）
  BRUSHED: 2,  // S7–S9：拉丝丝路（沿一个方向拉伸）
  ORE: 3,      // S1 原料：粗颗粒 + 裂纹
});

/** 该阶段的表面**类型**（决定取哪张瓦片）。 */
export const STAGE_SURFACE_KIND = Object.freeze([
  SURFACE_KINDS.ORE,      // S1 原料
  SURFACE_KINDS.HAMMER,   // S2 熔炼（锤前的不规则面）
  SURFACE_KINDS.HAMMER,   // S3 锻打 ← 本阶段主角
  SURFACE_KINDS.GRAIN,    // S4 定型
  SURFACE_KINDS.GRAIN,    // S5 淬火
  SURFACE_KINDS.GRAIN,    // S6 回火
  SURFACE_KINDS.BRUSHED,  // S7 开刃（磨削纹）
  SURFACE_KINDS.BRUSHED,  // S8 装配
  SURFACE_KINDS.BRUSHED,  // S9 精校
]);

/* ── 快速确定性哈希（整数）─────────────────────────────────────── */

function hash2(ix, iy, seed) {
  let n = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (seed | 0) * 1442695041;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) & 0xffff) / 0xffff;
}

/** 周期性值噪声（格点按 period 取模 → 天然无缝）。 */
function pnoise(fx, fy, period, seed) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const p = period | 0;
  const xa = ((x0 % p) + p) % p, xb = ((x0 + 1) % p + p) % p;
  const ya = ((y0 % p) + p) % p, yb = ((y0 + 1) % p + p) % p;
  const v00 = hash2(xa, ya, seed), v10 = hash2(xb, ya, seed);
  const v01 = hash2(xa, yb, seed), v11 = hash2(xb, yb, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/** 多层周期性噪声（无缝 fBm）。 */
function fbm(u, v, basePeriod, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, p = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += pnoise(u * p, v * p, p, seed + i * 977) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

/* ── 四种表面类型 ─────────────────────────────────────────────── */

/**
 * 锻打锤痕：**按锤点栅格化**。
 *
 * 第一版是「每像素循环 64 个锤点」，512² 时等于 1677 万次内层迭代 + 3355 万次噪声，
 * 实测 1795ms。现在反过来：先算出 8×8 个锤点的中心/半径/深度（各 64 次噪声），
 * 再让每个锤只在自己包围盒内的像素上盖章 —— 总工作量从「像素×锤」降到「锤×面积」。
 */
function buildHammerTile() {
  const buf = new Float32Array(TILE * TILE);
  /* ① 中频起伏打底（4 阶 → 3 阶，视觉差别小、成本少 1/4） */
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / TILE;
      buf[y * TILE + x] = 0.5 + (fbm(u, v, 4, 3, 1301) - 0.5) * 0.34;
    }
  }
  /* ② 锤点表：8×8 格，中心抖动、半径与深度各不相同（只算 64 次） */
  const N = 8;
  const pits = [];
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const jx = hash2(gx, gy, 71) - 0.5;
      const jy = hash2(gx, gy, 133) - 0.5;
      const cx = (gx + 0.5) / N + jx * (0.55 / N);
      const cy = (gy + 0.5) / N + jy * (0.55 / N);
      const rad = 0.030 + 0.022 * hash2(gx, gy, 211);
      const depth = 0.30 * (0.55 + 0.45 * hash2(gx, gy, 307));
      pits.push({ cx, cy, rad, depth });
    }
  }
  /* ③ 逐锤盖章：只碰自己的包围盒（含平铺镜像）*/
  for (const p of pits) {
    const rpx = p.rad * TILE;
    const x0 = Math.floor((p.cx - p.rad) * TILE) - 1;
    const x1 = Math.ceil((p.cx + p.rad) * TILE) + 1;
    const y0 = Math.floor((p.cy - p.rad) * TILE) - 1;
    const y1 = Math.ceil((p.cy + p.rad) * TILE) + 1;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        /* 平铺：像素坐标按 TILE 取模 */
        const wx = ((px % TILE) + TILE) % TILE;
        const wy = ((py % TILE) + TILE) % TILE;
        const u = (px + 0.5) / TILE;
        const v = (py + 0.5) / TILE;
        let dx = u - p.cx, dy = v - p.cy;
        if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
        const r = Math.hypot(dx, dy);
        if (r >= p.rad) continue;
        const t = r / p.rad;
        /* 碗形凹陷：中心最深，边缘平滑归零 */
        const i = wy * TILE + wx;
        buf[i] -= p.depth * (1 - t * t);
      }
    }
    void rpx;
  }
  /* ④ 少量细划痕（一次性正弦，逐像素成本极低）*/
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / TILE;
      buf[y * TILE + x] += 0.05 * Math.cos(2 * Math.PI * (11 * u + 0.13))
        + 0.02 * Math.cos(2 * Math.PI * (17 * v + 0.7));
    }
  }
  return buf;
}

/** 细密晶粒：高频、均匀、无明显方向性。 */
function buildGrainTile() {
  const buf = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / TILE;
      buf[y * TILE + x] = 0.5
        + (fbm(u, v, 48, 3, 4001) - 0.5) * 0.52
        + (fbm(u, v, 96, 2, 4009) - 0.5) * 0.26;
    }
  }
  return buf;
}

/** 拉丝丝路：u 方向低频、v 方向高频 ⇒ 沿刀轴拉伸的丝路。
 *
 * ★ 2026-10-24 修正（S9 截图看像“织物/粗布”而不是金属）：
 *   第一版振幅 0.46/0.20/0.10（合计 0.76 范围），频率最高只到 256，
 *   加上 shader 里贴图占 68% 高度权重 → 产出又粗又深的条纹，读成了布纹。
 *   真实拉丝的特征是**极细、极浅**：
 *     振幅  0.46/0.20/0.10 → **0.13/0.07/0.04**（降约 3.5 倍）
 *     频率  128/256       → **384/768**（提高到 3 倍，丝路变细）
 *   这样拉丝只在斜看高光时“闪一条”，不会变成可见的粗纹。 */
function buildBrushedTile() {
  const buf = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / TILE;
      buf[y * TILE + x] = 0.5
        + (pnoise(u * 0.06 * 384, v * 384, 384, 5501) - 0.5) * 0.13
        + (pnoise(u * 0.03 * 768, v * 768, 768, 5509) - 0.5) * 0.07
        + (fbm(u, v, 48, 2, 5521) - 0.5) * 0.04;
    }
  }
  return buf;
}

/** 原料粗颗粒：低频团块 + 大颗裂纹（脊状）。 */
function buildOreTile() {
  const buf = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    const v = (y + 0.5) / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / TILE;
      let h = 0.5;
      h += (fbm(u, v, 6, 4, 9901) - 0.5) * 0.62;
      h += (pnoise(u * 3, v * 3, 3, 9907) - 0.5) * 0.30;
      /* 裂纹：脊状噪声的尖锐取反 */
      const ridge = 1 - Math.abs(2 * fbm(u, v, 8, 3, 9919) - 1);
      const t = 1 - ridge;
      h -= t * t * t * t * 0.22;
      buf[y * TILE + x] = h;
    }
  }
  return buf;
}

const BUILDERS = {
  [SURFACE_KINDS.HAMMER]: buildHammerTile,
  [SURFACE_KINDS.GRAIN]: buildGrainTile,
  [SURFACE_KINDS.BRUSHED]: buildBrushedTile,
  [SURFACE_KINDS.ORE]: buildOreTile,
};

/* ── 图集生成 + 缓存（沿用 bakedMotif.js 的纪律）─────────────────── */

let atlasCache = null;
let lastGenMs = 0;

/**
 * 生成/复用表面高度图集（首次调用才有成本，之后直接复用）。
 * @returns {{texture:*, tiles:number, key:string, genMs:number}|null}
 */
export function getSurfaceAtlas() {
  const THREE = globalThis.THREE;
  if (!THREE) return null;
  if (atlasCache) return atlasCache;

  const now = () => ((globalThis.performance && performance.now) ? performance.now() : Date.now());
  const t0 = now();

  const cv = document.createElement('canvas');
  cv.width = ATLAS; cv.height = ATLAS;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(ATLAS, ATLAS);
  const data = img.data;

  for (let kind = 0; kind < GRID * GRID; kind++) {
    const build = BUILDERS[kind];
    if (!build) continue;
    const px = build();
    const tx = (kind % GRID) * TILE;
    const ty = Math.floor(kind / GRID) * TILE;
    for (let y = 0; y < TILE; y++) {
      const rowTo = ((ty + y) * ATLAS + tx) * 4;
      const rowFrom = y * TILE;
      for (let x = 0; x < TILE; x++) {
        const h = px[rowFrom + x];
        const g = (h <= 0 ? 0 : h >= 1 ? 255 : (h * 255 + 0.5) | 0);
        const i = rowTo + x * 4;
        data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
      }
    }
  }
  cx.putImageData(img, 0, 0);

  const tex = new THREE.Texture(cv);
  tex.wrapS = THREE.RepeatWrapping;   // 高度图必须能平铺
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;  // 高度数据不是颜色，不能走 sRGB
  tex.needsUpdate = true;

  lastGenMs = now() - t0;
  atlasCache = { texture: tex, tiles: GRID * GRID, key: 'surface-height-v2', genMs: lastGenMs };

  /* 资源账本：登记这张 512² 图集（可选资源，全局共用一张，不参与淘汰）*/
  try {
    const K3D = globalThis.K3D || {};
    K3D.rLedger?.track?.('surface-atlas:v2', {
      kind: 'surface-atlas', tex,
      bytesMiB: K3D.rLedger.textureMiB ? K3D.rLedger.textureMiB(tex) : 1,
      optional: true,
      evictable: false,
      note: '运行时生成的表面高度图集（P2）',
    });
  } catch (_) { /* 诊断件失败不影响渲染 */ }

  return atlasCache;
}

/** 该瓦片在图集中的偏移与缩放（供 shader 用）。 */
export function tileRectOf(kind) {
  const k = Math.max(0, Math.min(GRID * GRID - 1, Math.round(kind)));
  return {
    ox: (k % GRID) / GRID,
    oy: Math.floor(k / GRID) / GRID,
    scale: 1 / GRID,
  };
}

/** 调试/验收 */
export function surfaceAtlasInfo() {
  return atlasCache
    ? { key: atlasCache.key, tiles: atlasCache.tiles, genMs: +lastGenMs.toFixed(2), size: `${ATLAS}x${ATLAS}` }
    : null;
}

/** 释放（context 丢失 / 诊断用） */
export function releaseSurfaceAtlas() {
  if (!atlasCache) return false;
  try { atlasCache.texture.dispose(); } catch (_) { /* ignore */ }
  try { (globalThis.K3D?.rLedger)?.untrack?.('surface-atlas:v2'); } catch (_) { /* ignore */ }
  atlasCache = null;
  return true;
}

export default { getSurfaceAtlas, tileRectOf, STAGE_SURFACE_KIND, SURFACE_KINDS, surfaceAtlasInfo };
