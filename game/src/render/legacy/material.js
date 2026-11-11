/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/render/material.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from './/_registry.js';
// ★ 2026-10-14：安装「编译期特化」—— 把 k3dHandleLook 的 24 路 kind 分派
//   裁剪成只留当前刀柄材质那一支（数学逐字不动）。见 skin/shader/specialize.js。
import './skin/shader/specialize.js';
__reg.install();
const global = globalThis;

'use strict';
const K3D = (global.K3D = global.K3D || {});
const THREE = global.THREE;

const WEAR_TINT = new THREE.Color('#8b929b');

/* ★ 2026-10-18（P1「统一渲染程序」）：材质"特性开关"的恒定下限。
   three 把 clearcoat>0 / iridescence>0 计进 program 缓存键，这两个值在 0 ↔ 正值之间
   翻转就会多编一支着色器（配合图案/工艺维度 = "怎么换卡都在编译"）。
   取 1e-4 让开关永远是"开"，强度只由数值表达；该量级低于 8bit 的 1/255 量化步长，
   逐像素无差异。见 toPhysicalMaterial / computeApplied 的注释。 */
const FEATURE_FLOOR = 1e-4;

const MATERIAL_DEFAULTS = Object.freeze({
  baseColor: '#ffffff',
  metalness: 1, roughness: 1,
  patternStrength: 1, normalStrength: 1, reflection: 0.4,
  // ⚠ 清漆/虹彩默认都必须为 0（实测：0.1 也足以"影响颜色"）：
  //   - clearcoat 0.1 → 给刀身加白镜面，浅色皮肤饱和度腰斩（damascus 0.134→0.077）
  //   - iridescence 0.1 → 薄膜干涉只作用于非金属，会把电介质刀柄洗成亮灰
  //   两者在金属刀身上确实无感；要宝石感请降金属度到 0.6-0.8 后手动开。
  clearcoat: 0, clearcoatRoughness: 0.1,
  iridescence: 0, iridescenceIOR: 1.3,
  wear: 0,
});

