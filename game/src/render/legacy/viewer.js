/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/render/viewer.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
import { renderLoopAllowed, renderSurfaceVisible } from '../renderVisibility.js';
/* ★★ 2026-10-24（P2 接线修正）：必须**静态导入**。
   病象：原来只靠 `globalThis.K3D.studioEnv` 取（由 studioEnv.js 自己挂上），
   但那个模块只在测试脚本里被动态 import，**生产路径从未加载它** ——
   于是 loadEnvironment 跑的时候 K3D.studioEnv 还是 undefined，
   静默回退到旧 HDR。实测证据：棚环境已生成（55.3ms），但
    viewer.envMap / scene.environment / 刀身材质 envMap **全部不是它**（棚=N 贯穿 9 个阶段）。
   静态导入后模块求值顺序保证它一定在 loadEnvironment 之前就绪。 */
import { getStudioEnv, releaseStudioEnv } from '../v2/studioEnv.js';
import { invalidateCaptureTargets } from '../captureRunner.js';
/* 透射通道的 program 变体只在一个地方定义（见 gpuPreparation.js 注释）：
   早期实现"绑 RT 编一遍 + 翻面再编一遍"，每张晶体卡多付一支约 1s 的无用程序。 */
import { compileTransmissionVariants } from '../gpuPreparation.js';
__reg.install();
const global = globalThis;

'use strict';
const K3D = (global.K3D = global.K3D || {});
const THREE = global.THREE;

/* 减弱动效的取值口径统一到这里（★ 2026-10-14）。
   单一真源是 src/platform/motion.js；由 src/render/index.js 门面把结果写进
   `K3D.motionReduce`，本文件只读。未写入时回退系统偏好 —— 与改造前逐字等价。
   原来本文件有 3 处各自 `matchMedia(...)`，导致"设置里减少动态效果"对渲染层无效。 */
function prefersReducedMotion() {
  if (typeof K3D.motionReduce === 'boolean') return K3D.motionReduce;
  return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* 编译/等待时间线（只写内存，不打印、不影响行为）。
   tools/probe-ux-flow.mjs 用它回答"这 4 秒到底花在哪"。 */
function tl(ev, extra) {
  try {
    const a = global.__TL || (global.__TL = []);
    if (a.length < 4000) a.push(Object.assign({ t: Math.round(performance.now()), ev }, extra || {}));
  } catch (_) { /* ignore */ }
}

/* 分层内联包按需注入（与 bladeViewer 同一套机制，这里只需 HDR 那一层）。
 * 同一 src 只注入一次 —— 多张并发 promise 共享。*/
const _scriptCache = new Map();
function loadScriptOnce(src) {
  if (_scriptCache.has(src)) return _scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src; el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => reject(new Error('inline bundle 加载失败：' + src));
    document.head.appendChild(el);
  });
  _scriptCache.set(src, p);
  return p;
}

/**
 * 各刀型额外 Y 轴偏转（弧度）。
 * 正值 = 往右转，负值 = 往左转，0 = 不额外转；常规展示角度由 forge 相机预设控制。
 * 可按需在此补充，避免在 app.js 里硬编码刀型 ID 列表。
 */
const KNIFE_VIEW_ANGLE_Y = {
  knife_balisong: 0,   // 蝴蝶刀：保持默认朝向（开合面朝向相机）
  // 其余刀型使用全局默认 -15°
};
const DEFAULT_VIEW_ANGLE_Y = 0;

/**
 * 逐模型的取景缩放（**乘在相机距离上**，>1 = 相机拉远 = 模型看起来更小）。
 *
 * ⚠ 为什么改的是"相机距离"而不是"物体 scale"：
 *   `_computeFit` 是按摆正后的 AABB 自动贴合的 —— 把 `pivot.scale` 调小，
 *   下一次 fit 会把相机同步拉近，**画面里的大小纹丝不动**。
 *   要让模型"看起来"变小，只能改"让它刚好装满"这件事本身，
 *   即把每单位长度所需的距离乘一个系数。
 *
 * 换算：视口里模型占满的比例 = 1 / (margin × scale)。
 *   scale=1   → 83%（现基线）
 *   scale=1.5 → 56%，即**线性尺寸变成 2/3**（用户 2026-10-05 对原料的要求）
 * 注意它作用于"线性尺寸"：面积会变成 (2/3)² ≈ 4/9。
 */
const MODEL_FIT_SCALE = {
  /* ★ 2026-10-11：三个「料」的过程模型共用同一档取景缩放。
   *   原来只给矿石 1.5，熔料球与刀胚仍是 1.0 —— 同一块料在 S1→S2→S3→S4 的屏幕
   *   体量会从 55% 跳到 83%，再套上阶段机位（FOCUS[1]=0.70 / FOCUS[2]=0.64）
   *   后实测 133% / 140%，被视口裁掉约 1/3（见 2026-10-11 的逐阶段测量）。
   *   三者都是「方块状、天然显大」的块体，取景口径必须一致，
   *   形态变化（矿石→熔球→刀胚）才读得出是同一块料。 */
  ore_small: 1.5,            // 原料（矿石）—— S1 结果
  molten_sphere_small: 1.5,  // 原项目熔料球 —— S2 结果
  blank_ingot_small: 1.5,    // 原项目刀胚 —— S3 结果
};
const DEFAULT_FIT_SCALE = 1;

class Viewer {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this.root = null;
    this._modelTween = null;
    this.modelSize = null;
    this.fitBox = null;      // 摆正后的世界 AABB（取景用，见 _computeFit）
    this.fitScale = DEFAULT_FIT_SCALE;   // 逐模型取景缩放（见 MODEL_FIT_SCALE）
    this.fitDistance = 1;
    this.needsRender = true;
    this._lastRenderAt = 0;
    this._loopOn = false;
    let needsRender = this.needsRender;
    Object.defineProperty(this, 'needsRender', {
      configurable: true,
      enumerable: true,
      get: () => needsRender,
      set: (value) => {
        needsRender = !!value;
        if (needsRender && this.renderer && !this.disposed) this.resumeRender();
      },
    });
    this._viewportVisible = true;
    this._viewportObserver = null;
    /* ★ 2026-10-14：异步预编译状态（见 precompile()）。_compiling 期间 _render 直接
       跳过出帧 —— 否则会在 program 还没编译完时触发 three 的同步等待（实测 130–215s 卡死）。 */
    this._compiling = false;
    this._compilePromise = null;
    this._cancelCompile = null;
    this._compileFailed = false;
    this.onCompileState = null;      // (compiling:boolean) => void，给 UI 显示"编译中"
    this.onContextLost = null;
    this.onContextRestored = null;
    this._contextLost = false;

    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const narrowViewport = w <= 600;
    this._targetFrameMs = narrowViewport ? (1000 / 45) : 0;

