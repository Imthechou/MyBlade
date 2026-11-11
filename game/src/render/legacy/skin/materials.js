/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/materials.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
const K3D = __reg.proxy;

  /** 4 种多普勒 Style = 4 套**色彩生成规则**（文档 §9.6，不是 4 个固定皮肤）
   *
   * 每条风格由「锚点色相 anchor + 色相增量 deltas + 饱和/亮度」定义：
   *   - 灰系材质（饱和度 < 0.20，色相无意义）→ 直接用风格的**绝对色相**，得到经典配色
   *     （例如银灰钢 D02 = 蓝→紫→粉→蓝；若无此规则，灰色派生的色相是随机的）
   *   - 彩色材质（饱和度 ≥ 0.20）→ 把同一套 deltas **锚到该材质自己的色相**上，
   *     于是「同一个 T09 + F10，换材质就得到不同风格的多普勒」（文档 §9.2）
   */
  const DOPPLER_STYLES = {
    // D01 冷色多普勒：蓝 → 紫 → 品红 → 青（偏冷、科技）
    D01: {
      name: '冷色多普勒', anchor: 0.60,
      deltas: [0.00, 0.11, 0.19, -0.10],
      sats: [0.62, 0.74, 0.62, 0.55], vals: [0.44, 0.54, 0.46, 0.40],
    },
    // D02 经典幻彩：蓝 → 紫 → 粉 → 蓝（最接近经典多普勒观感）
    D02: {
      name: '经典幻彩', anchor: 0.62,
      deltas: [0.00, 0.13, 0.22, 0.00],
      sats: [0.64, 0.80, 0.72, 0.58], vals: [0.46, 0.58, 0.52, 0.42],
    },
    // D03 暖冷交替：金 → 橙 → 紫 → 蓝（适合金 / 铜色材质）
    D03: {
      name: '暖冷交替', anchor: 0.09,
      deltas: [0.00, -0.03, 0.66, 0.51],
      sats: [0.66, 0.82, 0.68, 0.56], vals: [0.58, 0.60, 0.46, 0.42],
    },
    // D04 极光多普勒：青 → 绿 → 蓝 → 紫（适合冰蓝钛 / 极光银）
    D04: {
      name: '极光多普勒', anchor: 0.50,
      deltas: [0.00, -0.06, 0.09, 0.24],
      sats: [0.56, 0.64, 0.68, 0.60], vals: [0.48, 0.54, 0.50, 0.44],
    },
  };

  // ── 颜色工具（只在本模块内部用，避免和 shader 侧混） ──────────────
  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }
  function rgbToHsv([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }
  function hsvToRgb(h, s, v) {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  }
  const r3 = (a) => a.map((x) => Math.round(x * 1000) / 1000);

  /**
   * 从材质基础色派生多普勒 profile（文档 §9.2「多普勒颜色应该从原材质派生」）。
   *   - 灰系材质（s < GREY_S）：色相不可信 → 用风格的绝对色相（经典配色）
   *   - 彩色材质：色相 = 材质色相 + 风格 deltas（同风格换材质 → 不同基调）
   * @param {string} baseHex 材质基础色（如 '#8b5cf6'）
   * @param {string} style   D01~D04
   * @param {object} ov      精调项（覆盖派生结果）
   */
  const GREY_S = 0.20;
  function makeDopplerProfile(baseHex, style, ov = {}) {
    const st = DOPPLER_STYLES[style] || DOPPLER_STYLES.D02;
    const [h0, s0] = rgbToHsv(hexToRgb(baseHex));
    const anchorHue = s0 < GREY_S ? st.anchor : h0;   // 灰系用风格锚点，彩色用自己的色相
    const pal = st.deltas.map((d, i) => {
      // 饱和度：取「风格目标」与「材质本身饱和度」的折中，避免彩色材质派生出脏色
      const satMult = s0 < GREY_S ? 1 : Math.min(1, 0.55 + s0 * 0.6);
      return r3(hsvToRgb(anchorHue + d, st.sats[i] * satMult, st.vals[i]));
    });
    return {
      style,
      styleName: st.name,
      anchorHue: +anchorHue.toFixed(4),
      // 保留多少原材质颜色（文档 §9.1：MaterialKeep 0.25~0.65，禁止默认 1.0 全覆盖）
      preserveRatio: ov.preserveRatio ?? 0.42,
      // 多普勒整体强度（文档 §9.1：0.35~0.85，不要默认 1.0）
      strength: ov.strength ?? 0.62,
      hueShift: ov.hueShift ?? 0.0,
      saturationBoost: ov.saturationBoost ?? 1.0,
      brightnessBoost: ov.brightnessBoost ?? 1.0,
      colorBias: ov.colorBias ?? r3([0, 0, 0]),
      paletteStart: ov.paletteStart ?? pal[0],
      paletteMid: ov.paletteMid ?? pal[1],
      paletteEnd: ov.paletteEnd ?? pal[3],
      paletteAlt: ov.paletteAlt ?? pal[2],
    };
  }

  /**
   * 24 种刀身材质。
   * 字段与文档 §4 的 BladeMaterialConfig 一一对应（baseColor 用 hex，交给渲染层转线性）。
   */
  const RAW = [
    // ── M01-M08 钢铁基础系（metalness 0.92~1.00 / roughness 0.35~0.50 / specular 0.6~1.0）──
  // ── 2026-10-11 材质外观两轮调整（S1 决策卡 3D 效果排查）─────────────────
  //   第一轮：25 条材质按「稀有度分层」重做外观——钢铁系用粗糙度梯度分层（哑光/缎面/镜面）、
  //           宝石珠光系真正启用 transmission（0.12~0.18 → 0.30~0.34 走彩釉通透）、
  //           特殊视觉系自发光从"几乎看不见"抬到可见区间。
  //   第二轮（按用户反馈）：赤焰钛 M13 / 紫晶金属 M16 / 琥珀金属 M18 / 天降陨铁 M25 回退原版；
  //           白昼珠光 M19 改为炫彩（镜面银底 + 强薄膜虹彩 0.90 + 420~950 薄厚 + D02 幻彩多普勒）；
  //           噬光液黑 M21 更深吸光 + 更薄蓝紫青油膜；星落陨铁 M22 转哑光暗钢 + 更亮冷色星屑。
  //   数值来源：scripts/patch_materials.js（Manus 工作区），可一键复算与回滚。
    { id: 'M01', name: '银灰碳钢', nameEn: 'Silver Carbon', group: '钢铁基础', baseColor: '#9aa2ac',
      metalness: 0.95, roughness: 0.45, roughnessVariation: 0.10, specularIntensity: 0.70, envIntensity: 1.00,
      dopplerStyle: 'D02' },
                            { id: 'M02', name: '高碳钢', nameEn: 'High Carbon', group: '钢铁基础',
      baseColor: '#7d858f', metalness: 0.98, roughness: 0.24, roughnessVariation: 0.1, specularIntensity: 0.92,
      envIntensity: 1.2,
      dopplerStyle: 'D01' },
                            { id: 'M03', name: '冷白不锈钢', nameEn: 'Cold White Steel', group: '钢铁基础',
      baseColor: '#c3ccd8', metalness: 0.9, roughness: 0.52, roughnessVariation: 0.14, specularIntensity: 0.66,
      envIntensity: 1.02,
      dopplerStyle: 'D04' },
                            { id: 'M04', name: '铬镜钢', nameEn: 'Chrome Mirror', group: '钢铁基础',
      baseColor: '#e0e6ef', metalness: 1, roughness: 0.12, roughnessVariation: 0.03, specularIntensity: 1,
      envIntensity: 1.4, clearcoat: 0.16, clearcoatRoughness: 0.05,
      dopplerStyle: 'D01' },
    { id: 'M05', name: '枪灰钢', nameEn: 'Gunmetal Grey', group: '钢铁基础', baseColor: '#6b7480',
      metalness: 0.96, roughness: 0.48, roughnessVariation: 0.12, specularIntensity: 0.70, envIntensity: 1.00,
      dopplerStyle: 'D01' },
    { id: 'M06', name: '黑曜钢', nameEn: 'Obsidian Steel', group: '钢铁基础', baseColor: '#2c3037',
      metalness: 0.98, roughness: 0.42, roughnessVariation: 0.10, specularIntensity: 0.85, envIntensity: 1.15,
      dopplerStyle: 'D02' },
                            { id: 'M07', name: '烟墨钢', nameEn: 'Smoke Ink Steel', group: '钢铁基础',
      baseColor: '#4a505c', metalness: 0.94, roughness: 0.36, roughnessVariation: 0.18, specularIntensity: 0.8,
      envIntensity: 1.12, clearcoat: 0.34, clearcoatRoughness: 0.1,
      dopplerStyle: 'D02' },
                    { id: 'M08', name: '锻黑钢', nameEn: 'Forged Black', group: '钢铁基础',
      baseColor: '#5c564c', metalness: 0.92, roughness: 0.62, roughnessVariation: 0.2, specularIntensity: 0.62,
      envIntensity: 0.95, clearcoat: 0,
      dopplerStyle: 'D02' },
    { id: 'M09', name: '冰蓝钛', nameEn: 'Ice Blue Titanium', group: '彩色金属', baseColor: '#8fc4de',
      metalness: 0.96, roughness: 0.18, roughnessVariation: 0.10, specularIntensity: 0.88, envIntensity: 1.15,
      clearcoat: 0.22, clearcoatRoughness: 0.14, iridescence: 0.10, iridescenceIOR: 1.35, iridescenceThickness: [120, 380],
      dopplerStyle: 'D04' },
    { id: 'M10', name: '深海钛', nameEn: 'Deep Sea Titanium', group: '彩色金属', baseColor: '#2f5f86',
      metalness: 0.97, roughness: 0.20, roughnessVariation: 0.10, specularIntensity: 0.86, envIntensity: 1.12,
      clearcoat: 0.20, clearcoatRoughness: 0.16, iridescence: 0.08, iridescenceIOR: 1.35, iridescenceThickness: [120, 360],
      dopplerStyle: 'D01' },
                            { id: 'M11', name: '极光钛', nameEn: 'Aurora Titanium', group: '彩色金属',
      baseColor: '#3fa8c8', metalness: 0.95, roughness: 0.2, roughnessVariation: 0.14, specularIntensity: 0.88,
      envIntensity: 1.18, clearcoat: 0.34, clearcoatRoughness: 0.12, iridescence: 0.3, iridescenceIOR: 1.44, iridescenceThickness: [150, 520],
      dopplerStyle: 'D04' },
    { id: 'M12', name: '紫晶钛', nameEn: 'Amethyst Titanium', group: '彩色金属', baseColor: '#8b5cf6',
      metalness: 0.96, roughness: 0.22, roughnessVariation: 0.12, specularIntensity: 0.86, envIntensity: 1.12,
      clearcoat: 0.22, clearcoatRoughness: 0.14, iridescence: 0.14, iridescenceIOR: 1.38, iridescenceThickness: [130, 400],
      dopplerStyle: 'D02' },
                            { id: 'M13', name: '赤焰钛', nameEn: 'Blaze Titanium', group: '彩色金属',
      baseColor: '#c0402a', metalness: 0.96, roughness: 0.24, roughnessVariation: 0.14, specularIntensity: 0.84,
      envIntensity: 1.1, clearcoat: 0.2, clearcoatRoughness: 0.16, iridescence: 0.1, iridescenceIOR: 1.36, iridescenceThickness: [140, 420],
      dopplerStyle: 'D03' },
                            { id: 'M14', name: '黄金钛', nameEn: 'Gold Titanium', group: '彩色金属',
      baseColor: '#d9a84e', metalness: 0.99, roughness: 0.13, roughnessVariation: 0.08, specularIntensity: 0.95,
      envIntensity: 1.3, clearcoat: 0.34, clearcoatRoughness: 0.08, iridescence: 0.05, iridescenceIOR: 1.34, iridescenceThickness: [120, 360],
      dopplerOverride: { preserveRatio: 0.50, strength: 0.55,
        paletteStart: [0.82, 0.60, 0.16], paletteMid: [0.90, 0.44, 0.10], paletteEnd: [0.16, 0.22, 0.86], paletteAlt: [0.48, 0.14, 0.62] },
      dopplerStyle: 'D03' },
                            { id: 'M15', name: '蓝晶金属', nameEn: 'Sapphire Metal', group: '宝石珠光',
      baseColor: '#3f7fd0', metalness: 0.68, roughness: 0.22, roughnessVariation: 0.08, specularIntensity: 0.95,
      envIntensity: 1.26, clearcoat: 0.68, clearcoatRoughness: 0.08, transmission: 0.3, ior: 1.52, iridescence: 0.26, iridescenceIOR: 1.42, iridescenceThickness: [170, 520],
      dopplerStyle: 'D01' },
                            { id: 'M16', name: '紫晶金属', nameEn: 'Amethyst Metal', group: '宝石珠光',
      baseColor: '#9d6cd8', metalness: 0.78, roughness: 0.18, roughnessVariation: 0.08, specularIntensity: 0.95,
      envIntensity: 1.25, clearcoat: 0.58, clearcoatRoughness: 0.08, transmission: 0.12, ior: 1.5, iridescence: 0.18, iridescenceIOR: 1.42, iridescenceThickness: [160, 480],
      dopplerStyle: 'D02' },
                            { id: 'M17', name: '翡翠金属', nameEn: 'Jade Metal', group: '宝石珠光',
      baseColor: '#3fae84', metalness: 0.66, roughness: 0.24, roughnessVariation: 0.1, specularIntensity: 0.92,
      envIntensity: 1.22, clearcoat: 0.7, clearcoatRoughness: 0.09, transmission: 0.3, ior: 1.5, iridescence: 0.24, iridescenceIOR: 1.42, iridescenceThickness: [170, 520],
      dopplerStyle: 'D04' },
                            { id: 'M18', name: '琥珀金属', nameEn: 'Amber Metal', group: '宝石珠光',
      baseColor: '#d98324', metalness: 0.72, roughness: 0.22, roughnessVariation: 0.1, specularIntensity: 0.92,
      envIntensity: 1.22, clearcoat: 0.66, clearcoatRoughness: 0.1, transmission: 0.18, ior: 1.46, iridescence: 0.1, iridescenceIOR: 1.38, iridescenceThickness: [160, 480],
      dopplerStyle: 'D03' },
                            { id: 'M19', name: '珠光白金', nameEn: 'Pearl Platinum', group: '珠光液态',
      baseColor: '#eef2f6', metalness: 0.5, roughness: 0.2, roughnessVariation: 0.1, specularIntensity: 0.95,
      envIntensity: 1.16, clearcoat: 0.78, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6, iridescenceThickness: [380, 820],
      dopplerOverride: { preserveRatio: 0.42, strength: 0.62,
        paletteStart: [0.55, 0.95, 1.00], paletteMid: [0.98, 0.62, 0.98], paletteEnd: [1.00, 0.90, 0.55], paletteAlt: [0.62, 1.00, 0.80] },
      dopplerStyle: 'D04' },
                            { id: 'M20', name: '液态银', nameEn: 'Liquid Silver', group: '珠光液态',
      baseColor: '#9db3d6', metalness: 1, roughness: 0.07, roughnessVariation: 0.04, specularIntensity: 1,
      envIntensity: 1.38, clearcoat: 0.36, clearcoatRoughness: 0.05, iridescence: 0.05, iridescenceIOR: 1.38, iridescenceThickness: [120, 380],
      dopplerStyle: 'D01' },
                            { id: 'M21', name: '液态黑', nameEn: 'Liquid Black', group: '珠光液态',
      baseColor: '#1e2129', metalness: 1, roughness: 0.06, roughnessVariation: 0.06, specularIntensity: 1,
      envIntensity: 1.06, clearcoat: 0.62, clearcoatRoughness: 0.04, iridescence: 0.34, iridescenceIOR: 1.46, iridescenceThickness: [260, 700],
      dopplerOverride: { preserveRatio: 0.58, strength: 0.34,
        paletteStart: [0.28, 0.42, 0.72], paletteMid: [0.52, 0.30, 0.78], paletteEnd: [0.22, 0.66, 0.70], paletteAlt: [0.36, 0.36, 0.88] },
      dopplerStyle: 'D02' },
                            { id: 'M22', name: '星空黑', nameEn: 'Starfield Black', group: '特殊视觉',
      baseColor: '#191c24', metalness: 0.93, roughness: 0.38, roughnessVariation: 0.34, specularIntensity: 0.84,
      envIntensity: 0.9, clearcoat: 0.18, clearcoatRoughness: 0.14, iridescence: 0.34, iridescenceIOR: 1.44, iridescenceThickness: [200, 620], emissionColor: '#b9c8ff', emissionIntensity: 0.11,
      dopplerOverride: { preserveRatio: 0.40, strength: 0.48,
        paletteStart: [0.36, 0.46, 0.92], paletteMid: [0.60, 0.40, 0.96], paletteEnd: [0.30, 0.78, 0.94], paletteAlt: [0.66, 0.62, 1.00] },
      dopplerStyle: 'D01' },
                            { id: 'M23', name: '月蚀紫', nameEn: 'Eclipse Purple', group: '特殊视觉',
      baseColor: '#4a2f6b', metalness: 0.92, roughness: 0.24, roughnessVariation: 0.16, specularIntensity: 0.9,
      envIntensity: 1.16, clearcoat: 0.44, clearcoatRoughness: 0.1, iridescence: 0.4, iridescenceIOR: 1.46, iridescenceThickness: [190, 620], emissionColor: '#7a5cff', emissionIntensity: 0.06,
      dopplerStyle: 'D02' },
                            { id: 'M24', name: '极光银', nameEn: 'Aurora Silver', group: '特殊视觉',
      baseColor: '#9fe8da', metalness: 0.93, roughness: 0.18, roughnessVariation: 0.12, specularIntensity: 0.94,
      envIntensity: 1.24, clearcoat: 0.52, clearcoatRoughness: 0.08, iridescence: 0.8, iridescenceIOR: 1.48, iridescenceThickness: [220, 700], emissionColor: '#6ff0d4', emissionIntensity: 0.08,
      dopplerStyle: 'D04' },
                            { id: 'M25', name: '天降陨铁', nameEn: 'Fallen Star Iron', group: '特殊视觉',
      baseColor: '#d0683a', metalness: 0.93, roughness: 0.26, roughnessVariation: 0.3, specularIntensity: 0.86,
      envIntensity: 1.2, clearcoat: 0.28, clearcoatRoughness: 0.14, iridescence: 0.26, iridescenceIOR: 1.4, iridescenceThickness: [180, 620], emissionColor: '#ff9a4d', emissionIntensity: 0.05,
      dopplerStyle: 'D03' },
  ];

  const MATERIAL_DEFAULTS = Object.freeze({
    metalness: 0.95, roughness: 0.30, roughnessVariation: 0.10, specularIntensity: 0.8,
    clearcoat: 0.0, clearcoatRoughness: 0.10, anisotropy: 0.0, anisotropyRotation: 0.0,
    transmission: 0.0, ior: 1.45, iridescence: 0.0, iridescenceIOR: 1.35,
    iridescenceThickness: [100, 400], emissionColor: null, emissionIntensity: 0.0, envIntensity: 1.0,
  });

  const MATERIALS = RAW.map((m) => {
    const cfg = { ...MATERIAL_DEFAULTS, ...m };
    cfg.doppler = makeDopplerProfile(cfg.baseColor, cfg.dopplerStyle, cfg.dopplerOverride || {});
    delete cfg.dopplerOverride;
    return Object.freeze(cfg);
  });

  /** UI 分组（按文档 §3 的五个系） */
  const GROUPS = ['钢铁基础', '彩色金属', '宝石珠光', '珠光液态', '特殊视觉'];

  K3D.materials24 = {
    DOPPLER_STYLES,
    MATERIALS,
    GROUPS,
    MATERIAL_DEFAULTS,
    makeDopplerProfile,
    list: () => MATERIALS.slice(),
    byGroup: (g) => MATERIALS.filter((m) => m.group === g),
    get(id) { return MATERIALS.find((m) => m.id === id) || MATERIALS[0]; },
  };

export const materials24 = __reg.proxy.materials24;