const MATERIAL_LIMITS = Object.freeze({
  metalness: [0, 1], roughness: [0, 1],
  patternStrength: [0, 1], normalStrength: [0, 2], reflection: [0, 2],
  clearcoat: [0, 1], clearcoatRoughness: [0, 1],
  iridescence: [0, 1], iridescenceIOR: [1.2, 2.5],
  wear: [0, 1],
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function clamp(value, [min, max]) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function deepMerge(...layers) {
  const out = {};
  for (const layer of layers) {
    if (!isObj(layer)) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
    }
  }
  return out;
}

function normalizeMaterial(input = {}) {
  const out = { ...MATERIAL_DEFAULTS };
  const src = isObj(input) ? input : {};
  if (isObj(src.bladeMask)) out.bladeMask = deepMerge(src.bladeMask);
  if (typeof src.baseColor === 'string' || Array.isArray(src.baseColor)) out.baseColor = src.baseColor;
  for (const [key, range] of Object.entries(MATERIAL_LIMITS)) {
    if (src[key] === undefined) continue;
    const v = clamp(src[key], range);
    if (v !== null) out[key] = v;
  }
  return out;
}

function colorFromSpec(spec, fallback = '#ffffff') {
  const c = new THREE.Color();
  try {
    if (typeof spec === 'string') c.setStyle(spec.trim());
    else if (Array.isArray(spec) && spec.length >= 3) c.setRGB(spec[0], spec[1], spec[2], THREE.SRGBColorSpace);
    else c.setStyle(fallback);
  } catch (e) { c.setStyle(fallback); }
  return c;
}

/** MeshStandardMaterial → MeshPhysicalMaterial（clearcoat 需要），逐项拷贝。 */
function toPhysicalMaterial(original) {
  const p = new THREE.MeshPhysicalMaterial();
  for (const k of ['map', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap', 'emissiveMap']) {
    p[k] = original[k] ?? null;
  }
  for (const k of ['name', 'side', 'metalness', 'roughness', 'envMapIntensity',
    'aoMapIntensity', 'emissiveIntensity']) {
    if (original[k] !== undefined) p[k] = original[k];
  }
  p.color.copy(original.color);
  p.emissive.copy(original.emissive);
  if (original.normalScale) p.normalScale.copy(original.normalScale);
  p.userData = { ...original.userData };
  /* ★ 2026-10-18（P1「统一渲染程序」）
   *
   *   病象：three 把"材质特性开关"算进 program 缓存键 —— `iridescence > 0`、
   *   `clearcoat > 0` 一旦从 0 变正值就 `#define` 出另一支着色器 ⇒ **又编一次**。
   *   而本工程的材质表是**逐材质**给这两个值的（多数 0、部分 0.4~0.8），
   *   于是"换一张卡 / 换一种材质"就可能顺带换掉这支 program，与图案/工艺那些
   *   维度叠加，变成"怎么换都在编译"。
   *
   *   改法：给这两个特性一个**恒定下限** FEATURE_FLOOR，让开关永远是"开"，
   *   强弱只由 uniform 数值表达。1e-4 的干涉/清漆低于 8bit 输出的 1/255 量化步长，
   *   逐像素无差异，但缓存键不再随材质翻转。真正要用它们的地方（S6 回火虹彩走
   *   `uTemperIrid`、镜面清漆）照旧写值。
   *
   *   ⚠ 规则必须同时作用于"材质表 → 应用到材质"的那条路径（computeApplied），
   *     否则表里的 0 会把开关翻回去。 */
  p.clearcoat = FEATURE_FLOOR; p.clearcoatRoughness = 0.1;
  p.ior = 1.5; p.specularIntensity = 1; p.sheen = 0;
  p.iridescence = FEATURE_FLOOR; p.iridescenceIOR = 1.3; p.transmission = 0;
  return p;
}

function computeApplied(orig, M) {
  const wear = clamp(M.wear, MATERIAL_LIMITS.wear) ?? 0;
  const base = colorFromSpec(M.baseColor);
  return {
    roughness: Math.min(1, M.roughness * orig.roughness * (1 + 1.1 * wear) + 0.22 * wear),
    metalness: Math.max(0, M.metalness * orig.metalness * (1 - 0.45 * wear)),
    envMapIntensity: M.reflection * orig.envMapIntensity * (1 - 0.55 * wear),
    color: orig.color.clone().lerp(WEAR_TINT, 0.6 * wear).multiply(base),
    normalScaleX: M.normalStrength * (orig.normalScale ? orig.normalScale.x : 1),
    normalScaleY: M.normalStrength * (orig.normalScale ? orig.normalScale.y : 1),
    // ★ 2026-10-18：见 toPhysicalMaterial 顶部 —— 特性取值恒 >= FEATURE_FLOOR（开关不翻转）。
    clearcoat: Math.max(M.clearcoat, FEATURE_FLOOR), clearcoatRoughness: M.clearcoatRoughness,
    iridescence: Math.max(M.iridescence, FEATURE_FLOOR), iridescenceIOR: M.iridescenceIOR,
    patternStrength: M.patternStrength, wear,
    baseColorHex: typeof M.baseColor === 'string' ? M.baseColor : base.getHexString(),
  };
}

/* ---------------------------------------------------------- fragment hook 管理 */

const HOOKS_KEY = '__k3dHooks';

/* ★ 2026-10-14：材质"代数"计数器。
   任何会让 three 需要**新建 program** 的改动都会 +1：
     · hook 集合 / signature 变化（syncFragmentHooks 重新装配）
     · program 缓存被清空（invalidateHookProgram）
   viewer 在出帧前比对这个代数：变了就先 compileAsync 把新 program 备好，
   绝不在渲染路径上撞 three 的同步编译等待（实测单次 130–215s）。 */
let MATERIAL_GEN = 0;
const bumpMaterialGen = () => { MATERIAL_GEN++; };

function hookMap(material) {
  if (!material.userData[HOOKS_KEY]) material.userData[HOOKS_KEY] = new Map();
  return material.userData[HOOKS_KEY];
}

function syncFragmentHooks(material) {
  const hooks = hookMap(material);
  if (hooks.size === 0) {
    if (material.userData.__hooksInstalled) {
      material.userData.__hooksInstalled = false;
      material.onBeforeCompile = () => {};
      material.userData.__hooksDirty = true;
      material.needsUpdate = true;
    }
    return;
  }
  const uniforms = {};
  const common = [];
  const mapFrag = [];
  const roughFrag = [];     // 注入到 #include <roughnessmap_fragment> 之后
  const metalFrag = [];     // 注入到 #include <metalnessmap_fragment> 之后
  const physFrag = [];      // 注入到 #include <lights_physical_fragment> 之后
  const normalFrag = [];    // 注入到 #include <normal_fragment_maps> 之后
  const vertCommon = [];    // 顶点着色器：#include <common> 之后
  const vertBody = [];      // 顶点着色器：#include <begin_vertex> 之后
  // ★ 2026-10-12（需求 2）：hook 装配顺序改用**优先级表**，不再依赖插入顺序。
  //   为什么：刀柄材质（bladeMask）必须**最后**着色 —— 否则刀身皮肤与阶段卡特效
  //   会盖在刀柄材质之上。实测（注入红色卡特效）「战术柄」被染成砖红 probe 94,9,18，
  //   而刀柄本应是军绿 G10（17,17,19）。此前顺序取决于 apply 调用次序（皮肤先挂还是
  //   刀柄先挂），不可靠。固定为 bladeAttrs → bladeSkin → bladeMask；未知 key 保持原序。
  const HOOK_ORDER = ['bladeAttrs', 'bladeSkin', 'bladeMask'];
  const orderedHooks = [...hooks.entries()].sort((a, b) => {
    const ia = HOOK_ORDER.indexOf(a[0]), ib = HOOK_ORDER.indexOf(b[0]);
    return (ia < 0 ? 1.5 : ia) - (ib < 0 ? 1.5 : ib);
  });
  for (const [, hook] of orderedHooks) {
    Object.assign(uniforms, hook.uniforms);
    if (hook.common) common.push(hook.common);
    if (hook.mapFragment) mapFrag.push(hook.mapFragment);
    if (hook.roughnessFragment) roughFrag.push(hook.roughnessFragment);
    if (hook.metalnessFragment) metalFrag.push(hook.metalnessFragment);
    if (hook.physicalFragment) physFrag.push(hook.physicalFragment);
    if (hook.normalFragment) normalFrag.push(hook.normalFragment);
    if (hook.vertexCommon) vertCommon.push(hook.vertexCommon);
    if (hook.vertexBody) vertBody.push(hook.vertexBody);
  }
  material.onBeforeCompile = (shader) => {
    for (const [name, slot] of Object.entries(uniforms)) shader.uniforms[name] = slot;
    let src = shader.fragmentShader;
    if (common.length) src = src.replace('#include <common>', '#include <common>\n' + common.join('\n'));
    if (mapFrag.length) src = src.replace('#include <map_fragment>', '#include <map_fragment>\n' + mapFrag.join('\n'));
    if (roughFrag.length) src = src.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + roughFrag.join('\n'));
    if (metalFrag.length) src = src.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + metalFrag.join('\n'));
    if (physFrag.length) src = src.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + physFrag.join('\n'));
    if (normalFrag.length) src = src.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normalFrag.join('\n'));
    shader.fragmentShader = src;
    // 顶点着色器：区域属性需要从顶点传到片元（aRegion → vRegion）
    let vs = shader.vertexShader;
    if (vertCommon.length) vs = vs.replace('#include <common>', '#include <common>\n' + vertCommon.join('\n'));
    if (vertBody.length) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertBody.join('\n'));
    shader.vertexShader = vs;
  };
  material.userData.__hooksInstalled = true;
  material.userData.__hooksDirty = true;
  bumpMaterialGen();
  // ⚠⚠ 关键：three 的默认 customProgramCacheKey() 返回 onBeforeCompile.toString()，
  //   而这里每次生成的 onBeforeCompile **源码文本完全相同**（逻辑都在闭包里读 hooks）。
  //   于是「增删 hook / 改 signature」时 cacheKey 不变 → three 直接复用旧 program →
  //   着色器改了但画面纹丝不动（实测：强制把刀身染成品红都看不出来）。
  //   必须让 cacheKey 反映当前 hook 集合 + 各自 signature。
  material.customProgramCacheKey = () => {
    // ⚠ 不能用函数源码本身：这里每次生成的 onBeforeCompile 源码是**常量**（逻辑在闭包里读 hooks），
    //   增删 hook 后源码不变 → cacheKey 不变 → three 复用"缺少该 hook"的旧 program。
    //   用 hook 集合 + signature 做 key：集合/结构变才变，纯 uniform 值更新不变。
    // ★ 2026-10-12：key 排序后拼接，避免同一 hook 集合因插入顺序不同产生两个 program
    const parts = [...hooks.keys()].sort().map((k) => k + '#' + ((hooks.get(k).signature) || ''));
    return parts.join('|');
  };
  material.needsUpdate = true;
}

