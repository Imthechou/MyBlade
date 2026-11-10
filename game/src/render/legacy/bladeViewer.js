/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/render/bladeViewer.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
// ★ 2026-10-14：安装「编译期特化」（刀柄 kind 的 24 路分派只留当前那一支）。
import './skin/shader/specialize.js';
/* ★ 2026-10-20（P1）：固定程序族（v2）。与 legacy 共用配方与 bladeMask，
   只替换刀身 hook 的绑定器；后端开关见下方 bladeBackend()。 */
import * as V2Blade from '../v2/programFamilies.js';
import { acquireHandleLook } from '../v2/handleLookBake.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});
  const THREE = global.THREE;
  const mat = K3D.material;

  const scriptCache = new Map();

  /* ★ 2026-10-20（P0 · Physical 宏漏预热）：clearcoat / iridescence 的恒定下限。
     与 material.js#toPhysicalMaterial 的 FEATURE_FLOOR 同一个量级 —— 让
     USE_CLEARCOAT / USE_IRIDESCENCE 永远是"开"，不再随材质表在 0 ↔ 正值之间翻转。
     1e-4 低于 8bit 输出的 1/255 量化步长，逐像素无差异。 */
  const K3D_FEATURE_FLOOR = 1e-4;

  /* ★★ 2026-10-20（P1 · 固定程序族原型）
   *
   *   后端开关：K3D.renderBackend = 'v2'（固定程序族）| 'legacy'（旧按卡特化）。
   *   由门面按 `?backend=` / localStorage 写入；**两条路径共用**：
   *     · 同一个 composeBladeSkin 配方（实机与出图同一真源）
   *     · 同一套 bladeMask（S8 柄）、同一份烘焙图集、同一份 Wear/S6/S7/S9 数学
   *   所以任何一张卡只要能被 legacy 画出来，v2 就能画出来；回退只换绑定器，不碰存档。
   *
   *   ⚠ 为什么 refresh 要按材质问"归谁"：旧路径在柄的 motif family 并集变化时会
   *     重建刀身 hook（同步特化范围）。v2 的签名与 family 无关，若那次 refresh 走
   *     legacy，就会把材质**换回旧 spec**（两套着色器混用 + 多一次链接）。
   */
  const bladeBackend = () => (K3D.renderBackend === 'legacy' ? 'legacy' : 'v2');

  function applyBladeSkinHook(material, pack, frame, opts) {
    if (bladeBackend() === 'legacy') {
      return K3D.bladeSkinShader.apply(material, pack, frame, opts);
    }
    return V2Blade.apply(material, pack, frame, opts);
  }

  function refreshBladeSkinHook(material) {
    if (V2Blade.owns(material)) return V2Blade.refresh(material);
    return K3D.bladeSkinShader.refresh(material);
  }

  function loadScriptOnce(src) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = () => resolve(true);
      el.onerror = () => reject(new Error('inline bundle 加载失败：' + src));
      document.head.appendChild(el);
    });
    scriptCache.set(src, p);
    return p;
  }

  function isFileProtocol() {
    return global.location && global.location.protocol === 'file:';
  }

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /* ---------------------------------------------------------------- 引擎 */

  class BladeViewer {
    constructor() {
      this.knives = [];                 // manifest 条目
      this.loaded = new Map();          // id -> {root, materials, meshData, bladeFrame, baseMap}
      this.listeners = { status: [], error: [] };
      this.loader = new THREE.GLTFLoader();
      this.envMap = null;
      // 分层内联包：已加载的 tier（core 恒为 true，knives 按需）
      this.tiers = { core: false, knives: false, hdr: false };
      this._knivesPromise = null;       //  knives 包的加载 promise（防并发重复注入）
      /* ★ 2026-10-09 并发去重 + 耗时观测（S4 切模型优化）：
       *   _loading     同 id 的**进行中**加载 —— 预热与玩家点击撞车时共享同一次解析
       *   loadTimings  最近 40 次加载耗时；?perf=1 时逐条打到 console
       */
      this._loading = new Map();
      this.loadTimings = [];
      this.perfLog = false;
    }

    onStatus(fn) { this.listeners.status.push(fn); }
    onError(fn) { this.listeners.error.push(fn); }
    _status(msg) { this.listeners.status.forEach((f) => f(msg)); }
    _error(msg) { this.listeners.error.forEach((f) => f(msg)); }

    /**
     * 加载模型清单：**只加载首屏 core 包**（3 过程模型 + 1 把刀，3.79MB）。
     *
     * ★ 2026-10-03 分层：改之前这里加载唯一的 14.61MB 单包，首屏必须整包
     *   解析完才继续。而其余 14 把刀要等首屏出画面后才可能用到 →
     *   拆到 js/bundle.knives.js 延后注入（见 ensureKnives / preloadKnives）。
     *
     * ★ http 模式完全不变（直接 fetch manifest.json + 原始 .glb，本来就没有内联包）。
     * ★ build.py --single 单包模式：core 里就装了一切，ensureKnives 直接跳过。
     */
    async init() {
      // ?perf=1：把模型加载耗时打到 console（用来验证预热到底有没有命中）
      this.perfLog = !!(global.location && /[?&]perf=1/.test(global.location.search || ''));
      /* 渲染循环（viewer.js）也要同一个开关才能记录长帧 —— 发布到全局，
       * 避免两处各自解析 URL 而行为不一致。 */
      global.K3D_PERF = this.perfLog;
      if (isFileProtocol()) {
        try {
          await loadScriptOnce('js/bundle.inline.js');
          this.tiers.core = true;
        } catch (e) { /* 走 fetch 兜底 */ }
      }
      const inline = global.K3D_INLINE;
      if (inline && inline.manifest) {
        this.knives = inline.manifest.knives || [];
        this.inline = inline;
      } else {
        const res = await fetch('assets/models/manifest.json');
        const data = await res.json();
        this.knives = data.knives || [];
      }
      this._status({ stage: 'manifest', count: this.knives.length });
      return this.knives;
    }

    /**
     * 确保 knives 分包已注入（其余 14 把刀）。
     *
     * 幂等 + 并发安全：多次调用共享同一个 promise。
     * ⚠ 失败不抛 —— 后续 _loadGlb 会落回 loadAsync，http 下正常、
     *   file:// 下会失败（XHR 被拦），但**不能因为延后包失败就让整个引擎挂掉**。
     *
     * @param {boolean} warm  true 时注入后立刻预解析（base64→ArrayBuffer 预热）
     * @returns {Promise<boolean>} 是否成功注入
     */
    ensureKnives() {
      if (this.tiers.knives) return Promise.resolve(true);
      if (!isFileProtocol()) { this.tiers.knives = true; return Promise.resolve(true); }
      if (this._knivesPromise) return this._knivesPromise;
      this._knivesPromise = loadScriptOnce('js/bundle.knives.js')
        .then(() => {
          // build.py --single 模式下不存在这个分包 → 视为「已全部在 core 里」
          const kn = global.K3D_INLINE_KNIVES;
          this.tiers.knives = true;
          if (kn && kn.models) this.knivesTier = kn;
          this._status({ stage: 'knives-ready' });
          return true;
        })
        .catch((e) => {
          // 单包模式 / 分包缺失：把 core 视为全集，_loadGlb 仍能在 core 里查到
          this.tiers.knives = true;
          this._status({ stage: 'knives-skipped', reason: e && e.message });
          return false;
        });
      return this._knivesPromise;
    }

    /**
     * 预热：把某把刀的 GLB 提前 parse 进 loaded 缓存（玩家选到时零等待）。
     *
     * ★ 必须 silent —— 预热没有对应的 switchModel 去清状态文案，
     *   不静默的话状态栏会永久卡在「模型加载中…」（见 loadKnife 的 opts.silent）。
     */
    async warmup(id) {
      if (this.loaded.has(id)) return true;
      try { await this.loadKnife(id, { silent: true }); return true; } catch (e) { return false; }
    }

    /**
     * 取一个模型的 base64 字符串（跨 core / knives 两层查找）。
     *
     * ★ 2026-10-03 内容 hash 寻址：
     *   build.py 发现 assets/models/ 与 assets/oth_model/ 下的 3 个过程模型
     *   **内容完全相同**（sha1 一致），旧版各 base64 存一份 → 白占 3MB。
     *   现在 models 以 'h:<sha1>' 为键只存一份，aliases 把 url 映射到 hash 键。
     *
     * ★ 分包后 alias **可能指向另一个包的键**：
     *   knives 包里 `assets/models/ore_small.glb` 的 alias 指向 core 里的键
     *   （base64 只在 core 存一份，跨包不重复存储）。
     *   所以拿到 key 后若**本包**没有，要再去另一包找 —— 否则这三个 url 会查不到，
     *   落回 loadAsync → file:// 下 XHR 被拦 → S1/S2/S3 卡在"模型加载中…"。
     *
     * 查找顺序（core → knives，**core 必须在前**：它是首屏已加载的那层）：
     *   ① aliases[url] → key → 该 key 的 models 条目（可能在本包或另一包）
     *   ② models[url]（旧格式直键兼容）
     *   ③ null → 落回 loadAsync
     */
    _inlineB64(url) {
      const layers = [
        { pack: this.inline, other: this.knivesTier },
        { pack: this.knivesTier, other: this.inline },
      ];
      for (const L of layers) {
        const inl = L.pack;
        if (!inl || !inl.models) continue;
        const key = (inl.aliases && inl.aliases[url]) || null;
        if (key) {
          const hit = inl.models[key];
          if (hit) return hit;
          // ★ 跨包：alias 指向的键可能住在另一包里
          if (L.other && L.other.models && L.other.models[key]) return L.other.models[key];
        }
        const direct = inl.models[url];
        if (direct) return direct;
      }
      return null;
    }

    async _loadGlb(url) {
      let b64 = this._inlineB64(url);
      // ★ 不在 core 里 → 补注入 knives 分包再查一次。
      //   这是分层加载的关键：玩家第一把选到非 core 刀型时的兜底。
      if (!b64 && !this.tiers.knives) {
        await this.ensureKnives();
        b64 = this._inlineB64(url);
      }
      if (b64) {
        const buf = base64ToBuffer(b64);
        return await new Promise((resolve, reject) => this.loader.parse(buf, '', resolve, reject));
      }
      return await this.loader.loadAsync(url);
    }

    /**
     * 加载一把刀：解析几何、快照原版材质、构建区域属性与刀身坐标系。
     *
     * @param {string} id
     * @param {object} [opts]
     * @param {boolean} [opts.silent=false] 静默加载：**不发 status 事件**。
     *   ★ 2026-10-03 新增。预热（warmup）必须传 true。
     *   原因：每次进本函数都会发 `{stage:'knife', message:'模型加载中…'}`，
     *   而清空状态文案的责任在调用方（main.js switchModel 里的 setStatus('')）。
     *   预热是**后台**加载，没有对应的 switchModel 去清 →
     *   状态栏被写脏后**永久卡在「模型加载中…」**。
     *   实测症状：移动端布局守卫 5 档视口全部报
     *   「舞台无模型像素 [status="模型加载中…"]」—— 而画布其实是有图的，
     *   玩家看到的是一条永不消失的加载提示。**静默失效，且不报错。**
     */
    /** Resolve canonical full-quality model assets regardless of screen or GPU tier. */
    _modelSource(entry) {
      // Single high-quality mesh/texture source across desktop and mobile.
      // Runtime quality controls still govern rendering, not duplicate GLB downloads.
      const url = String(entry.file || '');
      return { url, profile: 'full', key: entry.id + '@full' };
    }

    async loadKnife(id, opts) {
      const silent = !!(opts && opts.silent);
      const entry = this.knives.find((k) => k.id === id);
      if (!entry) throw new Error('未找到刀型：' + id);
      const src = this._modelSource(entry);
      const cached = this.loaded.get(id);
      if (cached) {
        /* 档位一致才算命中（见 _modelSource 的注释：缓存键少一维会返回另一档的资源）。 */
        if (cached.profile === src.profile) {
          if (this.perfLog && global.console && global.console.info) {
            global.console.info('[perf] loadKnife ' + id + ' cached');
          }
          return cached;
        }
        this.loaded.delete(id);
        if (global.console && global.console.warn) {
          global.console.warn('[bladeViewer] 资源档位变化 ' + cached.profile + ' → ' + src.profile + '，重新解析 ' + id);
        }
      }
      /* ★ 2026-10-09 并发去重：预热（warmup）与玩家点击（switchModel）经常同时要同一把刀。
       *   旧实现只查 this.loaded —— 而它**要等解析完成才写入** → 两边各解析一遍同一个 GLB，
       *   白白多占一份主线程（正好是 S4 连点三张卡、最卡的那一刻）。
       *   现在同 id 共享同一次解析；status 事件由**先到者**决定发不发。
       *   ⚠ 去重键也带档位（见 _modelSource）：否则档位切换时会把旧档的解析
       *     共享给新档的请求。 */
      if (this._loading.has(src.key)) return this._loading.get(src.key);
      const p = this._loadKnifeOnce(id, entry, silent, src);
      this._loading.set(src.key, p);
      try {
        return await p;
      } finally {
        this._loading.delete(src.key);
      }
    }

    /** loadKnife 的实际加载体（已由 loadKnife 保证「同 id + 同档位只跑一次」）。 */
    async _loadKnifeOnce(id, entry, silent, source) {
      const t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      if (!silent) this._status({ stage: 'knife', id, message: '模型加载中…' });
      const src = source || this._modelSource(entry);
      const profile = src.profile;
      const url = src.url;
      // All process stages use the project's authored GLBs and PBR textures.
      const gltf = await this._loadGlb(url);
      const root = gltf.scene;
      const materials = [];
      root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        // ★ 必须 `return p`：本函数的结果会被外层赋值回 child.material。
        //   旧实现只靠副作用 `child.material = p` 改 child，返回 undefined，
        //   外层 `child.material = convert(...)` 立刻用 undefined 覆盖掉 → mesh.material 变 undefined
        //   → three 的 projectObject() 读 .visible 抛 TypeError → 渲染循环每帧崩 → 全屏黑。
        const convert = (m) => {
          if (!m) return m;
          const p = mat.toPhysicalMaterial(m);
          if (this.envMap) p.envMap = this.envMap;
          p.userData.orig = {
            map: p.map, metalnessMap: p.metalnessMap, roughnessMap: p.roughnessMap,
            normalMap: p.normalMap,
            normalScale: p.normalScale ? p.normalScale.clone() : new THREE.Vector2(1, 1),
            roughness: p.roughness, metalness: p.metalness,
            envMapIntensity: p.envMapIntensity,
            color: p.color.clone(),
          };
          materials.push(p);
          return p;
        };
        child.material = Array.isArray(child.material)
          ? child.material.map(convert)
          : convert(child.material);
      });

      const meshChild = (() => {
        let found = null;
        root.traverse((c) => { if (!found && c.isMesh) found = c; });
        return found;
      })();

      const geo = meshChild.geometry;
      const idx = geo.index ? geo.index.array : null;
      const meshData = {
        positions: geo.attributes.position.array,
        normals: geo.attributes.normal ? geo.attributes.normal.array : null,
        uvs: geo.attributes.uv ? geo.attributes.uv.array : null,
        index: idx,
      };
      if (!meshData.index) {
        const n = meshData.positions.length / 3;
        const arr = new Uint32Array(n);
        for (let i = 0; i < n; i++) arr[i] = i;
        meshData.index = arr;
      }

      // 三区域顶点属性 aRegion（vec3 One-Hot：r=刀身 / g=护手+尾部 / b=刀柄）
      // bladeSkinShader 依赖它做区域判定，必须先于 applyBladeSkin 构建。
      const regionCoverage = this._buildRegionAttribute(geo, id);

      // 刀身局部坐标系（程序化纹理的采样域）
      const bladeFrame = this._buildBladeFrame(geo);

      // 模型自带基础色贴图（Wear 露底材用）
      let baseMap = null;
      for (const m of materials) {
        if (!baseMap && m.userData.orig && m.userData.orig.map) baseMap = m.userData.orig.map;
      }

      const info = {
        id, entry, root, materials, meshData,
        bladeFrame, baseMap, regionCoverage,
        /* Shared full-quality GLB cache identity. */
        profile,
        url,
      };
      this.loaded.set(id, info);
      this._status({ stage: 'knife-ready', id });
      this._recordTiming(id, t0);
      return info;
    }

    /** 记录一次冷加载耗时；?perf=1 时同时打到 console。 */
    _recordTiming(id, t0) {
      const end = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      const ms = Math.round(end - t0);
      this.loadTimings.push({ id, ms });
      if (this.loadTimings.length > 40) this.loadTimings.shift();
      if (this.perfLog && global.console && global.console.info) {
        global.console.info('[perf] loadKnife ' + id + ' ' + ms + 'ms');
      }
    }

    /** 刀身局部坐标系：轴 = 包围盒三边按长度排序（长轴/次长轴/第三轴），原点 = 包围盒 min。
     *  返回 { basis(Matrix3), origin, span } —— 与 Knife3D 完全一致（shader 侧依赖）。 */
    _buildBladeFrame(geo) {
      const pos = geo.attributes.position.array;
      const n = pos.length / 3;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        for (let d = 0; d < 3; d++) {
          const v = pos[i * 3 + d];
          if (v < mn[d]) mn[d] = v;
          if (v > mx[d]) mx[d] = v;
        }
      }
      const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
      const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const r = [0, 0, 0];
        r[order[i]] = 1;
        rows.push(r);
      }
      const basis = new THREE.Matrix3().set(
        rows[0][0], rows[0][1], rows[0][2],
        rows[1][0], rows[1][1], rows[1][2],
        rows[2][0], rows[2][1], rows[2][2],
      );
      // ★ 2026-10-12（S3 v12）刀身区域在「刀身局部坐标」里的实际范围。
      //   纹理投影按**刀身**（而不是整把刀包围盒）归一化 —— 图案才会完整铺在刀面上，
      //   而不是把 1/3 的图铺到刀柄上、刀面只看到一小条。
      //   依赖 aRegion（同一函数链里先于本函数构建）与 axisOrder（长轴/次长轴）。
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      const reg = geo.attributes.aRegion;
      if (reg) {
        const spanX = size[order[0]], spanY = size[order[1]];
        for (let i = 0; i < n; i++) {
          if (reg.getX(i) <= 0.5) continue;                 // 只统计刀身区域顶点
          const u = (pos[i * 3 + order[0]] - mn[order[0]]) / spanX;
          const v = (pos[i * 3 + order[1]] - mn[order[1]]) / spanY;
          if (u < uMin) uMin = u;
          if (u > uMax) uMax = u;
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      }
      if (!(uMax > uMin) || !(vMax > vMin)) { uMin = 0; uMax = 1; vMin = 0; vMax = 1; }
      return {
        basis,
        origin: new THREE.Vector3(mn[0], mn[1], mn[2]),
        span: new THREE.Vector3(size[order[0]], size[order[1]], size[order[2]]),
        axisOrder: order,
        bladeUV: { uMin, uMax, vMin, vMax },
      };
    }

    /**
     * 生成三区域顶点属性 aRegion（vec3 One-Hot：r=刀身 / g=护手+尾部 / b=刀柄）
     * 与 aBladeT（沿长轴归一化位置）/ aEdge（几何边缘因子）。
     *
     * 完整移植自 Knife3D engine.js（纯位置分区 + 单位分解 + 线外浅铺），保证
     * 与 regions.js 的边界标定一致。orm 参数已废弃（纯位置分区，不依赖金属度）。
     */
    _buildRegionAttribute(geo, knifeId) {
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      if (geo.attributes.aRegion) geo.deleteAttribute('aRegion');
      if (geo.attributes.aHandleLocal) geo.deleteAttribute('aHandleLocal');
      const pos = geo.attributes.position.array;
      const n = pos.length / 3;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        for (let d = 0; d < 3; d++) {
          const v = pos[i * 3 + d];
          if (v < mn[d]) mn[d] = v;
          if (v > mx[d]) mx[d] = v;
        }
      }
      const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
      const ax = size[0] >= size[1] && size[0] >= size[2] ? 0 : (size[1] >= size[2] ? 1 : 2);
      const span = Math.max(size[ax], 1e-6);
      const axSorted = [0, 1, 2].sort((a, b) => size[b] - size[a]);
      const ax2 = axSorted[1];
      const mn2 = mn[ax2], mx2 = mx[ax2], span2 = Math.max(mx2 - mn2, 1e-6);
      const arr = new Float32Array(n * 3);
      const tArr = new Float32Array(n);
      const handleLocal = new Float32Array(n * 3);
      const weights = new Float32Array(n);
      const tValues = new Float32Array(n);
      const coverage = { vertices: n, blade: 0, guard: 0, handle: 0 };
      // First pass: compute region weights and the actual handle-only cross-section bounds.
      // This makes the procedural grain independent of the full knife length and UV islands.
      let hm2 = Infinity, hM2 = -Infinity, hm3 = Infinity, hM3 = -Infinity;
      const ax3 = axSorted[2];
      for (let i = 0; i < n; i++) {
        const tAx = (pos[i * 3 + ax] - mn[ax]) / span;
        const tAx2 = (pos[i * 3 + ax2] - mn2) / span2;
        const w = K3D.regions.weightsAt(knifeId, tAx, tAx2);
        tArr[i] = w.t;
        tValues[i] = w.t;
        weights[i] = w.handle;
        arr[i * 3] = w.blade;
        arr[i * 3 + 1] = w.guard;
        arr[i * 3 + 2] = w.handle;
        coverage.blade += w.blade;
        coverage.guard += w.guard;
        coverage.handle += w.handle;
        if (w.handle > 0.28) {
          const p2 = pos[i * 3 + ax2], p3 = pos[i * 3 + ax3];
          if (p2 < hm2) hm2 = p2; if (p2 > hM2) hM2 = p2;
          if (p3 < hm3) hm3 = p3; if (p3 > hM3) hM3 = p3;
        }
      }
      coverage.blade /= n;
      coverage.guard /= n;
      coverage.handle /= n;
      if (!(hM2 > hm2 + 1e-6)) { hm2 = mn[ax2]; hM2 = mx[ax2]; }
      if (!(hM3 > hm3 + 1e-6)) { hm3 = mn[ax3]; hM3 = mx[ax3]; }
      const hSpan2 = Math.max(hM2 - hm2, 1e-6), hSpan3 = Math.max(hM3 - hm3, 1e-6);
      const rg = K3D.regions.of(knifeId);
      const handleLength = Math.max(Number(rg.guardStart) || 0.30, 0.08);
      // Second pass: local xyz = (along-handle, handle width, handle thickness), all 0..1.
      // Non-handle vertices get harmless clamped coordinates; only the feathered handle mask consumes them.
      for (let i = 0; i < n; i++) {
        const p = i * 3;
        handleLocal[p] = Math.max(0, Math.min(1, tValues[i] / handleLength));
        handleLocal[p + 1] = Math.max(0, Math.min(1, (pos[p + ax2] - hm2) / hSpan2));
        handleLocal[p + 2] = Math.max(0, Math.min(1, (pos[p + ax3] - hm3) / hSpan3));
      }
      geo.setAttribute('aRegion', new THREE.BufferAttribute(arr, 3));
      geo.setAttribute('aHandleLocal', new THREE.BufferAttribute(handleLocal, 3));
      geo.setAttribute('aBladeT', new THREE.BufferAttribute(tArr, 1));
      this._buildEdgeAttribute(geo);
      this._buildBladeEdgeAttribute(geo, knifeId, { ax, ax2, ax3: axSorted[2], mn, size }, coverage);
      return coverage;
    }

    /**
     * ★ 2026-10-07 新增：真正的「刃口掩码」 aBladeEdge（0..1）。
     *
     * 解决的根因（tools/measure_edge.js 实测）：
     *   S5 淬火刃口带 / S7 刃线辉光此前用 `min(p.y, 1-p.y)` 猜刃口位置 ——
     *   但 vBladeLocal.y 是**次长轴**（12 把刀里 11 把 = 刀身厚度方向，占比仅 14%~17%），
     *   对厚度取"两端"＝跨过刀身厚度打一条竖带，和刃线完全是两回事。
     *   实测该公式的刃口召回率：balisong 0.0% / gladius 0.0% / straight 0.0% /
     *   tangdao 0.0% / bayonet 4.1% / kris 3.0% / machete 28.0%（最好的一把）。
     *   → 玩家看到的是"刀面上一条与刃无关的带子"，而不是"沿着刀刃的一条带"。
     *
     * 判据（全部来自几何本身，不看朝向、不挑模型）：
     *   ① 沿长轴切 NT 片，每片内以 z 中位数当厚度中面；
     *   ② 每片内按横截宽度 y 分 NB 箱，取每箱最小半厚 = 该处轮廓宽度 w(y)；
     *   ③ 横截面轮廓宽度剖面两端谁先趋零，谁就是刃口侧；
     *   ④ 逐片投票（权重=两端相对差距）汇总成"整刀只有一侧刃"这个更强先验。
     *
     * ⚠ 走过的弯路（别重蹈，详见 tools/lib/geometry.js 同函数的注释）：
     *   · "到包围盒面的距离"当厚度 → 刀脊与刃口同值，两侧一起亮；
     *   · "到中面的距离"再取每格最小半厚 → 仍错，因为**刀脊和刃口都很薄**
     *     （实测 knife_straight 两端 25% 的半厚 min 分别是 0.0003 / 0.0000）；
     *   · 逐片各自定刃侧 → 逐片差距常只有 0.0002 vs 0.0005 量级，噪声让刃侧左右跳，
     *     掩码铺满两侧（主导侧占比只有 18%~50%）。投票后 9/12 把一致率 71%~91%。
     *
     * 验收指标（改动后必须重跑 tools/measure_edge.js）：
     *   每桶 y 中位离散度 σ = 0.004~0.025（越小越像"一条线"）、连续覆盖 9~11/20 片。
     *   tools/lib/geometry.js 里有逐行同构的实现，两边必须同步。
     */
    _buildBladeEdgeAttribute(geo, knifeId, frame, coverage) {
      const zero = () => {
        if (coverage) coverage.bladeEdge = 0;
        geo.setAttribute('aBladeEdge', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
      };
      if (!geo || !geo.attributes || !geo.attributes.position || !geo.attributes.aEdge
          || !geo.index || !frame || !K3D.regions) { zero(); return; }
      // 过程模型（矿石/熔料球/刀胚）没有刃口：全 0，让 S5/S7 在这三块题料上自然不出现刃带。
      if (K3D.regions.isProcess && K3D.regions.isProcess(knifeId)) { zero(); return; }
      const pos = geo.attributes.position.array;
      const edge = geo.attributes.aEdge.array;
      const cntV = geo.attributes.position.count;
      const { ax, ax2, ax3, mn, size } = frame;
      const spanAx = Math.max(size[ax], 1e-6);
      const span2 = Math.max(size[ax2], 1e-6);
      const NT = 16;                                  // 沿长轴切片数
      const NB = 24;                                  // 每片内横截宽度分箱数

      const vy = new Float64Array(cntV), vh = new Float64Array(cntV), vt = new Float64Array(cntV);
      const ti = new Int32Array(cntV);
      for (let i = 0; i < cntV; i++) {
        vt[i] = (pos[i * 3 + ax] - mn[ax]) / spanAx;
        vy[i] = (pos[i * 3 + ax2] - mn[ax2]) / span2;
        vh[i] = pos[i * 3 + ax3] - mn[ax3];
        ti[i] = Math.min(NT - 1, Math.max(0, Math.floor(vt[i] * NT)));
      }
      // 每片的厚度中面（片内 z 中位数）
      const zMid = new Float64Array(NT).fill(NaN);
      for (let s = 0; s < NT; s++) {
        const a = [];
        for (let i = 0; i < cntV; i++) if (ti[i] === s) a.push(vh[i]);
        if (!a.length) continue;
        a.sort((p, q) => p - q);
        zMid[s] = a[Math.floor(a.length / 2)];
      }
      // 每 (片, y箱) 的最小半厚 = 该处轮廓宽度
      const prof = new Float64Array(NT * NB).fill(Infinity);
      for (let i = 0; i < cntV; i++) {
        const s = ti[i];
        if (!Number.isFinite(zMid[s])) continue;
        const b = Math.min(NB - 1, Math.max(0, Math.floor(vy[i] * NB)));
        const d = Math.abs(vh[i] - zMid[s]);
        const c = s * NB + b;
        if (d < prof[c]) prof[c] = d;
      }
      // 逐片判刃侧（带置信度）→ 整刀投票
      const votes = [0, 0];                           // [低y票, 高y票]
      const blunt = new Float64Array(NT);             // 该片刀脊侧宽度（尺度基准）
      const yLo = new Float64Array(NT), yHi = new Float64Array(NT);
      const okS = new Uint8Array(NT);
      for (let s = 0; s < NT; s++) {
        const present = [];
        for (let b = 0; b < NB; b++) if (Number.isFinite(prof[s * NB + b])) present.push(b);
        if (present.length < 4) continue;
        const vals = present.map((b) => prof[s * NB + b]);
        const k = Math.min(3, present.length);
        const loEnd = vals.slice(0, k).reduce((a, b) => a + b, 0) / k;
        const hiEnd = vals.slice(-k).reduce((a, b) => a + b, 0) / k;
        blunt[s] = Math.max(loEnd, hiEnd, 1e-6);
        yLo[s] = present[0] / NB;
        yHi[s] = (present[present.length - 1] + 1) / NB;
        okS[s] = 1;
        const mg = Math.abs(loEnd - hiEnd) / Math.max(loEnd, hiEnd, 1e-9);
        if (mg > 0.10) votes[loEnd <= hiEnd ? 0 : 1] += mg;     // 差距太小不投票
      }
      if (!(votes[0] + votes[1])) { zero(); return; }
      const edgeLow = votes[0] >= votes[1];           // 整刀一个结论

      const out = new Float32Array(cntV);
      let hit = 0;
      for (let i = 0; i < cntV; i++) {
        const s = ti[i];
        if (!okS[s]) continue;
        const b = Math.min(NB - 1, Math.max(0, Math.floor(vy[i] * NB)));
        const w = prof[s * NB + b];
        if (!Number.isFinite(w)) continue;
        // ① 收窄：本处轮廓宽度相对该片刀脊侧宽度缩了多少（刃口处 → 1）
        const narrow = Math.min(1, Math.max(0, 1 - w / blunt[s]));
        if (narrow <= 0) continue;
        // ② 只认刃口那一侧（片内归一化 y，0=低y端）
        const den = yHi[s] - yLo[s];
        const ny = den > 1e-6 ? (vy[i] - yLo[s]) / den : 0.5;
        const side = edgeLow ? 1 - ny : ny;
        const sideGate = Math.min(1, Math.max(0, (side - 0.40) / 0.45));
        if (sideGate <= 0) continue;
        // ③ 曲率：刃脊是凸棱
        const e = Math.min(1, Math.max(0, (edge[i] - 0.40) / 0.50));
        // ④ 靠刀尖加权：护手/柄芯在模型里也又薄又凸，但它们在长轴的中后段
        const m = Math.min(1, Math.max(0, (vt[i] - 0.30) / 0.35));
        const wTip = m * m * (3 - 2 * m);
        const v = narrow * sideGate * (0.25 + 0.75 * e) * wTip;
        out[i] = v;
        if (v > 0.5) hit++;
      }
      if (coverage) coverage.bladeEdge = hit / Math.max(1, cntV);
      geo.setAttribute('aBladeEdge', new THREE.BufferAttribute(out, 1));
    }

    /** 几何边缘因子 aEdge：凸起=1 / 凹槽=0（顶点邻域平均位置与法线的夹角估算曲率）。 */
    _buildEdgeAttribute(geo) {
      if (!geo || !geo.attributes.position || !geo.attributes.normal || !geo.index) return;
      if (geo.attributes.aEdge) geo.deleteAttribute('aEdge');
      const pos = geo.attributes.position.array;
      const nor = geo.attributes.normal.array;
      const idx = geo.index.array;
      const n = pos.length / 3;
      const acc = new Float32Array(n * 3);
      const cnt = new Uint32Array(n);
      // ★ 2026-10-03 性能：原来写成
      //     for (const [x, y] of [[a,b],[a,c],[b,a],[b,c],[c,a],[c,b]])
      //   每次循环要 **new 1 个外层数组 + 6 个内层数组 + 6 次迭代器解构**。
      //   模型一律 15000 面 → 每把刀 9 万次数组分配，全靠 GC 收，
      //   这是 attrBuild（实测 3–29ms）里最容易造成掉帧的一处。
      //   改法：展开成 6 次显式累加，**零分配**。数值结果完全一致
      //   （同样的 6 对 (x,y) 累加顺序）。
      for (let f = 0; f < idx.length; f += 3) {
        const a = idx[f], b = idx[f + 1], c = idx[f + 2];
        const ax = a * 3, bx = b * 3, cx = c * 3;
      // (a←b)
      acc[ax] += pos[bx]; acc[ax + 1] += pos[bx + 1]; acc[ax + 2] += pos[bx + 2]; cnt[a]++;
      // (a←c)
      acc[ax] += pos[cx]; acc[ax + 1] += pos[cx + 1]; acc[ax + 2] += pos[cx + 2]; cnt[a]++;
      // (b←a)
      acc[bx] += pos[ax]; acc[bx + 1] += pos[ax + 1]; acc[bx + 2] += pos[ax + 2]; cnt[b]++;
      // (b←c)
      acc[bx] += pos[cx]; acc[bx + 1] += pos[cx + 1]; acc[bx + 2] += pos[cx + 2]; cnt[b]++;
      // (c←a)
      acc[cx] += pos[ax]; acc[cx + 1] += pos[ax + 1]; acc[cx + 2] += pos[ax + 2]; cnt[c]++;
      // (c←b)
      acc[cx] += pos[bx]; acc[cx + 1] += pos[bx + 1]; acc[cx + 2] += pos[bx + 2]; cnt[c]++;
    }
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (!cnt[i]) { out[i] = 0.5; continue; }
        const lx = acc[i * 3] / cnt[i] - pos[i * 3];
        const ly = acc[i * 3 + 1] / cnt[i] - pos[i * 3 + 1];
        const lz = acc[i * 3 + 2] / cnt[i] - pos[i * 3 + 2];
        const len = Math.hypot(lx, ly, lz) || 1e-6;
        const conv = -(lx * nor[i * 3] + ly * nor[i * 3 + 1] + lz * nor[i * 3 + 2]) / len;
        out[i] = Math.min(1, Math.max(0, 0.5 + 0.5 * conv * 2.2));
      }
      geo.setAttribute('aEdge', new THREE.BufferAttribute(out, 1));
    }

    /**
     * 应用 BladeSkin（composeBladeSkin 产出的 uniform 包）到**刀身**。
     * 与 Knife3D 的 applyBladeSkin 一致：写材质层 PBR + 挂 bladeSkin shader hook。
     * S8 握柄走 bladeMask 通道；护手/尾部持续使用 BladeSkin 的刀身材质。
     */
    applyBladeSkin(knifeId, pack, opts = {}) {
      const info = this.loaded.get(knifeId);
      if (!info || !pack) return null;
      const M = pack.material;
      const frame = info.bladeFrame;
      let applied = null;
      for (const m of info.materials) {
        if (K3D.material.setBladeAttrs) K3D.material.setBladeAttrs(m);
        m.metalness = M.metalness;
        /* ★★ 2026-10-24（P2 · 阶段粗糙度曲线 · 第二版）

           第一版 [1,1,1,0.88,0.72,0.80,0.60,0.62,0.52] 实测：
             S5 只从 0.734 降到 0.528，画面仍像**石头/水泥**。
           结合 A/B 数据（对比σ 最高出现在 rough ≈0.10–0.25）判断：
             0.5 以上的金属在台灯环境下就是“哑光矿石”而不是钢。

           第二版把后期压到 0.20–0.35 区间（真实抛光钢的范围）：
             S1–S3 保持 1.0（未加工，粗）
             S4 定型 0.72（锤痕被压平）
             S5 淬火 0.46（0.734×0.46≈0.34）← 晶粒细化
             S6 回火 0.52（氧化膜略粗于淬火）
             S7 开刃 0.34（磨削 → 近镜面）
             S8 装配 0.36
             S9 精校 0.27（0.73×0.27≈0.20，最细）

           ⚠ 下限 0.10：低于它会出现不真实的完美镜面。
           ⚠ 只乘到粗糙度上，不改 metalness / 不动卡数据 / 不影响玩法数值。 */
        const STAGE_ROUGH_GAIN = [1.00, 1.00, 1.00, 0.72, 0.46, 0.52, 0.34, 0.36, 0.27];
        const reachedStages = (() => {
          const fx = pack.uniforms.uCardFx;
          let n = 0;
          if (fx && fx.length >= 36) {
            for (let i = 0; i < 9; i++) if (Number(fx[i * 4 + 1]) > 0.001) n++;
          }
          return Math.max(0, Math.min(9, n));
        })();
        const roughGain = STAGE_ROUGH_GAIN[Math.max(0, reachedStages - 1)] ?? 1.0;
        m.roughness = Math.max(0.10, Math.min(1, M.roughness * roughGain));
        // ★ 材质的 envIntensity（25 种材质各有 1.00~1.25）落到 three 的 envMapIntensity。
        //   此前它只进了 uBladeEnvIntensity 这个**没人消费**的 uniform，
        //   导致所有材质的环境反射强度完全一样 —— 深色材质被环境光抬成亮银色。
        //
        //   ★★ 2026-10-24（阶段递进 · 实测是唯一有效的光照杠杆）
        //
        //     实测结论（冻结时间、只测刀身、只改一个参数）：
        //       scene.environmentIntensity 0.55→1.50  → 亮度变化 **0.0%**（完全无效）
        //       material.envMapIntensity  0.9→1.5    → 亮度 **+32.5%**、高光% +1.7
        //       renderer.toneMappingExposure 0.9→1.2 → 亮度 +21.8%
        //
        //     为何 scene.environmentIntensity 无效：看 three r169 的源码 ——
        //       `material.isMeshStandardMaterial && material.envMap === null && scene.environment`
        //       才会把 environmentIntensity 写进 envMapIntensity。
        //     本项目的刀身材质**自带 envMap**（道具级贴图），所以那条分支永远进不去。
        //       真正生效的是 material.envMapIntensity（由 M.envIntensity 驱动）。
        //
        //     所以这里给 envMapIntensity 加一层**工序递进**：
        //       刚熔炼/锻打的粗胚反射弱（哑光），淬火后金属化 → 逐渐变亮；
        //       开刃/精校最高（镜面感）。这是“越做越像钢”的主线条。
        //     只乘到 M.envIntensity 上（不改材质表本身），且上限 1.9 防过曝。
        const stageEnvGain = (() => {
          const fx = pack.uniforms.uCardFx;
          let reached = 0;
          if (fx && fx.length >= 36) {
            for (let i = 0; i < 9; i++) if (Number(fx[i * 4 + 1]) > 0.001) reached++;
          }
          /* ★★ 2026-10-24 第二轮（视觉扫描得到的正确方向）

             实测 E 档（surfW=0 / relief=0 / env=1.4）**视觉明显最好**：
               干净金属 + 明暗层次，没有木纹/布纹感。
             而 A 档（surfW=0.75 / relief=0.07）亮区仅 13.4%，
             整把刀读成“木头/织物”。

             所以曲线改成：S1~S3 保持低反射（粗胚不亮），
             从 S5 开始快速抬升，S9 到 1.72（× 0.818 ≈ 1.41）。
             这是“越做越像钢”的主线条，也是玩家能直接看出进度的线索。 */
          const g = Math.max(1, Math.min(9, reached));
          /* Studio reflections must not climb by ~90% from S3 to S9.
             The old linear gain illuminated an entire broad blade face
             before any S3 engraving could read. Use a bounded finishing
             curve: forged billet stays satin, polished stages regain a
             narrow specular band rather than blanket white reflections. */
          const STAGE_ENV_GAIN = [0.88, 0.90, 0.80, 0.88, 1.00, 1.04, 1.08, 1.10, 1.12];
          return STAGE_ENV_GAIN[g - 1];
        })();
        m.envMapIntensity = Math.min(1.48, M.envIntensity * stageEnvGain);
        // ★ 宝石珠光系（M15 蓝晶 / M16 紫晶 / M17 翡翠 / M18 琥珀）的半透 + 折射率。
        //   与 clearcoat / iridescence 同一套路：走 three 材质属性。
        //   此前 uBladeTransmission / uBladeIOR 是**死 uniform**（shader 声明了但 0 次使用），
        //   这 4 个材质设计的"半透宝石感"完全出不来。
        if ('transmission' in m) {
          m.transmission = M.transmission;
          m.ior = M.ior;
          // 透射需要看得见背后 → 打开背景采样（three 的 transmission 通道）
          m.thickness = (M.transmission || 0) > 0 ? 0.6 : 0;
        }
        if ('clearcoat' in m) {
          /* ★ 2026-10-20（P0 · Physical 宏漏预热）：clearcoat / iridescence 从 0 变正值
             会改动 USE_CLEARCOAT / USE_IRIDESCENCE 宏 —— 也就是**换一支 program**。
             材质表里这两个值逐材质不同（多数 0、部分 0.4~0.8），于是"换一张卡"
             可能顺带换掉 program，落到 render 里同步编译（实测 MAT06/09/15 为
             2.84 / 3.01 / 6.75 秒阻塞）。这里把开关钉在 FEATURE_FLOOR（恒定"开"），
             强弱只由数值表达；1e-4 低于 8bit 的 1/255 量化步长，逐像素无差异。
             与 material.js#toPhysicalMaterial 同一口径。 */
          m.clearcoat = Math.max(K3D_FEATURE_FLOOR, M.clearcoat || 0);
          m.clearcoatRoughness = M.clearcoatRoughness;
        }
        if ('iridescence' in m) {
          m.iridescence = Math.max(K3D_FEATURE_FLOOR, Number(pack.uniforms.uBladeIridescence) || 0);
          m.iridescenceIOR = M.iridescenceIOR;
          if (M.iridescenceThickness) m.iridescenceThicknessRange = M.iridescenceThickness;
        }
        /* ★ 2026-10-24（接通各向异性通道 · 拉丝/磨光的方向性高光）

           病象：state.js 一直在写 uBladeAnisotropy / uBladeAnisotropyRot，
           但**全仓没有任何地方把它赋给 material.anisotropy**（material.js 里 anisotropy 出现 0 次）
           —— 又一个“死 uniform”。
           后果：拉丝 / 磨削 / 锻打的方向性高光完全不存在，
           金属看起来是“均匀塑料”而不是“有丝路的钢”。
           这也是 CS2 刀皮里拉丝类 Finish 最核心的视觉特征。

           ⚠ 数据源不能只读 M.anisotropy：材质表 25 种里只有 1 处声明了 anisotropy
             且恒为 0，真真的方向性在**纹理参数**里（T02 拉丝 defaults.anisotropy = 0.7）。
             所以这里合并三个来源：
               ① 材质表 M.anisotropy（少数材质自带）
               ② 纹理 uTexParam6[3]（拉丝/磨削类的主来源）
               ③ 工艺语义：F03 拉丝 / F11 喷砂 恒给方向性（即使没选纹理）

           同一口径钉死宏：anisotropy 从 0 变正值会改 USE_ANISOTROPY → 换 program。
           这里恒给 FEATURE_FLOOR 或更大，强弱只由数值表达。
           方向由工艺给（拉丝沿刀轴），写在 anisotropyRotation 上。 */
        if ('anisotropy' in m) {
          const u6 = pack.uniforms.uTexParam6;
          const texAniso = Array.isArray(u6) ? Number(u6[3]) || 0 : (u6 ? Number(u6.w) || 0 : 0);
          const finId = Number(pack.uniforms.uFinId) || 0;
          /* 工艺语义：F03=拉丝 / F11=喷砂 即使没选纹理也有方向结构 */
          const finAniso = (finId === 3) ? 0.55 : (finId === 11 ? 0.35 : 0);
          let aniso = Math.max(Number(M.anisotropy) || 0, texAniso, finAniso);
          aniso = Math.min(1, Math.max(0, aniso));
          m.anisotropy = Math.max(K3D_FEATURE_FLOOR, aniso);
          /* 方向：拉丝的丝路沿刀轴 → 0（three 的默认切线方向就是 UV.x）；
             锻打/喷砂给一个微量角度，避免所有卡的高光方向完全一致。 */
          m.anisotropyRotation = (finId === 11) ? 0.35 : 0;
        }
        applyBladeSkinHook(m, pack, frame, {
          baseMap: info.baseMap,
          texStrength: opts.texStrength != null ? opts.texStrength : 1.0,
          // ★ 过程模型（矿石/熔料球/刀胚）没有烘焙好的皮肤 atlas，
          //   要保留模型自带的岩石/熔料纹理，只做"染色"而不是"替换"（见 shader 的 K3D_PRESERVE_TEX 分支）
          preserveTex: K3D.regions && K3D.regions.isProcess ? K3D.regions.isProcess(knifeId) : false,
        });
        mat.invalidateHookProgram(this.renderer, m);
        applied = m;
      }
      return applied;
    }

    /**
     * 构造一个「预热材质」—— 一份与**真实材质逐字同签名**的副本，但换成给定配方。
     *
     * ★ 2026-10-14（性能：卡顿预热 / docs/卡顿归因与优化方案.md §四 方案 A）
     *
     *   目标：玩家还在看三张候选卡时，先把这三张卡的 program 在 GPU 进程里链接好，
     *   等他点下去时预览就是瞬时的（实测 3.8 s → 32 ms）。
     *
     *   ⚠ 最关键的坑：three 的 program 缓存 key 是
     *       `material.customProgramCacheKey()`  ← 本工程在 material.js 里实现为
     *                                              「全部 hook 的 key#signature 排序拼接」
     *     再加上一串材质宏参数（envMap 有无、clearcoat 是否 >0 等）。
     *     早先的探针**只重挂 bladeSkin**，副本因此缺了
     *     bladeMask / patternStrength / roughPattern / bladeAttrs 的签名条目
     *     → key 与真实材质不一致 → 预热编出来的 program 永远命不中，
     *     而且**完全静默**（预热照跑、预览照卡，没人知道白做了）。
     *
     *   所以这里的做法是：把真实材质的 hook 表**整份搬过来**（bladeSkin 除外，
     *   它按变体重建；bladeMask 若变体自带刀柄配方也照生产路径重建），
     *   并同步搬运 motif family 登记（`specialize.js` 的 familiesFor 会并进签名）。
     *
     *   搬过来的 hook spec 是**共享对象**（GLSL 是常量字符串，uniform 槽共享也无妨）：
     *   预热材质恒为 visible=false，不参与任何绘制，值永远不会被读。
     *
     * @param {string} knifeId
     * @param {object} pack    composeBladeSkin 的产出
     * @param {object} [opts]  { handle?: 刀柄配方（S8 变体用，缺省则沿用当前刀柄） }
     * @returns {THREE.Material|null} 失败返回 null（上层静默跳过）
     */
    buildWarmMaterial(knifeId, pack, opts = {}) {
      const info = this.loaded.get(knifeId);
      if (!info || !pack || !Array.isArray(info.materials) || !info.materials.length) return null;
      const src = opts.sourceMaterial || info.materials[0];
      if (!src) return null;
      const m = src.clone();
      /* ⚠ clone() 会 JSON 化 userData —— 里面的 hook 表是 Map + 函数，会被丢掉，
         留下"有 signature 没有实现"的破损表。必须先清空再自己挂（与探针结论一致）。 */
      m.userData = {};

      /* ① 材质层 PBR —— 与 applyBladeSkin 逐行一致（少一项就可能改变材质宏） */
      const M = pack.material;
      if (K3D.material.setBladeAttrs) K3D.material.setBladeAttrs(m);
      m.metalness = M.metalness;
      m.roughness = M.roughness;
      m.envMapIntensity = M.envIntensity;
      if ('transmission' in m) {
        /* 预热副本可以强制打开透射：程序键只看 `transmission > 0`，不看具体数值。
           透射族预热（BladeStage.warmTransmissionFamily）就是靠这一点，
           用"当前这份不透明配方"的副本去编 M15–M18 要用的那支程序。 */
        const tr = opts.transmission != null ? Number(opts.transmission) : M.transmission;
        m.transmission = tr; m.ior = M.ior;
        m.thickness = (tr || 0) > 0 ? 0.6 : 0;
      }
      if ('clearcoat' in m) { m.clearcoat = Math.max(K3D_FEATURE_FLOOR, M.clearcoat || 0); m.clearcoatRoughness = M.clearcoatRoughness; }
      if ('iridescence' in m) {
        m.iridescence = Math.max(K3D_FEATURE_FLOOR, Number(pack.uniforms.uBladeIridescence) || 0);
        m.iridescenceIOR = M.iridescenceIOR;
        if (M.iridescenceThickness) m.iridescenceThicknessRange = M.iridescenceThickness;
      }
      /* 「预热副本」也必须逐字设 anisotropy —— 否则预热编出来的 program
         少了 USE_ANISOTROPY 宏，与真实材质签名不一致 → 预热失效、首卡仍卡顿。 */
      if ('anisotropy' in m) {
        m.anisotropy = Math.max(K3D_FEATURE_FLOOR, Number(M.anisotropy) || 0);
        m.anisotropyRotation = Number(M.anisotropyRotation) || 0;
      }

      /* ② 整份搬运 hook 表（bladeSkin 按变体重建；变体带刀柄时 bladeMask 也重建）。
            这是"签名逐字一致"的关键 —— 少搬一个 hook 就必然缓存不命中。 */
      const srcHooks = K3D.material.hookMap(src);
      const dstHooks = K3D.material.hookMap(m);
      for (const [key, spec] of srcHooks) {
        // Never copy a stale S8 mask from an already-used knife. Real gameplay
        // clears it before S8; the warm copy adds a mask below only when the
        // candidate has a genuinely selected and non-bypass handle.
        if (key === 'bladeSkin' || key === 'bladeMask') continue;
        dstHooks.set(key, spec);
      }

      /* ③ 刀柄路径登记的 motif family 也要跟着走（bladeSkinShader 组装时并入签名）。
            带 opts.handle 时**不搬** —— 那一支由下面的 _buildBladeMaskSpec 覆盖式登记，
            与生产路径（applyBladeSkin → applyBladeMask → noteFamilies 覆盖 + refresh）一致。 */
      // In a no-handle variant the real material is cleared to [] too.
      // Copying source families from a previously viewed S8 knife would
      // silently change the program signature and invalidate the warmup.
      if (!opts.handle && K3D.shaderSpecialize?.noteFamilies) {
        K3D.shaderSpecialize.noteFamilies(m, []);
      }

      /* ④ bladeSkin：按变体重建。这一步会触发 syncFragmentHooks，
            把上面搬来的 hook 一起装进 onBeforeCompile。 */
      applyBladeSkinHook(m, pack, info.bladeFrame, {
        baseMap: info.baseMap,
        texStrength: 1.0,
        preserveTex: K3D.regions && K3D.regions.isProcess ? K3D.regions.isProcess(knifeId) : false,
      });

      /* ⑤ 变体自带刀柄配方（S8）：与 applyBladeMask 同一条构造路径。
            必须在 apply 之后 —— _buildBladeMaskSpec 内部会 refresh()，
            而 refresh 读的是 bladeSkinShader 的 LAST_APPLY 记录。

         ★★ 2026-10-16 性能修复（用户：「锻造阶段效果的加载速度还是很慢」）
            这里**必须与 `applyBladeMask` 的 process-model 分支保持一致**：
            过程模型（矿石 / 熔料球 / 刀胚）在真实路径里会被
            `applyBladeMask` 走 `process-model-has-no-handle` 分支 → **removeHook('bladeMask')**，
            也就是真实材质**根本没有** bladeMask 钩子。
            而预热材质此前无条件挂上它 → customProgramCacheKey 与真实材质不一致
            （实测：池 `…|bladeMask#bladeMask:K0:…|bladeSkin#bladeSkin:v2:PT:T4:F10`
               vs 真实 `bladeAttrs|bladeSkin#bladeSkin:v2:PT:T4:F10:M0_12`）
            → **S1–S4 的预热全部白编**，玩家第一次点卡仍要吃 8.7–15.6 s 的现场链接。
            症状之所以隐蔽：预热照跑、日志有数、只是永远命不中。 */
      const isProcessModel = !!(K3D.regions && K3D.regions.isProcess && K3D.regions.isProcess(knifeId));
      if (opts.handle && !isProcessModel) {
        let origMap = null, maskMap = null;
        for (const mm of info.materials) {
          if (!origMap && mm.userData && mm.userData.orig && mm.userData.orig.map) origMap = mm.userData.orig.map;
          if (!maskMap && mm.userData && mm.userData.orig && mm.userData.orig.metalnessMap) maskMap = mm.userData.orig.metalnessMap;
        }
        if (!origMap) { m.dispose(); return null; }      // 与 applyBladeMask 的门槛一致：没有底图就不挂刀柄
        if (!maskMap) maskMap = origMap;
        K3D.material.upsertHook(m, 'bladeMask', this._buildBladeMaskSpec(m, opts.handle, origMap, maskMap));
      }

      /* ⑥ 与生产同款：作废这个副本自己的 program 缓存（clone 出来的材质
            在 renderer.properties 里没有记录，invalidate 走 __hooksDirty 分支） */
      K3D.material.invalidateHookProgram(this.renderer, m);
      return m;
    }

    /**
     * 应用 S8 握柄材质（走 bladeMask hook，只覆盖 wH；wG 护手/尾部继续由 BladeSkin 着色）。
     * 让装配阶段看到独立的 24 种握柄表面，而不破坏刀身与护手的既有材质。
     * @param {object} cfg { gain, tint, desat, metalness, roughness, reflection }
     */
    applyBladeMask(knifeId, cfg = {}) {
      const info = this.loaded.get(knifeId);
      if (!info) return null;
      // Process models are single-region workpieces; they intentionally have no
      // handle/guard. Keep the material free of a dead mask hook and avoid a
      // misleading missing-handle warning while their BladeSkin remains active.
      if (K3D.regions && K3D.regions.isProcess && K3D.regions.isProcess(knifeId)) {
        for (const m of info.materials) {
          K3D.material.removeHook(m, 'bladeMask');
          if (K3D.shaderSpecialize && K3D.shaderSpecialize.noteFamilies) {
            K3D.shaderSpecialize.noteFamilies(m, []);
          }
        }
        return { ok: true, skipped: true, reason: 'process-model-has-no-handle' };
      }
      // 找到某材质的模型自带贴图作为遮罩来源（用 ORM 的 B 通道做刀柄判定）
      let origMap = null, maskMap = null;
      for (const m of info.materials) {
        if (!origMap && m.userData.orig && m.userData.orig.map) origMap = m.userData.orig.map;
        if (!maskMap && m.userData.orig && m.userData.orig.metalnessMap) maskMap = m.userData.orig.metalnessMap;
      }
      /* ★ 2026-10-06（#2）：原实现在这里静默 return null，且**原因不透明** ——
       *   排查"刀柄没变化"时无法区分「模型没贴图」与「调用没走到」。
       *   现在打一条 warn 并明确返回原因标识；实测 15/15 模型都有 metalnessMap
       *   （tools/_triage_probe2.js 全模型普查），所以这条分支正常不会触发。 */
      const hasRegionAttribute = (() => {
        let found = false;
        info.root.traverse((child) => {
          if (child.isMesh && child.geometry && child.geometry.attributes
              && child.geometry.attributes.aRegion) found = true;
        });
        return found;
      })();
      if (!origMap || (!maskMap && !hasRegionAttribute)) {
        console.warn('[applyBladeMask] ' + knifeId + ' 缺少遮罩贴图，刀柄不会变化',
          { hasMap: !!origMap, hasMetalnessMap: !!maskMap });
        return { ok: false, reason: !origMap ? 'no-orig-map' : 'no-mask-map' };
      }
      const regionCoverage = info.regionCoverage || null;
      if (regionCoverage && regionCoverage.handle < 0.005) {
        console.warn('[applyBladeMask] ' + knifeId + ' 刀柄区域权重过低，卡牌材质可能不可见', regionCoverage);
        return { ok: false, reason: 'empty-handle-region', regionCoverage };
      }
      /* 区域顶点权重 aRegion 是当前模型的主遮罩，bladeMask 的 mapFragment
       * 使用 wH/wG；ORM 的 B 通道只在旧模型缺少 aRegion 时作兜底。
       * 所以模型有区域属性但没有 ORM 时，仍可正常着色刀柄，使用 baseColor
       * 贴图作为未启用的 mask sampler，避免整条刀柄渲染链被多余的 ORM 依赖截断。 */
      const usedRegionFallback = !maskMap && hasRegionAttribute;
      if (!maskMap) maskMap = origMap;
      for (const m of info.materials) {
        K3D.material.upsertHook(m, 'bladeMask', this._buildBladeMaskSpec(m, cfg, origMap, maskMap));
      }
      // ★ 原实现 return this._lastMaskApplied —— 而该字段**从未被赋值**，
      //   于是恒返回 undefined，调用方与守卫都无法判断"到底装上没有"。
      //   现在如实返回注入的材质数，供守卫断言（#2 验收标准）。
      return { ok: true, materials: info.materials.length, usedRegionFallback, regionCoverage };
    }

    /**
     * ★ 2026-10-08（P1 · 装配阶段边界）：摘掉握柄的装配材质，让整把刀（含握柄）回到
     * "刀身基础材质"状态。
     *
     * 为什么需要它：`main.js` 现在只在 S8 及以后才调 `applyBladeMask`
     * （见那边的 handleMaskGate 长注释）。但玩家可以**从 S8 回退**——
     * 重铸会重建 run、S8 换一张刀柄卡会重走 preview。若只在 S8 后"挂"、
     * 从不在 S8 前"摘"，刀柄上就会留着上一次的装配材质成为残影。
     *
     * 实现就是 `removeHook(m,'bladeMask')` —— 摘掉 mapFragment 之后，
     * 握柄区域不再被任何 hook 改写，于是自然落回材质自身的
     * baseColor/metalness/roughness，也就是"与刀身同一套基础材质"；护手本来就由 BladeSkin 控制。
     */
    clearBladeMask(knifeId) {
      const info = this.loaded.get(knifeId);
      if (!info) return null;
      let n = 0;
      for (const m of info.materials) {
        if (K3D.material && K3D.material.removeHook) K3D.material.removeHook(m, 'bladeMask');
        // ★ 2026-10-14：摘掉刀柄 hook 后，把它登记的 motif family 也清掉，
        //   否则 motif 特化范围会一直留着上一次刀柄卡的分支。
        if (K3D.shaderSpecialize && K3D.shaderSpecialize.noteFamilies
            && K3D.shaderSpecialize.noteFamilies(m, [])) {
          refreshBladeSkinHook(m);
        }
        n++;
      }
      return { ok: true, cleared: n };
    }

    /** 构造 bladeMask hook spec（与 material.js setBladeMask 的最小可用版本一致）。 */
    _buildBladeMaskSpec(m, cfg, origMap, maskMap) {
      const pick = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      const TINT_DEFAULT = '#8e99a6';
      const low = 0.35, high = 0.75;
      const fx = Array.isArray(cfg.cardEffect) || ArrayBuffer.isView(cfg.cardEffect)
        ? Array.from(cfg.cardEffect).slice(0, 4).map((v) => pick(v, 0)) : [0, 0, 1, 0];
      while (fx.length < 4) fx.push(fx.length === 2 ? 1 : 0);
      /* ★ 2026-10-14：刀柄卡特效同样会调用 k3dCardMotif（走 uHandleCardFx），
       *   而它与刀身共用同一个 program —— 必须把它用到的 family 也登记进
       *   motif 的特化范围，否则刀柄会落到兜底分支、画面与特化前不一致。
       *   （uHandleCardFx.y <= 0.001 时那句调用根本不执行，故不必登记。） */
      if (pick(fx[1], 0) > 0.001 && K3D.shaderSpecialize && K3D.shaderSpecialize.noteFamilies) {
        const fam = K3D.shaderSpecialize.familyOfStyle(fx[0]);
        if (fam != null && K3D.shaderSpecialize.noteFamilies(m, [fam])) {
          refreshBladeSkinHook(m);
        }
      }
      /* ★ 2026-10-14（编译期特化）：刀柄 kind 进 signature 并特化 GLSL，
       *   把 k3dHandleLook 的 24 路分派裁成只留当前这一支（数学逐字不动）。
       *   旧注释说"kind 是 uniform、不该进 shader key"，代价是 24 套程序化刀柄
       *   材质全部被翻译+内联（实测 ~6.9 s）；特化后整套着色器编译 195 s → ~4 s。 */
      const handleKind = Math.round(pick(cfg.patternKind, 0));
      const specOn = !!(K3D.shaderSpecialize && K3D.shaderSpecialize.enabled && K3D.shaderSpecialize.enabled());
      /* ★★ 2026-10-21（S8 每柄一支 program → 一支共用）
         把柄材质烘进图集后，签名里不再带 kind，24 种柄共用同一支 program：
         换柄只改 uHandleLookTile（uniform），不再触发链接。
         图集不可用（无 renderer / 上下文丢失）时退回逐 kind 特化。 */
      const atlasInfo = typeof this.renderer !== 'undefined'
        ? acquireHandleLook(this.renderer, handleKind) : null;
      const handleLookGLSL = atlasInfo
        ? BLADEMASK_COMMON_BASE + `uniform sampler2D uHandleLookTex;
uniform vec4 uHandleLookTile;
vec4 k3dHandleLookCall( vec3 local ) {
  vec2 uv = clamp( local.xy, 0.0, 1.0 );
  vec4 t = texture2D( uHandleLookTex, uHandleLookTile.xy + uv * uHandleLookTile.zw );
  /* ★ 2026-10-21（N2 修复）：图集的 a 通道是**编码后**的粗糙度偏移
     （烘焙端写 dr*0.5+0.5，因为 RGBA8 存不下负数）。这里解码回 dr ∈ [-0.16, 0.16]。
     旧实现两边都没做这件事，于是负 dr 全被 clamp 成 0。下游两处取 .a 的地方不用改。 */
  return vec4( t.rgb, t.a * 2.0 - 1.0 );
}`
        : ((K3D.shaderSpecialize && handleKind >= 0 && handleKind <= 23)
          ? K3D.shaderSpecialize.handleLook(this._BLADEMASK_COMMON, handleKind)
          : this._BLADEMASK_COMMON) + `
vec4 k3dHandleLookCall( vec3 local ) { return k3dHandleLook( uHandlePatternKind, local ); }`;
      return {
        // 刀柄 kind 会改变 GLSL（分派分支被裁掉）→ 进 shader key；
        // 特化关闭时源码与 kind 无关 → 签名退回旧形态（不带 kind）。
        // ⚠ 改 GLSL 必须同时改 signature：customProgramCacheKey 只由 hook 的 key#signature
        //   拼成（见 material.js:204），只改源码文本 three 会直接复用旧 program → 画面纹丝不动。
        //   这里把三档明暗 / 金属件 / 粗糙度下限都拼进去，扫档时自动换 program。
        /* v4：刀柄 look 改成"一次求值、三处复用"（GLSL 变了，签名必须跟着变，
           否则 three 会按旧 key 复用旧 program —— material.js 顶部注释记过这个坑）。 */
        /* v6：图集 a 通道改成编码后的粗糙度偏移（N2）。GLSL 变了签名必须跟着变，
           否则 three 会按旧 key 复用旧 program，画面纹丝不动。 */
        signature: atlasInfo ? 'bladeMask:v6:atlas'
          : (specOn ? 'bladeMask:v5:K' + handleKind : 'bladeMask:v5')
          + ':s' + Math.round(HANDLE_SHADE_DARK * 100) + '_' + Math.round(HANDLE_SHADE_MID * 100)
          + '_' + Math.round(HANDLE_SHADE_LIGHT * 100) + '_' + Math.round(HANDLE_ROUGH_FLOOR * 100)
          + '_f' + Math.round(HANDLE_MODEL_FOLLOW * 100)
          + '_L' + Math.round(HANDLE_STRUCT_LIFT * 100) + '_P' + Math.round(HANDLE_STRUCT_PALE * 100)
          + '_M' + Math.round(HANDLE_STRUCT_MIX * 100),
        uniforms: {
          uBladeOrigMap: { value: origMap },
          uBladeMaskMap: { value: maskMap },
          uBladeMaskLow: { value: low },
          uBladeMaskHigh: { value: high },
          uHandleGain: { value: pick(cfg.gain, 1) },
          uHandleTint: { value: K3D.material.colorFromSpec(cfg.tint || TINT_DEFAULT, TINT_DEFAULT) },
          uHandleDesat: { value: Math.min(1, Math.max(0, pick(cfg.desat, 0.2))) },
          uHandleMetalness: { value: Math.min(1, Math.max(0, pick(cfg.metalness, 0.35))) },
          uHandleRoughness: { value: Math.min(1, Math.max(0, pick(cfg.roughness, 0.6))) },
          uHandleReflection: { value: Math.min(2, Math.max(0, pick(cfg.reflection, 1))) },
          uHandlePatternKind: { value: Math.round(pick(cfg.patternKind, 0)) },
          uHandleLookTex: { value: atlasInfo ? atlasInfo.texture : null },
          uHandleLookTile: { value: atlasInfo
            ? new THREE.Vector4(atlasInfo.tile.x, atlasInfo.tile.y, atlasInfo.tile.sx, atlasInfo.tile.sy)
            : new THREE.Vector4(0, 0, 1, 1) },
          /* ★★ 2026-10-22（S8 柄上的"奇怪斑块"，用户点名着重修）
           *
           *   病象：S8 的柄上出现粉/紫的深浅斑块，像是脏了 / 贴图错位。
           *   实测（A/B 对照，`docs/render-v2-2026-10-20/ref-1012/ver-0.png`）：
           *     把 uHandleCardFx 归零 → 斑块**立刻全部消失**，只剩模型自带的缠绳几何；
           *     压到 0.45 仍然能明显看到粉斑（S8_08 原值 0.90、S8_01 原值 0.88）。
           *   根因：这是把 S8 卡自己的 motif（烘焙图集第 7 槽）画到**柄**上。
           *     刀身面积大、motif 读作"纹样"；柄在整刀构图里只有几十像素宽，
           *     同一段 motif 被压成一块块色斑 —— 尺寸一换就从"纹"变成"脏"。
           *
           *   修法：**柄这一路直接归零**（`uHandleCardFx.y = 0` 时 shader 里那句
           *   `if ( uHandleCardFx.y > 0.001 )` 根本不执行 → 顺带省掉分支）。
           *   刀身仍按 uCardFx 的原始强度走，S8 的身份来自 24 种柄材质本身（这才是它的辨识点）。
           *   若要恢复"柄上也有卡纹"，必须先按**柄的实际屏幕尺寸**重新设计 motif 频率，
           *   不能复用刀身那套。 */
          uHandleCardFx: { value: new THREE.Vector4(fx[0], 0, fx[2], fx[3]) },
          uHandleEffectTime: { value: 0 },
          uGuardGain: { value: 1 },
          uGuardTint: { value: K3D.material.colorFromSpec(TINT_DEFAULT, TINT_DEFAULT) },
          uGuardDesat: { value: 0.3 },
          uGuardMetalness: { value: 1 },
          uGuardRoughness: { value: 0.35 },
          uGuardReflection: { value: 1 },
          uDebugMode: { value: 0 },
          uWear: { value: pick(cfg.wear, 0) },
          uWearLow: { value: 0.10 },
          uWearHigh: { value: 0.55 },
          uDirt: { value: 0 },
          uCurvAO: { value: 0.6 },
          uCurvRough: { value: 0.5 },
        },
        // ⚠ 这里的 GLSL 注入块必须与 material.js 的 setBladeMask 完全一致，
        //   否则 region 判定 / 提亮 / 磨损 / 刀柄着色会行为不一致。
        //   为保持单一事实源，这里直接调用 material.js 已导出的内部实现不可行（它闭包私有），
        //   故由 bladeMaskGLSL() 返回与 material.js 相同的 GLSL 字符串。
        common: handleLookGLSL,
        vertexCommon: ``,
        vertexBody: ``,
        mapFragment: this._BLADEMASK_MAPFRAG,
        roughnessFragment: this._BLADEMASK_ROUGHFRAG,
        normalFragment: this._BLADEMASK_NORMALFRAG,
        metalnessFragment: this._BLADEMASK_METALFRAG,
        physicalFragment: this._BLADEMASK_PHYSFRAG,
      };
    }

    /** 接收 viewer 的环境贴图，并挂到所有已加载材质上。 */
    setEnvMap(tex) {
      this.envMap = tex;
      for (const info of this.loaded.values()) {
        for (const m of info.materials) {
          m.envMap = tex;
          m.needsUpdate = true;
        }
      }
    }

    /** 重新计算某把刀的 aRegion 顶点属性。 */
    rebuildRegions(knifeId) {
      const info = this.loaded.get(knifeId);
      if (!info) return;
      info.root.traverse((child) => {
        if (child.isMesh && child.geometry) {
          this._buildRegionAttribute(child.geometry, knifeId);
        }
      });
    }
  }

  /* ── bladeMask GLSL 块（与 material.js 的共享刀柄外观源保持一致）────
   *  这里把 GLSL 字符串集中存放，供 _buildBladeMaskSpec 引用。
   *  若日后与 material.js 出现分歧，以 material.js 为单一事实源同步过来。 */
  const BLADEMASK_COMMON_BASE = `uniform sampler2D uBladeOrigMap;
uniform sampler2D uBladeMaskMap;
uniform float uBladeMaskLow;
uniform float uBladeMaskHigh;
uniform float uHandleGain;
uniform vec3 uHandleTint;
uniform float uHandleDesat;
uniform float uHandleMetalness;
uniform float uHandleRoughness;
uniform float uHandleReflection;
uniform int   uHandlePatternKind;
uniform vec4  uHandleCardFx;
uniform float uHandleEffectTime;
uniform float uGuardGain;
uniform vec3 uGuardTint;
uniform float uGuardDesat;
uniform float uGuardMetalness;
uniform float uGuardRoughness;
uniform float uGuardReflection;
uniform float uDebugMode;
uniform float uWear;
uniform float uWearLow;
uniform float uWearHigh;
uniform float uDirt;
uniform float uCurvAO;
uniform float uCurvRough;
/* ★★ 2026-10-20（P0 · 已证实的 S8 纹样失效）
 *
 *   病象（SUPPLEMENT §3C）：S8_01 的 uHandleCardFx.y = 0.88、family 已登记，但柄上
 *   雕纹与 motif 粗糙度调制全部消失；运行时取到的 k3dCardMotif 函数体是 return 0.5。
 *
 *   根因：bladeSkinShader 会从「已烘焙族」里扣掉 motif 的 25 路分支（烘焙全量化），
 *   全部烘焙后整段函数体被换成常量桩 —— 这对刀身是正确的（刀身改读 uBakedAtlas），
 *   但柄的 mapFragment / roughnessFragment 仍在**直接调用** k3dCardMotif，
 *   于是 smoothstep(0.60,0.96,0.5)=0、(0.5-0.5)=0，两条都归零。
 *
 *   修法：柄也改读**同一份 9 槽烘焙图集**里的 S8 槽（stage 8 → 索引 7），
 *   让"只有全部消费者都迁移到纹理之后才允许裁掉函数"这条前置条件真正成立。
 *   这样特化可以继续把 25 路分支裁到桩，柄纹与刀身纹样仍来自同一套确定性值场。
 *   动画族（7/8/11/15/19/23）走 12 帧条带，时间轴用 uHandleEffectTime。 */
#ifndef K3D_BAKED_ATLAS_DECL
#define K3D_BAKED_ATLAS_DECL 1
uniform sampler2D uBakedAtlas;
uniform vec4  uBakedMeta[9];
uniform sampler2D uAnimAtlas;
uniform vec4  uAnimMeta[9];
#endif
/* ★★ 2026-10-21（S8 柄程序首次 1.3–2.2s 长帧）
 *
 *   柄的 k3dHandleLook 在 map / roughness / normal 三个注入点**各调用一次**。
 *   ANGLE 会把每个调用点各自内联一遍（24 路分派特化后仍是一整段 voronoi/噪声），
 *   于是同一段数学进编译三次 —— 实测柄程序 1.3–2.2s，是当前最后一个 >250ms 的长帧。
 *
 *   修法：map 片段（three 的 map_fragment 早于 roughness/normal）只算一次，
 *   结果放进文件作用域变量，另外两处直接读。数学逐字不变（同一个函数、同一支分支）。
 *   ⚠ 三处注入点的执行顺序是 three 的 include 顺序保证的：map → roughness → normal。
 */
vec4 k3dHandleLookShared;

float k3dHandleSlotMotif( vec2 p ) {
  vec4 am = uAnimMeta[7];
  vec4 m = uBakedMeta[7];
  vec2 pp = clamp( ( p - vec2( -0.3 ) ) / 1.6, 0.0, 1.0 );
  float v = 0.5;
  if ( am.x > 0.5 ) {
    const float FRAMES = 12.0;
    float period = max( 0.2, am.z );
    float ph = fract( uHandleEffectTime / period ) * FRAMES;
    float f0 = floor( ph );
    float w = ph - f0;
    float f1 = mod( f0 + 1.0, FRAMES );
    float rr = 1.0 / max( 1.0, am.w );
    float fr = 1.0 / FRAMES;
    vec2 inset = vec2( 0.5 / 1536.0, rr * 0.5 / 128.0 );
    vec2 inner = vec2( fr, rr ) - 2.0 * inset;
    float v0 = texture2D( uAnimAtlas, vec2( f0 * fr, am.y * rr ) + inset + pp * inner ).r;
    float v1 = texture2D( uAnimAtlas, vec2( f1 * fr, am.y * rr ) + inset + pp * inner ).r;
    v = mix( v0, v1, w );
  } else if ( m.x > 0.5 ) {
    float tile = m.y;
    vec2 off = vec2( mod( tile, 3.0 ), floor( tile / 3.0 ) ) * ( 1.0 / 3.0 );
    float inset = 1.0 / 1536.0;
    v = texture2D( uBakedAtlas, off + vec2( inset ) + pp * ( 1.0 / 3.0 - 2.0 * inset ) ).r;
  }
  return clamp( v, 0.0, 1.0 );
}`;
  /* 刀柄材质那一段单独存放：图集模式下整段不进源码（换成一次纹理采样），
     逐 kind 特化模式再拼回去。见 _buildBladeMaskSpec 的 atlasInfo 分支。 */
  const BLADEMASK_COMMON = BLADEMASK_COMMON_BASE + (K3D.handleLookGLSL || '');

  /* ★ 2026-10-16 刀柄：模型自带层次（三档明暗 + 金属件）+ 压反射。
     用户："① 我觉得问题是反射太强了；② 原模型刀柄部分的深色面板 / 亮螺点 / 接缝 /
     金属环之间颜色的差异要明显体现出来。"
     实测依据（tools/probe-handle-texture.mjs）：模型握柄反照率有 4 档明度
     （0.06 接缝 / 0.16 凹槽 / 0.24 面板 / 0.47 螺点棱），ORM.B 金属度在爪刀握柄里
     有 19% 落在 0.9–1.0（金属环/护片），直刃刀则 99% 非金属（螺点靠明度区分）。
     → 明暗走**三档**（深/中/亮），金属件单独用 ORM.B 判并给金属反射。
     改动 GLSL 记得同步改下面的 hook signature。 */
  const HANDLE_SHADE_DARK = 0.42;    // 接缝 / 深色面板
  const HANDLE_SHADE_MID = 0.95;     // 面板主面
  const HANDLE_SHADE_LIGHT = 1.45;   // 亮螺点 / 高光棱
  const HANDLE_METAL_LIFT = 1.55;    // 金属件（环/护片）提亮
  const HANDLE_METAL_ROUGH = 0.20;   // 金属件的粗糙度（要能反光才像金属）
  const HANDLE_ROUGH_FLOOR = 0.34;   // ★ 握柄粗糙度**下限** —— 治"反射太强"（旧值 0.035 = 近乎镜面）
  const HANDLE_METAL_DAMP = 0.55;    // 握柄（非金属）金属度衰减 0.96→0.53，压掉塑料镜面
  /* ★ 2026-10-16（用户：柄色要「根据原模上的颜色不同有颜色变化」）：
     模型反照率的**通道比例**混进柄色的权重。0 = 完全忽略模型色相（旧行为，单色平铺）；
     1 = 完全跟随（会把柄色完全交给模型，卡片的 tint 就没意义了）。
     取 0.35：明暗/色相都能跟着原模分区走，card tint 仍是主色。 */
  const HANDLE_MODEL_FOLLOW = 0.35;
  /* ★ 2026-10-16（用户：深色刀柄「混成一团」，闭环结构要「改成浅色」）：
     暗底结构提亮三件套，只在暗底生效（darkK 驱动）。
       STRUCT_LIFT 深色底把亮档抬多高（0 = 回旧行为）
       STRUCT_PALE 结构像素往白里混多少（0.55 = 混出"浅灰白"）
       STRUCT_MIX  结构提亮的总权重 */
  const HANDLE_STRUCT_LIFT = 1.75;
  const HANDLE_STRUCT_PALE = 0.55;
  const HANDLE_STRUCT_MIX = 0.70;

  const BLADEMASK_MAPFRAG = `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  // S8 mask 只接管握柄区域；护手/尾部仍由 BladeSkin 的刀身材质着色。
  vec3 hRaw = texture2D( uBladeOrigMap, vMapUv ).rgb;
  float hLum = dot(hRaw, vec3(0.2126, 0.7152, 0.0722));
  // The original GLB texture is often a metallic tactical grip. Reusing its full
  // **absolute** luminance as albedo makes wood/leather/ceramic look like painted
  // metal, so the level stays anchored at 0.45 (modelDetail keeps only ±6%).
  float modelDetail = clamp(0.96 + (hLum - 0.45) * 0.12, 0.88, 1.06);
  /* ★★ 2026-10-16（用户：「其他卡的刀柄效果都要稍微改下，要根据原模上的颜色不同
     有颜色变化，从而突出刀柄结构；现在就是一个颜色铺上去，没什么质感」）

     病灶：柄色 = 卡片 tint × 三档明暗 —— 模型自己的**颜色分区**（原模哪块偏红、
     哪块偏冷偏暗）被整片抹掉，24 张卡看着都是"一个颜色铺上去"。
     修法：把模型反照率的**通道比例**（去掉明度、只留色相倾向）按
     HANDLE_MODEL_FOLLOW 混进柄色 —— 原模偏红的区域更暖、偏冷的更沉，
     分区结构重新读得出来；明度层次仍由下面三档负责，两者正交
     （比例是去明度后的量，不会把曝光带偏）。
       hRaw ≈ 中性灰 → ratio ≈ (1,1,1) → 与原行为完全一致
       hRaw 偏红     → ratio 暖侧 > 1     → 该区域被推暖 */
  vec3 hRatio = hRaw / max( 0.06, hLum );
  vec3 hHue = mix( vec3( 1.0 ), hRatio, ${HANDLE_MODEL_FOLLOW} );
  vec3 handleTint = max(uHandleTint * 2.0, vec3(0.0));
  float tintLum = dot(handleTint, vec3(0.2126, 0.7152, 0.0722));
  handleTint = mix(handleTint, vec3(tintLum), uHandleDesat);
  /* ★ 2026-10-16 模型自带层次：**三档明暗** + 金属件。
     模型握柄反照率的 4 档明度 → 接缝(0.06)/凹槽(0.16) 落深档、面板(0.24) 落中档、
     螺点与棱(0.47) 落亮档 —— 这样"深色面板 / 亮螺点 / 接缝"三者的差异能读出来。
     金属环 / 护片按 ORM.B 单独提亮（它们该是金属，不该被涂成哑光握柄）。 */
  float hTone1 = smoothstep(0.10, 0.22, hLum);
  float hTone2 = smoothstep(0.28, 0.45, hLum);
  vec3 handleBase = vec3(0.48 * modelDetail) * handleTint * hHue * uHandleGain * mix(1.0, uHandleReflection, 0.10);
  /* ★★ 2026-10-16（用户：「S8 目前深色刀柄还是有点混成一团，可以给对应的刀柄内有闭环结构
     的地方改成浅色，这只是参考，你看看怎么改」）

     病灶：三档明暗都是「底色 × 系数」——底色很暗（旧木 #42382a / 握皮 #57352b …）时
     三档一起变黑，螺点 / 棱线 / 闭环边缘全糊成一团（实测 S8_12 旧木柄整块纯黑）。
     修法两条，**只在暗底生效**：
       ① 底色越暗，亮档越亮（darkK 把亮档往上推）→ 深色面板与结构重新分得开；
       ② 模型反照率高档细节（hTone2：螺点/棱）+ 凸曲率（vEdge）合成的「结构像素」
          往**浅色**去混 —— 闭环 / 螺点 / 棱这类封闭结构最吃这一口（用户原话"改成浅色"）。
     亮底（浅木 / 白瓷 / 竹节）上 darkK≈0，两条都不生效 → 那些卡观感保持不变。
     ⚠ 下面 HANDLE_STRUCT_* 三个数改动后必须同步改 signature（见 _buildBladeMaskSpec）。 */
  float handleBaseLum = dot( handleBase, vec3( 0.2126, 0.7152, 0.0722 ) );
  float darkK = clamp( 1.0 - handleBaseLum * 2.4, 0.0, 1.0 );
  float shadeLight = ${HANDLE_SHADE_LIGHT} + darkK * ${HANDLE_STRUCT_LIFT};
  float hStruct = clamp( hTone2 * 0.70 + smoothstep( 0.30, 0.90, vEdge ) * 0.50, 0.0, 1.0 );
  vec3 handleColor = mix(handleBase * ${HANDLE_SHADE_DARK}, handleBase * ${HANDLE_SHADE_MID}, hTone1);
  handleColor = mix(handleColor, handleBase * shadeLight, hTone2);
  vec3 paleLift = mix( handleColor, vec3( 1.0 ), ${HANDLE_STRUCT_PALE} );
  handleColor = mix( handleColor, paleLift, darkK * hStruct * ${HANDLE_STRUCT_MIX} );
  vec4 handleLook = k3dHandleLookCall( vHandleLocal );
  k3dHandleLookShared = handleLook;
  handleColor *= handleLook.rgb;
  float hMetal = smoothstep( 0.45, 0.80, texture2D( uBladeMaskMap, vMapUv ).b );
  handleColor = mix(handleColor, handleColor * ${HANDLE_METAL_LIFT}, hMetal);
  /* ★ 曲率 AO（与刀身同一套语义，见 material.js 的 curvatureAO / 方案 §5.2）：
     凹（vEdge→0）压暗、凸（vEdge→1）提亮 —— 接缝 / 凹槽 / 棱线在**任何材质**下都能读出来。
     这是"结构层次"的第二条腿：材质再怎么哑光，起伏也能靠 AO 读出来。
     只乘在 handleColor 上（最后按 wH 混入）→ 刀身与护手完全不受影响。 */
  {
    float hEdge = clamp( vEdge, 0.0, 1.0 );
    handleColor *= mix( 1.0 - uCurvAO * 0.45, 1.0 + uCurvAO * 0.30, hEdge );
  }
  // S8 card fingerprint: a separate local handle layer. The 30% identity blend
  // keeps the selected wood/leather/metal base material readable beneath the motif.
  float handleStrength = clamp( uHandleCardFx.y, 0.0, 0.52 );
  if ( handleStrength > 0.001 ) {
    float style = floor( uHandleCardFx.x );
    float tier = clamp( ( uHandleCardFx.x - style ) * 10.0, 0.0, 5.0 );
    float motif = k3dHandleSlotMotif( vHandleLocal.xy );
    float engraving = smoothstep( 0.60, 0.96, motif );
    float grain = 0.5 + 0.5 * sin( vHandleLocal.x * ( 22.0 + style * 1.7 )
                                  + vHandleLocal.y * ( 5.0 + style * 0.37 ) );
    vec3 accent = vec3(
      clamp( abs( mod( uHandleCardFx.w * 6.0 + 0.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
      clamp( abs( mod( uHandleCardFx.w * 6.0 + 4.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ),
      clamp( abs( mod( uHandleCardFx.w * 6.0 + 2.0, 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 )
    );
    vec3 identityHandle = handleColor;
    vec3 cardHandle = mix( handleColor, handleColor * 0.62 + accent * 0.48,
                           engraving * handleStrength * 0.92 );
    cardHandle *= 1.0 + ( grain - 0.5 ) * handleStrength * 0.42;
    float inlay = smoothstep( 0.84, 0.98,
      0.5 + 0.5 * sin( ( vHandleLocal.x * 11.0 + vHandleLocal.y * 7.0 + uHandleCardFx.w ) * 6.28318 ) );
    cardHandle = mix( cardHandle, cardHandle * 0.72 + accent * 0.38,
                      inlay * step( 2.0, tier ) * handleStrength * 0.48 );
    float star = step( 0.955, k3dCardHash( floor( vHandleLocal.xy * ( 34.0 + style ) ) + vec2( style ) ) );
    cardHandle += accent * star * step( 5.0, tier ) * handleStrength * 0.14;
    handleColor = mix( cardHandle, identityHandle, 0.30 );
  }
  // 只覆盖握柄。护手/尾部保留 k3dSkinW() 的刀身材质效果，不被 S8 默认灰色覆盖。
  diffuseColor.rgb = mix( diffuseColor.rgb, handleColor, wH );
}`;

