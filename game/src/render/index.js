/**
 * 表现层 · 3D 渲染门面
 *
 * ★★ 这是 UI / 玩法与 Three.js 之间的**唯一**接缝 ★★
 *
 * 规则：
 *   · core 与 ui **禁止**直接 import three / bladeViewer / bladeSkin；
 *   · 上层只认识 `show(modelId)` / `applySkin(skinState)` / `effect(name)` 这类语义方法；
 *   · 门面内部所有 legacy 调用都包了 try/catch —— **渲染失败绝不阻断玩法**
 *     （V1 曾出现过"模型加载失败 → 整个锻造流程卡死"的事故）。
 *
 * 未来迁移 Cocos / 小游戏时，只需重写本文件（用宿主 API 实现同样 7 个方法），
 * src/render/legacy/** 里的着色器与材质参数仍可作为移植参考。
 */

/* ── 依赖：按 V1 的加载顺序引入，保证 legacy 之间的运行时互相可见 ── */
import './legacy/_registry.js';
import './legacy/regions.js';
import './legacy/material.js';
import './legacy/viewer.js';
import './legacy/skin/materials.js';
import './legacy/skin/textures.js';
import './legacy/skin/finishes.js';
import './legacy/skin/handleMaterials.js';
import './legacy/skin/rarityVisuals.js';
import './legacy/skin/s3TexMaps.js';
/* S3 texture data is loaded once by bootstrap before the GPU readiness gate.
 * No speculative idle import: S3 is guaranteed to be decoded/uploaded before
 * users enter forging, or readiness reports a degraded status. */
const __perfGlobal = (typeof window !== 'undefined') ? window : globalThis;
const markS3DataPending = (v) => { try { if (__perfGlobal.K3D) __perfGlobal.K3D.s3TexMapsDataPending = v; } catch (_) { } };
markS3DataPending(true);
let s3DataPromise = null;
export function ensureS3TextureData() {
  if (!s3DataPromise) s3DataPromise = import('./legacy/skin/s3TexMapsData.js')
    .then(() => { markS3DataPending(false); return true; })
    .catch((error) => { markS3DataPending(false); console.warn('[render] S3 atlas missing', error); return false; });
  return s3DataPromise;
}
import './legacy/skin/grain.js';
import './legacy/skin/state.js';
import './legacy/skin/shader/noise.js';
import './legacy/skin/shader/patterns.js';
import './legacy/skin/shader/finishes.js';
import './legacy/skin/shader/cardEffects.js';
import './legacy/skin/shader/bladeSkinShader.js';
import './legacy/skin/shader/handleLook.js';
import './legacy/bladeViewer.js';
import './legacy/bladeEffects.js';
import './legacy/cardEffects.js';
import '../data/legacy/materials.js';
import '../data/legacy/knifeTypes.js';
import '../data/legacy/cardVisuals.js';
import '../data/legacy/cardWrites.js';
import '../data/legacy/cardEffectRecipes.js';
import '../data/legacy/temperIridescence.js';
import '../data/legacy/finishOverrides.js';

import { K3D_REGISTRY } from './legacy/_registry.js';
import { captureToDataURL } from './captureRunner.js';
import { env } from '../platform/env.js';
import motion from '../platform/motion.js';
import { TextureUploadTracker, awaitIfCurrent, collectPreparationTargets,
  materialCompileFingerprint, compileTransmissionVariants } from './gpuPreparation.js';
import { ComposePackCache } from './composeCache.js';
/* GPU 资源账本（方案 §5）：按 context 分账、预算软上限、lease。诊断件，不接管生命周期。 */
import { gpuLedger, GPU_BUDGET_MIB } from './resourceLedger.js';
if (typeof globalThis !== 'undefined') {
  try { (globalThis.K3D || (globalThis.K3D = {})).rLedger = gpuLedger; } catch (_) { /* ignore */ }
}

/* 编译/等待时间线（只写内存，不打印）。由 tools/probe-ux-flow.mjs 读取。 */
function tl(ev, extra) {
  try {
    const a = globalThis.__TL || (globalThis.__TL = []);
    if (a.length < 4000) a.push(Object.assign({ t: Math.round(performance.now()), ev }, extra || {}));
  } catch (_) { /* ignore */ }
}

const K3D = () => K3D_REGISTRY.proxy;

/**
 * 透射族预热时给副本用的 transmission 值。
 *
 * 程序键只看 `transmission > 0`（USE_TRANSMISSION 宏），数值本身是 uniform；
 * 这里取材质表 M15–M18 的同一档（0.30），只是为了"如果哪天有人在调试里
 * 直接看这份副本的数值也不会觉得荒谬"。
 */
const TRANSMISSION_WARM = 0.30;

/** 卸掉异常，返回兜底值 —— 渲染层永远不允许把异常抛给玩法层 */
function guard(fn, fallback = null) {
  try { return fn(); } catch (e) {
    if (globalThis.console) console.warn('[render]', e && e.message);
    return fallback;
  }
}

/**
 * `guard` 的**异步版**。
 *
 * ★ 2026-10-21（方案 §10 #54「缺纹理 / 网络失败」实测暴露）
 *   病象：`await guard(() => this.engine.loadKnife(modelId), null)` 在模型 404
 *   时并不走 `load-failed` 降级分支，而是抛出一个**未处理的 Promise 拒绝**
 *   （页面级 unhandledrejection）。GLB 传输截断时更难看：
 *   `RangeError: Invalid typed array length` 直接从 three 的 GLTFLoader 里冒出来。
 *   根因：`guard` 只有 try/catch —— 它 `return fn()` 返回的是**Promise 对象**，
 *   拒绝发生在 `await` 那一刻，已经不在 try 块里了。
 *   修法：新增本函数，同步抛错与 Promise 拒绝都收成 fallback。
 *   证据：tools/probe-resilience.mjs（修复前 model-404 / glb-truncate 两项
 *   各有 1 条页面错误 + 1 条未处理拒绝）。
 */
async function guardAsync(fn, fallback = null) {
  try { return await fn(); } catch (e) {
    if (globalThis.console) console.warn('[render]', e && e.message);
    return fallback;
  }
}

/** 让出一帧（预热从点击处理里调用，必须先把候选卡那一帧画出来再干活） */
function nextFrame() {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(r);
    else setTimeout(r, 16);
  });
}

/**
 * 预热请求指纹：同一批输入（模型 + 各变体的视觉字段 + 刀柄配方）就算同一份请求。
 *
 * ★ 为什么需要它：锻造页每次选卡 / 取消 / 重绘都会重跑 renderSelect.refresh()，
 *   如果每次都真的去构建三个材质，点击会平白多出十几毫秒。
 *   输入没变 → O(1) 早退，一个字符串都不用建。
 *
 * 环境贴图的有无由 _prewarmWork 单独比（它决定材质宏，是另一个维度）。
 * 减弱动效不在其中 —— 它不是着色器宏，不进 program。
 */
function warmFingerprint(modelId, variants, handles) {
  const part = (s) => [
    s.materialId, s.textureId, s.finishId, s.wear, s.knifeType, s.visualTier,
    s.temperCardId, s.finishCardId, s.patternSeed,
    JSON.stringify(s.variantParams || {}),
    JSON.stringify(s.cardFingerprints || {}),
    JSON.stringify(s.cardEffects || {}),
    /* 逐卡指纹的**输入**也要进指纹：cardFingerprints/cardEffects 是门面现算的，
       调用方交进来的往往还是空的（见 enrichCardVisuals）。
       少了这一行，"同一批输入但换了卡"会被误判成同一份请求 → 该预热却不预热。 */
    JSON.stringify(s.visualStages || []),
    JSON.stringify(s.visualBonus || {}),
  ].join('~');
  const hand = (h) => (h ? [
    h.metalId, h.tint, h.gain, h.desat, h.metalness, h.roughness, h.reflection, h.patternKind, h.wear,
  ].join('~') : '-');
  return [
    modelId,
    variants.map(part).join('|'),
    (handles || []).map(hand).join('|'),
  ].join('§');
}

/**
 * 把 S6 回火的**逐卡虹彩配方**并进 `variantParams.temper`。
 *
 * ★ 2026-10-14 修复「S6 决策卡在 3D 上毫无反应」
 *   现象：S6 的三张候选卡随便怎么切，画面哈希完全不变（实测 0/3）。
 *   根因：着色器 `k3dApplyTemper()` 第二行就是
 *        `float strength = clamp(ir.w, 0.0, 1.0) * on; if (strength <= 0.002) return;`
 *     而 `ir` 来自 `uTemperIrid`，其 w 分量的唯一来源是 state.js 里的
 *        `tIrid.strength = tmp.strength != null ? ... : 0`
 *     —— `tmp` 就是 `variantParams.temper`。S6 卡只写 `{amount, temperature}`，
 *     不带 strength，于是恒为 0 → 整层直接 return。
 *     配方本来在 `data/legacy/temperIridescence.js`，V1 由 cardPools 负责合并，
 *     V2 没有这条通路，配方就成了孤儿。
 *
 *   core 只交出 `temperCardId`（它不能 import 渲染层），查表在这一层做。
 *   幂等：每次都从 core 的原始 state 重建，不累积。
 */
function enrichTemper(skinState, k) {
  const id = skinState && skinState.temperCardId;
  if (!id || !k || !k.temperIridescence || typeof k.temperIridescence.get !== 'function') return skinState;
  const rec = guard(() => k.temperIridescence.get(id), null);
  if (!rec) return skinState;
  const out = {
    ...skinState,
    variantParams: { ...(skinState.variantParams || {}) },
  };
  out.variantParams.temper = { ...(out.variantParams.temper || {}), ...rec };
  return out;
}

/**
 * 把 **S5 逐卡工艺参数覆盖**（`data/legacy/finishOverrides.js`）并进 `variantParams.finish`。
 *
 * ★ 2026-10-16 修复「S5_21 神淬虹纹 / S5_22 玄蚀紫界 与卡面承诺不符」
 *   现象：这两张卡在原项目里分别是 **F10 渐变之色(Fade)** 与 **明显紫调**，
 *        本工程里它们与同工艺的其它卡长得一样。
 *   证据（tools/probe-uniform-diff.mjs 双边 compose 对拍）：
 *        S5_21  `uFinParam0` 本 `[0,0,0,0]` / 原 `[0,0,0.92,0]`。
 *   根因：原项目 `data/cardPools.js#buildRuntimeCard` 把 `finishOverrides.forCard(c)`
 *        并进 `write.variants.finish`；本工程只 `import '../data/legacy/finishOverrides.js'`
 *        却**没有任何消费点** —— 整张表是死代码（与 S6 虹彩、逐卡指纹同一类"独立数据表没接上"）。
 *
 *   幂等：每次都从 core 的原始 state 重建，不累积。
 */
function enrichFinish(skinState, k) {
  const id = skinState && skinState.finishCardId;
  if (!id || !k || !k.finishOverrides || typeof k.finishOverrides.get !== 'function') return skinState;
  const rec = guard(() => k.finishOverrides.get(id), null);
  if (!rec) return skinState;
  const out = {
    ...skinState,
    variantParams: { ...(skinState.variantParams || {}) },
  };
  out.variantParams.finish = { ...(out.variantParams.finish || {}), ...rec };
  return out;
}