function upsertHook(material, key, spec) {
  const hooks = hookMap(material);
  const existing = hooks.get(key);
  if (existing && existing.signature === spec.signature) {
    for (const [name, slot] of Object.entries(spec.uniforms)) {
      const target = existing.uniforms[name];
      if (!target) continue;
      const value = slot.value;
      // Optional atlas/S3 samplers can legitimately become null between stages.
      // Texture.copy(null) throws, aborting the rest of the skin/handle update.
      if (value == null || (value && value.isTexture)) target.value = value; // sampler refs, including clear
      else if (target.value && typeof target.value.copy === 'function') target.value.copy(value);
      else target.value = value;
    }
    return;
  }
  hooks.set(key, spec);
  syncFragmentHooks(material);
}

function removeHook(material, key) {
  if (hookMap(material).delete(key)) syncFragmentHooks(material);
}

function setPatternStrength(material, strength, baseColor) {
  if (strength === 1) { removeHook(material, 'patternStrength'); return; }
  upsertHook(material, 'patternStrength', {
    signature: 'patternStrength',
    uniforms: {
      uPatternStrength: { value: strength },
      uBaseColor: { value: baseColor.clone() },
    },
    common: 'uniform float uPatternStrength;\nuniform vec3 uBaseColor;',
    mapFragment: 'diffuseColor.rgb = mix( uBaseColor, diffuseColor.rgb, uPatternStrength );',
  });
}

/**
 * P4 Damascus：从 atlas 纹理 A 通道读取 pattern roughness 变体，
 * 调制 roughnessFactor。亮带抛光（A≈255）、暗带磨砂（A→0）。
 * intensity > 0 才注入 hook；0 则清掉避免残留。
 */
function setRoughPattern(material, roughTex, intensity) {
  if (intensity <= 0 || !roughTex) {
    removeHook(material, 'roughPattern');
    return;
  }
  upsertHook(material, 'roughPattern', {
    signature: 'roughPattern:' + (roughTex.uuid || ''),
    uniforms: {
      uRoughPatternTex: { value: roughTex },
      uRoughPatternIntensity: { value: Math.min(1, Math.max(0, intensity)) },
    },
    common: 'uniform sampler2D uRoughPatternTex;\nuniform float uRoughPatternIntensity;',
    roughnessFragment: `{
  float pRough = 1.0 - texture2D( uRoughPatternTex, vMapUv ).a * uRoughPatternIntensity;
  roughnessFactor = clamp( roughnessFactor * pRough, 0.0, 1.0 );
}`,
  });
}

/** 统一的「区域顶点属性」hook：aRegion / aBladeT / aEdge 的声明 + 赋值。
 *  必须在所有会用到这些属性/varying 的 hook（bladeMask、bladeSkin）编译前装上。
 *  ⚠ 属性声明只能有一份：旧实现把声明写在 bladeMask hook 里，bladeMask 缺席时
 *    bladeSkin 用 aBladeT 就 undeclared（或两者都声明就 redefinition，二选一都会炸）。
 *  所以声明独立成一个**恒装**的 hook，与 bladeMask 的启用/停用无关。 */
function setBladeAttrs(material) {  upsertHook(material, 'bladeAttrs', {
    signature: 'bladeAttrs',
    uniforms: {},
    // Fragment-side region data is unconditional: BladeSkin also shades process
    // models (ore / melt / ingot), where there is intentionally no bladeMask hook.
    // Keeping the region contract here prevents BladeSkin from depending on a
    // handle/guard mask merely to compile its blade-only color and roughness code.
    common: `varying vec3 vRegion;
varying vec3 vHandleLocal;
varying float vBladeT;
varying float vEdge;
// ★ 2026-10-07：「真正的刃口」掩码（0..1，顶点属性 aBladeEdge 直接透传）。
//   与 vEdge 的区别：vEdge 是**曲率**（凸=1），背脊、护手棱、凹槽边缘都会亮；
//   vBladeEdge 只在「薄 + 凸 + 靠刀尖」的那条刃线上为 1（判据见 bladeViewer._buildBladeEdgeAttribute）。
//   淬火刃口带（S5）/ 刃线辉光（S7）必须用它，不能用坐标位置猜 —— 实测坐标法在最长的
//   次长轴（= 刀身厚度方向）取两端，四把刀整条刃线命中率 0%。
varying float vBladeEdge;
void k3dRegionW( out float wB, out float wG, out float wH ) {
  wB = vRegion.r; wG = vRegion.g; wH = vRegion.b;
  if ( wB + wG + wH < 0.01 ) { wB = 1.0; wG = 0.0; wH = 0.0; }
}`,
    vertexCommon: `attribute vec3 aRegion;
attribute vec3 aHandleLocal;
attribute float aBladeT;
attribute float aEdge;
attribute float aBladeEdge;
varying vec3 vRegion;
varying vec3 vHandleLocal;
varying float vBladeT;
varying float vEdge;
varying float vBladeEdge;`,
    vertexBody: `vRegion = aRegion;
vHandleLocal = aHandleLocal;
vBladeT = aBladeT;
vEdge = aEdge;
vBladeEdge = aBladeEdge;`,
  });
}

