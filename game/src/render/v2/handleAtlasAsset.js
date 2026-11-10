/**
 * 预烘柄图集的资源通道（`assets/handle-atlas.png`）
 *
 * 与 `handleLookBake.js` 的关系：
 *   `handleLookBake` 负责"图集怎么被用"（UV 变换、uniform、账本）；
 *   本文件负责"图集从哪来"。首选预烘资源，取不到再退回运行时按 kind 烘（旧行为）。
 *
 * 三个必须写对的细节（写错就是"看起来差不多、其实变了"）：
 *   ① `premultiplyAlpha: 'none'` —— 这张图的 **A 通道是粗糙度偏移，不是不透明度**。
 *      浏览器默认可能预乘，一旦预乘，rgb 会被乘成接近 0（a 只有 0~30/255），画面全黑。
 *   ② `colorSpaceConversion: 'none'` —— 图集是以 `NoColorSpace` 写进 RGBA8 的线性数值，
 *      不能被当成 sRGB 做一次转换，否则与烘焙结果逐字节不一致。
 *   ③ `flipY = false` —— PNG 生成时就按 render target 的行序（第 0 行=图集最下面一行）写的，
 *      这里不再翻转，采样坐标与运行时烘焙完全一致。
 *
 * 时序：
 *   模块加载即发起 prefetch（不阻塞、不需要 renderer）。真正的取用发生在
 *   `acquireHandleLook()`，那时大概率已经就绪；没就绪就走运行时烘焙兜底。
 *   纹理对象在首次取用时才建（需要 `globalThis.THREE`）。
 */

const ATLAS_URL = 'assets/handle-atlas.png';

let state = 'idle';     // idle | loading | ready | failed
let bitmap = null;
let texture = null;
let error = null;
let startedAt = 0;
let readyAt = 0;

/** 发起预取。可重复调用。 */
export function prefetchHandleAtlas() {
  if (state !== 'idle') return;
  state = 'loading';
  startedAt = (globalThis.performance || Date).now();
  const fail = (e) => {
    state = 'failed';
    error = String((e && e.message) || e);
    if (globalThis.console) console.warn('[handleAtlas] 预烘图集取不到，退回运行时烘焙:', error);
  };
  try {
    const f = globalThis.fetch;
    if (!f) { fail(new Error('no fetch')); return; }
    f(ATLAS_URL, { cache: 'force-cache' })
      .then((r) => (r && r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + (r && r.status)))))
      .then((blob) => createImageBitmap(blob, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      }))
      .then((bm) => {
        bitmap = bm;
        state = 'ready';
        readyAt = (globalThis.performance || Date).now();
      })
      .catch(fail);
  } catch (e) {
    fail(e);
  }
}
prefetchHandleAtlas();

/**
 * 取图集纹理；未就绪 / 无 THREE 时返回 null（调用方走运行时烘焙兜底）。
 * @returns {import('three').Texture|null}
 */
export function getHandleAtlasTexture() {
  if (texture) return texture;
  if (!bitmap) return null;
  const THREE = globalThis.THREE;
  if (!THREE) return null;
  try {
    const t = new THREE.Texture(bitmap);
    t.flipY = false;
    /* NoColorSpace：图集是线性数值，不是颜色 */
    if ('colorSpace' in t && THREE.NoColorSpace !== undefined) t.colorSpace = THREE.NoColorSpace;
    else if ('encoding' in t && THREE.LinearEncoding !== undefined) t.encoding = THREE.LinearEncoding;
    /* ★ 2026-10-22（S8 柄上的摩尔纹）：这张图集必须开 mip。
       `k3dHandleLook` 里有一批**极高频率**的程序纹（k6 拉丝 sin(u*245)、
       k7 车纹 sin(r*145)、k15 sin(u*290)…按 256² 烘成 tile 后接近每像素一个周期）。
       柄在整刀构图里只有几十像素宽 → 无 mip 时严重欠采样，读出来是一片斜向摩尔纹/斑块，
       看起来就是"柄上有一格一格的怪纹"。开 mip + 各向异性后按屏幕尺度选层，纹样立刻收干净。
       代价：16 级 mip 约 +33% 显存（这张 6 MiB → 约 8 MiB），不涉及任何 program / 编译。 */
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    texture = t;
    return texture;
  } catch (e) {
    if (globalThis.console) console.warn('[handleAtlas] 纹理创建失败:', e && e.message);
    return null;
  }
}

/** 诊断：预取状态、耗时、图集尺寸。 */
export function handleAtlasAssetStats() {
  return {
    state,
    error,
    readyMs: state === 'ready' ? Math.round(readyAt - startedAt) : null,
    size: bitmap ? [bitmap.width, bitmap.height] : null,
  };
}

/** 上下文丢失后调用：纹理对象作废，但保留 ImageBitmap 以便重建（不必再下载）。 */
export function invalidateHandleAtlasAsset() {
  const t = texture;
  texture = null;
  if (t) { try { t.dispose(); } catch (_) { /* ignore */ } }
}

export default { prefetchHandleAtlas, getHandleAtlasTexture, handleAtlasAssetStats, invalidateHandleAtlasAsset };
