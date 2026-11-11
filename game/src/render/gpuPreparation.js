/** Runtime GPU preparation helpers. Keep these independent of Three.js for testing. */

const COMPILE_MAPS = [
  'map', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap',
  'displacementMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'envMap',
  'specularMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap',
  'iridescenceMap', 'iridescenceThicknessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'anisotropyMap', 'gradientMap', 'matcap',
  'specularIntensityMap', 'specularColorMap',
];

const stableValue = (value) => {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

/** A warm batch must not replay visuals when it still owns the visible selection. */
export function candidateWarmNeedsVisualRestore(isCurrent) {
  return typeof isCurrent !== 'function' || !isCurrent();
}

/**
 * Return the shader/program-relevant material identity used by renderer prewarming.
 * Values that only feed uniforms (e.g. roughness or clearcoat amount while enabled)
 * are intentionally omitted so visually distinct uniform states share a program.
 */
export function materialCompileFingerprint(material) {
  if (!material) return 'null';
  const enabled = (key) => Number(material[key]) > 0;
  const maps = COMPILE_MAPS.map((key) => {
    const tex = material[key];
    if (!tex) return [key, false];
    return [key, true, tex.channel ?? null, tex.mapping ?? null, tex.type ?? null,
      tex.colorSpace ?? null, !!(tex.isVideoTexture || tex.image?.isVideo ||
        (typeof HTMLVideoElement !== 'undefined' && tex.image instanceof HTMLVideoElement))];
  });
  const defines = Object.entries(material.defines || {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, stableValue(value)]);
  const fields = {
    type: material.type ?? material.constructor?.name ?? null,
    hook: typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey() : '',
    macros: {
      transmission: enabled('transmission'), dispersion: enabled('dispersion'),
      clearcoat: enabled('clearcoat'), iridescence: enabled('iridescence'),
      sheen: enabled('sheen'), anisotropy: enabled('anisotropy'),
    },
    maps, defines,
    side: material.side ?? null,
    normalMapType: material.normalMapType ?? null,
    vertexColors: !!material.vertexColors,
    flatShading: !!material.flatShading,
    toneMapped: material.toneMapped !== false,
    transparent: !!material.transparent,
    premultipliedAlpha: !!material.premultipliedAlpha,
    alphaHash: !!material.alphaHash,
    alphaTest: Number(material.alphaTest) > 0,
    precision: material.precision ?? null,
    // Additional program parameters used by common Three.js material variants.
    wireframe: !!material.wireframe,
    fog: !!material.fog,
    dithering: !!material.dithering,
    alphaToCoverage: !!material.alphaToCoverage,
    clipShadows: !!material.clipShadows,
    clipIntersection: !!material.clipIntersection,
    clippingPlanes: Array.isArray(material.clippingPlanes) ? material.clippingPlanes.length : 0,
  };
  return JSON.stringify(fields);
}

/** Three's double-sided transmission prepass uses a linear target + back side.
 * Compilation captures parameters synchronously, even when it returns a Promise.
 * Restore before yielding so an animation frame can never draw into this target. */
export function compileTransmissionPreparation(renderer, target, materials, sides, compile) {
  const previous = renderer.getRenderTarget();
  const changed = materials.filter((m) => m.transmission > 0 && m.side === sides.doubleSide);
  try {
    for (const material of changed) material.side = sides.backSide;
    renderer.setRenderTarget(target);
    return compile();
  } finally {
    for (const material of changed) material.side = sides.doubleSide;
    renderer.setRenderTarget(previous);
  }
}

/**
 * 透射通道的 program 变体：**只编真实绘制会取用的那一支**。
 *
 * ★ 2026-10-21（P1 未完成项 1 · 冷会话晶体卡 ~2.7s）
 *
 *   实测（tools/probe-crystal-attrib.mjs，MAT15，ANGLE/D3D11）冷会话里晶体会编出三支
 *   刀身程序，差异只在宏：
 *     ① `TONE_MAPPING` + `DOUBLE_SIDED`             —— 屏幕直出（真实绘制取用）
 *     ② 无 `TONE_MAPPING` + `DOUBLE_SIDED`          —— 绑 RT、side 未翻转（**从不绘制**）
 *     ③ 无 `TONE_MAPPING` + `FLIP_SIDED`            —— 绑 RT、side 翻成 BackSide（真实绘制取用）
 *   每支约 0.9–1.0s，串行链接，于是首帧 ~2.7–3.0s。
 *
 *   ② 是白编的：three 的透射前置通道只会把 DoubleSide 材质**翻成 BackSide** 再画进线性 target。
 *   早期实现"绑 RT 编一遍、再翻面编一遍"（两趟），于是每张晶体卡多付一支约 1s 的无用程序。
 *
 *   **一趟即可**：把场景里**所有**透射材质里的 DoubleSide 先翻成 BackSide，再绑 RT 编一次。
 *   ⚠ 翻转清单必须取自**整个场景**而不是调用方传入的那几个材质：
 *     compileAsync 会遍历场景里的每一个材质（含不可见的预热副本），
 *     漏翻一个就又会给那个副本编出一支②。
 *
 * @param {object} scene 要编译的场景（翻转清单从它的 traverse 取）
 * @param {number[]} sides  { doubleSide, backSide } 常量（避免本模块依赖 THREE）
 * @returns {Promise<any>} compile 的结果（无透射材质时为 undefined）
 */
export function compileTransmissionVariants(renderer, scene, sides, compile) {
  const transmissive = [];
  scene?.traverse?.((object) => {
    const list = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
    for (const material of list) if (material && material.transmission > 0) transmissive.push(material);
  });
  if (!transmissive.length) return undefined;
  const flipped = transmissive.filter((m) => m.side === sides.doubleSide);
  const target = new globalThis.THREE.WebGLRenderTarget(1, 1, { type: globalThis.THREE.HalfFloatType });
  const previous = renderer.getRenderTarget();
  try {
    for (const m of flipped) m.side = sides.backSide;
    renderer.setRenderTarget(target);
    return compile();
  } finally {
    for (const m of flipped) m.side = sides.doubleSide;
    renderer.setRenderTarget(previous);
    target.dispose();
  }
}

/** Limit concurrent GLB parsing to avoid a startup memory spike. */
export async function preloadModels(engine, ids, { concurrency = 2, onProgress = null } = {}) {
  const unique = [...new Set(ids.filter(Boolean))];
  const outcome = new Array(unique.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(4, Math.floor(Number(concurrency) || 2)));
  await Promise.all(Array.from({ length: Math.min(limit, unique.length) }, async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const id = unique[index];
      let ok = false;
      try { ok = !!(await engine.warmup(id)); } catch (_) { /* count as failed */ }
      outcome[index] = { id, ok };
      if (onProgress) onProgress(outcome.filter(Boolean).length, unique.length, id, ok);
    }
  }));
  return outcome;
}

