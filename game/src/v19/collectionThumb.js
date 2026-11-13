/**
 * 藏刀阁 · V19 刀模缩略图
 *
 * ★ 要修什么：藏刀阁列表里，老工艺刀有真实外观缩略图，V19 刀却只有
 *   一个锻造图标 + 材质名。收藏是这个产品的主卖点，列表里看不到刀，
 *   玩家就没有“这是我的作品”的记忆，只能点进详情才看到 3D。
 *
 * ★ 做法：用一台**独立的离屏 ForgeStage**，复用锻造时同一套材质配方
 *   （setSurface + knifeDetails 的磨面参数），把档案外观渲成静帧。
 *   出图后写入 IndexedDB（与老工艺缩略图共用缓存库），再回来时直接命中。
 *
 * ★ 约束：
 *   - 不碰游戏主舞台（v19/sharedStage 的单例），只自己建一台；
 *   - 串行出图，避免多台 WebGL 上下文与并发编译；
 *   - 卡片离屏时不画（IntersectionObserver），大收藏不会一次性编译几十把刀；
 *   - WebGL 不可用时由调用方保留原有降级展示，这里只回报失败。
 */

import { ForgeStage } from './stage.js';
import { setSurface } from './materials.js';
import { FITS } from './forge.js';
import { loadThumbnail, saveThumbnail } from '../render/collectionCache.js';

const T = globalThis.THREE;
/** 显示尺寸约 178×150，按 2× 出图，兼顾高分屏与体积。 */
const WIDTH = 356;
const HEIGHT = 300;
const MAX_MEMORY = 48;

const memory = new Map();
const inFlight = new Map();
let queue = Promise.resolve();
let stage = null;
let canvasHost = null;
let observer = null;
let generation = 0;
let unavailable = false;

/** 缓存键包含完整视觉配方；刀面/装配/矿料任何一项变化都会重新出图。
 *  前缀是**取景版本号**：改了相机/尺寸就 bump，旧图不会继续命中。 */
export function thumbnailKey(visual) {
  return 'v19-thumb-v2:' + JSON.stringify([
    visual?.model, visual?.fit, visual?.skin, visual?.marks,
    visual?.purity, visual?.ore, visual?.refinement, visual?.hits,
  ]);
}

function remember(key, value) {
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value);
}

function ensureStage() {
  if (stage) return stage;
  if (unavailable) return null;
  try {
    canvasHost = document.createElement('canvas');
    canvasHost.width = 4;
    canvasHost.height = 4;
    Object.assign(canvasHost.style, {
      position: 'fixed', left: '-10000px', top: '0', width: '4px', height: '4px',
      opacity: '0', pointerEvents: 'none', contain: 'strict',
    });
    document.body.appendChild(canvasHost);
    stage = new ForgeStage(canvasHost, { offscreen: true });
    return stage;
  } catch (error) {
    console.warn('[collection] V19 preview stage unavailable', error);
    unavailable = true;
    canvasHost?.remove();
    canvasHost = null;
    return null;
  }
}

function disposeStage() {
  if (!stage) return;
  try { stage.setRendering(false); } catch (_) { /* 上下文可能已丢失 */ }
  try { stage.renderer?.dispose?.(); } catch (_) { /* 忽略 */ }
  canvasHost?.remove();
  canvasHost = null;
  stage = null;
}

function identity(geometry) {
  geometry.computeBoundingBox?.();
  return geometry.boundingBox ?? null;
}

/**
 * 画一张刀模静帧。返回 dataURL 或 null（降级）。
 * @param {object} visual 档案里的 v19Visual
 * @param {() => boolean} isCurrent 是否仍然有效（页面已重绘/切换则放弃）
 */
