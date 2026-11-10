/**
 * 应用层 · 启动入口
 *
 * 启动顺序是有讲究的（ESM 下模块求值顺序即依赖顺序）：
 *   ① 平台服务层装好（存档 defaults、音频解锁）
 *   ② 渲染门面挂载 3D（失败也继续 —— 没有 3D 也要能玩）
 *   ③ UI 外壳 + 路由注册
 *   ④ 启动路由
 */

import { env, audio, bus, EVENTS } from '../platform/index.js';
import * as Progress from '../core/progress.js';
import Game from './game.js';
import * as Settings from './settings.js';
import { getStage, ensureS3TextureData } from '../render/index.js';
import { gpuLedger } from '../render/resourceLedger.js';
import { KNIFE_TYPES } from '../data/knifeTypes.js';
import { chooseStartupPreload, preloadModels, preloadModelsInBackground } from '../render/gpuPreparation.js';
import * as Shell from '../ui/shell.js';
import * as Tutorial from '../ui/tutorial.js';
import { createStageInspect } from '../ui/stageControls.js';
import router from '../ui/router.js';
import { $ } from '../ui/dom.js';

import * as Home from '../ui/pages/home.js';
import * as Forge from '../ui/pages/forge.js';
import * as Appraise from '../ui/pages/appraise.js';
// Secondary modules load on first visit instead of blocking the home route.
function lazyPage(load, { initialize = false } = {}) {
  let page = null;
  let pending = null;
  const ready = () => pending || (pending = load().then(mod => {
    page = mod;
    if (initialize) page.create?.();
    return page;
  }).catch(error => { pending = null; console.warn('[route] lazy page failed', error); throw error; }));
  return {
    render() {
      if (page) { page.render?.(); return; }
      const key = router.currentKey();
      ready().then(mod => {
        if (router.currentKey() === key) mod.render?.();
      }).catch(() => {
        if (router.currentKey() === key) {
          const host = document.querySelector('.page[data-page="' + key + '"]');
          if (host) host.textContent = '页面加载失败，请返回后重试';
        }
      });
    },
    leave() { page?.leave?.(); },
    enter() { page?.enter?.(); },
  };
}
const Arena = lazyPage(() => import('../ui/pages/arena.js'));
const Workshop = lazyPage(() => import('../ui/pages/workshop.js'), { initialize: true });
const Daily = lazyPage(() => import('../ui/pages/daily.js'), { initialize: true });

const boot = { note: null, root: null };

function setNote(text) {
  if (boot.note) boot.note.textContent = text;
}

function setStagePreparing(preparing) {
  const stage = getStage();
  // The viewer pauses drawing while a new shader program compiles, but keeps
  // the last completed frame on its canvas. Do not cover that valid frame with
  // a misleading "3D is preparing" pill. Show it only before any model has
  // actually been loaded for the stage.
  const hasRenderableModel = !!(stage && stage.ready && stage.modelId
    && stage.engine && stage.engine.loaded && stage.engine.loaded.has(stage.modelId));
  document.querySelectorAll('.stage').forEach((host) => {
    host.classList.toggle('is-preparing', !!preparing && !hasRenderableModel);
  });
}

async function K3DTextureReady(stage) {
  const shader = globalThis.K3D?.bladeSkinShader;
  return shader?.prepareTextures
    ? shader.prepareTextures(stage.viewer?.renderer)
    : { total: 0, uploaded: 0 };
}