function yieldIdle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 50);
  });
}

/**
 * Incrementally parse/cache non-critical GLBs without a bulk CPU or GPU spike.
 * One model is warmed per idle slice; no texture upload or shader compilation
 * is performed here. Callers can invalidate queued work or pause it while the
 * renderer owns a compile operation. yield is injectable for pure tests.
 */
export async function preloadModelsInBackground(engine, ids, {
  isCurrent = null, canRun = null, onProgress = null, yield: yieldTask = yieldIdle,
} = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const outcome = [];
  for (const id of unique) {
    while (true) {
      if (typeof isCurrent === 'function' && !isCurrent()) {
        return { results: outcome, cancelled: true, total: unique.length };
      }
      if (typeof canRun !== 'function' || canRun()) break;
      await yieldTask();
    }
    await yieldTask();
    if (typeof isCurrent === 'function' && !isCurrent()) {
      return { results: outcome, cancelled: true, total: unique.length };
    }
    let ok = false;
    try { ok = !!(await engine.warmup(id)); } catch (_) { /* best-effort cache fill */ }
    outcome.push({ id, ok });
    if (onProgress) onProgress(outcome.length, unique.length, id, ok);
  }
  return { results: outcome, cancelled: false, total: unique.length };
}

/** Wait for a preparation dependency, then re-check its owner before doing more work. */
export async function awaitIfCurrent(promise, isCurrent = null) {
  try { await promise; } catch (_) { /* preparation dependencies are best-effort */ }
  return typeof isCurrent !== 'function' || !!isCurrent();
}

