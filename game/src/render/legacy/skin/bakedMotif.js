/**
 * 卡纹样「烘焙」—— JS/canvas 侧生成 9 槽图集，运行时缓存成 THREE.Texture。
 *
 * ★ 为什么这么做（2026-10-17，用户口径「效果要快到点下去就开」「包体不能明显增加」
 *   「单卡每局随机差异的效果要有」）
 *
 *   实测（tools/probe-bake-sim.mjs）：单支 program 编译 **3094ms 里 99% 来自
 *   `k3dCardMotif` 这一层的函数体**（换成桩 → 38ms）。原因是那 25 路 if/else + atan/sin/cos
 *   让驱动侧编译器优化爆炸；把函数体换成「采样一张贴图」后 → 单支约 40ms。
 *
 *   参考实现：`Downloads/cs2-knife-viewer-V1.0`（`js/patterns.js` 在 JS/canvas 生成图案，
 *   `js/material.js` 把它转成 THREE.Texture 并缓存）——同一路线。
 *
 *   保真：`tools/probe-motif-replica.mjs` 用只含单族的极小 shader 与 JS 复刻逐像素对拍，
 *   family 1 实测 **MAE 0.17/255**（float 量化级）。
 *
 * ★ 两条硬约束
 *   ① 每局随机差异：贴图按 (family, rank, scale, phase) 生成 —— phase 来自本局种子参数，
 *      参数不同就现场重生成，绝不打死成静态图。
 *      （注：实测卡纹样的 phase 目前是**卡静态**的，每局差异来自 S3 纹理层的 uS3Xf；
 *        这里仍把 phase 纳入缓存键，将来相位若跟种子走会自动按局重生成。）
 *   ② 包体：全部运行时 canvas 生成，**不打包任何贴图资产**。9 槽图集 128px/格 → 384²，
 *      单张约 590KB 显存，LRU 6 条。
 *
 * ⚠ **动画族不烘焙**：family 7/8/11/15/19/23 的 GLSL 里带 `time`（缓慢流动），
 *   静态烘焙会把动画冻结 → 这 6 族继续走着色器里的原链（不损失任何观感）。
 */

const TILE = 256;                    // 每格分辨率（128 → 256：128 时细密图案被双线性放大糊掉，
                                     //   实测 family 12 出现 6.5% 像素差 >6/255；256 后回到肉眼一致）
const GRID = 3;                      // 3×3 = 9 槽
const ATLAS = TILE * GRID;
/* ★ 2026-10-17：图集覆盖 **p ∈ [PMIN, PMAX]**（外扩 30%）。
   实测依据：刀身局部坐标并不严格落在 0..1（刀尖/边缘会溢出），
   烘焙侧若按 0..1 采样并 clamp，边缘区域的图案就会和程序化版不一致
   （family 12 实测 6.5% 像素差 >6/255，且与图集分辨率无关 → 是范围问题不是糊）。 */
const PMIN = -0.3;
const PMAX = 1.3;
const PSPAN = PMAX - PMIN;
const CACHE_MAX = 4;                 // 768² × 4B ≈ 2.4MB/张 → 4 条约 9.4MB
const cache = new Map();
// Keep the expensive 256² CPU raster by *individual motif*, not by the
// cumulative nine-slot recipe. Switching a late card only bakes its own tile.
const tileCache = new Map();
const TILE_CACHE_MAX = 64; // ~16 MiB raw RGBA; deterministic bounded LRU
function tileKey(s) {
  return `${Math.round(s.family)}|${Math.max(1, Math.floor(s.rank))}|${(+s.scale || 1).toFixed(3)}|${(+s.phase || 0).toFixed(4)}`;
}

let tick = 0;

/* ── GLSL 数学的 JS 复刻（与 cardEffects.js 的 prelude 逐字对应）── */
const fract = (x) => x - Math.floor(x);
const mod = (x, y) => x - y * Math.floor(x / y);
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const step = (edge, x) => (x >= edge ? 1 : 0);
const mix = (a, b, t) => a + (b - a) * t;
const len2 = (x, y) => Math.hypot(x, y);
/* k3dCardHash( vec2 p ) = fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ) */
const cardHash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);

