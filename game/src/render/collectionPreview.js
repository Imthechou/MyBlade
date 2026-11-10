/**
 * 藏刀阁缩略图：用独立 BladeStage 串行绘制真实档案外观。
 * 缩略舞台与详情舞台分离，不碰游戏主舞台；无 WebGL 时不以通用刀型图冒充档案外观。
 */
import { BladeStage } from './index.js';
import { loadThumbnail, saveThumbnail, thumbnailCacheStats } from './collectionCache.js';

const MAX_CACHE = 72;
const imageCache = new Map();
const inFlight = new Map();
let queue = Promise.resolve();
let thumbStage = null;
let thumbHost = null;
let observer = null;
let generation = 0;

// The collection has its own camera/scale, so apply a small extra exposure trim
// without altering shaders, materials, studio PMREM or game-stage lighting.
export const COLLECTION_EXPOSURE = 0.84;
export function applyCollectionLighting(stage) {
  const viewer = stage?.viewer;
  if (!viewer?.renderer) return false;
  viewer.renderer.toneMappingExposure = COLLECTION_EXPOSURE;
  viewer.needsRender = true;
  return true;
}

function fingerprint(record) {
  return JSON.stringify(['archive-image-v4',
    record.id, record.knifeTypeId, record.knifeType, record.seed,
    record.visualRecipe, record.history, record.pendingSkin,
  ]);
}

function showState(host, message, kind = 'loading') {
  host.replaceChildren();
  host.dataset.state = kind;
  const label = document.createElement('span');
  label.className = 'blade-thumb-state';
  label.setAttribute('role', 'status');
  label.setAttribute('aria-live', 'polite');
  label.textContent = message;
  host.appendChild(label);
}

function remember(key, value) {
  imageCache.delete(key);
  imageCache.set(key, value);
  while (imageCache.size > MAX_CACHE) imageCache.delete(imageCache.keys().next().value);
}

function ensureStage() {
  if (thumbStage) return thumbStage;
  thumbHost = document.createElement('div');
  thumbHost.className = 'collection-thumb-renderer';
  Object.assign(thumbHost.style, {
    position: 'fixed', left: '-10000px', top: '0', width: '112px', height: '112px',
    overflow: 'hidden', pointerEvents: 'none', contain: 'strict',
  });
  document.body.appendChild(thumbHost);
  thumbStage = new BladeStage();
  return thumbStage;
}

function raf() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function draw(record, visual, isCurrent = () => true) {
  if (!BladeStage.supported) return null;
  const stage = ensureStage();
  const mounted = stage.ready ? { ok: true } : await stage.mount(thumbHost);
  if (!mounted?.ok) return null;
  applyCollectionLighting(stage);
  if (!isCurrent()) return null;
  const environment = await stage.loadEnvironment();
  if (!isCurrent()) return null;
  const modelId = visual?.modelId;
  if (!modelId || !visual.skin) return null;
  // 独立缩略舞台切刀时不重放上一份材质，当前档案配方在 show 后一次性应用。
  stage.deferSkin = true;
  let shown;
  try { shown = await stage.show(modelId, { viewPreset: visual.viewPreset || 'forge' }); }
  finally { stage.deferSkin = false; }
  if (!shown?.ok || !isCurrent()) return null;
  stage.applySkin(visual.skin, { coverAll: !visual.handle?.explicit });
  stage.applyHandle(visual.handle?.explicit ? visual.handle : null, visual.skin);
  stage.applyGlow(visual.glowCardId || null);
  // applySkin / applyHandle 可排队到当前编译之后；先等队列稳定，再显式绘制静帧。
  for (let pass = 0; pass < 8; pass++) {
    try { await stage.viewer?._compilePromise; } catch (_) { /* 仍尝试已有可用材质 */ }
    await raf();
    if (!isCurrent()) return null;
    if (!stage.isCompiling && !stage._visualFlushQueued) break;
  }
  /* ★ 2026-10-21（审计 #5）：改走门面的**离屏定尺出图**，不再把可见画布缩到 136×164
     再缩回来（12 张一批里有 50.6 ms 花在 drawing buffer 重分配上）。 */
  if (!stage.viewer?.renderer || !isCurrent()) return null;
  try { return { dataUrl: stage.snapshot(136, 164), degraded: !environment?.ok }; } catch (_) { return null; }
}