/** Return each unique mesh geometry/material pair that a real draw can use. */
export function collectPreparationTargets(root) {
  const targets = [];
  const seen = new WeakMap();
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let geometryMaterials = seen.get(object.geometry);
    if (!geometryMaterials) { geometryMaterials = new Set(); seen.set(object.geometry, geometryMaterials); }
    for (const material of materials) {
      if (!material || geometryMaterials.has(material)) continue;
      geometryMaterials.add(material);
      targets.push({ geometry: object.geometry, material });
    }
  });
  return targets;
}

/** The actual GPU texture cache belongs to the renderer/context, not the GLB. */
export class TextureUploadTracker {
  constructor() {
    this.renderer = null;
    this.versions = new WeakMap();
  }
  reset() {
    this.versions = new WeakMap();
    this.renderer = null;
  }
  upload(renderer, textures) {
    if (!renderer || typeof renderer.initTexture !== 'function') {
      return { ok: false, count: 0, uploaded: 0, reused: 0, failed: 0, gpuMiB: 0 };
    }
    if (this.renderer !== renderer) { this.versions = new WeakMap(); this.renderer = renderer; }
    const seen = new Set();
    let count = 0, uploaded = 0, reused = 0, failed = 0, bytes = 0;
    for (const tex of textures) {
      if (!tex?.isTexture || seen.has(tex)) continue;
      seen.add(tex);
      count++;
      const image = tex.image;
      const w = Number(image?.width || image?.videoWidth || 0);
      const h = Number(image?.height || image?.videoHeight || 0);
      if (!w || !h || image.complete === false) { failed++; continue; }
      // Renderer uploads only once per version. A later texture.needsUpdate
      // increments the version and correctly forces another upload.
      const version = tex.version || 0;
      if (this.versions.get(tex) === version) reused++;
      else {
        try { renderer.initTexture(tex); this.versions.set(tex, version); uploaded++; }
        catch (error) { failed++; console.warn('[render] texture upload failed', error); }
      }
      bytes += w * h * 4 * (tex.generateMipmaps === false ? 1 : 4 / 3);
    }
    return { ok: failed === 0 && count > 0, count, uploaded, reused, failed,
      gpuMiB: Math.round(bytes / 1048576 * 10) / 10 };
  }
}

export function chooseModelPreload({ memory = 4, coarse = true, override = '', modelIds = [], processIds = [] } = {}) {
  const all = [...new Set([...processIds, ...modelIds])];
  const allowFull = override === 'all' || (override !== 'focused' && memory >= 8);
  return {
    profile: allowFull ? 'all-models' : 'focused',
    models: allowFull ? all : [...new Set([...processIds, ...modelIds.slice(0, 3)])],
    concurrency: allowFull ? (coarse ? 2 : 3) : 2,
    warning: override === 'all' && memory < 4 ? 'all-model preload on a low-memory device may reduce stability' : null,
  };
}

/**
 * Select the blocking model set for first paint/first forge stage. The home
 * showcase is loaded by the route itself; only the first process model (ore)
 * is additionally needed before the first forge decision. Later knife/process
 * models are loaded by the existing on-demand warmup path. Explicit diagnostic
 * overrides retain the old focused/all profiles.
 */
export function chooseStartupPreload({ memory = 4, coarse = true, override = '', modelIds = [], processIds = [] } = {}) {
  if (override === 'all' || override === 'focused') {
    return chooseModelPreload({ memory, coarse, override, modelIds, processIds });
  }
  return {
    profile: 'first-stage',
    models: [...new Set(processIds.filter(Boolean).slice(0, 1))],
    concurrency: 1,
    warning: null,
  };
}