/** 各族的取值函数：(ctx) => v，ctx = {q:{x,y}, radius, n, wave, phase, time, rank} */
export const FAMILY_GEN = {
  0: ({ q, phase }) => 0.5 + 0.5 * Math.sin(q.x * 0.48 + Math.sin(q.y * 0.3) * 2.5 + phase * 6.2831853),
  1: ({ q }) => {
    const cx = Math.abs(fract(q.x) - 0.5), cy = Math.abs(fract(q.y) - 0.5);
    return 1 - smoothstep(0.12, 0.48, len2(cx, cy));
  },
  2: ({ q }) => 0.5 + 0.5 * Math.sin(Math.sin(q.x * 0.58 + Math.sin(q.y * 0.26) * 2.4) * 3.2 + q.y * 0.12),
  3: ({ q, radius, phase }) => 0.5 + 0.5 * Math.sin(radius * 1.65 + Math.sin(Math.atan2(q.y, q.x) * 5) * 0.8 + phase * 6.2831853),
  4: ({ q }) => Math.abs(Math.sin(q.x * 0.62) * Math.sin(q.y * 0.62)),
  5: ({ q }) => 0.5 + 0.5 * Math.sin(q.x + q.y) * Math.sin(q.x - q.y),
  6: ({ q }) => {
    const crack = Math.abs(Math.sin(q.x * 0.37 + Math.sin(q.y * 0.31) * 2.1));
    return 1 - smoothstep(0.05, 0.24, crack);
  },
  /* 7 star dust —— 动画族（不烘焙） */
  7: ({ n, time }) => step(0.86, n) * (0.5 + 0.5 * Math.sin(time * 1.7 + n * 6.2831853)),
  /* 8 vertical flame —— 动画族 */
  8: ({ q, time }) => 0.5 + 0.5 * Math.sin(q.x * 0.42 + Math.sin(q.y * 0.22 + time * 0.65) * 2.7),
  9: ({ q }) => 1 - smoothstep(0.03, 0.18, Math.abs(fract(q.x * 0.48 + q.y * 0.16) - 0.5)),
  10: ({ q }) => 1 - smoothstep(0.025, 0.12, Math.abs(Math.sin(q.x * 0.44 + Math.sin(q.y * 0.2) * 1.5))),
  /* 11 vortex —— 动画族 */
  11: ({ q, radius, time }) => 0.5 + 0.5 * Math.sin(radius * 1.15 + Math.atan2(q.y, q.x) * 2.4 + time * 0.28),
  12: ({ q }) => {
    const cx = fract(q.x * 1.0 + 0.5 * Math.floor(q.y * 0.62));
    const cy = fract(q.y * 0.62);
    return 1 - smoothstep(0.28, 0.48, len2(cx - 0.5, cy - 0.34));
  },
  13: ({ q }) => Math.max(Math.abs(Math.sin((q.x + q.y) * 0.52)), Math.abs(Math.sin((q.x - q.y) * 0.52))),
  14: ({ q }) => {
    const crack = Math.abs(Math.sin(q.x * 0.31 + Math.sin(q.y * 0.19) * 3.1 + Math.sin(q.y * 0.71)));
    return 1 - smoothstep(0.035, 0.16, crack);
  },
  /* 15 mist star field —— 动画族 */
  15: ({ q, n, time }) => {
    const cloud = 0.5 + 0.5 * Math.sin(q.x * 0.18 + Math.sin(q.y * 0.21 + time * 0.18) * 1.7);
    const speck = step(0.89, n) * (0.5 + 0.5 * Math.sin(time + n * 6.2831853));
    return mix(cloud, 1, speck * 0.7);
  },
  16: ({ q }) => 0.5 + 0.5 * Math.sin(q.x * 1.45 + Math.sin(q.y * 0.13) * 0.55),
  17: ({ q }) => {
    const dx = fract(q.x * 1.0) - 0.5, dy = fract(q.y * 0.72) - 0.5;
    const d = len2(dx, dy);
    return 0.5 + 0.5 * Math.sin(d * 18 + Math.sin(q.y * 0.25) * 2);
  },
  18: ({ q }) => {
    const vein = Math.abs(Math.sin(q.x * 0.23 + Math.sin(q.y * 0.13) * 2.8));
    return 1 - smoothstep(0.08, 0.26, vein);
  },
  /* 19 halo rings —— 动画族 */
  19: ({ q, radius, time }) => 0.5 + 0.5 * Math.sin(radius * 1.3 + Math.sin(Math.atan2(q.y, q.x) * 3 + time * 0.25) * 0.45),
  20: ({ q }) => {
    const gx = Math.abs(fract(q.x * 0.42) - 0.5), gy = Math.abs(fract(q.y * 0.42) - 0.5);
    return smoothstep(0.04, 0.46, Math.abs(gx - gy));
  },
  21: ({ q, phase }) => {
    const bolt = Math.abs(fract(q.x * 0.22 + Math.sin(q.y * 0.24 + phase * 6.2831853) * 0.28) - 0.5);
    return 1 - smoothstep(0.025, 0.12, bolt);
  },
  22: ({ q, rank, wave }) => {
    const pits = cardHash(Math.floor(q.x * 0.7), Math.floor(q.y * 0.7) + rank * 3);
    return smoothstep(0.22, 0.78, pits + wave * 0.22);
  },
  /* 23 void orbit —— 动画族 */
  23: ({ q, n, radius, time }) => {
    const orbit = Math.abs(Math.sin(radius * 1.1 + Math.atan2(q.y, q.x) * 3.5));
    return Math.max(
      step(0.93, n) * (0.5 + 0.5 * Math.sin(time * 1.8 + n * 6.2831853)),
      1 - smoothstep(0.035, 0.11, orbit) * 0.62,
    );
  },
  24: ({ q }) => {
    const cx = fract(q.x * 0.65);
    const cy = fract(q.y * 0.48 + Math.floor(q.x * 0.65) * 0.5);
    const arc = Math.abs(len2(cx - 0.5, cy - 0.28) - 0.34);
    return 1 - smoothstep(0.04, 0.13, arc + Math.max(0, cy - 0.62) * 0.4);
  },
};