function requestDraw(key, record, visual, token) {
  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key));
  const pending = inFlight.get(key);
  if (pending?.token === token) return pending.task;
  const task = queue.then(async () => {
    if (token !== generation) return null;
    // Fast path: never mount a second WebGL renderer for a previously captured
    // unchanged blade. Visual recipes are part of the versioned cache key.
    const saved = await loadThumbnail(key);
    if (token !== generation) return null;
    if (saved) return saved;
    const result = await draw(record, visual, () => token === generation);
    if (token !== generation) return null;
    if (result?.dataUrl && !result.degraded) {
      // Persist off the critical rendering path. If IndexedDB is unavailable,
      // continue normally with the existing bounded memory cache.
      const persist = () => { saveThumbnail(key, result).catch(() => {}); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(persist, { timeout: 1500 });
      else setTimeout(persist, 50);
    }
    return result;
  }).catch(error => {
    console.warn('[collection] archived preview failed', error);
    return null;
  });
  queue = task.catch(() => {});
  inFlight.set(key, { task, token });
  task.then(dataUrl => {
    if (inFlight.get(key)?.task === task) inFlight.delete(key);
    if (dataUrl) remember(key, dataUrl);
  });
  return task;
}

/**
 * 诊断用（只读）：缩略舞台当前的资源账目。
 *
 * 给 `tools/probe-collection-batch.mjs` 用 —— "收藏批量出图（20 次进出）的
 * 资源平台期与显存账本"一直没测，就是因为 thumbStage 是模块私有的。
 * 只回计数，不改任何状态；`renderer.info.memory` 是**对象数量**不是字节数。
 */
export function collectionStageStats() {
  const r = thumbStage?.viewer?.renderer;
  if (!r) return null;
  return {
    programs: r.info.programs.length,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    models: thumbStage.engine?.loaded?.size ?? null,
    cachedImages: imageCache.size,
    inFlight: inFlight.size,
    canvases: document.querySelectorAll('canvas').length,
    disk: thumbnailCacheStats(),
  };
}

/** 将档案外观缩略图接入卡片容器；record/visual 必须来自该档案的 canonical resolver。 */export function mountCollectionPreview(host, record, visual) {
  if (!host) return;
  if (!BladeStage.supported) {
    showState(host, '此设备不支持 WebGL，档案外观不可预览', 'unsupported');
    return;
  }
  const key = fingerprint(record);
  const paint = async (dataUrl, isCached = false) => {
    // Cached previews may be painted while their card is still detached during render().
    // Keep that synchronous path: otherwise every sort/compare redraw leaves blank cards.
    if (!host.isConnected && !isCached) return;
    if (!dataUrl?.dataUrl) {
      showState(host, '档案外观暂不可预览', 'unavailable');
      return;
    }
    if (dataUrl.degraded) host.dataset.degraded = 'environment';
    else delete host.dataset.degraded;
    const image = document.createElement('img');
    image.className = 'blade-thumb-image';
    image.alt = `${record.bladeName || '成刀'}的档案外观`;
    image.decoding = 'async';
    image.src = dataUrl.dataUrl;
    // Keep the loading placeholder until the actual PNG is decoded; never flash an empty frame.
    try {
      if (!isCached && typeof image.decode === 'function') await image.decode();
    } catch (_) {
      if (host.isConnected) showState(host, '档案外观暂不可预览', 'unavailable');
      return;
    }
    if (!host.isConnected && !isCached) return;
    host.replaceChildren(image);
    host.dataset.state = 'ready';
  };
  const cached = imageCache.get(key);
  if (cached) { imageCache.delete(key); imageCache.set(key, cached); paint(cached, true); return; }
  showState(host, '档案外观生成中', 'loading');
  const token = generation;
  const run = () => {
    observer?.unobserve(host);
    if (token !== generation || !host.isConnected) return;
    requestDraw(key, record, visual, token).then(paint);
  };
  if (typeof IntersectionObserver === 'function') {
    if (!observer) observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const callback = entry.target.__collectionPreviewRun;
        if (callback) callback();
      }
    }, { rootMargin: '220px 0px' });
    host.__collectionPreviewRun = run;
    observer.observe(host);
  } else run();
}

/** 仅供页面模块卸载时断开 lazy observer；不会中断共享绘制队列。 */
export function disconnectCollectionPreview(host) {
  if (!host) return;
  observer?.unobserve(host);
  delete host.__collectionPreviewRun;
}

/** 页面重绘时解除旧卡片节点引用，避免滞留观察器。 */
export function disconnectCollectionPreviews() {
  generation++;
  observer?.disconnect();
  observer = null;
  inFlight.clear();
}

/** Return the hidden archive canvas and its GPU resources after leaving. */
export function releaseCollectionPreviewStage() {
  disconnectCollectionPreviews();
  const token = generation;
  queue.then(() => {
    if (token !== generation || !thumbStage) return;
    const stage = thumbStage;
    thumbStage = null;
    try { stage.dispose(); } catch (_) { /* WebGL context may be lost */ }
    thumbHost?.remove();
    thumbHost = null;
  });
}