/**
 * 把**逐卡视觉指纹**并进 skinState —— `uVisualTier` 与 `uCardFx[9]` 的唯一来源。
 *
 * ★ 2026-10-15 修复「锻造各阶段的决策卡在 3D 上不体现稀有度、也没有逐卡纹样」
 *
 *   现象：S5 / S7（以及所有阶段）的三张候选卡看起来只差底色深浅，
 *        高档卡与低档卡没有区别；与原项目逐卡对比时"略有不同"。
 *   证据（tools/probe-card-visual-channels.mjs）：走到 S6 时
 *        `uVisualTier = 0`、`uRarityColor = #b9c4d2`（0 档）、`uCardFx` 9 行**全 0**，
 *        而按原项目口径应当是 `visualTier = 2`、每阶段一行 shaderParams。
 *   根因：原项目由 `js/core/cards.js#applyCardWrite` 在每次提交卡时写
 *        `pendingSkin.visualTier` / `cardFingerprints[stage]` / `cardEffects[stage]`，
 *        本工程重构时这三行没有搬过来 → 门面照旧合成，拿到的一直是空值。
 *        与 S6 逐卡虹彩配方（enrichTemper）是同一类事故：**独立数据表没接上**。
 *        代价：`uCardFx[i].y <= 0.001` 时 `k3dApplyStageCardFx()` 对整段直接 return，
 *        于是"每一张决策卡的 3D 效果"整体消失；且 R10 之后 S5 的 `spanW`/`rr`、
 *        S7 的 `tierW`、每阶段末尾 5 层稀有度维度全部读 `tier`，tier 恒 0 = 高档卡与低档卡同貌。
 *
 *   ⚠ 查表必须在这一层做：core 不允许 import 渲染层，它只交出 `visualStages`
 *     （阶段位次 / 卡 id / 稀有度 / 池内 rank）这份**纯数据材料**。
 *   ⚠ 不要改 `cardVisuals.resolve()` 的取 rank 规则：rank 决定 motif + 色相栅格，
 *     改了等于把每一张卡的观感重排（原项目 `visualRank = 池内 index + 1`，
 *     本工程的对应真源是 `data/cards.js#stageRankOf`）。
 *
 *   幂等：每次从 core 的原始 state 重建，调用方若已给值以"取大/覆盖"处理，不累积。
 */
function enrichCardVisuals(skinState, k) {
  const list = skinState && skinState.visualStages;
  const cv = k && k.cardVisuals;
  let tier = Math.max(0, Math.min(5, Number(skinState && skinState.visualTier) || 0));
  if (!Array.isArray(list) || !list.length) return skinState;
  if (!cv || typeof cv.resolve !== 'function') {
    /* 静默回落是最差的失败模式：不报错，但每一张卡都失去 3D 效果。 */
    console.warn('[render] 逐卡视觉指纹不可用（K3D.cardVisuals 未装载）→ uCardFx 全为 0');
    return skinState;
  }
  const rv = k.rarityVisuals;
  const fps = { ...(skinState.cardFingerprints || {}) };
  const fxs = { ...(skinState.cardEffects || {}) };
  let touched = false;
  for (const e of list) {
    if (!e) continue;
    const idx = Number(e.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) continue;
    const lv = (rv && typeof rv.level === 'function') ? Number(rv.level(e.rarity)) || 0 : 0;
    if (lv > tier) tier = lv;
    const fp = guard(() => cv.resolve({ id: e.cardId, rarity: e.rarity, visualRank: e.rank || 0 }, idx), null);
    if (!fp || !Array.isArray(fp.shaderParams) || fp.shaderParams.length < 4) continue;
    fps[idx] = fp;
    fxs[idx] = fp.shaderParams.slice(0, 4).map(Number);
    touched = true;
  }
  if (!touched && tier === (Number(skinState.visualTier) || 0)) return skinState;
  return { ...skinState, visualTier: tier, cardFingerprints: fps, cardEffects: fxs };
}

export class BladeStage {
  constructor() {
    this.container = null;
    this.engine = null;
    this.viewer = null;
    this.modelId = null;
    this._requestedModelId = null;
    this.ready = false;
    /** 幽灵态（无代表作时的展台默认刀）：只影响 canvas 的 CSS 透明度 */
    this._ghost = false;
    /** 切换序号：异步加载晚到时作废旧请求（V1 的竞态闸门经验） */
    this._seq = 0;
    this._skinState = null;
    this._handle = null;
    /* 当前可见配方的图集租约（方案 §5）。换卡时迁移，见 _leaseAtlases。 */
    this._leaseIds = null;
    /** 首屏先显示 GLB 自带材质，随后再套重量级锻造皮肤。 */
    this.deferSkin = false;
    /** 环境贴图加载去重（幂等，见 loadEnvironment） */
    this._envPromise = null;
    /** 最近一次"换刀 / 换皮 / 换柄"的异步落地 Promise（见 precompile 的等待逻辑） */
    this._pending = null;
    /* ── 预热池（见 prewarmSkins）────────────────────────────────────
       签名 → { mesh, material, used }。材质**故意保留**、不 dispose：
       只有材质还活着，three 才把它用到的 program 的引用计数保持 >0，
       program 对象与它内部的 WebGLUniforms 才会一直留在缓存里 ——
       玩家点卡那一刻 applySkin 换 cacheKey 就能直接命中（progDelta 0）。
       dispose 掉的话只靠 GPU 侧按源码缓存，多一层不确定性。 */
    this._warm = new Map();
    this._warmTick = 0;
    this._warmEnv = undefined;   // 池是按"环境贴图有无"建的；环境后到则整池作废
    this._warmPending = null;    // 当前预热（串行化，避免两个 compileAsync 并发）
    this._warmQueue = Promise.resolve();
    this._warmRequests = new Map();
    this._warmFp = null;         // 上次请求的指纹（同一批输入直接早退）
    /* 透射族预热（M15–M18 晶体）：材质常驻 → program 引用计数不归零。 */
    this._transWarm = null;
    this._transWarmPromise = null;
    this._textureUploadTracker = new TextureUploadTracker();
    this._composeCache = new ComposePackCache(8);
    globalThis.__FORGE_COMPOSE_CACHE = this._composeCache;
    /* 诊断出口（方案 §5 #20）：控制台里 `__FORGE_RENDER_DIAG()` 直接读。
       只读快照，不参与渲染路径。 */
    globalThis.__FORGE_RENDER_DIAG = () => this.renderDiag();
  }

  /** 是否可用（无 WebGL 时上层改走 2D 兜底） */
  static get supported() {
    return env.hasWebGL && typeof globalThis.THREE !== 'undefined';
  }

  async mount(container) {
    this.container = container;
    if (!BladeStage.supported) return { ok: false, reason: 'no-webgl' };
    const k = K3D();
    if (!k.bladeViewer || !k.Viewer) return { ok: false, reason: 'legacy-kernel-missing' };
    this.engine = guard(() => new k.bladeViewer());
    this.viewer = guard(() => new k.Viewer(container));
    if (!this.engine || !this.viewer) return { ok: false, reason: 'init-failed' };

    /* ★ 引擎必须拿到 viewer 的 renderer —— 两处硬依赖，缺一不可：
       ① bladeViewer 在换刀柄遮罩时要 `mat.invalidateHookProgram(this.renderer, m)`
          强制重建 program；renderer 为 undefined 时 program 不会重链，
          表现为控制台刷 "program not valid" + 刀身画不出来。
       ② 环境贴图（见 loadEnvironment）由 viewer 解出后回调引擎挂到材质上。 */
    this.engine.renderer = this.viewer.renderer;
    this.viewer.onEnvMapReady = (tex) => this.engine.setEnvMap(tex);
    this.viewer.onContextRestored = () => {
      const viewer = this.viewer;
      const recovery = this._contextRecovery = {};
      const viewerRecovery = viewer._restoring;
      const isCurrent = () => this.viewer === viewer && !viewer.disposed
        && !viewer._contextLost && this._contextRecovery === recovery
        && viewer._restoring === viewerRecovery;
      this._composeCache.clear();
      this._disposeWarmPool();
      this._disposeTransmissionWarm();
      this._warmFp = null;
      this._glowWarmPromise = null;
      if (this._glowWarm) {
        this.viewer.scene.remove(this._glowWarm.group);
        K3D().bladeEffects?.dispose?.(this._glowWarm.handle);
        this._glowWarm.baseMaterial?.dispose?.();
        this._glowWarm = null;
      }
      // Context restoration loses textures, programs and PMREM allocations. Do
      // not leave the old readiness flag green while those are rebuilt.
      const prep = globalThis.__FORGE_PREP;
      const previouslyReady = !!prep?.ready || !!this._restoreWasReady;
      this._restoreWasReady = previouslyReady;
      if (prep) { prep.ready = false; prep.restoring = true; }
      if (viewerRecovery) viewerRecovery.onCancel = () => {
        if (prep && this._contextRecovery === recovery) {
          prep.restoring = false;
          prep.ready = false;
          prep.lastRestoreOK = false;
        }
      };
      this._textureUploadTracker.reset();
      return (async () => {
        let recovered = false;
        try {
          // S3 textures are *not* model textures: they must also be re-uploaded.
          const s3 = await K3D().bladeSkinShader?.prepareTextures?.(this.viewer?.renderer);
          if (!isCurrent()) return false;
          const models = this.initLoadedTextures();
          const halo = await this.prewarmGlowShaders();
          if (!isCurrent()) return false;
          const compiled = await this.precompile();
          if (!isCurrent()) return false;
          recovered = (s3?.total > 0 && s3?.uploaded === s3?.total)
            && models.ok && halo.ok && compiled.ok;
          if (recovered && typeof globalThis.dispatchEvent === 'function'
            && typeof globalThis.Event === 'function') {
            globalThis.dispatchEvent(new Event('forge:gpu-restored'));
          }
        } catch (error) {
          console.warn('[render] context restore GPU rewarm failed', error);
        } finally {
          if (prep && isCurrent()) {
            prep.restoring = false;
            prep.ready = !!previouslyReady && !!recovered;
            prep.lastRestoreOK = !!recovered;
            if (!recovered) prep.problems.push('context restore GPU preparation failed');
          }
        }
        return recovered;
      })();
    };

    await guard(() => this.engine.init(), null);
    this.ready = true;
    return { ok: true };
  }

  /**
   * 加载环境贴图（HDR → PMREM）。
   *
   * ★ 为什么必须有：本工程刀身材质是 `metalness = 1`（纯金属）。
   *   纯金属没有漫反射分量，**亮度全部来自环境反射** —— 没有 envMap 时
   *   无论打多少直射光都是黑的。V1 曾经正因此"刀身全黑"。
   *   这里承接 V1 的延后加载策略：HDR 有 1.5MB，等首屏出画面后再在 idle 时拉，
   *   失败就降级为无环境光（不阻塞、不报错，游戏本就不依赖反射）。
   */
  async loadEnvironment(url) {
    if (!this.ready || !this.viewer || !this.viewer.loadEnvironment) {
      return { ok: false, reason: 'not-ready' };
    }
    if (this._envPromise) return this._envPromise;
    this._envPromise = (async () => {
      try {
        await this.viewer.loadEnvironment(url);
        return { ok: !!this.viewer.envMap };
      } catch (e) {
        console.warn('[render] 环境贴图不可用（反射降级）:', e && e.message);
        return { ok: false, reason: 'load-failed' };
      }
    })();
    return this._envPromise;
  }

  /** 是否已挂上环境贴图（诊断用） */
  get hasEnvironment() {
    return !!(this.viewer && this.viewer.envMap);
  }