/** 动画族（GLSL 里带 time）→ 走「12 帧动画图集」。
 *  周期 = 2π / ω（ω 就是 GLSL 里 time 的系数），**按族自己的周期取帧**才能无缝循环：
 *    7 星屑 1.7 → 3.70s   8 竖焰 0.65 → 9.67s   11 漩涡 0.28 → 22.44s
 *    15 雾星场 0.18 → 34.91s   19 光环 0.25 → 25.13s   23 虚空轨道 1.8 → 3.49s
 *  （最慢的雾星场每帧 2.9s，本来动得就极慢，步进完全看不出来） */
export const ANIM_OMEGA = { 7: 1.7, 8: 0.65, 11: 0.28, 15: 0.18, 19: 0.25, 23: 1.8 };
export const ANIMATED_FAMILIES = new Set(Object.keys(ANIM_OMEGA).map(Number));
export const ANIM_FRAMES = 12;

export function isAnimated(family) {
  return ANIMATED_FAMILIES.has(Math.round(family));
}

/** 只要族有 JS 复刻就能烘焙（静态走 3×3 图集，动画走 12 帧条带） */
export function canBake(family) {
  if (!Number.isFinite(family)) return false;
  const f = Math.round(family);
  return Object.prototype.hasOwnProperty.call(FAMILY_GEN, f);
}

/** 族的 prelude 参数（与 GLSL 逐字一致） */
function prelude(rank, scale, phase) {
  const r = Math.max(1, Math.floor(rank));
  const freq = (5 + mod(r * 1.73, 17)) * Math.max(0.45, scale);
  const angle = r * 0.6180339 + phase * 6.2831853;
  return { rank: r, freq, cs: Math.cos(angle), sn: Math.sin(angle) };
}