    // 保留最近一帧：移动端异步编译刀身材质时暂停 draw，保留旧帧能让舞台继续
    // 显示上一阶段模型，直到新材质编译完成，避免几秒钟的空白舞台。
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    /* ★ P1 卡顿修复（2026-10-08）：关掉 three.js 的着色器错误自检。
       真源在 js/lib/three.bundle.js（偏移 437824）：
         this.debug = { checkShaderErrors: !0, onShaderError: null }
       开着的时候，WebGLProgram 每编译一个 program 都会同步调用
       getProgramInfoLog() + 两次 getShaderInfoLog() —— 见同一文件偏移 345140 的
       `function E(e){ if (t.debug.checkShaderErrors) { const n = r.getProgramInfoLog(_)...`。
       这三个 GL 查询**必须等驱动把编译/链接做完才返回**（同步往返），
       于是每诞生一个新 program，主线程就被按住几百毫秒。
       CPU 采样抓到的叶帧直接印证：某一步 getShaderInfoLog 244 帧 + getProgramInfoLog 234 帧，
       同一窗口 totalMs 1313ms。这也解释了"为什么没有任何单次 GL 调用超过 4ms"——
       阻塞在同步等待里，不在任何单个函数里。
       SwiftShader 是 CPU 编译着色器、把这件事放大了几十倍；真机 GPU 上同样存在（幅度小些）。
       代价：着色器真写错时不再有漂亮的报错，只剩 WebGL 警告 + 黑屏。
       本工程的着色器是固定的（bladeSkinShader / material hook），已验证能编译过；
       需要排查着色器时，在控制台执行 `__BFViewer.renderer.debug.checkShaderErrors = true` 再刷新（`__BFViewer` 见 js/main.js:2545）。 */
    this.renderer.debug.checkShaderErrors = false;
    // Mobile portrait stages are fill-heavy: cap DPR at 1.5 to avoid rendering
    // four times the CSS pixel count on high-density phones while preserving 45 fps.
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, narrowViewport ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.87; // Subtle global exposure trim; keep stage PBR and material highlights intact
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 500);
    this.camera.position.set(0, 0.6, 3);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    /* ══════════ 展品照明重做（2026-10-27）══════════════════════

       用户反馈：「打光太强了，不柔和，光源也不对」。

       查了展品照明资料后的关键认识：
         · IES RP-30 / CIE LG8：展品照明要避免眩光与硬阴影，
           主辅光比推荐 2:1 ~ 4:1；金属尤其不能用直射光，
           直射只会得到一片死白镜面高光，反而丢掉层次。
         · 刀具摄影实务（The Slanted Lens / broncolor）：
           「把光直直打向金属，它不会变好看，只会变成一片高光」；
           要的是**渐变**，靠大发光面反射出层次。
         · 柔光的本质不是“强度低”，而是**发光面相对被摄体足够大**。

       所以全局打光拆成两个职责：
         ① studioEnv（已重做）：大面积柔光箱，负责金属的反射与高光形状；
         ② 这里的场景灯：只做**极弱的塑形补光**，不再当主光。

       旧值 key 1.4 / fill 0.6 / back 0.5 是无限远**平行光**（最硬的光），
       与柔光意境相否 —— 它们会把金属打出刺眼的亮点，
       而且一路压着 studioEnv 的层次。现在压到“只补形、不成像”的水平。 */
    this.keyLight = new THREE.DirectionalLight(0xffffff, 0.42);
    this.keyLight.position.set(2.2, 3, 2.4);
    this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(0xd4e0f0, 0.20);
    this.fillLight.position.set(-2.4, 0.6, -2);
    this.scene.add(this.fillLight);
    // 背面补光：从相机后方打光，让刀身另一面不被完全照黑
    this.backLight = new THREE.DirectionalLight(0xffffff, 0.16);
    this.backLight.position.set(0, 1, -3.5);
    this.scene.add(this.backLight);

    /* ★ V2（2026-10-03）：舞台底色改为透明（首页规格：刀悬浮在暖纸背景上，不加方框）。
       原来深色舞台会通过"亮背景吸光"以外的路径给刀提供额外的环境提亮，
       去掉深底后 S5–S9 刀具阶段实测平均色掉到 (4,4,4) —— 画面几乎全黑。
       这里补一盏半球光模拟"浅色纸面反射"，下半球取暖纸色，让金属刀身
       在浅背景上仍有可读的亮度层次。不加背景板、不加方框，只补光。

       ★ 2026-10-27：强度 0.85 → 0.62。
         半球光本身就是**软光**（无方向性阴影、无硬高光），所以它是新方案里
         要保留的那一盏；但旧值偏高，与 studioEnv 的环境补光叠加后
         会把整体抬得偏亮（用户说的「打光太强」的另一部分来源）。 */
    this.hemiLight = new THREE.HemisphereLight(0xFFFDF8, 0xF1EBDF, 0.62);
    this.scene.add(this.hemiLight);

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.clock = new THREE.Clock();
    this._reduceMotion = prefersReducedMotion();
    /* 材质时间原因（见 _isAnimating）：由门面按当前配方登记，默认关闭。 */
    this._materialTime = false;
    /* ★ 2026-10-12：渲染循环改成**可暂停**。
       原来构造完就 `setAnimationLoop(...)` 一路跑到世界尽头 —— 而本工程 9 个页面里
       只有 4 个（home / forge / forgeout / collection）真的显示 3D 舞台。
       其余 5 个（教程 / 图鉴 / 赛事 / 每日 / 成就）只是把 canvas 搬到 <body> 里藏着，
       循环却照跑：每帧照样 traverse + 更新 uniform + 发一整轮 draw call，
       纯属白烧 GPU（移动端表现为发热 + 掉电 + 页面滚动卡顿）。
       现在由 router 在切页时显式 pause/resume，隐藏时也停。 */
    this.resumeRender();

    // One gate for visibility events, IO, geometry fallback and dirty frames.
    this._onVisibility = () => this._syncRenderVisibility();
    document.addEventListener('visibilitychange', this._onVisibility);
    if (typeof global.IntersectionObserver === 'function') {
      try {
        this._viewportObserver = new global.IntersectionObserver((entries) => {
          if (this.disposed) return;
          for (const entry of entries) {
            if (entry.target !== this.renderer.domElement) continue;
            this._viewportVisible = !!entry.isIntersecting
              && (entry.intersectionRatio == null || entry.intersectionRatio > 0);
            this._syncRenderVisibility();
          }
        });
        this._viewportObserver.observe(this.renderer.domElement);
      } catch (_) {
        this._viewportObserver?.disconnect();
        this._viewportObserver = null;
      }
    }
    // Also wakes the geometry fallback when IO is unavailable or a tab is resized.
    this._onViewportChange = (event) => {
      if (this.disposed) return;
      if (event?.type === 'resize') this.resize();
      this._syncRenderVisibility();
    };
    global.addEventListener('scroll', this._onViewportChange, true);
    global.addEventListener('resize', this._onViewportChange, { passive: true });

    // 交互时间戳：给 OrbitControls 的阻尼留一段「松手后继续画」的窗口
    /* ⚠ 只把**真正拖拽/缩放**算交互。若把裸 pointermove 也算进去，
       桌面上鼠标随便划过舞台就会不停刷新时间戳 → 闸门永远开着，等于没优化。 */
    this._lastInputAt = 0;
    let pressed = false;
    const markInput = () => { this._lastInputAt = performance.now(); this.needsRender = true; };
    const el = this.renderer.domElement;
    const inputHandlers = {
      pointerdown: () => { pressed = true; markInput(); },
      pointerup: () => { pressed = false; markInput(); },
      pointercancel: () => { pressed = false; markInput(); },
      pointermove: () => { if (pressed) markInput(); },
      wheel: markInput,
      touchstart: markInput,
      touchmove: markInput,
    };
    for (const [type, handler] of Object.entries(inputHandlers)) {
      el.addEventListener(type, handler, { passive: true });
    }
    this._disposeInput = () => {
      pressed = false;
      for (const [type, handler] of Object.entries(inputHandlers)) el.removeEventListener(type, handler);
    };

    this.resizeObserver = typeof global.ResizeObserver === 'function'
      ? new global.ResizeObserver(() => { this.resize(); this._syncRenderVisibility(); }) : null;
    this.resizeObserver?.observe(container);
    this.resize();

    /* ★ 2026-10-14：WebGL 上下文丢失/恢复。
       背景：刀身材质着色器极大，首帧同步等待编译时（老路径）会把主线程按住 100s+，
       Windows 的 TDR 看门狗会判定 GPU 无响应 → 直接丢掉上下文（实测 CONTEXT_LOST_WEBGL）。
       改成异步编译后不该再丢；这里仍然兜底：丢掉时不崩、恢复后自动重编译并出一帧。
       `preventDefault()` 是必须的 —— 否则浏览器不会尝试恢复上下文。 */
    this._onContextLost = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (this.disposed) return;
      this._contextLost = true;
      invalidateCaptureTargets(this.renderer);
      /* ★ 2026-10-21：上下文代数 +1 —— 之后所有"待释放"的 program 都属于旧 context，
         不能再 delete（会刷 "delete: object does not belong to this context"）。 */
      try { globalThis.K3D.glCtxEpoch = (globalThis.K3D.glCtxEpoch || 0) + 1; } catch (_) { /* ignore */ }
      this.pauseRender();
      this._cancelRestore?.();
      this._cancelCompile?.();
      this._bgCompile = null;
      console.warn('[viewer] WebGL 上下文丢失，等待浏览器恢复…');
      if (this.onContextLost) this.onContextLost();
    };
    this._onContextRestored = () => {
      if (this.disposed) return;
      this._cancelRestore?.();
      this._cancelCompile?.();
      this._contextLost = false;
      this._compileFailed = false;
      this._matGen = undefined;
      try { globalThis.K3D.glCtxEpoch = (globalThis.K3D.glCtxEpoch || 0) + 1; } catch (_) { /* ignore */ }
      console.info('[viewer] WebGL 上下文已恢复');
      // Programs and the facade's texture/glow rebuild must BOTH finish before drawing.
      const recovery = this._restoring = {};
      const complete = (ok) => {
        if (this._restoring !== recovery) return;
        clearTimeout(restoreTimer);
        try { if (!ok) recovery.onCancel?.(); } catch (_) { /* observer only */ }
        recovery.onCancel = null;
        this._restoring = null;
        this._cancelRestore = null;
        if (!ok) this._cancelCompile?.();
        this._compileFailed = !ok;
        if (ok && !this.disposed && !this._contextLost) this.needsRender = true;
      };
      const restoreTimer = setTimeout(() => complete(false), 15 * 60 * 1000);
      this._cancelRestore = () => complete(false);
      let resources;
      try { resources = this.onContextRestored?.(); } catch (_) { resources = false; }
      Promise.all([
        this.precompile(),
        Promise.resolve(resources).then(value => value !== false, () => false),
      ]).then(([compiled, rebuilt]) => {
        if (this.disposed || this._contextLost || this._restoring !== recovery) return;
        complete(!!compiled && !!rebuilt);
      });
    };
    const glCanvas = this.renderer.domElement;
    glCanvas.addEventListener('webglcontextlost', this._onContextLost, false);
    glCanvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
    // HDR 环境不在这里自动加载：file:// 模式下内联包（K3D_INLINE）由 engine.init()
    // 按需注入，构造时通常还不存在 —— 由 app.boot() 在 init 之后显式调用 loadEnvironment()
  }

  /**
   * 把 envMap 显式挂到场景内所有材质上。
   * 原因：three r169 在 `material.envMap === null && scene.environment` 时会用
   * `scene.environmentIntensity` 直接覆盖着色器的 envMapIntensity uniform，
   * 导致材质的 `envMapIntensity`（即"反射强度"滑块）完全失效。
   * 显式挂载后走 `material.envMapIntensity` 分支，材质级控制才生效。
   */
  _applyEnvMapToScene() {
    if (!this.envMap) return;
    let touched = false;
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.envMap === this.envMap) continue;
        m.envMap = this.envMap;
        m.needsUpdate = true;
        touched = true;
      }
    });
    /* ★ 2026-10-14：envMap 会进 program 的 cacheKey（USE_ENVMAP 宏）→ 换了 envMap
       就等于换了一个 program。这里主动作废"已编译代数"，让 _render 先走一次
       compileAsync 再出帧 —— 否则第一帧会撞上 three 的同步编译等待（100s+）。 */
    if (touched) this._matGen = undefined;
  }

  /**
   * 加载环境贴图。
   *
   * ★ 2026-10-03 延后加载：HDR 原来内联在首屏包里（1.92MB / 占单包 13%）。
   *   它**只影响反射质感**，却让首屏多等 1.9MB —— 明显不划算。
   *   现在单独成 js/bundle.hdr.js，延后注入；失败直接退化成无环境光，
   *   不阻塞、不报错（游戏本来就不依赖反射）。
   */
  async loadEnvironment(url = 'assets/environment.hdr') {
    /* Prefer the procedural studio immediately: it is bundled and does not
       depend on fetching or decoding environment.hdr. The former flow first
       awaited RGBELoader, then created the studio, silently skipping BOTH on
       Safari when the old HDR failed. Keep the HDR as a real fallback only. */
    let mode = 'none';
    let cause = '';
    let nextEnv = null;
    try {
      nextEnv = getStudioEnv(this.renderer);
      if (nextEnv) mode = 'studio-half-float';
    } catch (e) {
      cause = String(e?.message || e);
      console.warn('[render] Studio reflection unavailable, trying legacy HDR:', cause);
    }
    if (!nextEnv && !this.disposed) {
      let hdr = null;
      let pmrem = null;
      try {
        let src = url;
        if (global.location.protocol === 'file:') {
          if (global.K3D_INLINE?.hdr) {
            src = 'data:application/octet-stream;base64,' + global.K3D_INLINE.hdr;
          } else {
            await loadScriptOnce('js/bundle.hdr.js');
            if (!global.K3D_INLINE_HDR?.hdr) throw new Error('legacy HDR bundle missing');
            src = 'data:application/octet-stream;base64,' + global.K3D_INLINE_HDR.hdr;
          }
        }
        hdr = await new THREE.RGBELoader().loadAsync(src);
        if (this.disposed) return;
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        pmrem = new THREE.PMREMGenerator(this.renderer);
        nextEnv = pmrem.fromEquirectangular(hdr).texture;
        if (nextEnv) mode = 'legacy-hdr';
      } catch (e) {
        cause = [cause, String(e?.message || e)].filter(Boolean).join(' / ');
        console.warn('[render] All environment reflections unavailable:', cause);
      } finally {
        try { hdr?.dispose(); } catch (_) { /* ignore */ }
        try { pmrem?.dispose(); } catch (_) { /* ignore */ }
      }
    }
    if (this.disposed) return;
    if (nextEnv) {
      this.envMap = nextEnv;
      this.scene.environment = nextEnv;
      if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.55;
      this._applyEnvMapToScene();
      if (this.onEnvMapReady) this.onEnvMapReady(nextEnv);
      this.needsRender = true;
    }
    /* In-browser read-only diagnostics: the absence of JS errors does not
       prove the metal reflection texture was really created on iOS. */
    global.__FORGE_ENV_DIAG = {
      mode, ready: !!nextEnv, reason: cause || null,
      textureType: mode === 'studio-half-float' ? 'HalfFloatType' : (nextEnv?.type ?? null),
    };
    /* The status is healthy when our half-float studio reflection is ready.
       Hide the panel even if the user previously bookmarked ?envdebug=1.
       Failures surface automatically; ?envdebug=force remains available
       when deliberately inspecting a healthy device. Ignore float-linear
       false on WebGL2: the active HDR input is HalfFloatType, not FloatType. */
    try {
      const d = global.document;
      const query = new URLSearchParams(global.location?.search || '');
      const show = mode !== 'studio-half-float' || !nextEnv || query.get('envdebug') === 'force';
      let el = d.getElementById('__forgeEnvDebug');
      if (!show) {
        if (el) el.remove();
      } else {
        if (!el) {
          el = d.createElement('div');
          el.id = '__forgeEnvDebug';
          el.style.cssText = 'position:fixed;left:8px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:99999;background:rgba(12,31,45,.92);color:#fff;border-radius:8px;padding:7px 10px;font:12px/1.5 ui-monospace,SFMono-Regular,monospace;white-space:pre;pointer-events:none;max-width:calc(100vw - 16px);';
          d.body.appendChild(el);
        }
        const gl = this.renderer?.getContext?.();
        const gl2 = !!(global.WebGL2RenderingContext && gl instanceof global.WebGL2RenderingContext);
        const floatLinear = !!gl?.getExtension?.('OES_texture_float_linear');
        el.textContent = 'Env: ' + mode + (nextEnv ? '  OK' : '  FAILED') + '\n'
          + 'WebGL2: ' + gl2 + ' · float-linear: ' + floatLinear
          + (cause ? '\n' + cause.slice(0,100) : '');
      }
    } catch (_) { /* diagnostics never break game rendering */ }
  }

  /**
   * 这一帧**是否真的需要画**。
   *
   * ★ 2026-10-12：原来 _render 每帧无条件 traverse + draw，哪怕刀一动不动。
   *   实测（390×844 软件 WebGL）：forge 页 p50 361ms/帧、约 1~2 fps，
   *   而 `renderer.render()` 自身 JS 耗时是 0ms —— 说明成本全在 GPU/合成侧，
   *   只有**少画**才有用，在 JS 里抠细节没用。
   *
   *   判据：**任何会改变画面的东西都算「活着」**，宁可多画也不能冻住动画：
   *     · needsRender      —— 换模型 / 换皮肤 / resize / 相机被程序改过
   *     · autoRotate       —— 自转开着就必须持续推进
   *     · 模型/相机补间     —— _modelTween / _camTween 正在跑
   *     · 刀身特效          —— S4 进阶卡的呼吸光晕（uTime 驱动）
   *     · 交互后 900ms      —— OrbitControls 的阻尼收敛窗口，松手后还要滑一会儿
   */
  _isAnimating() {
    if (this.needsRender) return true;
    if (this.controls && this.controls.autoRotate) return true;
    if (this._modelTween || this._camTween) return true;
    if (this._effect && !this._reduceMotion) return true;
    /* ★★ 2026-10-20（P0 · 已证实的"材质动画停钟"）
     *   病象：S6_08（无光晕、无自转、reduceMotion=false）闲置 1.2 秒后 frame 与
     *        uEffectTime 都不再前进；显式 invalidate 才恢复（SUPPLEMENT §3B）。
     *   根因：uEffectTime **只在本函数返回 true 时**才于 _render 里更新，而本函数
     *        没有任何"材质时间"原因 —— 配方里明明有非零动画条目（S7 刃线扫光、
     *        动画族纹样条带、S6 薄膜漂移、S8 柄纹），却因为相机静止而被判成"没在动"。
     *   修法：由门面按配方登记 materialTime 原因（setMaterialTime），这里只读。
     *        减弱动效时仍然停帧（uEffectTime 冻结在 0）—— 与原有 reduceMotion 口径一致。 */
    if (this._materialTime && !this._reduceMotion) return true;
    if (this._lastInputAt && performance.now() - this._lastInputAt < 900) return true;
    return false;
  }

  /** 配方是否需要持续推进 uEffectTime（门面按当前配方登记，见 _isAnimating 注释）。 */
  setMaterialTime(on) {
    const next = !!on;
    if (next === this._materialTime) return next;
    this._materialTime = next;
    if (next && !this._reduceMotion) this.needsRender = true;
    return next;
  }

  _render() {
    if (this.disposed) return;
    if (!this._renderVisible()) { this.pauseRender(); return; }
    /* ★ 2026-10-14：program 正在异步编译中 —— 这一帧绝不出。
       出帧就会触发 three 首次 setProgram → WebGLUniforms 构造 →
       `getProgramParameter(ACTIVE_UNIFORMS)` 的**同步等待**（实测 130–215s）。
       等 precompile() 完成后再画，主线程全程不卡。 */
    if (this._compilePromise || this._compiling || this._contextLost || this._compileFailed) { this.pauseRender(); return; }
    // 首屏环境贴图就绪前由 bootstrap 暂停自动编译，避免先编译无 envMap 的材质；
    // 交互界面已可用，bootstrap 会在后台解除此闸门并显式预编译。
    if (this.deferCompile) { this.pauseRender(); return; }
    /* ★ 2026-10-14「用到哪个编译哪个」：材质代数变了（钩子集合/signature/program 缓存变了）
       = 有材质需要重建 program。**先异步编译，本帧不出**，绝不让编译落到渲染路径上。
       这是兜底闸门：不依赖上层是否记得调 precompile()，任何入口（日志页、快照、
       实验室、切刀型）都不会再撞同步等待。 */
    if (K3D.material && K3D.material.materialGen) {
      const gen = K3D.material.materialGen();
      if (gen !== this._matGen) {
        this._matGen = gen;
        tl('render:gate');
        this.precompile();
        this.pauseRender();
        return;
      }
    }
    // 静止且无动画 → 整帧跳过（不 traverse、不 update、更不 draw）
    if (!this._isAnimating()) { this.pauseRender(); return; }
    const now = performance.now();
    if (this._targetFrameMs && now - this._lastRenderAt < this._targetFrameMs) return;
    this._lastRenderAt = now;
    // Keep the small set of card-authored shader motions in sync with the render
    // clock. Hook slots are shared with three.js uniforms, so this updates values
    // without rebuilding programs or traversing the cached, inactive models.
    const root = this.root;
    if (root && root.traverse) {
      const t = this._reduceMotion ? 0 : performance.now() * 0.001;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          const hooks = material && material.userData && material.userData.__k3dHooks;
          if (!hooks || !hooks.values) continue;
          for (const hook of hooks.values()) {
            const uniforms = hook && hook.uniforms;
            if (!uniforms) continue;
            if (uniforms.uEffectTime) uniforms.uEffectTime.value = t;
            if (uniforms.uHandleEffectTime) uniforms.uHandleEffectTime.value = t;
          }
        }
      });
    }
    /* 刀身特效逐帧推进：只写 uTime，不重建几何、不重编译着色器。
       尊重 prefers-reduced-motion —— 减弱动效时冻结在 t=0（静态特效）。 */
    if (this._effect && K3D.bladeEffects) {
      K3D.bladeEffects.update(this._effect, this._reduceMotion ? 0 : performance.now() * 0.001);
    }
    this.controls.update();
    const drawStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    /* ★ 2026-10-20（P0 · program 引用对账）：材质换程序后，旧 program 的引用
       必须在**新 program 已确定**之后再释放（见 material.js#flushProgramReleases）。
       空集合时是一次 length 判断，热路径无成本。 */
    if (K3D.material && K3D.material.flushProgramReleases) {
      K3D.material.flushProgramReleases(this.renderer);
    }
    // CPU-side diagnostics only: render() submission time and inter-frame
    // cadence while actively drawing, not an invented GPU/compositor FPS.
    const drawEnd = performance.now();
    const diag = global.__FORGE_RENDER_STATS || (global.__FORGE_RENDER_STATS = {
      frames: [],
      summary() {
        const samples = this.frames.slice();
        const intervals = samples.map(s => s.interval).filter(v => v > 0 && v <= 250).sort((a, b) => a - b);
        const draws = samples.map(s => s.drawMs).sort((a, b) => a - b);
        const quantile = (a, q) => a.length ? Math.round(a[Math.min(a.length - 1, Math.ceil(a.length * q) - 1)] * 10) / 10 : null;
        return { drawSamples: samples.length, activeFrameSamples: intervals.length,
          medianDrawMs: quantile(draws, 0.5), p95DrawMs: quantile(draws, 0.95),
          p95ActiveFrameMs: quantile(intervals, 0.95),
          estimatedActiveFPS: intervals.length ? Math.round(1000 / quantile(intervals, 0.5)) : null,
          note: 'Browser render-submission samples; not GPU-composited FPS' };
      },
    });
    diag.frames.push({ drawMs: drawEnd - drawStart,
      interval: this._lastSubmittedFrame ? drawStart - this._lastSubmittedFrame : 0 });
    if (diag.frames.length > 240) diag.frames.shift();
    this._lastSubmittedFrame = drawStart;
    if (this._pendingVisualSample) {
      const sample = this._pendingVisualSample;
      this._pendingVisualSample = null;
      const timeline = global.__FORGE_VISUAL_TIMINGS ||
        (global.__FORGE_VISUAL_TIMINGS = { samples: [], summary: () => {
          const values = global.__FORGE_VISUAL_TIMINGS.samples.map(s => s.ms).sort((a, b) => a - b);
          const byStage = {};
          for (const s of global.__FORGE_VISUAL_TIMINGS.samples) {
            const group = byStage[s.stageId] || (byStage[s.stageId] = []);
            group.push(s.ms);
          }
          for (const [k, v] of Object.entries(byStage)) {
            v.sort((a, b) => a - b);
            byStage[k] = { count: v.length,
              p95: v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)] };
          }
          return { count: values.length, p95: values.length
            ? values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] : null,
            newProgramPreviews: global.__FORGE_VISUAL_TIMINGS.samples.filter(s => s.programsAdded > 0).length,
            byStage };

        } });
      const ms = Math.round((performance.now() - sample.startedAt) * 10) / 10;
      timeline.samples.push({ ...sample, ms,
        programsAdded: Math.max(0, (this.renderer.info.programs?.length || 0) - sample.programsAtStart) });
      if (timeline.samples.length > 250) timeline.samples.shift();
    }
    /* ★ 2026-10-09：?perf=1 时记录长帧。模型刚换上来的第一帧若明显偏长，
       说明卡的是着色器编译 / 纹理首次上传，而不是模型加载 ——
       两者的优化手段完全不同（前者靠预热 program，后者靠预热 GLB）。 */
    if (global.K3D_PERF) {
      const dt = performance.now() - now;
      if (dt > 40) global.console.info('[perf] frame ' + Math.round(dt) + 'ms');
    }
    this.needsRender = false;
  }

  resize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const narrowViewport = w <= 600;
    this._targetFrameMs = narrowViewport ? (1000 / 45) : 0;
    const pixelRatio = Math.min(global.devicePixelRatio || 1, narrowViewport ? 1.5 : 2);
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    /* ★ P3（2026-10-08）：尺寸没变就早退。
       为什么值这一行：`renderer.setSize()` 在 three.js 里会**重建 drawing buffer**
       （改变 canvas.width/height → 底层 swap chain 重建），实测软渲染下单次约 1.5ms，
       而本方法被 ResizeObserver 在页面切换 / 抽屉展开 / 键盘弹出时反复触发；
       CPU 采样曾在一步里抓到 `setSize @ three.bundle.js:9` 占 197 帧 / 约 200ms。
       而且下面 `_computeFit()` 每次都要遍历全模型顶点求 AABB，纯属重算。
       契约保持不变：宽高**真的**变了（或首次调用 `_lastResizeW===undefined`）时行为与原来逐字相同。
       注意 `rebindContainer()` 必须继续生效 —— 它负责的正是"容器换了但尺寸恰好相同"那种
       情况下也要重算取景，所以那里会先把 `_lastResizeW` 清掉再调用本方法。 */
    if (this._lastResizeW === w && this._lastResizeH === h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.needsRender = true;
      if (!global.document || !global.document.hidden) this.resumeRender();
      return;
    }
    this._lastResizeW = w;
    this._lastResizeH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.modelSize) {
      const current = this.camera.position.distanceTo(this.controls.target);
      const wasAtFit = !this.fitDistance || Math.abs(current - this.fitDistance) < this.fitDistance * 0.05;
      this._computeFit();
      if (wasAtFit) this.resetView();
    }
    this.needsRender = true;
    // setSize() recreates the drawing buffer. Re-arm the loop as well as marking
    // it dirty, so a previously paused/idle stage cannot stay blank after resize.
    if (!global.document || !global.document.hidden) this.resumeRender();
  }

  /**
   * 把 ResizeObserver 重新绑定到当前的 canvas 父容器，并立即 resize 一次。
   *
   * ★ 为什么必须有这个（2026-10-03 修的真实 bug：出炉揭晓页一片空白）
   *   3D 舞台是**全局单 Viewer、跨页复用**（见 router.js 的硬约束①），
   *   切页时只把同一个 canvas DOM 搬进目标页的 .viewport。
   *   但构造时 `resizeObserver.observe(this.container)` 绑的是**首次创建时
   *   那个容器**（锻造页 #stage）。canvas 搬走后，新容器尺寸变化不会触发它
   *   → renderer 缓冲区停在 1×1（实测 canvasBuf=[1,1] 而 canvasCss=[390,291]）
   *   → 模型、自转、相机全都正常，就是一个像素都画不出来。
   *
   *   判据：canvas 的 CSS 尺寸正常但 width/height 属性为 1，就是这个 bug。
   *   修法：切页后调本方法，把 observer 跟到新容器，并强制 resize + 重绘。
   */
  rebindContainer() {
    if (this.disposed) return;
    const parent = this.renderer && this.renderer.domElement
      ? this.renderer.domElement.parentElement
      : null;
    if (!parent) return;
    if (parent !== this.container) {
      this.container = parent;
      if (this.resizeObserver) {
        try { this.resizeObserver.disconnect(); } catch (e) { /* 已断开 */ }
        try { this.resizeObserver.observe(parent); } catch (e) { /* 容器已移除 */ }
      }
    }
    // ★ P3 配套：这里要**强制**重算，不能吃掉 resize() 的"尺寸没变就早退"。
    //   本方法负责的正是"容器换了、但尺寸恰好相同"（弹出抽屉/切页后同宽高）那种情形：
    //   此时必须重设缓冲区并重算取景。清掉记忆值即可让 resize() 走完整路径。
    this._lastResizeW = undefined;
    this._lastResizeH = undefined;
    this.resize();
    this.needsRender = true;
  }

  /**
   * 放入一个已加载的 gltf.scene。
   * @param {string} [knifeId] - 可选的刀型 ID，用于从 KNIFE_VIEW_ANGLE_Y 查默认偏转角。
   *   蝴蝶刀不做额外偏转；统一的轻微三分之四视角由 forge 相机预设提供。
   */
  setModel(root, knifeId) {
    // 切模型时保留当前镜头作为过渡起点，避免新模型出现后机位直接跳回正面。
    // 首次加载仍使用 resetView 的即时定位；后续换模型则与模型入场动画并行补间。
    const hadModel = !!this.root;
    const fromCamera = hadModel ? this.camera.position.clone() : null;
    const fromTarget = hadModel ? this.controls.target.clone() : null;
    this._stopCamTween();
    this._clearModel();
    /* ★★ 2026-10-06 问题清单 #3：位置污染防护。
     *   setModel 会 `root.position.sub(center)` 把模型摆到原点，而 root 是
     *   **engine.loaded 缓存里的同一个对象**（loadKnife 命中缓存就直接复用）。
     *   旧实现第二次 setModel 时：root.position 已是 -center → 用它算出的
     *   AABB 中心偏移 → 再减一次 → 模型在空间里逐次漂移。
     *   实测：连切 10 次 root.position 恒 [0,0,0]（GLB 几何本身居中，尚未复现漂移），
     *   但这是**依赖模型导出器的巧合**——换一个 root 带初始位移的 GLB 就会立刻炸。
     *   一行归零，语义明确且零成本。 */
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);

    // 让刀身长边朝屏幕「竖直」方向 —— 舞台是 4:5 竖版，竖放才能填满画面。
    // （GLB 的朝向因导出工具而异：自制的长轴多在 x/z，CS 模型节点自带 -90° 旋转后
    //   长轴落在 y。三条分支都要归一化到"竖直"，不能只处理其中一种。）
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    if (axis === 'x') this.pivot.rotation.z = Math.PI / 2;        // x 长轴 → 转竖直
    else if (axis === 'z') this.pivot.rotation.x = -Math.PI / 2;  // z 长轴 → 转竖直
    // axis === 'y'：本身就竖直，无需旋转
    this.pivot.add(root);
    // 游戏坐标系朝向相反，绕 Y 轴翻转（与参考站一致）
    this.pivot.rotation.y += Math.PI;
    // 可选额外 Y 轴偏转：蝴蝶刀不转（开合面朝向），其余刀型默认 +180° 翻转刀身
    // 用四元数做复合旋转，避免欧拉角加法被 THREE.js 归一化（π+π≡0 导致无效）
    const viewAngleY = KNIFE_VIEW_ANGLE_Y[knifeId] ?? DEFAULT_VIEW_ANGLE_Y;
    if (viewAngleY !== 0) {
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), viewAngleY);
      this.pivot.quaternion.multiply(q);
    }
    // 记录「摆正后的基准姿态」，供 resetView 恢复（别丢 x/z 的摆正分量）
    this.baseRotation = this.pivot.rotation.clone();
    // 记录 Y 轴偏转量，供 resetView 决定相机在哪一侧（前/后）
    this.baseViewAngleY = viewAngleY;

    /* ★ 2026-10-04 V3：取景改用「旋转后的真实世界 AABB」。
       原来把 setModel 之前的 size 三个分量排序取 dims[0]/dims[1] 当纵向/横向用 ——
       隐含假设「旋转后 x 一定比 z 宽」，对刀型多半成立，对**方块状的过程模型**
       （矿石/熔球/刀胚）不成立，会把纵深当横向算错取景。改成直接量摆正后的盒子。 */
    this.pivot.updateMatrixWorld(true);
    // The GLTF root can carry nested rotations/scales, so subtracting its world
    // AABB center from root.position alone does not always center the *oriented*
    // knife in Viewer space. Recenter the completed pivot once, then derive the
    // fit box from that canonical origin; all stage cameras now target blade/handle
    // regions relative to the same centered model instead of inheriting asset drift.
    const orientedBox = new THREE.Box3().setFromObject(this.pivot);
    const orientedCenter = orientedBox.getCenter(new THREE.Vector3());
    if (Number.isFinite(orientedCenter.x) && Number.isFinite(orientedCenter.y)
        && Number.isFinite(orientedCenter.z)) {
      this.pivot.position.sub(orientedCenter);
      this.pivot.updateMatrixWorld(true);
    }
    this.fitBox = new THREE.Box3().setFromObject(this.pivot);
    // Cache blade-only local bounds once per geometry; later camera changes are O(meshes).
    this.bladeFitBox = new THREE.Box3();
    this.pivot.traverse(obj => {
      if (!obj.isMesh || obj.name?.startsWith('bladeEffectGlow')) return;
      const geo = obj.geometry, pos = geo?.attributes?.position, region = geo?.attributes?.aRegion;
      if (!pos || !region) return;
      const data = geo.userData || (geo.userData = {});
      if (!data.bladeCameraBounds) {
        const bounds = new THREE.Box3(), point = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) if (region.getX(i) > 0.55) bounds.expandByPoint(point.fromBufferAttribute(pos, i));
        data.bladeCameraBounds = bounds;
      }
      if (!data.bladeCameraBounds.isEmpty()) this.bladeFitBox.union(data.bladeCameraBounds.clone().applyMatrix4(obj.matrixWorld));
    });
    if (this.bladeFitBox.isEmpty()) this.bladeFitBox.copy(this.fitBox);
    this.root = root;
    this.modelSize = size;
    // 逐模型取景缩放：原料方块状天然显大，单给它拉远相机（见 MODEL_FIT_SCALE）
    this.fitScale = MODEL_FIT_SCALE[knifeId] ?? DEFAULT_FIT_SCALE;
    this._computeFit();
    this.resetView();
    if (hadModel && fromCamera && fromTarget && !this._reduceMotion) {
      const toCamera = this.camera.position.clone();
      const toTarget = this.controls.target.clone();
      this.camera.position.copy(fromCamera);
      this.controls.target.copy(fromTarget);
      this._startCamTween(fromCamera, toCamera, fromTarget, toTarget, 300);
    }
    // ★ 换模型 → 机位预设作废（它是为上一把刀的取景算的）。
    //   resetView 已把相机放回中位，这里只需清标记，
    //   否则调用方会以为"还在 edge 特写"，实际是全景 → 表现不一致。
    this.viewPreset = null;
    this._animateModelEntry(root);
    this.needsRender = true;
  }

  /** 模型落到舞台时轻微收放，减少阶段切模的生硬跳变。 */
  _animateModelEntry(root) {
    this._stopModelTween();
    if (!root || this._reduceMotion) return;
    const data = root.userData || (root.userData = {});
    if (!data.__viewerBaseScale) data.__viewerBaseScale = root.scale.toArray();
    const end = new THREE.Vector3().fromArray(data.__viewerBaseScale);
    const start = end.clone().multiplyScalar(0.94);
    root.scale.copy(start);
    const began = performance.now(), duration = 240, self = this;
    this._modelTween = setInterval(function () {
      if (self.disposed || self.root !== root) { self._stopModelTween(); return; }
      const t = Math.min(1, (performance.now() - began) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      root.scale.lerpVectors(start, end, e);
      self.needsRender = true;
      if (t >= 1) {
        root.scale.copy(end);
        self._stopModelTween();
      }
    }, 16);
  }

  _stopModelTween() {
    if (this._modelTween) { clearInterval(this._modelTween); this._modelTween = null; }
  }

  _computeFit() {
    // 摆正后的真实世界盒：x=横向、y=纵向、z=纵深（相机沿 Z 看）
    const src = this.fitBox
      ? this.fitBox.getSize(new THREE.Vector3())
      : this.modelSize;
    if (!src) return;
    const hx = Math.abs(src.x) / 2;   // 横向半宽
    const hy = Math.abs(src.y) / 2;   // 纵向半高
    const hz = Math.abs(src.z) / 2;   // 纵深半厚
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const aspect = Math.max(0.2, this.camera.aspect);
    const tan = Math.tan(halfFov);
    /* ★★ 2026-10-04 V3 · 深度补偿（本轮修的第二个取景 bug）
     *
     * 老公式把模型当成一张「位于焦距处的平板」：dist = 半宽 / (tan·aspect)。
     * 但模型有纵深 —— 离相机最近的**近端面**在 d−hz 处，同一焦距下它的投影
     * 比中心平面放大 d/(d−hz) 倍。纵深越大偏差越大：
     *
     *   刀（细长，hz≈0.02h）→ 误差 <1%，忽略不计
     *   矿石（0.88×0.90×0.87 近立方）→ d−hz = 1.204 vs d = 1.639，放大 1.36 倍
     *
     * 实测（390×844 / #stage 390×465 / fov 42 / aspect 0.838）：
     *   老公式 → NDC x ∈ [−1.127, +1.138]（越界），左右各裁 25/27px，fillW 113%
     *   验算新公式 NDC_x = hx/((d−hz)·tan·aspect) = 0.44/(1.204·0.3217) = 1.136 ✓ 吻合
     *   修后 → fillW 83%、fillH 71%，完整入画。
     *
     * 写法上让 margin 的语义与老公式完全一致（对细长刀是零差异）：
     *   fit = hz + max(需求距离) · margin     ← 而不是 (hz + 需求) · margin
     */
    const needV = hy / tan;
    const needH = hx / (tan * aspect);
    /* ★ V2（2026-10-03）：边距按视口宽高比自适应。
       原来固定 1.18，是为桌面 4:5 竖版舞台调的。移动端锻造页视口更宽更扁
       （如 390×300，aspect≈1.3），竖直方向反而是约束边 → 模型显得又小又居中偏远，
       实测占屏不足。规则：
         宽屏（aspect 大，横向是约束边）→ 收紧到 1.06，让刀尽量填满
         竖屏窄视口                → 放宽到 1.25，留呼吸位
       两端都夹在 [1.06, 1.30]，避免过曝贴边或过小。 */
    let margin = 1.18;
    if (aspect >= 1.6) margin = 1.06;        // 宽视口：横向宽松，竖向是瓶颈
    else if (aspect <= 0.75) margin = 1.28;  // 极窄竖视口：多留边
    else if (aspect <= 1.0) margin = 1.20;
    this.fitMargin = margin;
    /* ★ 2026-10-05 V3：逐模型取景缩放（见 MODEL_FIT_SCALE）。
       只把「近端面到相机的间距」M = max(needV,needH)·margin 乘 scale，
       **不能连 hz 一起乘** —— 屏幕上模型的线性大小 ∝ 1/(d − hz)（近端面在 d−hz 处）。
         写成 (hz + M)·scale → d−hz = 0.5hz + 1.5M ≠ 1.5M
           实测 390×844 得 fillW 51.0%，比目标 55.6% 又小了 4.6 个点，即线性只有 61%
         写成 hz + M·scale → d−hz = 1.5M ✓ → 线性尺寸精确 2/3
       只乘在距离上，不动物体 scale（否则下一次 fit 会拉近抵消）。 */
    const fitScale = this.fitScale || 1;
    this.fitDistance = hz + Math.max(needV, needH) * margin * fitScale;
    const span = Math.max(hx, hy, hz) * 2;
    this.camera.near = Math.max(span * 0.005, 0.001);
    this.camera.far = span * 80;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = this.fitDistance * 0.32;
    /* ★★ 修复「刀的大小不对」：maxDistance 原为 fitDistance × 3.2 ——
       一旦双指/滚轮缩到最远，刀只有默认尺寸的约 1/3，看起来就像“刀变小了/坏了”。
       而且旧实现不提供任何复原手段，玩家无法退回去。
       现在收紧到 1.35：仍能退后看全景（约小 26%），但不会缩成一个小点；
       另配合门面 resetView() 一键回到默认机位。 */
    this.controls.maxDistance = this.fitDistance * 1.35;
  }

  /** 一键还原：恢复「摆正后的基准姿态」+ 默认机位。 */
  resetView() {
    if (!this.fitDistance) return;
    /* ★★ 修复（用户：复原没回到原位）：
       必须在写相机前先取消进行中的补间 —— 否则 setInterval 会在下一帧
       把相机再推回补间的中途位置，看起来就像“复原没生效”（实测残留 0.42）。 */
    this._stopCamTween();
    // ⚠ 必须恢复 baseRotation，不能只留 y —— 长轴在 x/z 的模型靠 z/x 分量摆正，
    //   清掉它们会让刀变回横放（曾导致"CS 模型竖着、新模型横着"的不一致）
    if (this.baseRotation) this.pivot.rotation.copy(this.baseRotation);
    else this.pivot.rotation.set(0, this.pivot.rotation.y, 0);
    // 相机根据刀朝向自动切换前/后：
    // viewAngleY ≈ 0   → 刀尖朝相机，相机在负 Z 侧（正面）
    // viewAngleY ≈ π   → 刀尖远离相机，相机在正 Z 侧（背面）
    const camZ = (this.baseViewAngleY > Math.PI * 0.5) ? 1.0 : -1.0;
    // 默认视角：正对模型中心，无俯仰、无侧偏
    this.camera.position.set(0, 0, this.fitDistance * camZ);
    this.controls.target.set(0, 0, 0);
    /* ★★ 2026-10-06（#3）：必须把 OrbitControls 的**待处理增量**清零。
     *
     * 现象：同一把刀连续 setModel 10 次，相机每次都偏一点（实测末次偏移 0.038，
     *   旋转 7e-6，取景距离 3.4e-5 —— 逐次累积不收敛）。
     *
     * 根因：OrbitControls 内部维护 sphericalDelta（球面增量），每帧 update() 把它
     * 衰减后叠加到相机位置上。上面三行只改了 camera.position / target，
     * **没动 sphericalDelta** —— 它还留着上一帧的值（哪怕极小）。
     * 而揭晓页会开 `autoRotate = true`，它每帧往 sphericalDelta 里加量
     * → 还原视角后相机立刻又被自转推走一点点，10 次切换就累积成可见偏移。
     * 这正是用户说的"重复切换同一把刀位置/朝向不一致"。
     *
     * 修法：还原前临时关掉阻尼与自转，update() 一次让内部状态与外部对齐，
     * 再恢复原设置。damping 关掉时 update 是瞬时赋值（不衰减、不残留），
     * 正好用来"清账"。
     */
    const c = this.controls;
    const wasDamping = c.enableDamping;
    const wasAuto = c.autoRotate;
    c.enableDamping = false;
    c.autoRotate = false;
    /* ★★ 修复（复原仍偏 0.42）：只调 update() **不能**清掉内部增量 ——
       阻尼关掉后 update 仍会把 `_sphericalDelta` 叠到球坐标上一次（然后才清零），
       所以相机会被上一次拖拽的残余推偏。这里先把增量显式归零。 */
    if (c._sphericalDelta) { c._sphericalDelta.theta = 0; c._sphericalDelta.phi = 0; }
    if (c._panOffset) c._panOffset.set(0, 0, 0);
    if (typeof c._scale === 'number') c._scale = 1;
    c.update();                      // 清空 sphericalDelta / panOffset
    /* update() 后相机可能又被阻尼/惯性微调了一步，这里再写一次硬值，保证逐位对齐默认机位 */
    this.camera.position.set(0, 0, this.fitDistance * camZ);
    this.controls.target.set(0, 0, 0);
    c.enableDamping = wasDamping;
    c.autoRotate = wasAuto;
    this.needsRender = true;

    /* ★★ 修复（用户：「拖动点掉会自动复原」——但复原到的不是本页默认视角）：
     *
     *   病象：关闭拖动后相机回到**中性基准位** `[0,0,-fitDistance]`，
     *   而各页面真实默认视角是带机位偏移的：
     *     首页 [-0.335, 0.075, -1.839]、锻造页 [0.285, 0.086, -2.839]。
     *   于是“关掉拖动”后刀会换一个角度，看起来像自己动了一下。
     *
     *   修法：重置姿态后，如果当前有生效的机位 preset，就把它**重新应用一次**，
     *   让“关掉拖动”回到的正是**本页当前的默认机位**。
     *   （setViewPreset 内部不会回调 resetView，不存在递归。）
     */
    const preset = this.viewPreset;
    if (preset && Viewer.VIEW_PRESETS[preset]) {
      this.setViewPreset(preset, { duration: 0 });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * ★★ 机位 preset（2026-10-06 新增，问题清单 #11：三节点镜头语言）
   *
   * 动机（用户诉求原文）：「重点强化定型、开刃、终调三个关键节点，
   * 让玩家明显感受到刀型形成、刀刃完成、最终成刀三个阶段的视觉反馈，
   * 建议通过变化摄像机视角的方式来实现，不要改得太复杂」。
   *
   * 为什么用 preset 而不用连续镜头轨道：轨道演出要引入时间轴、状态机、
   * 可打断逻辑，动辄 200+ 行且极易与"玩家随时拖拽旋转"打架 ——
   * 用户拖一下就打断演出，观感反而更糟。三个**离散机位**是同一诉求下
   * 最省事、最稳的形态：切换是一次补间到位，拖拽仍随时可用。
   *
   * 三个机位（相对 fitDistance 的比例，语义与阶段一一对应）：
   *   forge  定型：正面全景 + 轻微俯视推进 ——「刀型定下来了」
   *   edge   开刃：刃口特写（近 + 偏侧）——「刃线磨出来了」
   *   reveal 揭晓：拉远 + 侧后 3/4 ——「整把刀成了」（配自转）
   *
   * ⚠ 全部以 fitDistance 为基准做比例 → 换刀型/换尺寸时自动适配，
   *   不存在"某把刀切到特写会穿模"的问题。
   * ⚠ reduced-motion 由调用方（main.js）判断后直接跳位，本方法不读偏好。
   */
  static get VIEW_PRESETS() {
    /* ★★ 2026-10-24（用户：各阶段镜头位置也要调整）
     *
     *   病象：除 reveal 外，**6 个预设里有 5 个是 `polar: 0, azim: 0`** ——
     *   同一个正面机位，只差 dist 的 6%。于是 S1→S2→S3 与 S4→S8→S9 之间
     *   “镜头没动”，玩家只能靠徽标和进度点判断阶段，3D 本身没有叙事。
     *
     *   修法：给每个阶段一个**可读的独立机位**：
     *     · polar 控制俯仰（正 = 从上往下看），用来读出“这是块料 / 这是成刀”；
     *     · azim 控制绕 Y 偏转，用 3/4 与侧侧来区分相邻阶段；
     *     · dist 保持 ≈1 附近，**不能推太近**：刀身细长，一推近就裁刀尖/刀柄。
     *
     *   安全边界（实测不裁切）：polar ≤ 0.14、azim ≤ 0.38。
     *   角度的语义：
     *     raw    S1 原料 —— 几乎平视，轻微侧转，看块体剖面
     *     melt   S2 熔炼 —— 略俯视，让熔融球的高光与流动读得出来
     *     billet S3 刀胚 —— 偏右 3/4，看胚料的走向
     *     forge  S4/S8/S9 定型·装配·调校 —— 偏左 3/4，看整刀轮廓
     *     edge   S5–S7 淬火·回火·开刃 —— 侧偏最大，露出刃线高光带
     *     reveal S10 鉴定 —— 拉远 + 俯视 + 侧后 3/4
     *
     *   ⚠ 这些是**可调初版**：改角度后需复核 12 刀型在 390×844 下不被裁切
     *     （探针：docs/rework/2026-10-24 的实机验证）。
     */
    return {
      /* ★★ 2026-10-24（用户：各阶段的镜头位置也要调整）
       *
       *   病象：以前 6 个预设里有 5 个是 `polar:0, azim:0` —— 同一个正面机位，
       *   只差 dist 的 6%；再加上 `viewPresetForStage` 让相邻阶段复用同一预设，
       *   于是 S1→S2、S4→S5 这类切换**镜头完全不动**，玩家只能靠徽标知道换了阶段。
       *
       *   现在：S1–S9 每阶一个**可读的独立机位**，用 azim 正负交替 + polar 微俯仰 区分：
       *     raw     S1 原料   轻微右偏，平视看块体
       *     melt    S2 熔炼   左偏 + 俯视，让熔融高光与流动可读
       *     billet  S3 刀胚   右偏最大，看清胚料走向
       *     forge   S4 定型   左偏 3/4，看整刀轮廓
       *     edge    S5 淬火   右偏 3/4，露刃线高光带
       *     temper  S6 回火   左偏 + 微俯，看回火色带
       *     grind   S7 开刃   小幅右偏且最近，聚焦刃口
       *     assemble S8 装配  接近平视，看柄与护手
       *     tune    S9 调校   右偏、稍远收尾
       *     reveal  S10 鉴定  拉远 + 俯视 + 侧后 3/4
       *
       *   ⚙ 安全边界（实测不裁切）：polar ≤ 0.16、|azim| ≤ 0.42、dist ≥ 0.92。
       *     刀身细长，**不要靠推近做特写** —— 一推近就裁刀尖/刀柄。
       *   ⚠ 可调初版：改角度后请重跑逐阶段验证（fillH 不应超过 ~95%）。
       */
      // S1 原料：接近平视，只轻微右偏，避免把块体拍成剪影
      raw:      { dist: 1.10, polar: 0.03, azim:  0.10, targetY: 0 },
      // S2 熔炼：左偏 + 略俯，让熔融球的流动高光可读
      melt:     { dist: 0.92, polar: 0.10, azim: -0.12, targetY: 0 },
      // S3 刀胚：右偏最大，看清胚料走向
      billet:   { dist: 0.94, polar: 0.05, azim:  0.24, targetY: 0 },
      // S4 定型：左偏 3/4，看整刀轮廓
      forge:    { dist: 0.98, polar: 0.04, azim: -0.18, targetY: 0 },
      // S5 淬火：右偏 3/4，露刃线高光带（距离另由 fitBox 分支给）
      edge:     { dist: 1.00, polar: 0.03, azim:  0.34, targetY: 0 },
      // S6 回火：反向左偏 + 微俯，与 S5 明确区分
      temper:   { dist: 1.00, polar: 0.06, azim: -0.26, targetY: 0 },
      // S7 开刃：小幅右偏、最近一档，聚焦刃口
      grind:    { dist: 0.96, polar: 0.02, azim:  0.18, targetY: 0 },
      // S8 装配：接近平视，看柄与护手
      assemble: { dist: 1.04, polar: 0.05, azim: -0.10, targetY: 0 },
      // S9 调校：稍远收尾
      tune:     { dist: 1.06, polar: 0.07, azim:  0.14, targetY: 0 },
      // S10 鉴定：拉远、俯视、侧后 3/4
      reveal:   { dist: 1.12, polar: 0.16, azim: -0.42, targetY: 0.00 },
    };
  }

  /**
   * 切到指定机位（带补间）。
   * @param {'forge'|'edge'|'reveal'} name
   * @param {{duration?:number}} [opts] duration=0 立即到位
   */
  setViewPreset(name, opts) {
    const P = (name && typeof name === 'object') ? name : Viewer.VIEW_PRESETS[name];
    if (!P || !this.fitDistance) return false;
    this.viewPreset = (name && typeof name === 'object') ? (name.name || 'card-focus') : name;
    // 相机在正面（-Z）还是背面（+Z）由刀型朝向决定，沿用 resetView 的判据
    const camZ = (this.baseViewAngleY > Math.PI * 0.5) ? 1.0 : -1.0;
    let r = this.fitDistance * P.dist;
    /* ★★ 2026-10-24（修：「edge 机位把刀裁了」）
     *
     *   病象：实测 S6/S7/S8 的刀占屏 fillH 一度达到 **112%** —— 刀柄跑到画外。
     *
     *   根因有两层：
     *     ① 这里原用 `bladeFitBox` —— 它只框**刃身**，不含刀柄；
     *        按刃身算出的距离，放进整刀就把柄部挤出画面。
     *     ② 系数 1.22 太紧，一点侧偏（azim）就会越界。
     *
     *   修法：改用**整刀包围盒**（`this.fitBox`）取景与对焦，
     *   系数取 1.12 —— 比 forge 机位更近（保住“刃线特写”感），
     *   但框的是整把刀，刀尖与刀柄都在画内。
     */
    const isEdge = name === 'edge';
    const blade = isEdge && (this.fitBox || this.bladeFitBox);
    if (blade) {
      const size = blade.getSize(new THREE.Vector3());
      const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      r = (Math.max(size.x / (tan * Math.max(0.2, this.camera.aspect)), size.y / tan) * 0.5 + size.z * 0.5) * 1.12;
    }
    // 球坐标 → 笛卡尔：polar 为俯仰（正 = 从上往下看），azim 为绕 Y 偏转
    const tgt = blade ? blade.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, P.targetY * this.fitDistance * 0.4, 0);
    const to = new THREE.Vector3(
      tgt.x + Math.sin(P.azim) * Math.cos(P.polar) * r,
      Math.sin(P.polar) * r + tgt.y,
      tgt.z + camZ * Math.cos(P.azim) * Math.cos(P.polar) * r
    );
    const dur = (opts && opts.duration != null) ? Math.max(0, opts.duration) : 720;
    if (dur === 0) {
      this._stopCamTween();
      this.camera.position.copy(to);
      this.controls.target.copy(tgt);
      this.controls.update();
      this.needsRender = true;
      return true;
    }
    this._startCamTween(this.camera.position.clone(), to, this.controls.target.clone(), tgt, dur);
    return true;
  }

  /** Brief inspection turn returning to the fixed stage camera. */
  inspectTurn() {
    if (this._reduceMotion || !this.viewPreset) return;
    const name = this.viewPreset;
    const P = Viewer.VIEW_PRESETS[name];
    if (!P) return;
    this.setViewPreset({ ...P, name, azim: P.azim - 0.22 }, { duration: 0 });
    this.setViewPreset(name, { duration: 380 });
  }
  _startCamTween(fromPos, toPos, fromTgt, toTgt, dur) {
    this._stopCamTween();
    const t0 = performance.now();
    // 用 setInterval + 墙钟（不用 rAF）：无头环境 rAF 被节流到数秒一次，
    // 那样补间在截图/守卫里会直接跳到终点，"相机动过"这件事无法断言。
    // 视觉上与 rAF 版一致（只按墙钟算进度），代价是后台标签页会多跑几帧。
    const self = this;
    this._camTween = setInterval(function () {
      if (self.disposed) { self._stopCamTween(); return; }
      const p = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);           // easeOutCubic
      self.camera.position.lerpVectors(fromPos, toPos, e);
      self.controls.target.lerpVectors(fromTgt, toTgt, e);
      self.controls.update();
      self.needsRender = true;
      if (p >= 1) self._stopCamTween();
    }, 16);
  }

  _stopCamTween() {
    if (this._camTween) { clearInterval(this._camTween); this._camTween = null; }
  }

  setAutoRotate(on) { this.controls.autoRotate = !!on; this.needsRender = true; }

  /* ── 着色器异步预编译 ─────────────────────────────────────────────────
   * ★ 2026-10-14（性能：点开就卡死 → 点开就能玩）
   *
   * 病根：刀身材质注入的 GLSL 极大（本工程 ~80KB，编译后片元着色器 219K 字符）。
   *   ANGLE/D3D11 首次链接这个 program 需要很久，而 **`gl.linkProgram` 本身是
   *   异步入队（实测 0ms 返回）**；把主线程真正按住的是 three 第一次
   *   `setProgram` → 构造 `WebGLUniforms` → `getProgramParameter(ACTIVE_UNIFORMS)`
   *   的那次**同步查询**。实测单次阻塞 215.8s / 132.9s（Windows 上还会触发
   *   TDR 看门狗 → CONTEXT_LOST_WEBGL → 白屏）。
   *
   * 解法：在第一次出帧**之前**用 `renderer.compileAsync()` 把 program 备好。
   *   compileAsync 内部走 `KHR_parallel_shader_compile`，轮询
   *   `COMPLETION_STATUS_KHR`（**不阻塞**），编译在 GPU 进程里做，
   *   主线程全程可响应：引导屏能转、页面能滚。
   *
   * 幂等：program 已在缓存里时 three 会直接命中，重复调用开销可忽略。
   * 无 compileAsync（旧 three / 无并行编译扩展）时退回同步 compile —— 仍只在
   * 这里做一次，避免每帧都撞上。
   *
   * @returns {Promise<boolean>} 是否走的是"异步编译"路径
   */
  precompile() {
    if (this.disposed || !this.renderer || this._contextLost) return Promise.resolve(false);
    if (this._compilePromise) return this._compilePromise;
    tl('gate:start');
    const r = this.renderer;
    const generation = K3D.material?.materialGen?.();
    this._compileFailed = false;
    this._compiling = true;
    this.pauseRender();
    let timer;
    let finish;
    const task = new Promise(resolve => { finish = resolve; });
    const cancel = () => settle(false, true);
    const settle = (ok, cancelled = false) => {
      if (this._compilePromise !== task) return; // Late completion cannot clear a newer gate.
      clearTimeout(timer);
      this._compilePromise = null;
      this._cancelCompile = null;
      this._compiling = false;
      this._compileFailed = !ok;
      if (ok && generation !== undefined) this._matGen = generation;
      tl('gate:compile:end', { ok: !!ok, cancelled });
      // Settle the public task even when a consumer callback throws.
      finish(!!ok);
      try { this.onCompileState?.(false); } catch (_) { /* observer only */ }
      if (ok && !this.disposed && !this._contextLost) this.needsRender = true;
    };
    this._compilePromise = task;
    this._cancelCompile = cancel;
    // Bound the whole operation, including a pending background prewarm.
    timer = setTimeout(() => {
      if (this._compilePromise !== task) return;
      console.warn('[viewer] precompile watchdog expired: GPU readiness NOT confirmed');
      this._bgCompile = null;
      settle(false);
    }, 15 * 60 * 1000);
    try { this.onCompileState?.(true); } catch (_) { /* observer only */ }
    Promise.resolve().then(async () => {
      if (this._bgCompile) {
        tl('gate:bg-wait:start');
        try { await this._bgCompile; } catch (_) { /* retry foreground */ }
        tl('gate:bg-wait:end');
      }
      if (this._compilePromise !== task || this.disposed || this._contextLost) return false;
      const hasExt = !!r.extensions?.has?.('KHR_parallel_shader_compile');
      tl('gate:compile:start');
      if (typeof r.compileAsync === 'function' && hasExt) {
        await r.compileAsync(this.scene, this.camera);
      } else {
        r.compile(this.scene, this.camera);
      }
      /* ★ 2026-10-20（P0 · Physical 宏漏预热 · 透射通道）
       *   有 transmission 的材质（M15–M18 晶体类）在 three 里会额外画一遍：
       *   线性离屏 target + BackSide + NoToneMapping → **另一支 program**。
       *   compileAsync 只覆盖"屏幕直出"那一支，透射那支会落到第一次 render 里
       *   同步链接（实测 physical+transmission 首帧 3373ms，正是审计里
       *   MAT06/09/15 的 2.84/3.01/6.75 秒阻塞）。
       *   这里在**同一个异步闸门内**把这一支也备好；没有透射材质时零成本。 */
      /* ★ 2026-10-21：只编**真实绘制会取用**的变体，且翻转清单取自整个场景。
         早期这里是"绑 RT 编一遍（side 不翻）+ 翻面再编一遍"：实测（MAT15 冷会话）
         多出来的那支（RT + DOUBLE_SIDED）从未被绘制取用，白付 ~1.0s。
         规则集中在 gpuPreparation.compileTransmissionVariants，与两条预热路径共用。 */
      await compileTransmissionVariants(r, this.scene,
        { doubleSide: THREE.DoubleSide, backSide: THREE.BackSide },
        () => (typeof r.compileAsync === 'function' && hasExt
          ? r.compileAsync(this.scene, this.camera)
          : r.compile(this.scene, this.camera)));
      return true;
    }).then(ok => settle(ok), error => {
      if (this._compilePromise !== task) return;
      console.warn('[viewer] 预编译失败:', error && error.message);
      settle(false);
    });
    return task;
  }

  _renderVisible() {
    return !this._restoring && renderLoopAllowed(!!global.document?.hidden, this._viewportVisible)
      && renderSurfaceVisible(this.renderer?.domElement, global);
  }

  _syncRenderVisibility() {
    if (this.disposed) return;
    if (this._renderVisible()) this.resumeRender();
    else this.pauseRender();
  }

  /** 停掉渲染循环（不销毁任何东西，resumeRender() 可原样接回）。
   *  幂等：重复调用无副作用。 */
  pauseRender() {
    if (!this._loopOn) return;
    this._loopOn = false;
    try { this.renderer.setAnimationLoop(null); } catch (e) { /* 已销毁 */ }
  }

  /** 恢复渲染循环。幂等；已销毁的实例不再复活。 */
  resumeRender() {
    if (this._loopOn || this.disposed || this._contextLost || this._compiling
      || this._compilePromise || this._compileFailed || !this._renderVisible()) return;
    this._loopOn = true;
    this.needsRender = true;
    try { this.renderer.setAnimationLoop(() => this._render()); } catch (e) { /* 已销毁 */ }
  }

  /** 设定"减弱动效"（★ 2026-10-14 由 src/render/index.js 门面转发设置项）。
   *  只改这一个标志位：相机补间、模型入场收放、刀身呼吸特效、逐帧是否推进
   *  全都读它，因此一处生效、全链路一致。改完请求一帧让画面立刻落到新状态。 */
  setReduceMotion(flag) {
    const v = !!flag;
    if (v === this._reduceMotion) return v;
    this._reduceMotion = v;
    this.needsRender = true;
    if (this._effect && K3D.bladeEffects) K3D.bladeEffects.update(this._effect, v ? 0 : performance.now() * 0.001);
    return v;
  }
  /* ── 刀身特效（S4 十二进阶卡 K13–K24）────────────────────────────────
   *  ★ 2026-10-10 重做。旧「环绕光效」是刀体外部的两圈环带（和刀型无关，
   *    换模型长得一样），已整条移除。现在的特效由 render/bladeEffects.js
   *    克隆刀体几何、沿法线外扩一点点生成外壳，因此**轮廓就是这把刀的轮廓**。
   *
   *  外壳挂在刀模型内部的网格节点上（复制该网格的局部矩阵），
   *  所以它跟着刀一起旋转/复位，不需要额外同步；材质是独立的
   *  ShaderMaterial，不写任何 bladeSkin hook，不会盖掉前序阶段的纹理与工艺。
   */
  setBladeEffect(spec) {
    this.clearBladeEffect();
    if (!K3D.bladeEffects || !this.root) return false;
    const h = K3D.bladeEffects.build(spec, this.root);
    if (!h) return false;
    this._effect = h;
    this.needsRender = true;
    return true;
  }

  clearBladeEffect() {
    if (!this._effect) return false;
    if (K3D.bladeEffects) K3D.bladeEffects.dispose(this._effect);
    this._effect = null;
    this.needsRender = true;
    return true;
  }
  /* ★★ 2026-10-08 已删除 `setExposure(v)`（零调用死方法）。
   *  诊断报告 P2「无用导出」复核结果：全项目对 `setExposure` 只有**本文件这一处定义**，
   *  没有任何调用点（`toneMappingExposure` 的另一个写入点是 :80 的初始化 `= 0.9`，
   *  那是真源，不经过这个方法）。它唯一的作用被留成一句注释体量：
   *  曝光值固定 0.9；若将来要做"阶段亮度演出"，请直接改 :80 并在实机上验证，
   *  不要复活一个从未接线的 setter —— 那只会让下一个读代码的人以为曝光是可调的。 */

  /** 渲染一帧并导出 dataURL（用于刀型卡片缩略图）。 */
  snapshot(w = 160, h = 120) {
    /* ★ 2026-10-14：缩略图是**同步 API**（调用方要立刻拿到 dataURL），这里允许一次
       同步编译（只发生在开发工具/刀型卡片缩略图路径）。真正的渲染循环绝不走这条路 ——
       见 _render 里的材质代数闸门，它一律先 compileAsync 再出帧。 */
    if (K3D.material && K3D.material.materialGen) {
      const gen = K3D.material.materialGen();
      if (gen !== this._matGen) {
        try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
        this._matGen = gen;
      }
    }
    const oldSize = new THREE.Vector2();
    this.renderer.getSize(oldSize);
    const oldPR = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/webp', 0.8);
    this.renderer.setPixelRatio(oldPR);
    this.renderer.setSize(oldSize.x, oldSize.y, false);
    this.camera.aspect = oldSize.x / Math.max(1, oldSize.y);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
    return url;
  }

  /* ★★ 2026-10-06 问题清单 #3：清模型时**不 dispose** 几何与材质。
   *
   * 为什么不能在这里 dispose（这是本文件最大的一个坑）：
   *   root 来自 bladeViewer 的 `loaded` 缓存（loadKnife 命中缓存直接返回同一对象），
   *   而 `pivot.remove(root)` **不会**把它从缓存里摘掉。旧实现在这里
   *   `_disposeObject(root)` 把 geometry/material 全释放了，缓存却留着这份
   *   "已 dispose 的对象"。于是玩家切回同一把刀时：
   *     loadKnife 命中缓存 → 拿到已 dispose 的 geometry/material
   *     → three 重新上传 GPU 资源（能跑，但每次都重来一遍）
   *     → 材质上的 hook 状态、needsUpdate 时序都可能与首帧不一致
   *   表现就是"锻造一轮后模型开始不稳定"—— 不报错，但越玩越不对。
   *
   * 现在的策略：**只从场景树上摘下来，资源所有权留给 bladeViewer 缓存**。
   *   资源释放推迟到引擎真正卸载时（引擎是全局单例，本就随页面生命周期存活），
   *   这与 router.js「3D 舞台全局唯一、不销毁重建」的硬约束也是一致的。
   *   如需显式释放，引擎侧应提供 `disposeKnife(id)`，而不是在这里误伤缓存。
   */
  _clearModel() {
    this._stopModelTween();
    if (this.root) {
      const baseScale = this.root.userData && this.root.userData.__viewerBaseScale;
      if (baseScale) this.root.scale.fromArray(baseScale);
      this.pivot.remove(this.root);
      this.root = null;
    }
    this.fitBox = null;   // 取景盒随模型一起失效，避免 resize() 拿旧盒重算
    this.modelSize = null;
  }

  _disposeObject(obj) {
    obj.traverse((c) => {
      if (c.isMesh) {
        c.geometry && c.geometry.dispose();
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => m && m.dispose());
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._cancelRestore?.();
    this._cancelCompile?.();
    this._disposeInput?.();
    this._disposeInput = null;
    this._loopOn = false;
    this._stopModelTween();
    this._stopCamTween();      // ★ 补间定时器必须停，否则回调会摸已销毁的 camera/controls
    this.renderer.setAnimationLoop(null);
    if (this._onVisibility) { document.removeEventListener('visibilitychange', this._onVisibility); this._onVisibility = null; }
    if (this._viewportObserver) { this._viewportObserver.disconnect(); this._viewportObserver = null; }
    if (this._onViewportChange) {
      global.removeEventListener('scroll', this._onViewportChange, true);
      global.removeEventListener('resize', this._onViewportChange);
      this._onViewportChange = null;
    }
    this.resizeObserver && this.resizeObserver.disconnect();
    /* ★ 与 _clearModel 的区别：这里是真的要销毁整个 viewer（渲染器/画布都扔），
     *   所以模型资源在这一刻**必须**显式释放，否则 GPU 内存永久泄漏。
     *   _clearModel 不释放是因为引擎缓存还要复用同一个 root。 */
    if (this.root) {
      this._disposeObject(this.root);
      this.pivot.remove(this.root);
      this.root = null;
    }
    this.fitBox = null;
    this.modelSize = null;
    /* 摄影棚 PMREM 是当前 WebGLRenderer 私有的 RT。释放本 renderer 的贴图，
       不能把主舞台的贴图一起 dispose（否则其它藏刀/首页也会变黑）。 */
    invalidateCaptureTargets(this.renderer);
    try { K3D.rLedger?.releaseRenderer?.(this.renderer); } catch (_) { /* diagnostics */ }
    const studioReleased = releaseStudioEnv(this.renderer);
    if (!studioReleased && this.envMap) this.envMap.dispose();
    this.controls && this.controls.dispose();
    this.renderer.dispose();
    if (this._onContextLost) this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
    if (this._onContextRestored) this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.renderer.domElement.remove();
  }
}

K3D.Viewer = Viewer;

export { Viewer };