function setBladeMask(material, cfg, origMap, maskMap, maskAlpha) {
  // cfg.active 由调用方给出：皮肤配方带 handle 块、或用户调过刀柄 → 注入。
  // 刀柄样式（颜色 + 质感）统一由本 hook 负责，atlas 烘焙侧不再着色，避免双重应用。
  // maskAlpha=true  → 遮罩取 atlas metal 贴图的 **A 通道**（我们自己烘焙的刀身/刀柄分区，更准）
  // maskAlpha=false → 退化为模型自带 ORM 的 B 通道（无皮肤时的兜底）
  const active = !!cfg && cfg.active !== false && !!origMap && !!maskMap;
  if (!active) { removeHook(material, 'bladeMask'); return; }
  const pick = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  let low = pick(cfg.low, 0.35), high = pick(cfg.high, 0.75);
  if (low >= high) { low = 0.35; high = 0.75; }
  /* ★ 2026-10-14（编译期特化）：刀柄 kind 现在**进 signature 并特化 GLSL**。
   *   旧注释说"pattern kind 是 uniform、不该 fan out program cache"，代价是
   *   k3dHandleLook 的 24 套程序化刀柄材质全部被翻译+内联（实测 ~6.9 s 编译）。
   *   现在只保留当前用到的那一支；换刀柄材质触发重编译，但整套只要 ~4 s（原 195 s）。 */
  const handleKind = Math.round(pick(cfg.handlePatternKind, 0));
  const specOn = !!(K3D.shaderSpecialize && K3D.shaderSpecialize.enabled && K3D.shaderSpecialize.enabled());
  const handleLookGLSL = (K3D.shaderSpecialize && handleKind >= 0 && handleKind <= 23)
    ? K3D.shaderSpecialize.handleLook(K3D.handleLookGLSL, handleKind)
    : (K3D.handleLookGLSL || '');
  upsertHook(material, 'bladeMask', {
    // GLSL 源码结构相关：遮罩来源（K3D_MASK_ALPHA）+ 刀柄 kind（已特化，见上）。
    // 特化关闭时源码与 kind 无关 → 签名退回旧形态（不带 kind）。
    signature: 'bladeMask:v3' + (maskAlpha ? ':alpha' : ':orm') + (specOn ? ':K' + handleKind : ''),
    uniforms: {
      uBladeOrigMap: { value: origMap },
      uBladeMaskMap: { value: maskMap },
      uBladeMaskLow: { value: low },
      uBladeMaskHigh: { value: high },
      uHandleGain: { value: pick(cfg.handleGain, 1) },
      uHandleTint: { value: colorFromSpec(cfg.handleTint, '#ffffff') },
      uHandleDesat: { value: Math.min(1, Math.max(0, pick(cfg.handleDesat, 0))) },
      uHandleMetalness: { value: Math.min(1, Math.max(0, pick(cfg.handleMetalness, 0.35))) },
      uHandleRoughness: { value: Math.min(1, Math.max(0, pick(cfg.handleRoughness, 0.6))) },
      uHandleReflection: { value: Math.min(2, Math.max(0, pick(cfg.handleReflection, 1))) },
      // ★ 刀柄程序化纹理 kind（2026-10-03）：进 signature，否则换刀柄材质不会触发重编译
      uHandlePatternKind: { value: Math.round(pick(cfg.handlePatternKind, 0)) },
      // 护手+尾部（区域 1）：独立材质 profile
      uGuardGain: { value: pick(cfg.guardGain, 1) },
      uGuardTint: { value: colorFromSpec(cfg.guardTint, '#ffffff') },
      uGuardDesat: { value: Math.min(1, Math.max(0, pick(cfg.guardDesat, 0))) },
      uGuardMetalness: { value: Math.min(1, Math.max(0, pick(cfg.guardMetalness, 1))) },
      uGuardRoughness: { value: Math.min(1, Math.max(0, pick(cfg.guardRoughness, 0.35))) },
      uGuardReflection: { value: Math.min(2, Math.max(0, pick(cfg.guardReflection, 1))) },
      uDebugMode: { value: pick(cfg.debugMode, 0) },   // 0=最终 / 1=区域视图
      // 磨损系统（方案 §30/§31）：wear01 × WearRate → 露出底材
      uWear: { value: Math.min(1, Math.max(0, pick(cfg.wear, 0))) },
      uWearLow: { value: pick(cfg.wearLow, 0.10) },
      uWearHigh: { value: pick(cfg.wearHigh, 0.55) },
      // Cavity / Dirt（方案 §5.2）：凹槽积垢/油污
      uDirt: { value: Math.min(1, Math.max(0, pick(cfg.dirt, 0))) },
      // 曲率 AO + 曲率粗糙度（方案 B）：用 vEdge 给刀身加光影/棱线高光，出层次感
      // 固定默认值，始终生效（不接滑块），全局作用于所有工艺
      uCurvAO: { value: 0.6 },
      uCurvRough: { value: 0.5 },
    },
    common: (maskAlpha ? '#define K3D_MASK_ALPHA 1\n' : '') + `uniform sampler2D uBladeOrigMap;
uniform sampler2D uBladeMaskMap;
uniform float uBladeMaskLow;
uniform float uBladeMaskHigh;
uniform float uHandleGain;
uniform vec3 uHandleTint;
uniform float uHandleDesat;
uniform float uHandleMetalness;
uniform float uHandleRoughness;
uniform float uHandleReflection;
uniform int   uHandlePatternKind;   // 刀柄程序化纹理 kind（对应 handleMaterials.PATTERN_KINDS）
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
// 刀柄权重（旧接口保留：纹理 mask 兜底路径用）
float k3dHandleW( vec2 uv ) {
  float wB, wG, wH;
  k3dRegionW( wB, wG, wH );
  if ( vRegion.r + vRegion.g + vRegion.b > 0.01 ) return wH;
  #ifdef K3D_MASK_ALPHA
    float m = texture2D( uBladeMaskMap, uv ).r;
  #else
    float m = 1.0 - texture2D( uBladeMaskMap, uv ).b;
  #endif
  return smoothstep( uBladeMaskLow, uBladeMaskHigh, m );
}

${handleLookGLSL || ''}`,
    vertexCommon: `// 区域属性声明/赋值统一在 'bladeAttrs' hook（见 setBladeAttrs）`,
    vertexBody: ``,
    mapFragment: `{
  vec3 dbgPattern = diffuseColor.rgb;   // atlas 烘焙出的图案（供调试视图「图案」档）
  // 护手+尾部 / 刀柄 的基底都取模型自带贴图（三层体系后的做法）
  vec3 raw = diffuse * texture2D( uBladeOrigMap, vMapUv ).rgb;
  // ── 非刀身区域高光压缩 ───────────────────────────────────────────
  // 护手/刀柄的底色都由 raw 派生，而这两块常落在模型自带的**亮金属**上：
  // 不压的话它们在皮肤旁边会读作"惨白"（用户报的"块与块之间的连接处发白"）。
  // 这里把亮端软压向中灰，保住结构但不再刺眼。刀身不受影响（刀身走 atlas 采样色）。
  // ⚠ 常量必须与 js/atlas.js 烘焙侧的 HLC_CEIL / HLC_K 保持一致，否则两侧色不一致。
  {
    const float HLC_CEIL = 0.42;
    const float HLC_K    = 0.45;
    raw = min( raw, vec3( HLC_CEIL ) ) + max( vec3( 0.0 ), raw - vec3( HLC_CEIL ) ) * HLC_K;
  }
  // 只提暗部（软下限）：暗底 × 彩色 = 看不见，需要抬到可上色的亮度
  float hl = dot( raw, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 lifted = raw * clamp( 0.5 / max( hl, 0.05 ), 1.0, 2.2 );
  vec3 lum = vec3( dot( lifted, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  // ── 磨损系统（方案 §30/§31/§33）──────────────────────────────
  // ①② WearRate：刀尖/刀刃优先磨（§5.2），护手/刀柄磨得慢（真刀的握手处不易掉漆）
  float tAxis = clamp( vBladeT, 0.0, 1.0 );
  float bladeWearRate = mix( 0.20, 1.00, smoothstep( 0.40, 1.00, tAxis ) );
  float wearRate = wB * bladeWearRate + wG * 0.25 + wH * 0.15;
  // ③ EdgeFactor（方案 §7）：凸棱先掉漆、凹槽保留颜色 → WearFinal = Wear × Rate × Edge
  wearRate *= mix( 0.55, 1.70, clamp( vEdge, 0.0, 1.0 ) );
  float wearAmt = uWear * wearRate;
  // ③ Paint → Wear → Reveal Substrate：磨掉处露出**模型底材**（不是变灰）
  //    金属皮上是「彩色 → 银亮」，符合方案 §33 对 Doppler/anasodized 的期望
  float paintAmount = 1.0 - smoothstep( uWearLow, uWearHigh, wearAmt );
  diffuseColor.rgb = mix( lifted, diffuseColor.rgb, paintAmount );
  // ── Cavity / Dirt（方案 §5.2）：凹槽积垢、油污、氧化 —— 用几何曲率反推
  //    凹槽（vEdge→0）积垢、凸棱（vEdge→1）干净；真刀的螺丝孔/锻打凹槽最黑
  float cavity = 1.0 - clamp( vEdge, 0.0, 1.0 );
  float dirt = cavity * uDirt;
  diffuseColor.rgb *= ( 1.0 - dirt * 0.55 );
  // ── 方案 B：曲率 AO（始终生效，让刀身磨线/凹槽出层次）──────────────
  // vEdge=0(凹) 压暗、vEdge=1(凸/刃口) 提亮 → 刃口那条线自然被"点亮"，
  // 磨线凹陷被压出阴影，起伏立刻可见。只作用于刀身权重区（wB），护手/刀柄保留各自着色。
  {
    float e = clamp( vEdge, 0.0, 1.0 );
    float curvatureAO = mix( 1.0 - uCurvAO * 0.35, 1.0 + uCurvAO * 0.30, e );
    diffuseColor.rgb *= mix( 1.0, curvatureAO, wB );
  }
  // ★ 2026-10-12（需求 2）：护手/刀柄的基底**只取模型自带贴图**，不再乘 diffuse。
  //   为什么：diffuse 是「刀身材质 / 阶段卡」写进 material.color 的色相 ——
  //   S8 装配卡的 shaderParams.hue 会把它推成偏红，乘上去后「战术柄」的军绿 G10
  //   被染成砖红（实测 probe 从 军绿 → 砖红），刀柄的身份被刀身色相盖掉。
  //   刀柄的身份只应来自 uHandleTint + k3dHandleLook（24 种材质自己说了算）。
  //   处理方式与刀身 raw 完全一致（同样的 HLC 高光压缩 + 暗部软下限），只是源不同。
  vec3 hRaw = texture2D( uBladeOrigMap, vMapUv ).rgb;
  {
    const float HLC_CEIL_H = 0.42;
    const float HLC_K_H    = 0.45;
    hRaw = min( hRaw, vec3( HLC_CEIL_H ) ) + max( vec3( 0.0 ), hRaw - vec3( HLC_CEIL_H ) ) * HLC_K_H;
  }
  float hlH = dot( hRaw, vec3( 0.2126, 0.7152, 0.0722 ) );
  // Match bladeViewer.js: the selected S8 surface owns grip color; the GLB map
  // may contribute only subtle detail so the grip does not read as painted metal.
  float modelDetailH = clamp(0.96 + (hlH - 0.45) * 0.12, 0.88, 1.06);
  vec3 handleTintH = max(uHandleTint * 2.0, vec3(0.0));
  float tintLumH = dot(handleTintH, vec3(0.2126, 0.7152, 0.0722));
  handleTintH = mix(handleTintH, vec3(tintLumH), uHandleDesat);
  // ── 区域：握柄 ──
  // S8 只覆盖握柄。护手/尾部继续显示 BladeSkin 基础材质，不在这里另涂一层灰色。
  // ── 区域 2：刀柄 ──
  vec3 handleColor = vec3(0.48 * modelDetailH) * handleTintH * uHandleGain * mix(1.0, uHandleReflection, 0.18);
  float hW = ( vRegion.r + vRegion.g + vRegion.b > 0.01 ) ? wH : k3dHandleW( vMapUv );
  // ★ 2026-10-12（需求 2）：颜色/自发光覆盖改用**锐化后的刀柄权重** hWc。
  //   实测：遮罩在刀柄区是软过渡（hW≈0.5），于是刀身皮肤与阶段卡特效的色相有近一半
  //   透过刀柄材质混出来 —— 红色卡把「战术柄」混成砖红（probe 94,9,18）。
  //   质感仍用原始 hW（保留边缘柔和过渡），**颜色与自发光**用 hWc，让刀柄读作自己的材质。
  float hWc = smoothstep( 0.12, 0.45, hW );
  // ★ 2026-10-12（需求 2）：刀柄**不吃刀身卡特效的自发光**。
  //   阶段卡（S5 淬火 / S8 装配 / S9 调校）会往 totalEmissiveRadiance 里叠一层
  //   按卡色相着色的辉光；实测红色卡把「战术柄」整块染成砖红（probe 94,9,18），
  //   而刀柄的身份应只来自 uHandleTint + k3dHandleLook。这里按刀柄权重把它压掉
  //   （留 8% 让极亮卡在刀柄上仍有微弱的“同一把刀”呼应）。护手压一半。
  totalEmissiveRadiance *= ( 1.0 - hWc * 0.92 );
  // ★ 程序化纹理（2026-10-03）：此前旧版刀柄只做纯色 tint，12 类外观除了颜色不同、质感全一样；本轮升级为 24 类独立表面。
  //   算法移植自参考项目「锻刀大赛皮肤效果/docs/12种刀柄材质方案.md」的 HandlePattern，
  //   在运行时用物体坐标（vBladeLocal，与刀身共用 buildFrame 坐标系）直接算，
  //   不用额外资产、零显存开销。kind 与 handleMaterials.PATTERN_KINDS 一一对应。
  {
    // ★ 2026-10-12（需求 2）：刀柄外观走 k3dHandleLook —— 返回 vec4( 结构化底色, 粗糙度偏移 )。
    //   旧版只有一个 ±0.42 的明暗标量，24 张卡的木纹/编织/开片/星点看起来都一样；
    //   现在底色可以带色相（幻彩、玉、星点），粗糙度偏移让质感真能读出来。
    vec4 look = k3dHandleLook( uHandlePatternKind, vHandleLocal );
    // pat ∈ [0,1]：0.5 = 基调色，越偏离越亮/越暗（模拟纹理明暗）
    handleColor *= look.rgb;
    // 纹理同时轻微影响粗糙度：纹理凸起处更粗糙（漫反射），凹陷处更光滑
    roughnessFactor = mix( roughnessFactor, clamp( uHandleRoughness + look.a, 0.03, 1.0 ), hWc );
  }
  // 刀身（vRegion.r）保持 atlas 烘焙的皮肤颜色不动，另外两块按权重覆盖
  diffuseColor.rgb = mix( diffuseColor.rgb, handleColor, hWc );
  // ── 调试视图（方案 v2 §43）────────────────────────────────
  // 1=区域掩码 / 2=图案 / 3=底材 / 4=磨损 / 5=边缘因子
  if ( uDebugMode > 0.5 ) {
    if ( uDebugMode < 1.5 ) {          // 区域：刀身=白 / 护手+尾部=黄 / 刀柄=蓝（§6.3）
      diffuseColor.rgb = vec3( 0.0 );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 1.0, 1.0 ), wB );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.86, 0.24 ), wG );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.31, 0.55, 1.0 ), wH );
    } else if ( uDebugMode < 2.5 ) {   // 图案：只看 atlas 烘焙结果
      diffuseColor.rgb = dbgPattern;
    } else if ( uDebugMode < 3.5 ) {   // 底材：模型原贴图（提亮后）
      diffuseColor.rgb = lifted;
    } else if ( uDebugMode < 4.5 ) {   // 磨损：白=未磨 / 黑=磨穿露底
      diffuseColor.rgb = vec3( paintAmount );
    } else if ( uDebugMode < 5.5 ) {   // 边缘因子：白=凸棱 / 黑=凹槽
      diffuseColor.rgb = vec3( vEdge );
    }
  }
}`,
    // 刀柄独立质感：S8 仅握柄按权重覆盖，刀身与护手保持 BladeSkin 材质
    // （three 的 envMapIntensity 是 uniform 无法逐像素调，「反射」用 albedo 亮度表达）
    roughnessFragment: `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  // ── 方案 B：曲率粗糙度（刀身）──
  // 凸的刃口(vEdge→1) 更光 → 高光更锐利；凹的磨线(vEdge→0) 更糙 → 哑光。
  // 让"起伏"从镜面均匀高光变成有棱有角的明暗分布。只作用于刀身权重 wB。
  {
    float e = clamp( vEdge, 0.0, 1.0 );
    // 以 0.5 为中点：凸 e=1 → -uCurvRough*0.5（更光），凹 e=0 → +uCurvRough*0.5（更糙）
    float bladeRough = clamp( roughnessFactor + uCurvRough * ( 0.5 - e ) * 0.8, 0.0, 1.0 );
    roughnessFactor = mix( bladeRough, roughnessFactor, 0.0 );  // 先取刀身值
    // 护手粗糙度留给 BladeSkin；S8 的独立粗糙度只作用于握柄。
    // ★ 2026-10-12（需求 2）：刀柄质感走 k3dHandleW —— 多数刀模型没有区域顶点属性
    //   （vRegion 全 0），只靠 wH 的话刀柄永远拿不到自己的粗糙度，会一直呈现刀身金属感。
    //   k3dHandleW 内部已处理「有属性用属性、没有则回退遮罩贴图」。
    vec4 handleLook = k3dHandleLook( uHandlePatternKind, vHandleLocal );
    float handleRough = clamp( uHandleRoughness + handleLook.a, 0.035, 1.0 );
    roughnessFactor = mix( roughnessFactor, handleRough, max( wH, k3dHandleW( vMapUv ) ) );
  }
  // 调试模式：强制哑光，让调试色不被高光/反射盖住（否则金属上根本看不清）
  if ( uDebugMode > 0.5 ) roughnessFactor = 1.0;
}`,
    normalFragment: `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  if (wH > 0.001) {
    vec3 hRgb = k3dHandleLook(uHandlePatternKind, vHandleLocal).rgb;
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
}`,
    metalnessFragment: `{
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  // 护手金属度仍由 BladeSkin 决定；S8 只重设握柄金属度。
  // ★ 2026-10-12（需求 2）：同上 —— 金属度也要能落到刀柄上（木/皮/玉=0，钢/瓷=高）
  metalnessFactor = mix( metalnessFactor, uHandleMetalness, max( wH, k3dHandleW( vMapUv ) ) );
  // 调试模式：强制非金属 → 调试色以漫反射直读，不被反射染色
  if ( uDebugMode > 0.5 ) metalnessFactor = 0.0;
}`,
    // S8 只在握柄区域屏蔽刀身虹彩/清漆，护手与尾部仍保留刀身材质的光学效果。
    physicalFragment: `#ifdef USE_IRIDESCENCE
{
  // S8 只屏蔽握柄上的刀身虹彩；护手仍保留刀身材质效果
  float wB, wG, wH; k3dRegionW( wB, wG, wH );
  float nonBlade = max( wH, k3dHandleW( vMapUv ) );
  material.iridescence = mix( material.iridescence, 0.0, nonBlade );
  material.iridescenceFresnel = mix( material.iridescenceFresnel, vec3( 0.0 ), nonBlade );
  material.iridescenceF0 = mix( material.iridescenceF0, vec3( 0.0 ), nonBlade );
}
#endif
#ifdef USE_CLEARCOAT
{
  float wB2, wG2, wH2; k3dRegionW( wB2, wG2, wH2 );
  // S8 只屏蔽握柄上的刀身清漆；护手仍保留刀身材质效果
  float nonBlade2 = max( wH2, k3dHandleW( vMapUv ) );
  material.clearcoat = mix( material.clearcoat, 0.0, nonBlade2 );
  material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.0, nonBlade2 );
}
#endif`,
  });
}