/**
 * 烘焙 9 槽图集。slots[i] = {family, rank, scale, phase} 或 null。
 * @returns {{texture: THREE.Texture, meta: number[][]}|null}  meta[i] = [family+1, tile, 0, 0]
 */
export function getBakedAtlas(slots) {
  const THREE = globalThis.THREE;
  if (!THREE || !Array.isArray(slots)) return null;
  const list = slots.slice(0, GRID * GRID);
  if (!list.some((s) => s && canBake(s.family))) return null;

  const key = list
    .map((s) => (s ? `${Math.round(s.family)}|${Math.max(1, Math.floor(s.rank))}|${(+s.scale || 1).toFixed(3)}|${(+s.phase || 0).toFixed(4)}` : '-'))
    .join(',');
  const hit = cache.get(key);
  if (hit) { hit.used = ++tick; return { texture: hit.tex, meta: hit.meta, key }; }

  const cv = document.createElement('canvas');
  cv.width = ATLAS; cv.height = ATLAS;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(ATLAS, ATLAS);
  const data = img.data;
  const meta = [];

  for (let slot = 0; slot < list.length; slot++) {
    const s = list[slot];
    if (!s || !canBake(s.family) || isAnimated(s.family)) { meta.push([0, 0, 0, 0]); continue; }
    const family = Math.round(s.family);
    const k = tileKey(s);
    let pixels = tileCache.get(k);
    if (!pixels) {
      pixels = new Uint8ClampedArray(TILE * TILE * 4);
      const gen = FAMILY_GEN[family];
      const { rank, freq, cs, sn } = prelude(s.rank, s.scale, s.phase);
      const phase = +s.phase || 0;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const px = PMIN + ((x + 0.5) / TILE) * PSPAN;
          const py = PMIN + ((y + 0.5) / TILE) * PSPAN;
          const qx = (px * cs - py * sn) * freq;
          const qy = (px * sn + py * cs) * freq;
          const radius = len2(qx, qy);
          const n = cardHash(Math.floor(qx) + rank, Math.floor(qy) + rank);
          const wave = Math.sin(qx + Math.sin(qy * 0.43 + phase * 6.2831853) * 1.8);
          const v = gen({ q: { x: qx, y: qy }, radius, n, wave, phase, time: 0, rank });
          const g = Math.round(Math.min(1, Math.max(0, v)) * 255);
          const i = (y * TILE + x) * 4;
          pixels[i] = g; pixels[i + 1] = g; pixels[i + 2] = g; pixels[i + 3] = 255;
        }
      }
      tileCache.set(k, pixels);
      if (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value);
    } else {
      // refresh LRU without copying its 256² source
      tileCache.delete(k); tileCache.set(k, pixels);
    }
    const tx = (slot % GRID) * TILE;
    const ty = Math.floor(slot / GRID) * TILE;
    for (let y = 0; y < TILE; y++) {
      const from = y * TILE * 4;
      const to = ((ty + y) * ATLAS + tx) * 4;
      data.set(pixels.subarray(from, from + TILE * 4), to);
    }
    meta.push([family + 1, slot, 0, 0]);
  }
  cx.putImageData(img, 0, 0);

  const tex = new THREE.Texture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  cache.set(key, { tex, meta, used: ++tick });
  if (cache.size > CACHE_MAX) {
    const entries = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < cache.size - CACHE_MAX; i++) {
      const [k, e] = entries[i];
      try { e.tex.dispose(); } catch (_) { /* ignore */ }
      cache.delete(k);
      /* 账本：图集淘汰时同步销账（方案 §5「纹理 dispose 时同步撤销记录」） */
      try { K3D.rLedger?.untrack('motif-atlas:' + k); } catch (_) { /* 诊断件，失败不影响渲染 */ }
    }
  }
  /* 账本：登记这张 768² 图集（可选资源，可在超预算时被淘汰后按需重烘） */
  try {
    K3D.rLedger?.track('motif-atlas:' + key, {
      kind: 'motif-atlas', tex,
      bytesMiB: K3D.rLedger.textureMiB(tex),
      optional: true,
      /* ★ 2026-10-21（方案 §5「lease / pin / refCount，零引用才 LRU 淘汰」）
         以前这里是 `evictable: false` —— 于是 `evictUnpinned()` 永远是空转，
         预算降级链走到最后一级也没有可淘汰的对象。现在交出一个真正的 owner：
         `releaseBakedAtlas(key)` 会 dispose 纹理并把这个 key 从 cache 里摘掉，
         下一次同一配方取图集时按需重烘（重烘成本 = 9 格 canvas，,见 RESULT §3.18）。
         谁在用它？`index.js` 的 applySkin（当前卡）与预热池条目各自 pin 一次，
         所以"正在显示/正在预热"的图集 refs ≥ 1，不会被淘汰。 */
      evictable: true,
      release: () => releaseBakedAtlas(key),
      note: '9 槽静态纹样图集',
    });
  } catch (_) { /* ignore */ }
  return { texture: tex, meta, key };
}