async function main() {
  // Developer-visible quality override for controlled visual A/B comparisons.
  // The automatic policy remains the default when the query is absent.
  const qualityFlag = new URLSearchParams(globalThis.location.search).get('quality');
  if (qualityFlag === 'high' || qualityFlag === 'balanced') globalThis.__FORGE_QUALITY = qualityFlag;
  boot.root = $('#boot');
  boot.note = $('#bootNote');

  // ① 平台
  setNote('正在准备存档…');
  Progress.load();
  Progress.rolloverDaily();
  // 存档设置统一经 app/settings 施加到音频/震动/动效（V2.1 §29）
  Settings.applyAll();
  // 首次手势后解锁音频（浏览器策略）
  const unlockOnce = () => { audio.unlock(); globalThis.removeEventListener('pointerdown', unlockOnce); };
  globalThis.addEventListener('pointerdown', unlockOnce);

  // ② 页面骨架（3D 容器由页面自己创建，因此必须先建页再挂渲染器）
  Home.create({ legacy: { Game, getStage, createStageInspect } });
  Forge.create();
  Appraise.create();

  // ③ 渲染门面挂载
  setNote('正在装填锻造台…');
  let renderOk = false;
  const stageHost = $('#forgeStage');
  if (stageHost) {
    try {
      const r = await getStage().mount(stageHost);
      renderOk = !!(r && r.ok);
    } catch (_) { renderOk = false; }
  }
  if (!renderOk) console.warn('[boot] 3D 舞台不可用，游戏继续以 2D 界面运行');

  /* 启动屏持续到同一 renderer 完成资源、贴图和第一帧准备。 */
  const stage = getStage();
  if (renderOk) {
    stage.deferSkin = true;
    stage.viewer.deferCompile = true;
    stage.onCompileState((busy) => setStagePreparing(busy));
  }

  // ④ 外壳与路由（★ 底部标签栏已删除 —— 导航收归首页，见 css/pages/shell.css）
  setNote('正在搭建界面…');
  Shell.create($('#topbar'));

  router.register('home', Home);
  router.register('forge', { ...Forge, canEnter: () => !!(Game.run && !Game.run.finished) });
  router.register('appraise', Appraise);
  router.register('arena', Arena);
  router.register('workshop', Workshop);
  router.register('daily', Daily);

  router.onNavigate((key) => {
    Shell.sync(key);
    /* ★ 切页后必须重算取景：挂载时页面可能还是 display:none，
         量到的容器宽高是 0，canvas 会停在 1×1。 */
    getStage().resize();
    // ★ 3D 画布跨页复用（全局单 Viewer）—— canvas 在哪个容器里就画在哪一页。
    //   凡是有舞台的页面都必须在这里接管，缺一个就会出现"切过去一片空白"。
    const host = key === 'forge' ? $('#forgeStage') : (key === 'appraise' ? $('#appraiseStage') : null);
    if (host) { getStage().attachTo(host); getStage().resize(); }
    /* ★ 切页后把鉴赏按钮对齐到画布真实状态。
       切页时 attachTo 发生在 page.render() 之后，会把控件重置回
       该页默认值（首页/锻造页默认关），而按钮模块自己不知道 ——
       不对齐就会出现“按钮亮着、实际拖不动”。 */
    if (key === 'home') Home.syncInspect?.();
    else if (key === 'forge') Forge.syncInspect?.();
  });
  bus.on(EVENTS.CR_CHANGED, () => Shell.sync(router.currentKey()));

  // ⑤ 启动路由（首页会立刻开始加载展台上的刀 → 材质钩子就位）
  router.start();
  Shell.sync(router.currentKey());

  // Shared renderer/context preparation; keep the loading screen up until
  // resources, S3 decoding, texture uploads and the first actual draw finish.
  // Do not pretend a timed race against HDR means the GPU is ready.
  let deferredModels = [];
  const prep = { ready: false, problems: [], models: [], textures: 0, gpuMiB: 0,
    /* 方案 §5.6：Ready 要分四档，不能笼统叫"全卡 GPU 就绪"。
       每一档只在真的做到时置 true；没做到的档位就是"还没到"，不再用 ready=false 一概而论。 */
    readyStages: { assetsReady: false, programsReady: false, uploadSubmitted: false, firstDrawSubmitted: false },
    startedAt: performance.now(),
    note: '首页当前场景与首阶段资源+基础GPU准备；后续阶段模型按需加载' };
  globalThis.__FORGE_PREP = prep; // visible to diagnostics, no private data
  if (renderOk) {
    try {
      setNote('正在加载金属与环境反射…');
      const [hdr, s3] = await Promise.all([
        stage.loadEnvironment(), ensureS3TextureData(),
      ]);
      if (!hdr?.ok) prep.problems.push('HDR environment unavailable');
      if (!s3) prep.problems.push('S3 supplied textures unavailable');

      setNote('正在解析刀具模型…');
      const processes = ['ore_small', 'molten_sphere_small', 'blank_ingot_small'];
      // Keep only first-stage ore in the blocking set. The showcase model is
      // already loaded by the home route; later models are filled incrementally
      // on idle slices. Diagnostic overrides preserve focused/all eager profiles.
      const coarse = !!(globalThis.matchMedia && matchMedia('(pointer: coarse)').matches);
      const memory = Number(navigator.deviceMemory) || (coarse ? 4 : 8);
      const forced = new URLSearchParams(globalThis.location.search).get('preload') || '';
      prep.quality = (globalThis.__FORGE_QUALITY === 'high' ? 'high'
        : globalThis.__FORGE_QUALITY === 'balanced' ? 'balanced'
        : (memory < 8 || coarse) ? 'balanced' : 'high');
      const knifeModels = KNIFE_TYPES.map((t) => t.modelId);
      const policy = chooseStartupPreload({ memory, coarse, override: forced,
        processIds: processes, modelIds: knifeModels });
      prep.profile = policy.profile;
      prep.totalModels = policy.models.length;
      if (policy.warning) console.warn('[boot]', policy.warning);
      /* 方案 §5：GPU 预算按质量档给软上限（balanced 96 / high 192 MiB）。 */
      gpuLedger.setProfile(prep.quality);
      const results = await preloadModels(stage.engine, policy.models, {
        concurrency: policy.concurrency,
        onProgress: (done, total) => setNote(`正在解析刀具模型 ${done}/${total}…`),
      });
      for (const { id, ok } of results) {
        if (ok) prep.models.push(id);
        else prep.problems.push('model: ' + id);
      }
      if (policy.profile === 'first-stage' && !forced) {
        // Process models unlock S2/S3 first. High-memory desktop profiles may
        // cache every knife during spare time; constrained/touch devices cap
        // this warm cache to the first three forms. This queue never uploads
        // the decoded GLB textures to the GPU.
        const knifeBudget = memory >= 8 && !coarse ? knifeModels : knifeModels.slice(0, 3);
        deferredModels = [...processes.slice(1), ...knifeBudget]
          .filter((id) => !stage.engine.loaded?.has?.(id));
      }
      setNote('正在解码与上传纹理…');
      /* 资产（模型 + HDR + S3 数据）到这里已经齐了 —— 注意这与"程序就绪"是两件事。 */
      prep.readyStages.assetsReady = prep.models.length === policy.models.length && !!hdr?.ok && !!s3;
      const readyTextures = await K3DTextureReady(stage);
      prep.textures = readyTextures.uploaded;
      /* 账本：S3 的 24 张 512² 程序化贴图（每张 RGBA，按 createTexture 的 mip 设置估算）。 */
      try {
        const maps = globalThis.K3D?.s3TexMaps;
        const n = maps?.ids?.length || 0;
        const size = maps?.SIZE || 512;
        if (n) {
          gpuLedger.track('s3-textures', {
            kind: 's3-textures', renderer: stage.viewer?.renderer,
            bytesMiB: (n * size * size * 4 * (4 / 3)) / 1048576,
            optional: true, evictable: false,
            note: `${n} 张 ${size}² S3 纹理（含 mip 估算）`,
          });
        }
      } catch (_) { /* 诊断件 */ }
      if (readyTextures.uploaded !== readyTextures.total) prep.problems.push('S3 texture upload incomplete');
      const modelTextures = stage.initLoadedTextures();
      prep.modelTextures = modelTextures.count;
      prep.gpuMiB = modelTextures.gpuMiB;
      if (!modelTextures.ok) prep.problems.push('model texture upload incomplete');
      /* 上传提交（gl.texImage2D 已下发）—— 与"像素被采样到"仍不是同一件事。 */
      prep.readyStages.uploadSubmitted = readyTextures.uploaded === readyTextures.total && modelTextures.ok;
      /* 方案 §5：GPU 预算账本（估算值），随启动报告一起留痕。 */
      prep.gpuLedger = gpuLedger.report();
      setNote('正在准备全刀光晕着色器…');
      const halo = await stage.prewarmGlowShaders();
      prep.glowShaders = halo.ok;
      if (!halo.ok) prep.problems.push('S4 glow shader preparation: ' + halo.reason);

      // The home model is loaded by the router. Waiting before replay avoids
      // accidentally applying its skin on a previous or unloaded GLB.
      setNote('正在准备 GPU 着色器…');
      await stage.waitForModel();
      stage.deferSkin = false;
      if (stage._skinState) stage.applySkin(stage._skinState, { coverAll: stage._coverAll !== false });
      if (stage._handle) stage.applyHandle(stage._handle, stage._skinState);
      if (stage.viewer) stage.viewer.deferCompile = false;
      const compiled = await stage.precompile();
      if (!compiled.ok) prep.problems.push('initial shader compilation incomplete');
      /* 程序就绪（compileAsync 已落地）。 */
      prep.readyStages.programsReady = !!compiled.ok;
      // A real draw forces VAOs, first texture binds and shader uniform setup.
      // No temporary renderer or snapshot is used for the readiness claim.
      if (stage.viewer && !stage.isCompiling && compiled.ok) {
        stage.viewer.renderer.render(stage.viewer.scene, stage.viewer.camera);
        stage.viewer.needsRender = true;
        /* 首帧已提交（draw 已下发）。仍不等于"像素已呈现"，但这已经是本层能测的最后一档。 */
        prep.readyStages.firstDrawSubmitted = true;
      }
      prep.gpuLedger = gpuLedger.report();
      prep.ready = !!compiled.ok && !!hdr?.ok && !!s3
        && readyTextures.total > 0 && readyTextures.uploaded === readyTextures.total
        && modelTextures.ok && modelTextures.count > 0 && halo.ok
        && prep.models.length === policy.models.length && prep.problems.length === 0;
    } catch (error) {
      console.warn('[boot] GPU preparation degraded:', error);
      prep.problems.push(String(error && error.message || error));
      if (stage.viewer) stage.viewer.deferCompile = false;
      stage.deferSkin = false;
    }
  } else {
    prep.problems.push('WebGL unavailable; 2D mode');
  }
  setStagePreparing(false);
  prep.completedAt = performance.now();
  prep.elapsedMs = Math.round(prep.completedAt - prep.startedAt);
  if (prep.ready) prep.readyAt = prep.completedAt;
  if (boot.root) {
    boot.root.classList.add('is-gone');
    setTimeout(() => boot.root?.remove(), 340);
  }

  // The loading screen has now been removed only after strict current-scene
  // readiness. Continue useful model parsing without blocking it: one GLB per
  // idle window, paused whenever the renderer's shared compile gate is busy.
  if (prep.ready && deferredModels.length) {
    const generation = (Number(globalThis.__FORGE_BG_PRELOAD_SEQ) || 0) + 1;
    globalThis.__FORGE_BG_PRELOAD_SEQ = generation;
    const remaining = [...new Set(deferredModels)];
    prep.backgroundModels = { status: 'queued', done: 0, total: remaining.length, results: [] };
    globalThis.__FORGE_BG_PRELOAD = prep.backgroundModels;
    preloadModelsInBackground(stage.engine, remaining, {
      isCurrent: () => globalThis.__FORGE_BG_PRELOAD_SEQ === generation,
      canRun: () => !stage.viewer?._compiling && !stage.viewer?._compilePromise && !stage.viewer?._bgCompile,
      onProgress: (done, total, id, ok) => {
        prep.backgroundModels.done = done;
        prep.backgroundModels.results.push({ id, ok });
      },
    }).then((report) => {
      prep.backgroundModels.status = report.cancelled ? 'cancelled' : 'complete';
      prep.backgroundModels.results = report.results;
      prep.backgroundModels.finishedAt = performance.now();
    }).catch((error) => {
      prep.backgroundModels.status = 'failed';
      prep.backgroundModels.error = String(error && error.message || error);
    });
  }

  // ⑦ 新手引导：首次启动弹一次四件事（V2.1 §27）。
  //    等装填屏淡出后再弹，避免被 z-index 更高的引导屏盖住。
  setTimeout(() => { try { Tutorial.maybeShowFirstRun(); } catch (_) { /* 引导失败不影响开玩 */ } }, 360);

  console.log('[boot] 锻刀大赛已启动 · 平台', env.host, '· 3D', renderOk ? '可用' : '不可用');
}

function start() {
  main().catch(error => {
    setNote('启动失败：' + (error?.message || error));
    console.error('[boot] 启动失败', error);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

export default main;