async function draw(visual, isCurrent) {
  const instance = ensureStage();
  if (!instance || !visual?.model) return null;
  const asset = await instance.load(visual.model);
  if (!isCurrent()) return null;

  const fit = FITS.find(item => item.id === visual.fit) || null;
  setSurface(asset.uniforms, visual, fit);
  const uniforms = asset.uniforms;
  // 静帧不要锻造/命中残留：热、脉冲、波纹都会把亮度锁在高温色。
  uniforms.fClock.value = 0;
  uniforms.fHeat.value = 0;
  uniforms.fPulse.value = 0;
  uniforms.fWave.value = 0;
  uniforms.fHit.value.set(999, 999, 0);

  const box = identity(asset.mesh.geometry);
  if (!box) return null;
  const center = box.getCenter(new T.Vector3());
  const size = box.getSize(new T.Vector3());

  // 刀身通常沿最长轴排布：横刀给一个斜置角度，竖刀只做轻微侧倾。
  const mesh = new T.Mesh(asset.mesh.geometry, asset.mesh.material);
  mesh.position.set(-center.x, -center.y, -center.z);
  mesh.frustumCulled = false;
  const holder = new T.Group();
  holder.add(mesh);
  holder.rotation.set(.05, .52, size.x >= size.y ? -.62 : -.16);
  holder.updateMatrixWorld(true);

  const framed = new T.Box3().setFromObject(holder);
  if (framed.isEmpty()) return null;
  const extent = framed.getSize(new T.Vector3());
  const mid = framed.getCenter(new T.Vector3());
  const aspect = WIDTH / HEIGHT;
  const halfHeight = Math.max(extent.y / 2, extent.x / (2 * aspect)) * 1.06;
  const camera = new T.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .1, 60);
  camera.position.set(mid.x, mid.y, 12);
  camera.lookAt(mid.x, mid.y, 0);
  camera.updateProjectionMatrix();

  const scene = new T.Scene();
  scene.environment = instance.scene.environment;
  scene.add(holder, new T.HemisphereLight(0xdfe9ff, 0x32302c, 1.25));
  const key = new T.DirectionalLight(0xffe7d1, 3.1);
  key.position.set(-2.4, 3, 3.6);
  const rim = new T.DirectionalLight(0xc6e5ff, 1.5);
  rim.position.set(3.2, 1.4, 2.2);
  const fill = new T.DirectionalLight(0xffffff, .5);
  fill.position.set(0, -2.2, 1.6);
  scene.add(key, rim, fill);

  const target = new T.WebGLRenderTarget(WIDTH, HEIGHT);
  target.texture.colorSpace = T.SRGBColorSpace;
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(WIDTH, HEIGHT);
  const renderer = instance.renderer;
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new T.Color());
  const previousAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
    // WebGL 原点在左下，画布在左上，逐行翻转。
    for (let y = 0; y < HEIGHT; y++) {
      image.data.set(pixels.subarray((HEIGHT - y - 1) * WIDTH * 4, (HEIGHT - y) * WIDTH * 4), y * WIDTH * 4);
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/webp', .92);
  } catch (error) {
    console.warn('[collection] V19 preview render failed', error);
    return null;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    target.dispose();
    scene.remove(holder);
    scene.environment = null;
    instance.invalidate?.(80);
  }
}

function request(key, visual, token) {
  if (memory.has(key)) return Promise.resolve(memory.get(key));
  const pending = inFlight.get(key);
  if (pending?.token === token) return pending.task;
  const task = queue.then(async () => {
    if (token !== generation) return null;
    const saved = await loadThumbnail(key);
    if (token !== generation) return null;
    if (saved?.dataUrl) return saved.dataUrl;
    const dataUrl = await draw(visual, () => token === generation);
    if (token !== generation) return null;
    if (dataUrl) {
      const persist = () => { saveThumbnail(key, { dataUrl, degraded: false }).catch(() => {}); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(persist, { timeout: 1600 });
      else setTimeout(persist, 60);
    }
    return dataUrl;
  }).catch(error => {
    console.warn('[collection] V19 preview failed', error);
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

function paint(host, record, dataUrl, cached) {
  if (!dataUrl) {
    host.dataset.state = 'unavailable';
    return;
  }
  if (!host.isConnected && !cached) return;
  const image = document.createElement('img');
  image.className = 'v19-thumb-image';
  image.alt = `${record.bladeName || '成刀'}的档案外观`;
  image.decoding = 'async';
  image.src = dataUrl;
  const commit = () => {
    if (!host.isConnected && !cached) return;
    host.replaceChildren(image);
    host.dataset.state = 'ready';
    delete host.dataset.degraded;
  };
  if (cached || typeof image.decode !== 'function') { commit(); return; }
  image.decode().then(commit).catch(() => {
    if (host.isConnected) host.dataset.state = 'unavailable';
  });
}

/**
 * 把 V19 档案外观缩略图挂到卡片主视觉位。
 * 调用方应保留原有的图标 + 材质降级内容，出图成功后会被替换。
 */
export function mountBladeThumbnail(host, record) {
  const visual = record?.v19Visual;
  if (!host || !visual) return false;
  const key = thumbnailKey(visual);
  const cached = memory.get(key);
  if (cached) {
    memory.delete(key);
    memory.set(key, cached);
    paint(host, record, cached, true);
    return true;
  }
  host.dataset.state = 'pending';
  const token = generation;
  const run = () => {
    observer?.unobserve(host);
    delete host.__v19ThumbRun;
    if (token !== generation || !host.isConnected) return;
    request(key, visual, token).then(dataUrl => paint(host, record, dataUrl, false));
  };
  if (typeof IntersectionObserver === 'function') {
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = entry.target.__v19ThumbRun;
          if (callback) callback();
        }
      }, { rootMargin: '260px 0px' });
    }
    host.__v19ThumbRun = run;
    observer.observe(host);
  } else run();
  return true;
}

/** 页面重绘时解除旧卡片上的观察器。 */
export function disconnectBladeThumbnails() {
  generation++;
  observer?.disconnect();
  observer = null;
  inFlight.clear();
}

/** 离开工坊时释放离屏舞台与显存。 */
export function releaseBladeThumbnailStage() {
  disconnectBladeThumbnails();
  const token = generation;
  queue.then(() => {
    if (token !== generation) return;
    disposeStage();
  });
}