/**
 * 释放一张静态纹样图集（账本淘汰 / context 丢失时由 owner 调用）。
 * 只做"销账 + dispose + 摘缓存"三件事；材质仍持有旧纹理引用时，
 * three 会在下一次 draw 时按 texture.image（canvas 还在）重新上传，
 * 不会出现黑图 —— 这也是把它标成 optional/evictable 的前提。
 */
export function releaseBakedAtlas(key) {
  const e = cache.get(key);
  if (!e) return false;
  try { e.tex.dispose(); } catch (_) { /* ignore */ }
  cache.delete(key);
  try { K3D.rLedger?.untrack('motif-atlas:' + key); } catch (_) { /* ignore */ }
  return true;
}

/** 调试/验收用 */
export function bakedMotifCacheSize() { return cache.size; }
export function bakedTileCacheSize() { return tileCache.size; }
export const BAKED_TILE = TILE;
export const BAKED_GRID = GRID;


/* ────────────────────────── 动画族：12 帧条带 ──────────────────────────
 * 布局：一张贴图，X 方向 12 帧，Y 方向每个「动画槽」一行。
 * 采样：fract(time/period)*12 取相邻两帧线性插值（bevel 由 shader 做）。
 * 只在真有动画族时分配；行数 = 该材质实际用到的动画槽数（通常 1–2）。
 */
const ANIM_TILE = 128;
const animCache = new Map();
const ANIM_CACHE_MAX = 4;