  /**
   * 切换并展示一把刀。
   * @param {string} modelId 例如 'knife_tangdao' / 'ore_small'
   */
  async show(modelId, { viewPreset = 'forge', viewDuration = 0 } = {}) {
    if (!this.ready || !modelId) return { ok: false, reason: 'not-ready' };
    if (this.modelId === modelId) {
      /* A request for another model may still be loading while the current model
         remains mounted. Returning early here must cancel that request: preview
         cancellation commonly asks to show the already-mounted process model,
         and otherwise the stale knife request can mount after the preview ended. */
      if (this._requestedModelId && this._requestedModelId !== modelId) {
        ++this._seq;
        this._requestedModelId = modelId;
        this._pending = null;
      }
      if (this.viewer && this.viewer.viewPreset !== viewPreset) this.viewer.setViewPreset(viewPreset, { duration: viewDuration });
      return { ok: true, modelId };
    }
    if (this._requestedModelId === modelId && this._pending) return this._pending;
    const seq = ++this._seq;
    this._requestedModelId = modelId;
    const p = (async () => {
      const info = await guardAsync(() => this.engine.loadKnife(modelId), null);
      if (!info || seq !== this._seq) {
        if (seq === this._seq) this._requestedModelId = null;
        return { ok: false, reason: info ? 'stale' : 'load-failed' };
      }
      guard(() => this.viewer.setModel(info.root, modelId));
      this._glowRoot = null; this._glowSignature = null;
      this.modelId = modelId;
      // 先给新模型一帧 GLB 自带材质，再异步套锻造材质。着色器编译期间渲染会
      // 暂停；保留这一帧能让玩家始终看到当前阶段的模型轮廓，不会舞台空白。
      if (!this.deferSkin && (this._skinState || this._handle)) {
        const applyVisual = () => {
          if (seq !== this._seq || this.modelId !== modelId || this.deferSkin) return;
          /* ★ 2026-10-16：**必须带上记住的 coverAll**。
             原来这里写的是 `this.applySkin(this._skinState)` —— 默认 coverAll=true，
             于是「每个刀型的**第一张卡**」刀柄会被刀身材质覆盖，第二张起才恢复正常
             （因为 show() 对同一模型会走上面的早退分支，不再重放）。
             症状：S4 拼图里 K01–K12（12 个刀型各第一次出图）柄是白的，
             K13–K24（同刀型第二次）柄才是模型材质 —— 用户看到的就是"辉光唐刀跟别人不一样"。
             口径真源：原项目 docs/卡片效果预览/说明.md ——「只看某一张卡的变化」时
             `uSkinCoverAll = 0`（刀柄交回模型材质），它的参考图同样如此。 */
          if (this._skinState) this.applySkin(this._skinState, { coverAll: this._coverAll !== false });
          if (this._handle) this.applyHandle(this._handle);
          /* ★ 2026-10-16：没有柄配方时也要在新模型上**清一次**残留遮罩 ——
             切到一把曾在 S8 挂过柄的刀（或从 S8 重铸回 S7）时，
             它的材质里还留着上一次的 bladeMask。 */
          else { const e = this.engine; if (e && e.clearBladeMask) guard(() => e.clearBladeMask(modelId), null); }
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(applyVisual));
        } else setTimeout(applyVisual, 32);
      }
      // setModel 会重置取景，再应用当前阶段机位（S5–S7 刃身近景，其余全刀）。
      guard(() => this.viewer.setViewPreset(viewPreset, { duration: viewDuration }));
      if (seq === this._seq) this._requestedModelId = modelId;
      return { ok: true, modelId };
    })();
    this._pending = p;
    return p;
  }

  /**
   * 预编译当前场景里的全部材质 program —— 必须在"第一次真正出帧"之前完成。
   *
   * ★ 2026-10-14（性能修复：点开就卡死 → 点开就能玩）
   *   刀身材质的片元着色器达 219K 字符，ANGLE/D3D11 首次链接它需要很久。
   *   `gl.linkProgram` 是异步入队的（0ms 返回），真正把主线程按住的是 three 首次
   *   `setProgram` 时构造 `WebGLUniforms` → `getProgramParameter(ACTIVE_UNIFORMS)`
   *   的那次同步查询 —— **实测单次 215.8s / 132.9s**，Windows 上还会因 TDR
   *   丢上下文（CONTEXT_LOST_WEBGL）。表现就是"点开游戏 → 白屏卡死几十秒～几分钟"。
   *
   *   这里改用 `renderer.compileAsync()`：它内部走 KHR_parallel_shader_compile
   *   轮询 COMPLETION_STATUS_KHR，**不阻塞主线程**，编译在 GPU 进程里做。
   *   于是整个等待期间：引导屏能转、页面能滚、点按有反馈 —— 只是画面晚一点出现。
   *
   * 幂等、可重复调用（program 已缓存时 three 直接命中，开销可忽略）。
   * 细节实现见 viewer.precompile()。
   *
   * @returns {Promise<{ok:boolean, async?:boolean}>}
   */
  /** Upload all loaded GLB images on the gameplay renderer (not just scene-visible meshes).
   * `ok` means every eligible texture uploaded, not just that the renderer exists. */
  initLoadedTextures() {
    const textures = [];
    for (const info of (this.engine?.loaded?.values() || [])) {
      for (const material of (info.materials || [])) {
        for (const name of ['map', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap', 'emissiveMap']) {
          if (material[name]?.isTexture) textures.push(material[name]);
        }
      }
    }
    const status = this.uploadTextures(textures);
    /* 账本：GLB 纹理按"一整批"入账（它们由引擎持有，不由本模块释放）。
       用途是让 §5 的 GPU 预算能看到最大的一块占用，而不是只看到我们自建的图集。 */
    try {
      gpuLedger.track('glb-textures', {
        kind: 'glb-textures', renderer: this.viewer?.renderer,
        bytesMiB: Number(status.gpuMiB) || 0, optional: false, evictable: false,
        note: '全部已加载刀具模型的贴图（估算）',
      });
    } catch (_) { /* 诊断件 */ }
    if (globalThis.__FORGE_PREP) {
      globalThis.__FORGE_PREP.modelTextures = status.count;
      globalThis.__FORGE_PREP.gpuMiB = status.gpuMiB;
    }
    return status;
  }

  /** Upload arbitrary shader/model textures through the same renderer/version cache. */
  uploadTextures(textures) {
    const status = this._textureUploadTracker.upload(this.viewer?.renderer, textures || []);
    if (globalThis.__FORGE_PREP) {
      globalThis.__FORGE_PREP.textureUploads = (globalThis.__FORGE_PREP.textureUploads || 0) + status.uploaded;
    }
    return status;
  }

  /** Precompile the single *shared* S4 halo GLSL on a hidden real-geometry mesh.
   *  Reuse shader programs for every S4 card/model; geometry is not copied to the scene.
   *  The reference material remains alive so Three's program refcount won't reach zero. */
  prewarmGlowShaders() {
    if (this._glowWarmPromise) return this._glowWarmPromise;
    const viewer = this.viewer;
    const THREE = globalThis.THREE;
    const bladeEffects = K3D().bladeEffects;
    if (!viewer || !THREE || !bladeEffects) return Promise.resolve({ ok: false, reason: 'no-glow-kernel' });
    this._glowWarmPromise = (async () => {
      const loaded = this.engine?.loaded;
      const preferred = loaded?.get('knife_tangdao') || [...(loaded?.values() || [])]
        .find((info) => String(info.id).startsWith('knife_'));
      if (!preferred) return { ok: false, reason: 'no-knife-model' };
      let firstMesh = null;
      preferred.root.traverse((o) => { if (!firstMesh && o.isMesh && o.geometry?.getAttribute('aRegion')) firstMesh = o; });
      if (!firstMesh) return { ok: false, reason: 'no-region-geometry' };
      const group = new THREE.Group();
      group.visible = false; // compile() traverses hidden meshes; render() doesn't draw them
      const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
      group.add(new THREE.Mesh(firstMesh.geometry, baseMaterial));
      const handle = bladeEffects.build({ glow: 0.8, spread: 0.02 }, group);
      if (!handle) return { ok: false, reason: 'glow-build-failed' };
      viewer.scene.add(group);
      try {
        if (viewer._compilePromise) await viewer._compilePromise;
        if (viewer._bgCompile) await viewer._bgCompile;
        if (viewer.renderer.extensions?.has?.('KHR_parallel_shader_compile')) {
          await viewer.renderer.compileAsync(viewer.scene, viewer.camera);
        } else {
          // Only a tiny standalone S4 shader; no large universal skin shader.
          viewer.renderer.compile(viewer.scene, viewer.camera);
        }
        this._glowWarm = { group, handle, baseMaterial };
        return { ok: true, programs: 1 };
      } catch (error) {
        viewer.scene.remove(group);
        bladeEffects.dispose(handle);
        baseMaterial.dispose();
        return { ok: false, reason: String(error?.message || error) };
      }
    })();
    return this._glowWarmPromise;
  }

  async precompile() {
    if (!this.ready || !this.viewer || !this.viewer.precompile) {
      return { ok: false, reason: 'not-ready' };
    }
    // ① 先等"换刀/换皮/换柄"落地 —— 否则场景里还没挂上要编译的材质
    if (this._pending) { try { await this._pending; } catch (_) { /* ignore */ } }
    // ② 再让出两帧，保证 hook 已经写进材质、needsUpdate 已生效
    await new Promise((r) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(r));
      else setTimeout(r, 16);
    });
    const ok = await this.viewer.precompile();
    return { ok: !!ok, async: !!ok && !!this.viewer.renderer.extensions?.has?.('KHR_parallel_shader_compile') };
  }

  /** 等待最新一次模型切换落地；切换期间允许继续操作并替换待加载模型。 */
  async waitForModel() {
    while (this._pending) {
      const pending = this._pending;
      try { await pending; } catch (_) { /* 模型失败时仍可走 2D 锻造 */ }
      if (pending === this._pending) break;
    }
    return this.modelId ? { ok: true, modelId: this.modelId } : { ok: false, reason: 'no-model' };
  }

  /** 是否正在异步编译（UI 可据此显示"材质编译中"提示） */
  get isCompiling() {
    return !!(this.viewer && this.viewer._compiling);
  }

  /** 注册编译状态回调（viewer.onCompileState 的转发） */
  onCompileState(fn) {
    if (this.viewer) this.viewer.onCompileState = fn;
    return this;
  }

  /* ── 卡顿预热（docs/卡顿归因与优化方案.md §四 · 方案 A）─────────────────
   *
   * 病象：锻造阶段第一次点候选卡，画面要等 2.8–9.1 s 才有反应。
   * 归因（tools/probe-switch-isolation.mjs 实测）：不是模型加载（GLB 解析 33–35 ms），
   *   是**该配方第一次用到时 program 要新建+链接**（A4 换纹理 → prodDelta +1 / 3807 ms；
   *   同一个目标第二次换过去 → prodDelta 0 / 8 ms）。刀身材质的注入 GLSL 极大，
   *   ANGLE 把它翻成 HLSL 再交给 D3D11 链接，单次就是秒级。
   *
   * 解法：玩家还在看三张候选卡的时候，**先在后台把这三张卡的 program 链接好**，
   *   等他点下去时就是热命中。预热成本一次打包三张 ≈ 单张的 1.5 倍而不是 3 倍
   *   （一次 compileAsync 批量并行），实测 6477 ms 换三次 32 ms。
   *
   * ⚠ 绝不能碰的地方：viewer._render() 的异步编译闸门。预热是**纯增量** ——
   *   它自己走 compileAsync，失败/不支持就静默返回，玩法与渲染行为一字不变。
   *
   * ⚠ 为什么材质要"整份搬运 hook 表"才有效：three 的 program 缓存 key 就是
   *   material.customProgramCacheKey()（= 全部 hook 的 key#signature 拼接）+ 材质宏。
   *   只重挂 bladeSkin 的副本会缺 bladeMask/patternStrength 等条目 → key 不一致 →
   *   预热编出来的 program 永远命不中，而且**完全静默**。见 bladeViewer.buildWarmMaterial。
   *
   * @param {object[]} skinStates core/recipe.deriveSkinState() 的产出（纯数据）
   * @param {object}   [opts]
   *   modelId  默认当前模型
   *   handles  与 skinStates 一一对应的刀柄配方（S8 变体用；缺省则沿用当前刀柄）
   * @returns {Promise<{ok:boolean, compiled?:number, pooled?:number, ms?:number, reason?:string}>}
   */
  async prewarmSkins(skinStates, { modelId = null, handles = null, isCurrent = null, onFirstPhase = null } = {}) {
    if (!this.ready || !this.viewer || !this.engine) return { ok: false, reason: 'not-ready' };
    const variantsAll = (Array.isArray(skinStates) ? skinStates : []).filter(Boolean);
    const variants = variantsAll;
    if (!variants.length) return { ok: false, reason: 'no-variants' };
    const id = modelId || this.modelId;
    if (!id) return { ok: false, reason: 'no-model' };
    const r = this.viewer.renderer;
    if (!globalThis.THREE || !r || typeof r.compile !== 'function') {
      return { ok: false, reason: 'no-compiler' };
    }
    /* ⓪ 指纹早退：选卡 / 取消 / 重绘都会重新 render，输入没变就 O(1) 返回 ——
          否则每一次点击都要重建三个材质（~10 ms）并白跑一轮。 */
    const fp = warmFingerprint(id, variants, handles);
    if (fp === this._warmFp) return { ok: true, skipped: true, reason: 'same-request' };
    const duplicate = this._warmRequests.get(fp);
    if (duplicate) return duplicate;

    // 新阶段/重铸不会取消正在编译的候选批次。中途取消会让快速游玩时每批
    // 都编到一半就作废，玩家最终点到的候选反而一直冷启动。队列串行执行，
    // 仍然只在隐藏副本上编译，不阻塞真实舞台的渲染。
    const work = this._warmQueue.catch(() => {}).then(async () => {
      /* 让候选卡先完成一帧布局，再开始后台编译。 */
      await nextFrame();
      // Obsolete candidate groups do not spend seconds compiling on the GPU.
      // A currently running batch cannot be cancelled, but queued batches can.
      if (isCurrent && !isCurrent()) return { ok: false, reason: 'obsolete' };
      tl('prewarm:work:start', { n: variants.length });
      /* 第一段（不透明）编完就回调 —— 上层据此提前放行入场。
         整批仍然是一个 task（闸门照旧等它），所以不会与预编译并发。 */
      let phase1Sent = false;
      const noteFirstPhase = (info) => {
        if (phase1Sent) return;
        phase1Sent = true;
        if (typeof onFirstPhase === 'function') { try { onFirstPhase(info || { ok: true }); } catch (_) { /* 观察者 */ } }
      };
      const task = this._prewarmWork(id, variants, handles, isCurrent, noteFirstPhase);
      this._warmPending = task;
      /* ★ 2026-10-16：把这一批挂到 viewer 上，让**闸门**（viewer.precompile）能等它。
         两个 compileAsync 在同一 renderer 上只能串行 → 不等的话玩家点卡要付
         「预热整批 + 自己这份」（实测 11–22s）。等它落地再编，通常直接命中缓存（9ms）。 */
      const v0 = this.viewer;
      if (v0) v0._bgCompile = task;
      let out;
      try { out = await task; } finally {
        if (this._warmPending === task) this._warmPending = null;
        if (v0 && v0._bgCompile === task) v0._bgCompile = null;
        /* 早退路径（模型未就绪 / 无几何 / 淘汰）不会走到第一段回调，这里补一次，
           免得调用方永远等不到"可以进页面"的信号。 */
        noteFirstPhase(out || { ok: false, reason: 'no-phase1' });
      }
      if (out && out.ok) this._warmFp = fp;
      return out;
    });
    this._warmQueue = work.catch(() => null);
    this._warmRequests.set(fp, work);
    try { return await work; } finally { this._warmRequests.delete(fp); }
  }

  /** prewarmSkins 的实际工作段（单独拆出，便于 finally 里清理 _warmPending）
   *  @param {Function|null} onFirstPhase 不透明段编完时回调一次（上层据此前置放行） */
  async _prewarmWork(id, variants, handles, isCurrent = null, onFirstPhase = null) {
    const k = K3D();
    const THREE = globalThis.THREE;
    const viewer = this.viewer;
    const info = this.engine.loaded && this.engine.loaded.get(id);
    if (!info || !Array.isArray(info.materials) || !info.materials.length) {
      return { ok: false, reason: 'model-not-loaded' };
    }
    /* 环境贴图会进材质宏（USE_ENVMAP）→ 直接换 program。它的有无一变，整池作废。
       用**真实材质自己的** envMap 状态判定，比 viewer.envMap 更贴近实际宏值。 */
    const envState = info.materials[0].envMap ? 'E' : '-';
    if (this._warmEnv !== envState) { this._disposeWarmPool(); this._warmEnv = envState; }

    /* ③ 等"换刀 / 换皮"落地，再等 viewer 自己的异步编译闸门空闲 ——
          避免两个 compileAsync 在同一个 renderer 上并发。
          （await 恢复后到调用 compileAsync 之间只有微任务，rAF 插不进来。） */
    if (!await awaitIfCurrent(this._pending, isCurrent)) return { ok: false, reason: 'obsolete' };
    if (!await awaitIfCurrent(viewer._compilePromise, isCurrent)) return { ok: false, reason: 'obsolete' };
    const targets = collectPreparationTargets(info.root);
    if (!targets.length) return { ok: false, reason: 'no-geometry' };

    /* ④ 构建段（同步）：一次把 N 个变体全挂好，之后一次 compileAsync 打包编译。
          ⚠ 构建会 +MATERIAL_GEN，而 viewer._render() 的兜底闸门正是靠这个代数判断
            "有没有材质需要重建 program"。这里必须在**动手之前**先记下闸门是不是空闲的：
              · 闸门空闲（genBefore === viewer._matGen）→ 这次的代数增量全是这几个
                一次性副本造成的，同步掉标记，省得闸门白跑一趟 precompile；
              · 闸门有欠账（比如玩家刚点了卡、真实材质的 program 还没编）→ **绝不能同步**，
                否则会把真实材质的待办一起吞掉，那一帧就会直接撞上 three 的同步编译等待
                （实测 130–215 s 的卡死）。留给闸门处理。 */
    const tWarmStart = (globalThis.performance || Date).now();
    if (globalThis.__PW_TRACE) console.info('__PW start');
    const canSyncGen = !!(k.material && k.material.materialGen)
      && k.material.materialGen() === viewer._matGen;
    const built = [];
    for (let i = 0; i < variants.length; i++) {
      const pack = this._composePack(variants[i]);
      if (!pack) continue;
      // compileAsync() only prepares programs: upload sampled textures separately.
      // These textures are reused by the exact visible recipe for this card.
      // These atlas textures are shared across candidate warms. Use the same
      // renderer/version tracker as GLB textures rather than issuing redundant
      // initTexture calls on every stage/reroll.
      const atlasTextures = [pack.uniforms?.uBakedAtlas, pack.uniforms?.uAnimAtlas]
        .filter((tex) => tex?.isTexture && tex.image);
      if (atlasTextures.length) this.uploadTextures(atlasTextures);
      const wantedHandle = handles && handles[i] && handles[i].explicit && !handles[i].bypass
        ? this._withHandleCardEffect(handles[i], variants[i]) : null;
      for (const { geometry, material: sourceMaterial } of targets) {
        const warmMaterial = guard(() => this.engine.buildWarmMaterial(id, pack,
          { handle: wantedHandle, sourceMaterial }), null);
        if (!warmMaterial) continue;
        // A hook signature alone is not the complete Three program identity:
        // base-material maps/defines and geometry attributes also participate.
        // Retain one hidden representative per actual source-material/geometry
        // pair so all visible GLB submeshes can hit a program warmed in advance.
        const sig = `${id}|${envState}|${sourceMaterial.uuid || info.materials.indexOf(sourceMaterial)}`
          + `|${geometry.uuid || geometry.id || ''}|${materialCompileFingerprint(warmMaterial)}`;
        const hit = this._warm.get(sig) || built.find((b) => b.sig === sig);
        if (hit) {
          try { warmMaterial.dispose(); } catch (_) { /* ignore */ }
          hit.used = ++this._warmTick;
          continue;
        }
        const mesh = new THREE.Mesh(geometry, warmMaterial);
        mesh.visible = false;        // 绝不进 draw list；但 compile() 走 traverse() 仍会收它
        mesh.frustumCulled = false;
        viewer.scene.add(mesh);
        /* ★ 2026-10-21（方案 §5 lease）：预热池条目是第二类 owner。
           候选卡虽然没显示，但它的材质正采样同一张纹样图集 ——
           没有这次 pin，预算降级会把"三个候选"正在用的图集淘汰掉。 */
        const lease = pack.atlasLease || null;
        if (lease) {
          const L2 = k.rLedger;
          if (L2) { for (const lid of [lease.motif, lease.anim]) if (lid) guard(() => L2.pin(lid)); }
        }
        built.push({ sig, mesh, material: warmMaterial, lease });
      }
    }
    if (canSyncGen && k.material && k.material.materialGen) viewer._matGen = k.material.materialGen();

    if (!built.length) return { ok: true, compiled: 0, pooled: this._warm.size };

    // A queued candidate may become stale while a scene compile was finishing.
    // No async boundary follows this check until compileAsync begins, so obsolete
    // batches can be removed without paying for seconds of GPU compilation.
    if (isCurrent && !isCurrent()) {
      for (const b of built) this._removeWarm(b);
      return { ok: false, reason: 'obsolete' };
    }

    /* ⑤ 两段编译（★ 2026-10-21 第四轮 · 入场不再被透射族堵住）
     *
     *   实测：S1 候选池里有一张晶体卡时，整批预热 2.33s —— 其中约一半是
     *   **透射材质那两支程序**（屏幕支 + 透射前置支）。而首页的「开始锻刀」
     *   要 `await Game.prewarmCandidates()` 才 `router.go('forge')`，
     *   于是玩家在首页干等 2.3s 才看到三张卡。
     *
     *   拆法：**不透明副本先编、先放行**（`onFirstPhase`），透射副本接着在后台编。
     *   · 63% 的局（候选池没有晶体）本来就只有一段，行为不变；
     *   · 有晶体的局：入场等待从 2.33s 降到 ~1.1s，晶体卡仍能命中（后台已经编好）；
     *   · 闸门仍然等整批（`_bgCompile` = 整个 task），所以不会出现两个 compileAsync 并发。
     *
     *   ★ 2026-10-17 的老结论仍然成立：**不要逐张顺序编**。
     *     那次实验是"每个变体一次 compileAsync 且所有副本都留在场景里"，
     *     每次都要扫全场景、互相排队（实测预热自身被拖到 19–40s）。
     *     这里只有两段，且第一段编译时透射副本**不在场景里**，不会互相扫到。 */
    const perf = globalThis.performance || Date;
    const t0 = perf.now();
    if (globalThis.__PW_TRACE) console.info('__PW build', Math.round(perf.now() - tWarmStart), 'ms · built', built.length);
    const transmissive = built.filter((b) => Number(b.material.transmission) > 0);
    const opaqueOnly = built.filter((b) => !(Number(b.material.transmission) > 0));
    const parallel = typeof viewer.renderer.compileAsync === 'function'
      && viewer.renderer.extensions?.has?.('KHR_parallel_shader_compile');
    const compile = () => parallel
      ? viewer.renderer.compileAsync(viewer.scene, viewer.camera)
      : viewer.renderer.compile(viewer.scene, viewer.camera);
    const verifyLinks = (list) => {
      if (parallel) return;
      // Without KHR the explicit link checks can block during preparation.
      // This does not pretend to be asynchronous, nor reduce visual quality.
      const gl = viewer.renderer.getContext();
      const seen = new Set();
      for (const entry of list) {
        const programs = viewer.renderer.properties.get(entry.material).programs;
        for (const program of programs?.values?.() || []) {
          if (seen.has(program)) continue;
          seen.add(program);
          if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
            throw new Error(`Candidate shader link failed: ${gl.getProgramInfoLog(program.program) || 'unknown'}`);
          }
        }
      }
    };
    /* ① 不透明段：把透射副本先摘出场景，编译范围就只剩不透明那一批。 */
    for (const b of transmissive) if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
    try {
      tl('prewarm:compile:start', { built: built.length, opaque: opaqueOnly.length });
      await compile();
      verifyLinks(opaqueOnly);
      tl('prewarm:compile:end', { ms: Math.round(perf.now() - t0) });
    } catch (e) {
      /* 编译失败就把这一批撤掉（不进池）—— 否则它们会以"已在池里"的身份挡住重试，
         变成"看起来预热过了、其实 program 从没编出来"的静默失效。 */
      for (const b of built) this._removeWarm(b);
      return { ok: false, reason: 'compile-failed', message: e && e.message };
    }
    const msOpaque = Math.round(perf.now() - t0);
    /* ⑥ 编完才入池：池 = "program 已经好了"的承诺，不能提前兑现
     *   ★ 2026-10-21：入池时**把预热网格摘出场景**，只留材质。
     *     材质活着就够维持 program 的引用计数（three 只在 material.dispose 时释放），
     *     而网格留在场景里会被之后每一次 scene 级 compileAsync 重新扫到 ——
     *     实测后果：透射通道那次编译会把晶体副本按「RT + 未翻转」再编一支
     *     从不参与绘制的变体，晶体卡首帧因此固定多付约 1.0s（tools/probe-crystal-attrib）。
     */
    const pool = (list) => {
      for (const b of list) {
        if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
        this._warm.set(b.sig, { mesh: b.mesh, material: b.material, used: ++this._warmTick });
      }
    };
    pool(opaqueOnly);
    this._evictWarmPool();
    viewer.needsRender = true;
    /* 第一段完成 —— 上层可以放行（首页的「开始锻刀」、forge 页的"准备中"）。 */
    const firstPhase = { ok: true, compiled: opaqueOnly.length, pooled: this._warm.size, ms: msOpaque, pending: transmissive.length };
    if (typeof onFirstPhase === 'function') { try { onFirstPhase(firstPhase); } catch (_) { /* 观察者 */ } }
    if (!transmissive.length) return firstPhase;

    /* ② 透射段（后台）：把副本放回场景，编屏幕支 + 透射前置支。
          这一段的 CPU 时间仍然算在同一个 task 里（闸门会等它），只是不再挡住入场。 */
    if (isCurrent && !isCurrent()) {
      for (const b of transmissive) this._removeWarm(b);
      return { ...firstPhase, transmission: false, reason: 'obsolete' };
    }
    const t1 = perf.now();
    try {
      for (const b of transmissive) viewer.scene.add(b.mesh);
      await nextFrame();
      await compile();
      // Physical transmission draws DoubleSide materials a second time on their
      // back side into a linear offscreen target (NoToneMapping). A screen-only
      // compile cannot cover this different Three program identity.
      // 变体选择与 viewer.precompile 共用 compileTransmissionVariants（同一规则，
      // 只编真实绘制会取用的那支）。
      await compileTransmissionVariants(viewer.renderer, viewer.scene,
        { doubleSide: THREE.DoubleSide, backSide: THREE.BackSide }, compile);
      verifyLinks(transmissive);
    } catch (e) {
      for (const b of transmissive) this._removeWarm(b);
      return { ...firstPhase, transmission: false, transmissionError: e && e.message };
    }
    pool(transmissive);
    this._evictWarmPool();
    viewer.needsRender = true;
    return {
      ok: true, compiled: built.length, pooled: this._warm.size,
      ms: Math.round(perf.now() - t0), transmissionMs: Math.round(perf.now() - t1), transmission: true,
    };
  }

  /** 预热池容量上限。当前阶段的 3 张永远是最新的、不会被淘汰；
      上限只用来挡住"一局 9 个选卡阶段 × 3 张 + 反复重铸"的无界增长。 */
  get warmPoolSize() { return this._warm ? this._warm.size : 0; }

  /**
   * 这一批配方里有没有**透射材质**（M15–M18 晶体）？
   *
   * 只回一个布尔：调用方（app 层）据此决定要不要做透射族预热。
   * 判据用渲染层自己的 compose 结果（`pack.material.transmission`），
   * 不在 app 层硬编码材质 id —— 材质表改了这里自动跟随。
   */
  transmissionReachable(skinStates) {
    for (const skin of (skinStates || [])) {
      if (!skin) continue;
      const pack = guard(() => this._composePack(skin), null);
      if (pack && Number(pack.material && pack.material.transmission) > 0) return true;
    }
    return false;
  }

  /**
   * 透射族预热（P1 未完成项 1）。
   *
   * ★ 时机是这整件事唯一的难点 —— 见 RESULT.md §3.8 的**已证伪尝试**：
   *   早期在"首屏就绪"时预热，此时当前材质还没挂 bladeSkin 钩子，
   *   编出来的是**另一套 key** 的无用程序（program 7→12），晶体首次仍要重编。
   *   所以本方法只在「钩子签名已确定」之后才有意义：
   *     · 当前材质已经挂过 bladeSkin（`this._pack` 存在且有活材质）
   *     · 且当前这份配方**不是**透射材质（是的话，渲染闸门本来就会编，不用重复）
   *
   * ★ 做法：克隆当前活材质（钩子表整份搬运，见 bladeViewer.buildWarmMaterial），
   *   只把 transmission 打开，然后按 `compileTransmissionVariants` 的同一套规则
   *   编出屏幕支 + 透射前置支。编完**把副本网格摘出场景、只留材质**：
   *   材质活着就够维持 program 引用计数，而网格留在场景里会被之后每次
   *   scene 级 compileAsync 重新扫到（实测会给晶体副本多编一支无用变体 ~1s）。
   *
   * 幂等：已预热直接返回 cached；失败不抛，只回 reason。
   * @returns {Promise<{ok:boolean, compiled?:number, ms?:number, cached?:boolean, reason?:string}>}
   */
  warmTransmissionFamily() {
    if (!this.ready || !this.viewer || !this.engine || !this.modelId) {
      return Promise.resolve({ ok: false, reason: 'not-ready' });
    }
    const pack = this._pack;
    if (!pack) return Promise.resolve({ ok: false, reason: 'no-pack' });
    /* 环境贴图会进材质宏（USE_ENVMAP）→ 换 program。它的有无一变，预热副本作废。 */
    const info = this.engine.loaded && this.engine.loaded.get(this.modelId);
    const envState = info && info.materials && info.materials[0] && info.materials[0].envMap ? 'E' : '-';
    if (this._transWarm && this._transWarmEnv !== envState) this._disposeTransmissionWarm();
    if (this._transWarm) return Promise.resolve({ ok: true, cached: true, compiled: this._transWarm.length });
    if (this._transWarmPromise) return this._transWarmPromise;
    const k = K3D();
    if (k.renderBackend && k.renderBackend !== 'v2') return Promise.resolve({ ok: false, reason: 'legacy-backend' });
    /* 当前就是透射材质：闸门这一帧本来就会编，再热一遍只是重复。 */
    if (Number(pack.material && pack.material.transmission) > 0) {
      return Promise.resolve({ ok: false, reason: 'already-transmissive' });
    }
    const THREE = globalThis.THREE;
    const viewer = this.viewer;
    const r = viewer.renderer;
    if (!THREE || !r) return Promise.resolve({ ok: false, reason: 'no-renderer' });

    let claimed = null;
    const task = this._warmQueue.catch(() => {}).then(async () => {
      /* 让当前这一帧先落地；透射族不急。 */
      await nextFrame();
      if (viewer !== this.viewer || viewer.disposed) return { ok: false, reason: 'obsolete' };
      if (!await awaitIfCurrent(this._pending)) return { ok: false, reason: 'obsolete' };
      /* ★ 先等闸门空闲，**此时还不能登记 _bgCompile**：
         闸门内部会 `await _bgCompile`，若我们同时 `await _compilePromise`，
         两个 await 互相等待就是死锁（实测：首帧 60s 不出、program 一个都不增）。
         所以顺序必须是「等闸门结束 → 登记 → 立刻开始编译」，中间不留 await。 */
      if (!await awaitIfCurrent(viewer._compilePromise)) return { ok: false, reason: 'obsolete' };
      if (viewer !== this.viewer || viewer.disposed || viewer._compilePromise) return { ok: false, reason: 'obsolete' };
      const info = this.engine && this.engine.loaded && this.engine.loaded.get(this.modelId);
      const envState = info && info.materials && info.materials[0] && info.materials[0].envMap ? 'E' : '-';
      const targets = collectPreparationTargets(info && info.root);
      if (!targets.length) return { ok: false, reason: 'no-geometry' };

      const canSyncGen = !!(k.material && k.material.materialGen)
        && k.material.materialGen() === viewer._matGen;
      const built = [];
      for (const { geometry, material: sourceMaterial } of targets) {
        /* 只克隆一次：同一 geometry×material 组合在 targets 里已经去重。 */
        const material = guard(() => this.engine.buildWarmMaterial(this.modelId, pack,
          { sourceMaterial, transmission: TRANSMISSION_WARM }), null);
        if (!material) continue;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;        // 不进 draw list，但 compileAsync 的 traverse 会收它
        mesh.frustumCulled = false;
        viewer.scene.add(mesh);
        built.push({ mesh, material });
      }
      if (canSyncGen && k.material && k.material.materialGen) viewer._matGen = k.material.materialGen();
      if (!built.length) return { ok: false, reason: 'build-failed' };

      const perf = globalThis.performance || Date;
      const t0 = perf.now();
      const compile = () => (typeof r.compileAsync === 'function'
        && r.extensions?.has?.('KHR_parallel_shader_compile')
        ? r.compileAsync(viewer.scene, viewer.camera)
        : r.compile(viewer.scene, viewer.camera));
      /* 登记与第一次编译在同一个同步块里完成（见上面注释的时序要求）。 */
      claimed = task;
      viewer._bgCompile = claimed;
      try {
        /* ① 屏幕直出支（TONE_MAPPING） */
        await compile();
        /* ② 透射前置支：与真实绘制同一套规则（DoubleSide 翻面 + 线性 target） */
        await compileTransmissionVariants(r, viewer.scene,
          { doubleSide: THREE.DoubleSide, backSide: THREE.BackSide }, compile);
      } catch (error) {
        for (const b of built) { guard(() => b.mesh.parent && b.mesh.parent.remove(b.mesh)); guard(() => b.material.dispose()); }
        return { ok: false, reason: 'compile-failed', message: String(error && error.message || error) };
      } finally {
        /* 无论成败都摘出场景：网格只服务于这一次编译。 */
        for (const b of built) guard(() => b.mesh.parent && b.mesh.parent.remove(b.mesh));
      }
      /* 材质留在 this._transWarm 上（不 dispose）→ program 引用计数不归零。 */
      this._transWarm = built.map((b) => b.material);
      this._transWarmEnv = envState;
      const ms = Math.round(perf.now() - t0);
      return { ok: true, compiled: built.length, ms };
    });

    this._transWarmPromise = task;
    return task.then((out) => {
      if (this._transWarmPromise === task) this._transWarmPromise = null;
      if (claimed && viewer._bgCompile === claimed) viewer._bgCompile = null;
      if (out && out.ok) this._invalidate();
      return out;
    }, (error) => {
      if (this._transWarmPromise === task) this._transWarmPromise = null;
      if (claimed && viewer._bgCompile === claimed) viewer._bgCompile = null;
      return { ok: false, reason: 'threw', message: String(error && error.message || error) };
    });
  }

  _disposeTransmissionWarm() {
    if (this._transWarm) {
      for (const material of this._transWarm) guard(() => material.dispose());
      this._transWarm = null;
    }
    this._transWarmPromise = null;
  }

  _evictWarmPool() {
    const MAX = 24; // retain the complete current card pool + the most recent stage
    if (!this._warm || this._warm.size <= MAX) return;
    const entries = [...this._warm.entries()].sort((a, b) => a[1].used - b[1].used);
    let over = this._warm.size - MAX;
    for (const [sig, e] of entries) {
      if (over <= 0) break;
      over--;
      this._removeWarm(e);
      this._warm.delete(sig);
    }
  }

  _disposeWarmPool() {
    if (!this._warm) { this._warm = new Map(); return; }
    for (const e of this._warm.values()) this._removeWarm(e);
    this._warm.clear();
  }

  _removeWarm(e) {
    if (!e) return;
    guard(() => { if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh); });
    guard(() => { if (e.material) e.material.dispose(); });
    /* 租约必须与上面的材质 dispose 成对 —— 否则淘汰后的图集永远 refs>0。 */
    if (e.lease) {
      const L = K3D().rLedger;
      if (L) { for (const id of [e.lease.motif, e.lease.anim]) if (id) guard(() => L.unpin(id)); }
      e.lease = null;
    }
  }

  /**
   * 图集租约迁移（方案 §5「保留当前 / 当前三个候选 / 导出任务的 lease」）。
   *
   * 语义：**当前显示的这张卡** + **预热池里的每个候选**各算一个 owner。
   * 这里只负责"当前"这一个；预热池由 `_prewarmWork` / `_removeWarm` 成对处理。
   *
   * 为什么用"差集"而不是先 unpin 全部再 pin：同一张图集可能被旧卡和新卡共用，
   * 先清零再 +1 会在两步之间制造一个 refs=0 的窗口 —— 虽然当前是同步执行，
   * 但降级链若哪天在别处被异步调用，这个窗口就会变成"淘汰一张还在用的图"。
   *
   * @param {{motif:string|null, anim:string|null}|null} next
   */
  _leaseAtlases(next) {
    const L = K3D().rLedger;
    if (!L) return;
    const list = (o) => (o ? [o.motif, o.anim].filter(Boolean) : []);
    const prev = list(this._leaseIds);
    const nxt = list(next);
    const prevSet = new Set(prev), nextSet = new Set(nxt);
    for (const id of prev) if (!nextSet.has(id)) guard(() => L.unpin(id));
    for (const id of nxt) if (!prevSet.has(id)) { guard(() => L.pin(id)); }
    this._leaseIds = next || null;
    /* 预算降级：只在真正吃紧时才动（见 resourceLedger.relieve）。 */
    guard(() => L.relieve(this.viewer && this.viewer.renderer));
  }

  /**
   * 应用刀身皮肤。
   * @param {object} skinState core/recipe.deriveSkinState() 的产出（纯数据）
   * @param {object} [opts]
   *   coverAll  默认 true → `uSkinCoverAll = 1`：刀身材质覆盖**整刀**（刀身 + 护手 + 握柄），
   *             这是正常锻造流程的口径（S4~S7 尚未装配刀柄）。
   *             传 false → `uSkinCoverAll = 0`：刀身/护手仍用刀身材质，**握柄交回模型默认材质**。
   *             「只看某一张卡带来什么变化」的对照预览必须用它 —— 否则握柄也被涂成刀身色，
   *             卡的差异会被握柄那一大块同色区域稀释（原项目 docs/卡片效果预览 的同一口径）。
   */
  applySkin(skinState, { coverAll = true } = {}) {
    this._skinState = skinState;
    /* ★ 2026-10-16：coverAll 必须**记住**。
       `_queueVisualFlush()` 在编译期间会把最新配方延后重放一次，重放时若不带
       coverAll，就会退回默认 true —— 实测（tools/probe-frame-diff.mjs 抓最终 hook uniforms）
       K12 的 `uSkinCoverAll` 变成 1，刀柄被涂成刀身色，而"只看单卡"的对照预览
       （原项目 docs/卡片效果预览 的同一口径）要求它是 0。 */
    this._coverAll = coverAll;
    if (this.deferSkin) return { ok: true, deferred: true };
    if (!this.ready || !skinState) return { ok: false, reason: 'not-ready' };
    // 写入最新预览状态时不等当前 compileAsync 收尾。相同 shader signature
    // 的卡片只改 uniform，能立刻替换正在显示的预览；若结构确实变化，
    // viewer 会在当前异步编译结束后按最新 materialGen 继续编译。
    const pack = this._composePack(skinState);
    if (!pack) return { ok: false, reason: 'compose-failed' };
    /* ★ 2026-10-21（方案 §5 lease）：当前这张卡的图集由这里持有租约。
       applySkin 是"可见材质"的唯一写入路径，所以它就是最合适的 owner 边界：
       换卡时先放旧的一（除非新卡还在用），再拿新的一，然后按预算淘汰无主项。 */
    this._leaseAtlases(pack.atlasLease);
    if (pack.uniforms) pack.uniforms.uSkinCoverAll = coverAll ? 1 : 0;
    // Compose cache entries are reused: NEVER leave the last Grip mask value sticky.
    /* ★★ 2026-10-16（用户：「默认纹理那层 S2 没选不应该是没有吗？没选就没有」）
     *
     *   花纹强度 `uSkinTexStrength` 是**纹理层的总闸**（shader 里
     *   `textureMix = uS3On ? clamp(uSkinTexStrength,0,1)*s3Surface : clamp(uSkinTexStrength,0,2)`，
     *   再 `col = base * mix(1.0, shade, textureMix)`）—— 给 0 就是**一点都不调制**。
     *   玩家没选过 S3 纹理卡（`textureChosen === false`）时给 0：
     *   程序化图案与 S3 图像层同时静音，刀面回到材质本色。
     *   ⚠ 这是 uniform、不进 program 签名，所以与预热副本天然兼容。 */
    const texStrength = skinState && skinState.textureChosen === false ? 0 : 1.0;
    tl('applySkin', { fin: skinState && skinState.finishId, tex: skinState && skinState.textureId });
    const okk = guard(() => this.engine.applyBladeSkin(this.modelId, pack, { texStrength }), null);
    this._pack = pack;
    this._syncMaterialTime();
    this._invalidate();
    return { ok: !!okk, pack };
  }

  /**
   * 把视口标脏（按需渲染的唯一入口）。
   *
   * ★ 2026-10-18（用户：「决策卡的 3D 视觉效果慢」）
   *
   *   视口是**按需出帧**的：`viewer._isAnimating()` 只认 needsRender / 自转 /
   *   相机补间 / 刀身特效 / 画布输入后 900ms。而"换一张候选卡"绝大多数只改
   *   **uniform**（材质层色相、finish 强度、纹理相位…），**材质代数不变** →
   *   于是 `_render()` 里 `if (!this._isAnimating()) return;` 直接整帧跳过，
   *   画面停在上一张卡的效果上，直到玩家碰一下画布或等下一次编译收尾。
   *
   *   实测（.work/probe，真实 GPU）：同一张卡，点卡后等出帧 **8 550 ms**；
   *   而"写完之后显式标脏"只用了 **9 ms** —— 差的这 8.5 秒与渲染无关，
   *   纯粹是没人告诉视口"画面变了"。
   *
   *   ⚠ 只在**可见模型**的写入路径上调它。预热副本（prewarmSkins）写的是
   *     隐藏材质，标脏会让视口在编译排队期间反复出帧，反而变慢。
   */
  _invalidate() {
    try { if (this.viewer) this.viewer.needsRender = true; } catch (_) { /* 已销毁 */ }
  }

  /**
   * skinState → composeBladeSkin 的 uniform 包。
   * ★ applySkin 与 prewarmSkins **共用这一条路径** —— 只有两边逐字一致，
   *   预热编出来的 program 才会与真实预览的 cacheKey 相同（否则宁可不预热）。
   */
  _composePack(skinState) {
    return this._composeCache.get(skinState, () => this._composePackUncached(skinState));
  }

  _composePackUncached(skinState) {
    const k = K3D();
    return guard(() => {
      const enriched = enrichCardVisuals(enrichFinish(enrichTemper(skinState, k), k), k);
      const st = k.bladeSkin.makeState(enriched);
      if (k.grain && k.grain.applyTo) k.grain.applyTo(st, `forge:${enriched.textureId || 'none'}`);
      // Run seed + selected forging identity own the pattern. Later shapes and
      // finishing choices must never shuffle an already forged surface.
      const ids = Object.keys(st.cardFingerprints || {})
        // Late decisions must not shuffle already forged S3 grain.
        .filter((idx) => Number(idx) <= 2)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => st.cardFingerprints[key] && st.cardFingerprints[key].cardId)
        .filter(Boolean);
      if (ids.length && typeof k.bladeSkin.hashSeed === 'function') {
        st.patternSeed = ((Number(st.patternSeed) || 0)
          + (k.bladeSkin.hashSeed('card-fingerprint', ...ids) % 1001)) % 1001;
      }
      // Per-stage visual tiers travel with the same composed pack used by
      // visible preview, prewarming and saved-knife replay. They do NOT depend
      // on the current UI stage or on the global maximum rarity.
      const pack = k.bladeSkin.composeBladeSkin(st);
      if (pack?.uniforms) {
        const tiers = new Float32Array(9);
        const rarity = { common:0, fine:1, rare:2, epic:3, legend:4, mythic:5 };
        for (const entry of enriched.visualStages || []) {
          const idx = Number(entry?.index);
          if (Number.isInteger(idx) && idx >= 0 && idx < 9)
            tiers[idx] = rarity[String(entry.rarity || '')] ?? 0;
        }
        pack.uniforms.uStageTiers = tiers;
        // The S5 card ID is the stable owner of the finish family.
        // Never use current UI stage or highest global rarity as a fallback.
        pack.uniforms.uS5CardId = enriched.finishCardId || null;
      }
      return pack;
    }, null);
  }

  /** S8 motif uses the same fingerprint resolver as the blade's card slots. */
  _withHandleCardEffect(handle, skinState) {
    if (!handle || handle.bypass || !handle.explicit) return handle;
    const k = K3D(), resolved = enrichCardVisuals(skinState || {}, k);
    const fx = resolved.cardEffects && resolved.cardEffects[7];
    const result = fx ? { ...handle, cardEffect: fx } : { ...handle };
    // Subtle alloy coordination, not a replacement for wood/leather/jade identity.
    // Keep the original tint so replay/queue flush cannot accumulate color drift.
    const THREE = globalThis.THREE, mat = k.materials24?.get(skinState?.materialId);
    if (THREE && mat?.baseColor && /^M[0-9]{2}$/.test(skinState?.materialId || '')) {
      const source = handle.sourceTint || handle.tint;
      if (source) {
        const tint = new THREE.Color(source), alloy = new THREE.Color(mat.baseColor);
        const lum = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
        alloy.multiplyScalar(Math.min(3, Math.max(0.15, lum(tint) / Math.max(0.025, lum(alloy)))));
        const material = k.handleMaterials?.get(handle.metalId);
        const blend = material?.group === '金属' ? 0.20 : material?.group === '木质' || material?.group === '皮胶' ? 0.06 : 0.10;
        tint.lerp(alloy, blend);
        result.sourceTint = source;
        result.tint = '#' + tint.getHexString();
      }
    }
    return result;
  }

  /** S4 glow uses cached model shells while switching parameters/card previews. */
  applyGlow(cardId) {
    if (!this.viewer) return;
    const spec = guard(() => K3D().cardEffectRecipes?.get(cardId), null);
    const root = this.viewer.root;
    const signature = spec ? `${cardId}:${JSON.stringify(spec)}` : null;
    if (this._glowRoot === root && this._glowSignature === signature) {
      // The selected material/finish may have changed while the S4 card did not.
      if (spec && this.viewer._effect) K3D().bladeEffects?.updateSpec?.(this.viewer._effect, spec);
      return;
    }
    // Same knife, different S4 card: only update shell uniforms, never create
    // a fresh set of nine shader materials or geometry wrappers.
    if (spec && root && this._glowRoot === root && this.viewer._effect
      && K3D().bladeEffects?.updateSpec?.(this.viewer._effect, spec)) {
      this._glowSignature = signature;
      this._invalidate();
      return;
    }
    this.viewer.clearBladeEffect();
    this._glowRoot = root;
    this._glowSignature = null;
    if (spec && root && this.viewer.setBladeEffect(spec)) {
      this._glowSignature = signature;
      // Shell ShaderMaterials are not bladeSkin hooks, so their creation does
      // not increment the material-hook generation watched by the render loop.
      // Explicitly compile them before the first visible draw to avoid a cold
      // synchronous link on the first S4 advanced-card preview.
      if (!this._glowWarm) {
        const previous = this.viewer._compilePromise;
        Promise.resolve(previous).catch(() => {}).then(() => this.viewer?.precompile?.()).catch(
          (err) => console.warn('[render] glow shader warmup failed', err));
      }
    }
    this._invalidate();
  }

  /* 把"这份配方是否需要推进材质时间"同步给 viewer（见 recipeNeedsMaterialTime）。
     只在写入可见材质后调用；预热副本不碰它。 */
  _syncMaterialTime() {
    const v = this.viewer;
    if (!v || typeof v.setMaterialTime !== 'function') return;
    v.setMaterialTime(recipeNeedsMaterialTime(this._pack, this._handle));
  }

  /**
   * 渲染身份三元组（方案 §5 #20「记录 recipeHash / contextEpoch / program keys」）。
   *
   * 排查"换了卡却复用了旧 program""同一张卡在新上下文里变慢"这类问题时，
   * 光看 uniform 值没法判断两次到底是不是同一份配方。这三段合起来可对账：
   *   · `recipeHash`   —— 这一帧画什么（完整配方的规范 JSON 的 FNV-1a 短 hash，
   *                       见 composeCache.hashText；相同 hash ⇒ 同一份 uniform 语义配方）
   *   · `contextEpoch` —— 这块 GL 上下文重建过没有（`K3D.glCtxEpoch`，context loss 时 +1）
   *   · `programs`     —— 编译产物（`program.cacheKey`，three 去重的实际键）
   * `recipeHash` 相同而 program 数不同 ⇒ 是 program 缓存/上下文的问题，不是配方的问题。
   */
  renderDiag() {
    const r = this.viewer && this.viewer.renderer;
    const list = (r && r.info && r.info.programs) || [];
    const programs = [];
    for (const p of list) {
      const key = p && (p.cacheKey || p.name);
      if (key) programs.push(String(key));
    }
    return {
      recipeHash: this._pack ? (this._pack.recipeHash || null) : null,
      contextEpoch: (K3D().glCtxEpoch || 0),
      programCount: programs.length,
      programs,
      /* 图集身份（#14 的对账用）：尺寸 + 过滤方式 —— 换过滤/换 padding 时这里会变。 */
      atlas: (() => {
        const u = this._pack && this._pack.uniforms;
        const f = (t) => (t ? {
          size: [t.image && t.image.width, t.image && t.image.height],
          mip: t.generateMipmaps !== false,
          minFilter: t.minFilter,
          anisotropy: t.anisotropy || 1,
        } : null);
        return u ? { motif: f(u.uBakedAtlas), anim: f(u.uAnimAtlas) } : null;
      })(),
    };
  }

  /** S1 has no chosen material. Remove both old shader hooks and restore GLB PBR. */
  clearSkin() {
    this._skinState = null;
    this._pack = null;
    if (this.viewer && typeof this.viewer.setMaterialTime === 'function') this.viewer.setMaterialTime(false);
    if (!this.modelId || !this.engine?.loaded) return;
    const info = this.engine.loaded.get(this.modelId);
    if (!info) return;
    const k = K3D();
    for (const material of info.materials || []) {
      // Repeated S1 syncs must not trigger fresh programs every time.
      if (!k.material?.hookMap?.(material)?.has('bladeSkin')) continue;
      if (k.material?.removeHook) k.material.removeHook(material, 'bladeSkin');
      const orig = material.userData?.orig;
      if (orig) {
        material.roughness = orig.roughness;
        material.metalness = orig.metalness;
        material.envMapIntensity = orig.envMapIntensity;
        material.color.copy(orig.color);
        if ('transmission' in material) material.transmission = 0;
        if ('iridescence' in material) material.iridescence = 0;
        if ('clearcoat' in material) material.clearcoat = 0;
      }
      if (k.material?.invalidateHookProgram) k.material.invalidateHookProgram(this.viewer.renderer, material);
    }
    this._invalidate();
  }

  /** 应用刀柄遮罩（S8 装配）。传 null/undefined = **清掉**遮罩（回到"整刀刀身材质"）。 */
  applyHandle(handleMask, skinState = null) {
    handleMask = this._withHandleCardEffect(handleMask, skinState || this._skinState);
    this._handle = handleMask;
    if (this.deferSkin) return { ok: true, deferred: true };
    if (!this.ready) return { ok: false, reason: 'not-ready' };
    // Mask changes happen AFTER applySkin's invalidation. Keep the program's
    // uniform dictionary synchronized when adding/removing that hook as well.
    // Optional sampler-to-null transitions are handled by material.upsertHook.
    // This is dirty-hook-only: ordinary same-signature tint changes still reuse
    // their compiled program and shared live uniform slots.
    const finish = (result) => {
      const materials = this.engine?.loaded?.get(this.modelId)?.materials || [];
      for (const material of materials) K3D().material?.invalidateHookProgram?.(this.viewer?.renderer, material);
      this._invalidate();
      return result;
    };
    /* ★ 2026-10-16：null = 主动清除。
       调用方（`Game.handleMaskGate`）在 S1–S7 / 没选过柄时会传 null —— 必须真的
       把钩子摘掉，否则从 S8 重铸回 S7、或切到另一把刀时，会留下上一次的柄材质。 */
    if (!handleMask) {
      const r0 = guard(() => this.engine.clearBladeMask(this.modelId), null);
      this._syncMaterialTime();
      return finish({ ok: !!r0, cleared: true });
    }
    /* ★ 2026-10-16：`bypass`（S8_03 止滑胶，见 data/handlePalette.js）——
       这张卡要求「直接用模型自带刀柄」，所以不是"换一套柄材质"，而是**不挂遮罩**。 */
    if (handleMask.bypass) {
      const r1 = guard(() => this.engine.clearBladeMask(this.modelId), null);
      this._syncMaterialTime();
      return finish({ ok: !!r1, bypass: true });
    }
    // 与皮肤预览一致：总是写入当前手柄状态，避免把过期卡片排队逐个追编。
    const r = guard(() => this.engine.applyBladeMask(this.modelId, handleMask), null);
    this._syncMaterialTime();
    return finish({ ok: !!r });
  }

  /** 编译期间只保留最新配方；当前 compileAsync 结束后再一次性应用，避免连续
   * 触屏操作反复改变材质代数、让低性能设备在过期预览之间追编。 */
  _queueVisualFlush() {
    if (this._visualFlushQueued) return;
    this._visualFlushQueued = true;
    const pending = this.viewer && this.viewer._compilePromise;
    Promise.resolve(pending).finally(() => {
      this._visualFlushQueued = false;
      if (!this.ready || this.deferSkin || this.isCompiling) return;
      if (this._skinState) this.applySkin(this._skinState, { coverAll: this._coverAll !== false });
      if (this._handle) this.applyHandle(this._handle);
    });
  }

  /** 播放一次性特效（确认/火花/断裂/揭晓） */
  effect(name, opts = {}) {
    if (!this.ready) return { ok: false };
    return guard(() => {
      const v = this.viewer;
      const k = K3D();
      if (name === 'hammer' || name === 'spark') {
        if (k.cardEffects && k.cardEffects.play) k.cardEffects.play(this.engine, this.modelId, name, opts);
      } else if (name === 'fracture') {
        if (v.setBladeEffect) v.setBladeEffect({ kind: 'fracture', ...opts });
      } else if (name === 'reveal') {
        if (v.setBladeEffect) v.setBladeEffect({ kind: 'reveal', ...opts });
      } else if (name === 'clear') {
        if (v.clearBladeEffect) v.clearBladeEffect();
      }
      return { ok: true };
    }, { ok: false });
  }

  /**
   * 把 3D 画布搬到另一个页面的容器里（首页展台 / 锻造页 / 鉴定页共用同一个 viewer）。
   * V1 的做法是 router 直接搬 DOM，导致"两页各有一个 canvas"的串台；
   * 这里收敛成门面的一个方法，上层不再碰渲染器内部。
   */
  attachTo(container) {
    return guard(() => {
      if (!this.viewer || !container) return false;
      const canvas = this.viewer.renderer && this.viewer.renderer.domElement;
      if (!canvas) return false;
      if (canvas.parentElement !== container) container.appendChild(canvas);
      if (this.viewer.rebindContainer) this.viewer.rebindContainer();
      this.container = container;
      const pageKey = container.closest?.('.page')?.dataset.page || null;
      const pageChanged = this._pageKey !== pageKey;
      this._pageKey = pageKey;
      /* 换页就想不起来上一页的开关：回到该页自己的默认值。
         否则会出现相反的错误 —— 首页开了拖动、进锻造页后按钮显示关，
         但画布实际还是能拖（=_interactive 被跨页缓存了）。 */
      if (pageChanged) this._interactive = null;
      /* ★★ 修复（用户：「拖动不生效」的第二个成因）
       *
       *   病象：开着拖动的时候，只要页面 re-render一次（切阶段/改状态都会），
       *   按钮仍然显示“已开启”（aria-pressed=true），但实际又拖不动了。
       *   实测：开启后 → re-render → enableRotate 从 true 变回 false。
       *
       *   根因：attachTo 以前在这里**按页面名无条件重置** controls，
       *   把用户刚打开的开关盖掉了。而 attachTo 每次 render 都会被调一次。
       *
       *   修法：attachTo 只负责“把 canvas 搬过去”与页面级默认值，
       *   开关状态由 this._interactive 记住：一旦用户显式开/关过，
       *   后续 re-render 一律尊重它，不再被页面默认值覆盖。
       *   （首次进入该页时 _interactive 为 null → 才用页面默认值。）
       */
      if (this.viewer.controls) {
        if (this._interactive == null) {
          /* 页面级默认值：只有用户从未动过开关时才生效。 */
          // 默认可拖拽，S4/S7 的游戏手势由页面阶段守卫关闭。
          this.viewer.controls.enableRotate = true;
          this.viewer.controls.enableZoom = pageKey !== 'appraise';
        } else {
          /* 尊重开关：开就开、关就关。 */
          this.viewer.controls.enableRotate = !!this._interactive;
          this.viewer.controls.enableZoom = !!this._interactive;
        }
      }
      /* 同步一次 touch-action：不然默认关拖拽的页面会被 OrbitControls
         的 `none` 锁住滚动（见 setInteractive 的注释）。 */
      this._applyTouchAction();
      /* 幽灵态跟着 canvas 走：搬去哪个容器都要保持（否则切页后透明度丢失） */
      this._applyGhostClass();
      return true;
    }, false);
  }

  /**
   * 幽灵态开关（无代表作 / 无进行中的一局时的展台占位刀）。
   *
   * ★ 为什么**不**去改材质的 `opacity`：刀身是 `applyBladeSkin` 注入的自定义
   *   ShaderMaterial，`material.opacity` **不会**被片元着色器消费 —— 除非每套
   *   shader 都手写 `gl_FragColor.a *= opacity`。改它恒无效果，而且是静默失败。
   *   canvas 级 CSS opacity 是唯一与着色器无关、且对整刀（含地面阴影）一致的通路。
   *
   * 类名挂在 **canvas** 上而不是容器上：canvas 会在页面间被搬来搬去
   * （首页 / 锻造 / 鉴定共用一个 viewer），挂在容器上切页就丢了。
   */
  setGhost(on) {
    this._ghost = !!on;
    return guard(() => { this._applyGhostClass(); return true; }, false);
  }

  /** 把 this._ghost 同步到 canvas 的 class 上（幂等） */
  _applyGhostClass() {
    const canvas = this.viewer && this.viewer.renderer && this.viewer.renderer.domElement;
    if (!canvas || !canvas.classList) return;
    canvas.classList.toggle('is-ghost', !!this._ghost);
  }

  /**
   * 重新取景。
   * ⚠ 必须显式调用：页面切页时容器从 display:none 变可见，
   *   挂载那一刻量到的宽高是 0 → canvas 会停在 1×1。
   */
  resize() {
    return guard(() => {
      if (!this.viewer || !this.viewer.resize) return false;
      /* ★ 容器不可见时**不要** resize：此时 rect 是 0，
         renderer.setSize(1,1) 会把缓冲区压成 1×1，
         等页面再显示回来时若尺寸恰好没变就会一直是一个像素都画不出来。
         这是 V1 踩过的坑（切页后舞台全黑）。 */
      const host = (this.viewer.renderer && this.viewer.renderer.domElement
        && this.viewer.renderer.domElement.parentElement) || null;
      if (host) {
        const r = host.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
      }
      this.viewer.resize();
      return true;
    }, false);
  }

  /**
   * 等"换刀 / 换皮"落地。
   *
   * ★ 为什么需要它（原项目 2026-10-03 的真实事故：出炉揭晓页一片空白）：
   *   `show()` 是**异步**的（engine.loadKnife 要解析 GLB）。揭晓页必须在模型
   *   真正挂上之后才能推相机 —— 否则 Viewer.setViewPreset 里 `if (!this.fitDistance)
   *   return false` 会直接吃掉这次调用（fitDistance 是 _computeFit 算的，只有
   *   模型进来才有），表现为"揭晓页相机不动 + 画面停在上一把刀"。
   *   上层只认识这一个语义方法，不再自己 await loader 的 Promise。
   */
  async settle() {
    if (this._pending) { try { await this._pending; } catch (_) { /* ignore */ } }
    return { ok: this.ready, modelId: this.modelId };
  }

  /** 相机预设（首页展台/锻造/鉴定各用不同机位） */
  view(preset, opts = null) {
    return guard(() => (this.viewer && this.viewer.setViewPreset
      ? this.viewer.setViewPreset(preset, opts)
      : null), null);
  }

  autoRotate(on) {
    return guard(() => this.viewer && this.viewer.setAutoRotate && this.viewer.setAutoRotate(!!on), null);
  }

  /**
   * 开启/关闭「自由鉴赏」交互（拖动旋转 + 双指缩放）。
   *
   * ★ 为什么做成显式开关（用户要求：平衡性能与可玩性）：
   *   · 关：controls 禁用 → 平台可以正常滚动/点击，舞台不需要持续响应指针；
   *   · 开：才允许拖拽。默认关，需要看细节时玩家自己打开。
   *
   * 只改 controls 的两个开关，不碰相机与材质，因此**切换本身不花钱**。
   */
  setInteractive(on) {
    return guard(() => {
      const c = this.viewer && this.viewer.controls;
      if (!c) return false;
      /* ★★ 修复（用户：「锻造页的拖动不生效」）：
       *
       *   病象：在锻造页点「开启拖动」，图标亮了但拖不动（实测 enableRotate 恒为 false）。
       *
       *   根因：这里残留了旧逻辑的 `const fixed = pageKey === 'forge'`，
       *   然后 `enableRotate = !!on && !fixed` —— 锻造页 `fixed` 恒为 true，
       *   于是**无论怎么点都开不了**。旧逻辑的背景是「锻造页永远固定机位」，
       *   但现在锻造页已经给了显式开关（S4 锻打阶段由 stageControls 禁用），
       *   这个硬门控就成了 bug。
       *
       *   现在：开关是**唯一真源** —— on 就开、off 就关，不再按页面名拦截。
       *   （S4 锻打阶段的保护改由 UI 层 disabled + canDrag 守，语义更清楚。） */
      c.enableRotate = !!on;
      c.enableZoom = !!on;
      /* ★ 记住用户的显式选择：后续 attachTo（每次 re-render 都会调）
         必须尊重它，否则按钮亮着却拖不动（实测到过）。 */
      this._interactive = !!on;
      /* OrbitControls 的 connect() 会把 canvas 的 touch-action 写成 `none`，
         那是为了滑动时不滚页面。但关掉拖拽后还留着 `none`，
         页面在舞台上就**永远滚不动**（实测验出）。
         所以开关同时接管 touchAction：
           开 → 'none'（不让页面跟着动，拖拽才准）
           关 → 'auto'（恢复正常滚动） */
      this._applyTouchAction();
      this.viewer.needsRender = true;
      return true;
    }, false);
  }

  /**
   * 当前画布**是否真的可拖动**。
   *
   * ★ 为什么需要：拖动开关的 UI 状态不能只活在按钮模块里 ——
   *   切页时 `attachTo` 会把 controls 重置回该页默认值（首页/锻造页默认关），
   *   但按钮模块自己的 `on` 变量不会跟着变，于是出现“按钮亮着、实际拖不动”/
   *   “按钮关着、实际能拖”两种不一致。
   *   把画布状态做成**可回读的唯一真源**，按钮 sync 时读它即可。
   */
  isInteractive() {
    const c = this.viewer && this.viewer.controls;
    return !!(c && (c.enableRotate || c.enableZoom));
  }

  /** 按当前是否可交互，把 canvas 的 touch-action 写成对应值。 */
  _applyTouchAction() {
    const cv = this.viewer && this.viewer.renderer && this.viewer.renderer.domElement;
    if (!cv) return;
    const c = this.viewer.controls;
    const interactive = !!(c && (c.enableRotate || c.enableZoom));
    cv.style.touchAction = interactive ? 'none' : 'auto';
  }

  /**
   * 一键复原：回到“默认位置”（摆正姿态 + 基准机位）。
   * ★ 这是用户明确要求的：默认位置就很好，偏移了要能一键回来。
   */
  resetView() {
    return guard(() => {
      if (!this.viewer || !this.viewer.resetView) return false;
      this.viewer.resetView();
      this.viewer.needsRender = true;
      return true;
    }, false);
  }

  /**
   * 缩略图（收藏卡分享用）—— **离屏定尺出图**。
   *
   * 旧路是 `viewer.snapshot(w,h)`，它会把**可见画布**缩到 w×h 再缩回来。
   * 实测 12 张一批（`tools/probe-arch-benefit.mjs`）：总 211.7 ms，
   * 其中纯 drawing buffer 重分配 50.6 ms（24%），`setSize` 被调用 48 次（每张 4 次，有级联）。
   * 现在走固定 render target（`captureRunner.js`）：画布尺寸 / pixelRatio / viewport 一概不碰。
   * 失败（上下文丢失等）时**退回旧路**，行为不丢。
   */
  snapshot(w = 320, h = 240) {
    const off = guard(() => captureToDataURL(this.viewer, w, h), null);
    if (off) return off;
    return guard(() => (this.viewer && this.viewer.snapshot ? this.viewer.snapshot(w, h) : null), null);
  }

  clear() {
    return guard(() => {
      if (this.viewer && this.viewer.clearBladeEffect) this.viewer.clearBladeEffect();
      if (this.viewer && this.viewer._clearModel) this.viewer._clearModel();
      this.modelId = null;
      this._requestedModelId = null;
      return true;
    }, false);
  }

  dispose() {
    this._disposeWarmPool();     // 预热材质挂在 scene 上，必须随舞台一起撤
    this._disposeTransmissionWarm();
    this._composeCache.clear();
    guard(() => this.viewer && this.viewer.dispose && this.viewer.dispose());
    this.viewer = null;
    this.engine = null;
    this.ready = false;
    this.container = null;
    this._warmFp = null;
    this._warmEnv = undefined;
  }
}