/**
 * 把参数写进材质。atlas 贴图（map）已由 engine 设置好，这里只写参数与注入。
 * 注意：本项目的 atlas 里刀柄已按皮肤着色，所以默认**不**启用刀柄遮罩；
 * 只有用户手动微调刀柄（handleGain/tint/desat 非中性）时才注入。
 */
function applyMaterialState(material, M, opts = {}) {
  const orig = material.userData.orig;
  if (!orig) return null;
  const applied = computeApplied(orig, M);

  // 「区域顶点属性」hook：aRegion/aBladeT/aEdge 的**唯一**声明点，恒装不撤。
  // （bladeMask 启用/停用、bladeSkin 挂上/摘下都不影响这些属性的声明，
  //   否则会出现 undeclared 或 redefinition —— 两个都实测踩过）
  setBladeAttrs(material);

  // clearcoat / iridescence 从 0→>0 会改变 USE_CLEARCOAT / USE_IRIDESCENCE 宏，
  // 需要重编译；其余都是 uniform，不需要
  const hadCC = material.clearcoat > 0;
  const hasCC = applied.clearcoat > 0;
  const hadIR = (material.iridescence || 0) > 0;
  const hasIR = applied.iridescence > 0;

  material.roughness = applied.roughness;
  material.metalness = applied.metalness;
  material.envMapIntensity = applied.envMapIntensity;
  material.color.copy(orig.color).lerp(WEAR_TINT, 0.6 * applied.wear)
    .multiply(colorFromSpec(M.baseColor));
  material.normalScale.set(applied.normalScaleX, applied.normalScaleY);
  material.clearcoat = applied.clearcoat;
  material.clearcoatRoughness = applied.clearcoatRoughness;
  material.iridescence = applied.iridescence;
  material.iridescenceIOR = applied.iridescenceIOR;

  setPatternStrength(material, applied.patternStrength, colorFromSpec(M.baseColor));

  // P4 Damascus：pattern roughness 变体（亮带抛光 / 暗带磨砂）
  setRoughPattern(material, opts.patternRoughMap || null, opts.patternRoughIntensity || 0);

  // 是否注入由调用方通过 bladeMask.active 决定（皮肤有 handle 配方 或 用户调过）
  // 遮罩贴图：有皮肤时用 atlas 的 metal 贴图（A 通道=刀柄分区，更准），
  //           否则退回模型自带 ORM（B 通道）。由 engine.applySkin 记录在 userData。
  setBladeMask(
    material, M.bladeMask, orig.map,
    material.userData.maskTex || orig.metalnessMap,
    !!material.userData.maskAlpha,
  );

  if ((hadCC !== hasCC) || (hadIR !== hasIR)) material.needsUpdate = true;
  return applied;
}

