/**
 * S4 模型轮廓光晕内核（来自 V1，保留原视觉算法）。
 * 安全修正：先快照源 mesh，再批量附加 shell，避免遍历时自增子节点。
 * 上层共享程序/预热由 src/render/index.js 管理。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const THREE = global.THREE;
  const K3D = (global.K3D = global.K3D || {});

  /** 壳层数：越多渐变越丝滑。 */
  const SHELL_COUNT = 6;
  /** 最内层（贴刀）的不透明度上限 —— 2026-10-10 用户指定 40%。 */
  const MAX_ALPHA = 0.34;
  /** 最外层相对 spread 的外扩倍数。 */
  const OUTER_OFFSET = 1.70;
  /** 有彩色时的饱和度系数 —— 2026-10-10 用户指定 1.0（不额外加浓，保留刀身本色）。 */
  const SAT_BOOST = 1.0;
  /** 归一化亮度目标：光晕不要顶到纯白。 */
  const VALUE_TARGET = 0.92;
  /** 材质色近乎无彩时，配方卡片色所占比重。 */
  const FALLBACK_HEX = '#5fc8ff';

  /** 多层壳：t=0 最内（贴刀）→ t=1 最外。 */
  const SHELLS = (function () {
    const out = [];
    for (let i = 0; i < SHELL_COUNT; i++) {
      const t = i / (SHELL_COUNT - 1);
      out.push({
        offset: 0.08 + (OUTER_OFFSET - 0.08) * Math.pow(t, 1.35),
        amount: MAX_ALPHA * Math.pow(1 - t, 1.35),
        rim: 3.3 - 1.9 * t,
        light: t,
      });
    }
    return out;
  })();
  const LAYERS = SHELLS.map((s) => s.offset);

  const DEFAULTS = { glow: 0.8, spread: 0.02, tintHex: FALLBACK_HEX };

  const GLOW_VERT = [
    'uniform float uShell;',
    'attribute vec3 aRegion;',
    'uniform float uGuardW;',
    'uniform float uHandleW;',
    'varying float vRegionW;',
    'varying vec3 vN;',
    'varying vec3 vView;',
    'void main() {',
    '  /* 区域权重：aRegion 是 One-Hot（r=刀身 / g=护手+尾部 / b=刀柄）。',
    '     全刀都罩光晕，但刀柄/护手是细圆柱 + 多环结构，边缘光天然累积得多，',
    '     所以按区域压低它们的强度，避免「刀柄一圈特别重」。 */',
    '  vRegionW = aRegion.x + aRegion.y * uGuardW + aRegion.z * uHandleW;',
    '  vN = normalize(normalMatrix * normal);',
    '  vec3 p = position + normalize(normal) * uShell;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vView = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');

  const GLOW_FRAG = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform float uAmount;',
    'uniform float uSpeed;',
    'uniform float uRim;',
    'uniform float uLight;',
    'uniform vec3  uColor;',
    'uniform vec3  uColor2;',
    'varying float vRegionW;',
    'varying vec3 vN;',
    'varying vec3 vView;',
    'void main() {',
    '  /* 全刀统一：不按区域遮罩，整把刀都罩同一套光晕 */',
    '  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), uRim);',
    '  float pulse = 0.92 + 0.08 * sin(uTime * uSpeed * 1.3);',
    '  float a = uAmount * rim * pulse * clamp(vRegionW, 0.0, 1.0);',
    '  if (a < 0.003) discard;',
    '  /* 由深到浅：内层饱和本色 → 外层偏亮色 */',
    '  vec3 col = mix(uColor, uColor2, clamp(uLight, 0.0, 1.0) * 0.65);',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '}',
  ].join('\n');

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [0.37, 0.78, 1.0];
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** 刀在自身局部坐标系里的长轴长度（决定外扩厚度）。 */
  function axisFrame(geo) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
    return { len: Math.max(Math.max(size[0], size[1], size[2]), 1e-3) };
  }

  /** 读刀身材质颜色（材质自身颜色 → 注入 hook 的基色）。 */
  function readMaterialColor(material) {
    if (!material) return null;
    const hooks = K3D.material?.hookMap?.(material) || material.userData?.__k3dHooks || material.userData?.__hooks;
    if (hooks && typeof hooks.forEach === 'function') {
      let found = null;
      hooks.forEach((h) => {
        if (found || !h || !h.uniforms) return;
        const u = h.uniforms.uBladeBaseColor || h.uniforms.uBaseColor || h.uniforms.uColor || h.uniforms.uTint;
        if (u && u.value && u.value.isColor) found = u.value;
      });
      if (found) return [found.r, found.g, found.b];
    }
    if (material.uniforms && material.uniforms.uBaseColor && material.uniforms.uBaseColor.value) {
      const v = material.uniforms.uBaseColor.value;
      if (v && v.isColor) return [v.r, v.g, v.b];
    }
    if (material.color && material.color.isColor) return [material.color.r, material.color.g, material.color.b];
    return null;
  }

  /**
   * 决定光晕颜色：
   *   材质色有彩 → 归一化亮度 + 拉高饱和（保留刀的色相）
   *   材质色无彩 → 配方卡片色为主，掺少量材质色（保证有颜色）
   */
  function haloColorOf(material, cardRgb) {
    const base = readMaterialColor(material);
    const card = cardRgb || hexToRgb(FALLBACK_HEX);
    if (!base) return card;
    const mx = Math.max(base[0], base[1], base[2]);
    if (mx < 1e-4) return card;
    const mn = Math.min(base[0], base[1], base[2]);
    const chroma = (mx - mn) / mx;
    if (chroma < 0.22) return base.map((v) => clamp(0.27 + v * 0.35, 0.27, 0.62));
    const norm = base.map((v) => clamp((v / mx) * VALUE_TARGET, 0, 1));
    const mean = (norm[0] + norm[1] + norm[2]) / 3;
    return norm.map((v) => clamp(mean + (v - mean) * SAT_BOOST, 0, 1));
  }

  /**
   * 给一把刀挂上光晕（多层壳，全刀统一）。
   * @param {object} spec  卡数据 variants.effect（见 cardEffectRecipes.js）
   * @param {THREE.Object3D} root  已加载的刀模型根（viewer.root）
   */
  function build(spec, root) {
    if (!THREE || !root || !root.traverse) return null;
    const o = Object.assign({}, DEFAULTS, spec || {});
    const cardRgb = hexToRgb(o.tintHex);
    const uniforms = { uTime: { value: 0 } };
    const items = [];
    const glow = clamp(num(o.glow, DEFAULTS.glow), 0, 1);
    const spread = clamp(num(o.spread, DEFAULTS.spread), 0.006, 0.06);

    // Snapshot SOURCE meshes before adding shells. Appending child meshes while
    // traversing the same parent would revisit the newly created glow geometry
    // (or multiply shells exponentially on multi-mesh models).
    const sources = [];
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry?.attributes) return;
      const at = obj.geometry.attributes;
      if (at.position && at.normal && at.aRegion && !obj.name.startsWith('bladeEffectGlow')) sources.push(obj);
    });
    for (const obj of sources) {
      const frame = axisFrame(obj.geometry);
      const c = haloColorOf(obj.material, cardRgb);
      const cHi = [c[0] + (1 - c[0]) * 0.25, c[1] + (1 - c[1]) * 0.25, c[2] + (1 - c[2]) * 0.25];

      SHELLS.forEach((sh, i) => {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: uniforms.uTime,
            uAmount: { value: glow * sh.amount },
            uSpeed: { value: num(o.speed, 1) },
            uRim: { value: sh.rim },
            uLight: { value: sh.light },
            uShell: { value: frame.len * spread * sh.offset },
            uGuardW: { value: REGION_GUARD_W },
            uHandleW: { value: REGION_HANDLE_W },
            uColor: { value: new THREE.Color(c[0], c[1], c[2]) },
            uColor2: { value: new THREE.Color(cHi[0], cHi[1], cHi[2]) },
          },
          vertexShader: GLOW_VERT,
          fragmentShader: GLOW_FRAG,
          transparent: true,
          depthWrite: false,
          /* 普通混合：白底上仍是有颜色的光晕；加色混合在白底上只会越加越白 */
          blending: THREE.NormalBlending,
          side: THREE.BackSide,
        });
        const shell = new THREE.Mesh(obj.geometry, mat);
        shell.name = 'bladeEffectGlow' + i;
        shell.matrixAutoUpdate = false;
        shell.matrix.copy(obj.matrix);
        shell.frustumCulled = false;
        shell.renderOrder = 9 - i;
        if (obj.parent) obj.parent.add(shell);
        items.push({ obj: shell, material: mat, ownGeometry: null,
          source: obj, shellIndex: i, frameLength: frame.len });
      });
    }

    if (!items.length) return null;
    return { items: items, uniforms: uniforms };
  }

  /** Reuse the existing geometry and GPU programs when a different S4 card
   *  selects the same knife. All visual differences are uniform-only updates. */
  function updateSpec(handle, spec) {
    if (!handle || !Array.isArray(handle.items)) return false;
    const o = Object.assign({}, DEFAULTS, spec || {});
    const tint = hexToRgb(o.tintHex);
    const glow = clamp(num(o.glow, DEFAULTS.glow), 0, 1);
    const spread = clamp(num(o.spread, DEFAULTS.spread), 0.006, 0.06);
    for (const item of handle.items) {
      const u = item.material?.uniforms;
      if (!u) continue;
      const sh = SHELLS[item.shellIndex];
      if (!sh) continue;
      const base = haloColorOf(item.source?.material, tint);
      const hi = base.map(v => v + (1 - v) * 0.25);
      u.uAmount.value = glow * sh.amount;
      u.uSpeed.value = num(o.speed, 1);
      u.uShell.value = item.frameLength * spread * sh.offset;
      u.uColor.value.setRGB(base[0], base[1], base[2]);
      u.uColor2.value.setRGB(hi[0], hi[1], hi[2]);
    }
    return true;
  }

  /** 逐帧更新（只写 uniform）。 */
  function update(handle, t) {
    if (!handle || !handle.uniforms) return;
    handle.uniforms.uTime.value = t;
  }

  /** 释放：光晕外壳共享刀体几何，只释放材质。 */
  function dispose(handle) {
    if (!handle || !handle.items) return;
    for (const it of handle.items) {
      if (it.obj && it.obj.parent) it.obj.parent.remove(it.obj);
      if (it.material && it.material.dispose) it.material.dispose();
    }
    handle.items = [];
    handle.uniforms = null;
  }

  K3D.bladeEffects = {
    build, update, updateSpec, dispose, DEFAULTS, axisFrame, haloColorOf, readMaterialColor,
    SHELLS, LAYERS, SAT_BOOST, MAX_ALPHA,
  };
  /** 护手 + 尾部区域的光晕权重（刀身 = 1.0）。 */
  const REGION_GUARD_W = 0.55;
  /** 刀柄区域的光晕权重（刀身 = 1.0）。 */
  const REGION_HANDLE_W = 0.38;

export const bladeEffects = __reg.proxy.bladeEffects;