/** 全局单例（一个页面只有一个舞台） */
let stage = null;
export function getStage() {
  if (!stage) stage = new BladeStage();
  return stage;
}

/* ── 减弱动效：把 platform/motion 的结果同步进渲染层（★ 2026-10-14）──
 * legacy viewer 读的是 `K3D.motionReduce`（见 viewer.js 的 prefersReducedMotion）。
 * 注册表 proxy 就是 `globalThis.K3D`，所以写这里 legacy 立刻能读到。
 * 这是「设置 → 渲染」唯一的接缝：设置面板改的是 platform/motion，
 * 这里订阅它并把结果推给 (a) 全局标志 (b) 已挂载的 viewer 实例。 */
function pushMotionPreference(reduce) {
  K3D().motionReduce = !!reduce;
  const v = stage && stage.viewer;
  if (v && typeof v.setReduceMotion === 'function') v.setReduceMotion(!!reduce);
}
pushMotionPreference(motion.reduced());   // 模块求值即定档：viewer 构造时就能读到正确值
motion.subscribe(pushMotionPreference);

/* ── 渲染后端开关（P1：固定程序族 v2 / 旧按卡特化 legacy）──────────────
 * 规则（docs/RENDER_REARCHITECTURE_S1_S9.md §10）：迁移期必须有可回退开关，
 * 失败只回退后端、不清用户存档；禁止用"关闭特化"当通用快速回退。
 * 取值优先级：URL `?backend=` > localStorage > 默认。
 * 默认 v2（固定程序族）；legacy 保留完整旧路径用于对拍与回退。 */
