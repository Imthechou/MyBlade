/**
 * 刀柄材质图集（把 24 种 k3dHandleLook 烘成一张纹理）
 *
 * 为什么需要（RESULT.md §6 未达标项）：
 *   柄的 k3dHandleLook 以 `kind` 进 bladeMask 的签名 → **每种柄一支 program**。
 *   全卡扫描里 S8 的 22 次 link、以及"三种候选柄各编一次"的 1.2s 长帧都来自这里。
 *
 * 做法：
 *   1. 一张 6×4 的图集（每格 256²，RGBA8）：rgb = 柄的底色乘子，a = 粗糙度偏移；
 *   2. 每格用**当前 kind 特化过的**同一段 GLSL 烘一次（离屏正交相机 + viewport/scissor）；
 *   3. 主材质改成采样图集（`uHandleLookTex` + `uHandleLookTile`），签名里不再带 kind
 *      → 24 种柄共用一支 program。
 *
 * 边界：
 *   · 烘焙只是把"同一段数学"换个地方算，不新增/修改任何手感参数；
 *   · 图集在**首次用到某个 kind 时**才烘（懒加载），一局只会烘 1–3 格；
 *   · 没有 renderer / 上下文丢失时返回 null，调用方退回逐 kind 特化（旧行为）；
 *   · 只做 2D 烘焙：local.z（柄厚度方向）固定 0.5，正反两面因此共用同一纹理。
 *     这是刻意取舍——柄的厚度方向在画面里几乎不可分辨，换来的是程序数量从 24 降到 1。
 */

const TILE = 256;
const COLS = 6;
const ROWS = 4;
export const HANDLE_KIND_COUNT = 24;

/* 图集来源：优先用预烘资源 `assets/handle-atlas.png`（0 支 program），
   取不到才退回运行时按 kind 烘。见 handleAtlasAsset.js 顶部说明。 */
import { getHandleAtlasTexture, handleAtlasAssetStats } from './handleAtlasAsset.js';

let atlas = null;          // { target?, texture, external?, baked:Set, material?, camera?, scene?, mesh? }
let rendererRef = null;
let failed = false;
let forceRuntime = false;  // 诊断：探针要求"一定走运行时烘焙"时置位

/** 每格的 UV 变换：(offsetX, offsetY, scaleX, scaleY) */
export function tileTransform(kind) {
  const k = ((Math.round(kind) % HANDLE_KIND_COUNT) + HANDLE_KIND_COUNT) % HANDLE_KIND_COUNT;
  const col = k % COLS;
  const row = Math.floor(k / COLS);
  const inset = 0.5 / TILE;   // 半像素内缩，避免线性过滤串到隔壁格
  return {
    x: (col * TILE + inset) / (COLS * TILE),
    y: (row * TILE + inset) / (ROWS * TILE),
    sx: (TILE - 2 * inset) / (COLS * TILE),
    sy: (TILE - 2 * inset) / (ROWS * TILE),
  };
}

function trackAtlas(texture, renderer, note) {
  try {
    const L = globalThis.K3D && globalThis.K3D.rLedger;
    L?.track('handle-atlas', {
      kind: 'handle-atlas', renderer,
      bytesMiB: L.textureMiB(texture),
      optional: true, evictable: false,
      note,
    });
  } catch (_) { /* 诊断件，失败不影响渲染 */ }
}