/* ★★ 2026-10-20（P0 · 已证实的 program 引用累积）
 *
 *   病象（原 docs/render-audit-2026-10-20/SUPPLEMENT.md §3A，该证据目录已于 2026-10-24 清理）：同一可见材质热切 60 次，
 *   program 数量不变而 usedTimes 总和 19 → 79；dispose 材质后只减 1。
 *
 *   根因就在下面原来那行 `props.programs = undefined`：three 只在**它的 dispose 回调**里
 *   逐个 `releaseProgram()`（usedTimes--，归零才销毁）。把引用集合直接丢掉，
 *   旧 program 的 usedTimes 永远不减 → 引用只增不减；下次再用同一支 program 时
 *   又一次 usedTimes++，所以"数量不变、引用累积"。
 *
 *   修法（不改 three 内部）：把旧引用集合先**寄存**到材质上，等这一材质真正拿到
 *   新的 program 集合之后再对账 —— 新集合里仍然出现的（同 key 重新命中）不动，
 *   不再出现的才 `usedTimes--`（归零则 destroy + 从 renderer.info.programs 摘掉）。
 *   这样既不会误销毁马上还要用的 program，也不会漏掉真正的旧引用。
 *   对账时机由 viewer 每帧末尾调用 flushProgramReleases()（空集合时零开销）。
 */