const RENDER_BACKENDS = new Set(['v2', 'legacy']);
function readBackendFromUrl() {
  try {
    const search = globalThis.location && globalThis.location.search;
    if (typeof search !== 'string') return null;
    const m = /[?&]backend=(v2|legacy)(?:&|$)/.exec(search);
    return m ? m[1] : null;
  } catch (_) { return null; }
}
function resolveRenderBackend() {
  const fromUrl = readBackendFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const saved = globalThis.localStorage && globalThis.localStorage.getItem('k3d.renderBackend');
    if (RENDER_BACKENDS.has(saved)) return saved;
  } catch (_) { /* storage 不可用 → 默认 */ }
  return 'v2';
}
function pushRenderBackend(name) {
  const backend = RENDER_BACKENDS.has(name) ? name : 'v2';
  K3D().renderBackend = backend;
  return backend;
}
export function setRenderBackend(name) {
  const backend = pushRenderBackend(name);
  try { globalThis.localStorage && globalThis.localStorage.setItem('k3d.renderBackend', backend); } catch (_) { /* ignore */ }
  return backend;
}
export function getRenderBackend() { return K3D().renderBackend || pushRenderBackend(resolveRenderBackend()); }
pushRenderBackend(resolveRenderBackend());

/**
 * 这份配方是否需要持续推进 `uEffectTime`（P0 · 已证实的"材质动画停钟"）。
 *
 * 判据只认**真的读时间**的项（与旧 shader 的消费点一一对应）：
 *   · 动画族纹样条带（uAnimMeta 里有 family）→ 12 帧条带要换帧
 *   · S6 回火带 / S7 刃线扫光 / S9 磨痕微光（uCardFx[5]/[6]/[8] 活跃）
 *   · S6 薄膜漂移（uTemperIrid.w > 0 且 uTemperFlow > 0）
 *   · S8 柄卡纹样（uHandleCardFx.y > 0）
 * 静态视角虹彩（只随相机变）不在此列 —— 相机静止时仍然停帧。
 */