/** slots: [{family,rank,scale,phase}] | null（按 stage 索引，只处理动画族） */
export function getAnimAtlas(slots) {
  const THREE = globalThis.THREE;
  if (!THREE || !Array.isArray(slots)) return null;
  const rows = [];
  slots.forEach((s, i) => {
    if (s && canBake(s.family) && isAnimated(s.family)) rows.push({ slot: i, meta: s });
  });
  if (!rows.length) return null;

  const key = rows.map((r) => `${Math.round(r.meta.family)}|${Math.max(1, Math.floor(r.meta.rank))}|${(+r.meta.scale || 1).toFixed(3)}|${(+r.meta.phase || 0).toFixed(4)}`).join(',');
  const hit = animCache.get(key);
  if (hit) { hit.used = ++tick; return { texture: hit.tex, meta: hit.meta, rows: hit.rows, key }; }

  const N = rows.length;
  /* ★ 2026-10-21（方案 §5「超限逐级降级」）：动画条纹是本工程最"锦上添花"的资源
     —— 每行 128²×12 ≈ 0.75 MiB。预算不够就**跳过动画、保留静态纹样**，
     不动分辨率也不改材质参数。账本见 src/render/resourceLedger.js。 */
  try {
    const L = K3D.rLedger;
    if (L) {
      const mib = (ANIM_FRAMES * ANIM_TILE * N * ANIM_TILE * 4) / 1048576;
      if (!L.canAfford(mib)) {
        K3D.animAtlasSkipped = (K3D.animAtlasSkipped || 0) + 1;
        return null;   // 调用方拿到 null → uAnimMeta 全 0 → 回落静态纹样
      }
    }
  } catch (_) { /* 账本不可用时照旧 */ }
  const cv = document.createElement('canvas');
  cv.width = ANIM_FRAMES * ANIM_TILE;
  cv.height = N * ANIM_TILE;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(cv.width, cv.height);
  const data = img.data;

  const meta = new Float32Array(36);   // [family+1, row, period, 0] × 9
  const rowOf = [];
  rows.forEach((r, ri) => {
    const family = Math.round(r.meta.family);
    const gen = FAMILY_GEN[family];
    const { rank, freq, cs, sn } = prelude(r.meta.rank, r.meta.scale, r.meta.phase);
    const phase = +r.meta.phase || 0;
    const omega = ANIM_OMEGA[family] || 1;
    const period = (2 * Math.PI) / omega;
    meta[r.slot * 4] = family + 1;
    meta[r.slot * 4 + 1] = ri;
    meta[r.slot * 4 + 2] = period;
    meta[r.slot * 4 + 3] = N;   // rowCount（shader 折算 UV 用）
    rowOf.push(r.slot);
    for (let f = 0; f < ANIM_FRAMES; f++) {
      const time = (f / ANIM_FRAMES) * period;
      const ox = f * ANIM_TILE;
      const oy = ri * ANIM_TILE;
      for (let y = 0; y < ANIM_TILE; y++) {
        for (let x = 0; x < ANIM_TILE; x++) {
          const px = PMIN + ((x + 0.5) / ANIM_TILE) * PSPAN;
          const py = PMIN + ((y + 0.5) / ANIM_TILE) * PSPAN;
          const qx = (px * cs - py * sn) * freq;
          const qy = (px * sn + py * cs) * freq;
          const radius = len2(qx, qy);
          const n = cardHash(Math.floor(qx) + rank, Math.floor(qy) + rank);
          const wave = Math.sin(qx + Math.sin(qy * 0.43 + phase * 6.2831853) * 1.8);
          const v = gen({ q: { x: qx, y: qy }, radius, n, wave, phase, time, rank });
          const g = Math.round(Math.min(1, Math.max(0, v)) * 255);
          const i = ((oy + y) * cv.width + (ox + x)) * 4;
          data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
        }
      }
    }
  });
  cx.putImageData(img, 0, 0);

  const tex = new THREE.Texture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  animCache.set(key, { tex, meta, rows: rowOf, used: ++tick });
  if (animCache.size > ANIM_CACHE_MAX) {
    const entries = [...animCache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < animCache.size - ANIM_CACHE_MAX; i++) {
      const [k, e] = entries[i];
      try { e.tex.dispose(); } catch (_) { /* ignore */ }
      animCache.delete(k);
      try { K3D.rLedger?.untrack('anim-atlas:' + k); } catch (_) { /* ignore */ }
    }
  }
  try {
    K3D.rLedger?.track('anim-atlas:' + key, {
      kind: 'anim-atlas', tex,
      bytesMiB: K3D.rLedger.textureMiB(tex),
      optional: true,
      /* 动画条纹比静态纹样更"锦上添花"：超预算时它是**第一个**被淘汰的对象，
         淘汰后该槽回落静态纹样（uAnimMeta 全 0）。 */
      evictable: true,
      release: () => releaseAnimAtlas(key),
      note: `${N} 行动画条纹（12 帧/行）`,
    });
  } catch (_) { /* ignore */ }
  return { texture: tex, meta, rows: rowOf, key };
}

/** 释放一张动画条纹图集（账本淘汰时由 owner 调用）。 */
export function releaseAnimAtlas(key) {
  const e = animCache.get(key);
  if (!e) return false;
  try { e.tex.dispose(); } catch (_) { /* ignore */ }
  animCache.delete(key);
  try { K3D.rLedger?.untrack('anim-atlas:' + key); } catch (_) { /* ignore */ }
  return true;
}

/* 调试用（探针里查缓存命中情况） */
export function animCacheSize() { return animCache.size; }