function ensureAtlas(THREE, renderer) {
  if (atlas || failed) return atlas;

  /* ① 首选：预烘图集。整条路径**不产生任何 program** —— 这就是审计 #8 的收口点。 */
  const external = forceRuntime ? null : getHandleAtlasTexture();
  if (external) {
    atlas = { texture: external, external: true, baked: new Set() };
    /* 24 格全在里面，直接标满，避免 acquire 时再判断 */
    for (let k = 0; k < HANDLE_KIND_COUNT; k++) atlas.baked.add(k);
    trackAtlas(external, renderer, '24 种柄材质图集（预烘 assets/handle-atlas.png）');
    return atlas;
  }

  /* ② 兜底：运行时按 kind 烘（旧行为，24 支特化 program）。 */
  try {
    const width = COLS * TILE;
    const height = ROWS * TILE;
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    target.texture.needsUpdate = true;
    /* 账本：6×4 × 256² 的柄图集（1536×1024 RGBA ≈ 6 MiB），方案 §5 要求记进 GPU 预算 */
    trackAtlas(target.texture, renderer, '24 种柄材质烘焙图集（运行时兜底）');

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      /* ★ 2026-10-21（方案 §4「完整活跃集合 ≤12」）—— 这条路的三次尝试与结论：
         ① kind 走 uniform（源码固定、24 种柄共用 1 支 program）：
            link 22 → 1，但 ANGLE 要为 24 路分派建一条巨大的分支管线，
            S8 首张卡 39 ms → **814/876 ms**（RESULT §3.18(g)）。**已否定**。
         ② JS 复刻 `k3dHandleLook`：视觉对不上。`k3dHHash` 用 `sin(dot)*43758.5453` 取小数，
            而 sin 在 fp32 大自变量上各家实现不同 —— 实测连最小自变量（dot≈1900）都与 JS
            完全去相关（平均差 0.33 ≈ 两个独立均匀分布的理论值 1/3），24 格平均差 14.65/255，
            纹路落点整体搬家（RESULT §3.20(a)）。**已否定**。
         ③ 离线预烘成 `assets/handle-atlas.png`：逐位精确（就是 GPU 自己的输出），
            运行时 0 支柄 program。**这条生效了**，即上面 ① 的分支。
         本函数（运行时烘）现在只是 ③ 取不到时的兜底：按 kind 特化源码，
         24 种柄 = 24 支 program。 */
      uniforms: {},
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 'void main() { gl_FragColor = vec4( 1.0 ); }',
      depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    atlas = { target, texture: target.texture, baked: new Set(), material, camera, scene, mesh, geometry };
    rendererRef = renderer;
    return atlas;
  } catch (e) {
    console.warn('[handleAtlas] 图集创建失败，退回逐 kind 特化:', e && e.message);
    failed = true;
    return null;
  }
}

/** 用当前 kind 的特化 GLSL 烘一格。返回是否成功。 */
function bakeKind(THREE, renderer, kind) {
  const a = atlas;
  if (!a) return false;
  if (a.external) return true;          // 预烘图集：24 格都在，无需烘焙
  if (a.baked.has(kind)) return true;
  const K3D = globalThis.K3D || {};
  const raw = K3D.handleLookGLSL || '';
  if (!raw) return false;
  const specialized = (K3D.shaderSpecialize && K3D.shaderSpecialize.enabled && K3D.shaderSpecialize.enabled())
    ? K3D.shaderSpecialize.handleLook(raw, kind)
    : raw;
  const source = `
    varying vec2 vUv;
    ${specialized}
    void main() {
      vec4 look = k3dHandleLook( ${Math.round(kind)}, vec3( clamp( vUv.x, 0.0, 1.0 ), clamp( vUv.y, 0.0, 1.0 ), 0.5 ) );
      /* ★ 2026-10-21（N2 修复）：a 通道存的是**编码后**的粗糙度偏移。
         旧写法 clamp(look.a, 0, 1) 会把 dr ∈ [-0.16, 0] 全部压成 0
         —— 也就是 k6/k15/k18/k19/k20/k22/k23 这批"本该比基线更光滑"的柄
         从来拿不到负面偏移。现在写 dr * 0.5 + 0.5（[-0.16,0.16] → [0.42,0.58]），
         采样端（bladeViewer 的 k3dHandleLookCall）用 a * 2.0 - 1.0 还原。
         代价：8 位量化步长从 0.00063 变成 0.0078 —— 对粗糙度是不可见的量级。 */
      gl_FragColor = vec4( clamp( look.rgb, 0.0, 1.0 ), clamp( look.a * 0.5 + 0.5, 0.0, 1.0 ) );
    }`;
  a.material.fragmentShader = source;
  a.material.needsUpdate = true;
  const col = kind % COLS;
  const row = Math.floor(kind / COLS);
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = new THREE.Vector4();
  const previousScissor = new THREE.Vector4();
  const previousScissorTest = renderer.getScissorTest();
  renderer.getViewport(previousViewport);
  renderer.getScissor(previousScissor);
  try {
    renderer.setRenderTarget(a.target);
    /* GL 的 framebuffer 原点在左下，UV 的 v=0 也在下方 —— 不翻行号，
       这样 tileTransform() 里 `y = row*TILE/height` 与烘焙位置一一对应。 */
    renderer.setViewport(col * TILE, row * TILE, TILE, TILE);
    renderer.setScissor(col * TILE, row * TILE, TILE, TILE);
    renderer.setScissorTest(true);
    renderer.render(a.scene, a.camera);
    a.baked.add(kind);
    return true;
  } catch (e) {
    console.warn('[handleAtlas] 烘焙失败 kind=' + kind, e && e.message);
    return false;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
  }
}