export function recipeNeedsMaterialTime(pack, handle = null) {
  const u = (pack && pack.uniforms) || {};
  const anim = u.uAnimMeta;
  if (anim) {
    for (let i = 0; i < 9; i++) if (Number(anim[i * 4]) > 0.5) return true;
  }
  const fx = u.uCardFx;
  if (fx) {
    for (const i of [5, 6, 8]) if (Number(fx[i * 4 + 1]) > 0) return true;
  }
  if (Number(u.uTemperIrid && u.uTemperIrid[3]) > 0 && Number(u.uTemperFlow) > 0) return true;
  const hfx = handle && handle.cardEffect;
  if (hfx && Number(hfx[1]) > 0) return true;
  return false;
}

/**
 * 获取可用刀模清单，供诊断探针查看当前引擎资源。
 *
 * ⚠ `knives` 是 BladeViewer **实例**的属性（构造函数里 `this.knives = []`，
 *   init() 之后才填充），不是类上的静态属性。早期写成 `K3D.bladeViewer.knives`
 *   取的是类对象 → 恒为空数组 → 实验室只能靠刀型表兜底，manifest 里的
 *   真实文件名/别名全部丢失。这里必须从**已挂载的实例**读。
 */
export function listModels() {
  return guard(() => {
    const s = getStage();
    const inst = s && s.engine;
    const list = (inst && Array.isArray(inst.knives) && inst.knives.length)
      ? inst.knives
      : (K3D_REGISTRY.proxy.bladeViewer && K3D_REGISTRY.proxy.bladeViewer.knives) || [];
    return (list || []).map((m) => ({ id: m.id, name: m.name || m.id, file: m.file }));
  }, []);
}

export default { BladeStage, getStage, listModels };