const PENDING_RELEASE = new Set();

function releaseProgramReference(renderer, program) {
  if (!program || typeof program.usedTimes !== 'number') return false;
  if (--program.usedTimes > 0) return false;
  /* ★ 2026-10-21：上下文已丢失时不要再 delete —— 那些 GL 对象属于**旧** context，
     会刷 "delete: object does not belong to this context"。等恢复后由 three 重建。 */
  try {
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    if (gl && gl.isContextLost && gl.isContextLost()) return false;
  } catch (_) { /* ignore */ }
  const list = renderer && renderer.info ? renderer.info.programs : null;
  if (Array.isArray(list)) {
    const index = list.indexOf(program);
    if (index >= 0) { list[index] = list[list.length - 1]; list.pop(); }
  }
  try { program.destroy(); } catch (_) { /* already destroyed */ }
  return true;
}

/** 清掉材质的 program 缓存（three r169：命中缓存不会重跑 onBeforeCompile）。 */
function invalidateHookProgram(renderer, material) {
  if (!material.userData || !material.userData.__hooksDirty) return;
  material.userData.__hooksDirty = false;
  const props = renderer && renderer.properties ? renderer.properties.get(material) : null;
  if (props && props.programs) {
    const previous = material.userData.__stalePrograms;
    const list = props.programs instanceof Set ? [...props.programs] : Array.from(props.programs || []);
    /* 打上当前上下文代数：context loss 之后这批 program 已失效，不能再 delete。 */
    const epoch = (globalThis.K3D && globalThis.K3D.glCtxEpoch) || 0;
    for (const program of list) { try { program.__k3dEpoch = epoch; } catch (_) { /* ignore */ } }
    material.userData.__stalePrograms = Array.isArray(previous) ? previous.concat(list) : list;
    props.programs = undefined;
    PENDING_RELEASE.add(material);
  }
  material.needsUpdate = true;
  bumpMaterialGen();
}