/**
 * 取某个 kind 的图集参数；首次调用会同步烘一格（一次很小的离屏绘制）。
 * @returns {{texture, tile:{x,y,sx,sy}}|null} null = 不可用，调用方走旧路径
 */
export function acquireHandleLook(renderer, kind) {
  const THREE = globalThis.THREE;
  if (!THREE || !renderer || !renderer.getContext) return null;
  try {
    const gl = renderer.getContext();
    if (gl.isContextLost && gl.isContextLost()) return null;
  } catch (_) { return null; }
  const a = ensureAtlas(THREE, renderer);
  if (!a) return null;
  if (!bakeKind(THREE, renderer, kind)) return null;
  const tile = tileTransform(kind);
  /* tile 的 y 已经按"图集行从顶部编号"换算过；采样时直接用 */
  return { texture: a.texture, tile };
}

/** 诊断：图集来源（预烘 / 运行时）、已烘多少格、尺寸。 */
export function handleAtlasStats() {
  const asset = handleAtlasAssetStats();
  if (!atlas) return { ready: false, baked: 0, size: 0, source: null, asset };
  return {
    ready: true,
    baked: atlas.baked.size,
    size: COLS * TILE,
    source: atlas.external ? 'prebaked' : 'runtime',
    asset,
  };
}

/**
 * 诊断（探针专用）：把图集 render target 交出去读像素。
 * `tools/probe-handle-cpu.mjs` / `tools/bake-handle-atlas.mjs` 靠它拿到"现烘的 GPU 结果"。
 * 走预烘资源时返回 undefined —— 先调 `resetHandleAtlasForBake()` 切回运行时路径。
 */
export function getHandleAtlasTarget() {
  return atlas ? atlas.target : null;
}

/**
 * 诊断（探针专用）：丢弃当前图集（含预烘那条），强制下一次 acquire 走运行时烘焙。
 * 这样"预烘 PNG 是否与现烘结果一致"才能被逐字节验证。
 */
export function resetHandleAtlasForBake() {
  forceRuntime = true;
  try { atlas?.target?.dispose(); } catch (_) { /* ignore */ }
  try { atlas?.geometry?.dispose(); } catch (_) { /* ignore */ }
  try { atlas?.material?.dispose(); } catch (_) { /* ignore */ }
  atlas = null;
  failed = false;
  rendererRef = null;
}

/** 上下文丢失后旧图集作废。 */
export function invalidateHandleAtlas() {
  if (!atlas) return;
  if (atlas.external) {
    /* 预烘图集的底层是 ImageBitmap，three 会在新上下文里重新上传；
       这里只把"已用"标记清掉，不 dispose 纹理（否则要再下载一次）。 */
    atlas.baked.clear();
    for (let k = 0; k < HANDLE_KIND_COUNT; k++) atlas.baked.add(k);
    return;
  }
  try { atlas.target.dispose(); } catch (_) { /* ignore */ }
  try { atlas.geometry.dispose(); } catch (_) { /* ignore */ }
  try { atlas.material.dispose(); } catch (_) { /* ignore */ }
  atlas = null;
  rendererRef = null;
}

export default {
  acquireHandleLook, tileTransform, handleAtlasStats, invalidateHandleAtlas,
  getHandleAtlasTarget, resetHandleAtlasForBake, HANDLE_KIND_COUNT,
};