const BLADEMASK_ROUGHFRAG = `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  /* 复用 map 片段算好的结果（见 k3dHandleLookShared 注释），不再重复内联 */
  vec4 handleLook = k3dHandleLookShared;
  /* ★ 下限从 0.035 抬到 ${HANDLE_ROUGH_FLOOR} —— 旧的近乎镜面，是"反射太强 / 像塑料"的主因。 */
  float handleRough = clamp( uHandleRoughness + handleLook.a, ${HANDLE_ROUGH_FLOOR}, 1.0 );
  if ( uHandleCardFx.y > 0.001 ) {
    float motif = k3dHandleSlotMotif( vHandleLocal.xy );
    handleRough = clamp( handleRough + ( motif - 0.5 ) * uHandleCardFx.y * 0.32, ${HANDLE_ROUGH_FLOOR}, 1.0 );
  }
  /* 金属件（环 / 护片 / 螺点）要能反光才像金属 */
  handleRough = mix( handleRough, ${HANDLE_METAL_ROUGH}, smoothstep( 0.45, 0.80, texture2D( uBladeMaskMap, vMapUv ).b ) );
  roughnessFactor = mix( roughnessFactor, handleRough, wH );
}`;

  const BLADEMASK_NORMALFRAG = `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  if (wH > 0.001) {
    vec3 hRgb = k3dHandleLookShared.rgb;
    float h = dot(hRgb, vec3(0.3333333));
    float bumpScale = 0.25;
    if (uHandlePatternKind == 6 || uHandlePatternKind == 7 || uHandlePatternKind == 15 || uHandlePatternKind == 18 || uHandlePatternKind == 19) bumpScale = 0.13;
    if (uHandlePatternKind == 1 || uHandlePatternKind == 2 || uHandlePatternKind == 5 || uHandlePatternKind == 8 || uHandlePatternKind == 12 || uHandlePatternKind == 14 || uHandlePatternKind == 16 || uHandlePatternKind == 21 || uHandlePatternKind == 22 || uHandlePatternKind == 23) bumpScale = 0.30;
    vec3 surfDx = dFdx(vViewPosition);
    vec3 surfDy = dFdy(vViewPosition);
    vec3 r1 = cross(surfDy, normal);
    vec3 r2 = cross(normal, surfDx);
    float det = dot(surfDx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    vec3 bumped = abs(det) * normal - grad * bumpScale * wH;
    normal = normalize(mix(normal, bumped, 0.6));
  }
}`;

  const BLADEMASK_METALFRAG = `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  /* ★ 握柄（非金属）金属度衰减到 ${HANDLE_METAL_DAMP}：0.96 的「冷镜钢柄」原本整块镜面 → 塑料感。
     金属件（ORM.B 高 = 环/护片）保持真金属。 */
  float hMetalM = smoothstep( 0.45, 0.80, texture2D( uBladeMaskMap, vMapUv ).b );
  metalnessFactor = mix( metalnessFactor, mix( uHandleMetalness * ${HANDLE_METAL_DAMP}, 1.0, hMetalM ), wH );
}`;

  const BLADEMASK_PHYSFRAG = `#ifdef USE_IRIDESCENCE
{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  float nonBlade = wH;
  material.iridescence = mix( material.iridescence, 0.0, nonBlade );
}
#endif
#ifdef USE_CLEARCOAT
{
  float wB2, wG2, wH2; k3dRegionW( wB2, wG2, wH2 );
  float nonBlade2 = wH2;
  material.clearcoat = mix( material.clearcoat, 0.0, nonBlade2 );
  material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.0, nonBlade2 );
}
#endif`;

  // 把 GLSL 块挂到实例上（_buildBladeMaskSpec 引用 this._BLADEMASK_*）
  BladeViewer.prototype._BLADEMASK_COMMON = BLADEMASK_COMMON;
  BladeViewer.prototype._BLADEMASK_MAPFRAG = BLADEMASK_MAPFRAG;
  BladeViewer.prototype._BLADEMASK_ROUGHFRAG = BLADEMASK_ROUGHFRAG;
  BladeViewer.prototype._BLADEMASK_NORMALFRAG = BLADEMASK_NORMALFRAG;
  BladeViewer.prototype._BLADEMASK_METALFRAG = BLADEMASK_METALFRAG;
  BladeViewer.prototype._BLADEMASK_PHYSFRAG = BLADEMASK_PHYSFRAG;

  K3D.bladeViewer = BladeViewer;

  /**
   * ★ P7：离屏渲染一把刀的正面图，返回 dataURL（PNG/JPEG）。
   * 供赛事对阵区展示"玩家的刀"和"对手的刀"。
   * 流程：新建临时 Viewer（不挂 DOM） → loadKnife → applyBladeSkin → snapshot → dispose。
   * 失败时降级返回 null（arenaUI 会显示纯 DOM 剪影兜底）。
   * @param {object} record  刀记录（含 knifeType / skinState / styleId / tier）
   * @param {number} [w=200] [h=280] 快照尺寸
   * @returns {Promise<string|null>} dataURL 或 null
   */
  BladeViewer.prototype.renderPortrait = async function(record, w = 200, h = 280) {
    if (!record || !record.knifeType) return null;
    const kt = String(record.knifeType || '').replace(/^knife_/, '');
    // 先尝试用 bladeViewer 的 manifest 找对应条目
    const entry = this.knives.find((k) => k.id === kt);
    if (!entry) return null;
    // 临时 detached container
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:' + w + 'px;height:' + h + 'px;overflow:hidden;';
    // 必须 append 到 document 才能让 ResizeObserver / getBoundingClientRect 工作
    document.body.appendChild(container);
    try {
      // 新建 Viewer（与 forge 页同套 Three.js 管线，但不挂 orbit controls 交互）
      const vv = new K3D.Viewer(container);
      await vv.loadKnife(entry.file);
      // 应用皮肤（若有 skinState）
      if (record.skinState && K3D.bladeSkin && K3D.bladeSkin.composeBladeSkin) {
        const pack = K3D.bladeSkin.composeBladeSkin(record.skinState);
        if (pack) this.applyBladeSkin(kt, pack);
      }
      // 渲染一次并导出
      const url = vv.snapshot(w, h);
      vv.dispose();
      return url || null;
    } catch (e) {
      console.warn('[renderPortrait] 离屏渲染失败', e.message || e);
      try { const vv2 = new K3D.Viewer(container); vv2.dispose(); } catch (_) {}
      return null;
    } finally {
      try { container.parentNode.removeChild(container); } catch (_) {}
    }
  };

export const bladeViewer = __reg.proxy.bladeViewer;