/**
 * 对账并释放被 invalidateHookProgram 摘掉的旧 program 引用。
 * 只释放"新 program 集合里已经不存在"的那些 —— 同一 key 重新命中的不算泄漏。
 * @returns {{released:number, materials:number}} released = 真正销毁的 program 数
 */
function flushProgramReleases(renderer) {
  if (!PENDING_RELEASE.size) return { released: 0, materials: 0 };
  let released = 0;
  let materials = 0;
  for (const material of [...PENDING_RELEASE]) {
    const stale = material.userData && material.userData.__stalePrograms;
    const props = renderer && renderer.properties ? renderer.properties.get(material) : null;
    if (!Array.isArray(stale) || !stale.length) { PENDING_RELEASE.delete(material); continue; }
    if (!props || !props.programs) continue;      // 还没重新出帧 → 下一帧再对账
    const live = props.programs instanceof Set ? props.programs : new Set(props.programs);
    const epoch = (globalThis.K3D && globalThis.K3D.glCtxEpoch) || 0;
    for (const program of stale) {
      if (live.has(program)) continue;            // 仍被本材质使用（同 key 命中）
      if (program && program.__k3dEpoch !== undefined && program.__k3dEpoch !== epoch) continue; // 旧 context，丢弃
      if (releaseProgramReference(renderer, program)) released++;
    }
    material.userData.__stalePrograms = [];
    PENDING_RELEASE.delete(material);
    materials++;
  }
  return { released, materials };
}

/** 诊断用：还有多少材质在等对账（0 = 平台期）。 */
function pendingProgramReleases() { return PENDING_RELEASE.size; }

K3D.material = {
  MATERIAL_DEFAULTS, MATERIAL_LIMITS, WEAR_TINT,
  normalizeMaterial, deepMerge, colorFromSpec,
  toPhysicalMaterial, computeApplied, applyMaterialState,
  invalidateHookProgram, defaultMaterial: () => ({ ...MATERIAL_DEFAULTS }),
  flushProgramReleases, pendingProgramReleases, releaseProgramReference,
  /** 材质代数：viewer 用它判断"是否需要先异步预编译再出帧"（见 material.js 顶部注释） */
  materialGen: () => MATERIAL_GEN,
  // hook 管理器（BladeSkin 皮肤系统要用它挂 bladeSkin 注入；多注入点共存不互相覆盖）
  upsertHook, removeHook, hookMap,
  // 区域顶点属性（aRegion/aBladeT/aEdge）的唯一声明 hook，bladeSkin 侧挂 hook 前需确认已装
  setBladeAttrs,
};

export const material = __reg.proxy.material;
