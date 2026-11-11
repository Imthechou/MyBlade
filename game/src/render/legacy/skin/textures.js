/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/textures.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
const K3D = __reg.proxy;

  /** 每种纹理可有的资源槽（文档 §7 的标准目录） */
  const ASSET_SLOTS = ['pattern', 'roughness', 'normal', 'flow', 'mask'];
  const ASSET_BASE = 'assets/blade-skins/textures/';

  /**
   * 参数表说明：
   *   defaults  该纹理的默认参数值（UI 滑块初值）
   *   schema    UI 参数定义 [key, label, min, max, step]
   *   channels  该纹理实际输出的通道（pattern/roughness/height 必有）
   *   procedural 是否默认用 shader 程序化生成（true = 无资源也能出效果）
   */
  const TEXTURES = [
    {
      id: 'T01', name: '素面', nameEn: 'Plain', group: '基础',
      desc: '纯净基础表面：纯色金属、高级简约、测材质用',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0, contrast: 0.15, roughnessStrength: 0.25 },
      schema: [['contrast', '对比', 0, 1, 0.01], ['roughnessStrength', '粗糙调制', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T02', name: '拉丝', nameEn: 'Brushed', group: '基础',
      desc: '纵向/横向/环向细密拉丝，方向性高光的来源',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.05,
        density: 180, direction: 0, anisotropy: 0.7, contrast: 0.5, roughnessStrength: 0.55 },
      schema: [['density', '密度', 20, 600, 1], ['direction', '方向(度)', 0, 180, 1],
        ['anisotropy', '各向异性', 0, 1, 0.01], ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T03', name: '锻打纹', nameEn: 'Forged', group: '锻造',
      desc: '不规则锻打面：低频噪声 + 中频噪声 + 法线 + 粗糙度变化',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.35,
        lowFreq: 0.35, midFreq: 0.55, hammerDensity: 14, contrast: 0.6, roughnessStrength: 0.6 },
      schema: [['hammerDensity', '锤点密度', 4, 40, 0.5], ['lowFreq', '低频', 0, 1, 0.01],
        ['midFreq', '中频', 0, 1, 0.01], ['roughnessStrength', '粗糙调制', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T04', name: '大马士革', nameEn: 'Damascus', group: '锻造',
      desc: '★ 核心纹理：多层 fbm 流纹 + domain warp，模拟真实大马士革钢的暗/亮层交错',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.55,
        contrast: 0.7, roughnessStrength: 0.5 },
      schema: [['warp', '扭曲强度', 0, 1.2, 0.01], ['contrast', '对比', 0, 1, 0.01],
        ['roughnessStrength', '粗糙调制', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'flow'], procedural: true,
    },
    {
      id: 'T05', name: '水波纹', nameEn: 'Ripple', group: '锻造',
      desc: '连续柔和波纹，适合折叠钢 / 流线型刀 / 高级金属',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.25,
        frequency: 10, amplitude: 0.55, contrast: 0.55, roughnessStrength: 0.45 },
      schema: [['frequency', '频率', 2, 30, 0.1], ['amplitude', '幅度', 0, 1, 0.01],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T06', name: '大理石纹', nameEn: 'Marble', group: '自然',
      desc: 'Voronoi + Noise + Domain Warp（不要做成固定几根线）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.5,
        cellScale: 3.2, veinWidth: 0.12, contrast: 0.72, roughnessStrength: 0.4 },
      schema: [['cellScale', '晶格尺度', 0.5, 12, 0.1], ['veinWidth', '纹路宽度', 0.01, 0.4, 0.01],
        ['contrast', '对比', 0, 1, 0.01], ['warp', '扭曲', 0, 1.2, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T07', name: '几何纹', nameEn: 'Geometric', group: '工业',
      desc: '六边形 / 三角 / 菱形 / 工业网格，由 seed 随机 rotation/scale/offset/phase',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.05,
        tile: 1, gridScale: 10, grooveWidth: 0.12, contrast: 0.65, roughnessStrength: 0.55 },
      schema: [['tile', '图案(0六边/1三角/2菱/3网格)', 0, 3, 1], ['gridScale', '网格密度', 2, 40, 0.5],
        ['grooveWidth', '沟槽宽度', 0.02, 0.4, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T08', name: '火焰纹', nameEn: 'Flame', group: '自然',
      desc: '模拟火焰/熔流：Directional Noise + Warp + Gradient',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.6,
        flowDir: 0.25, stretch: 2.5, contrast: 0.72, roughnessStrength: 0.5 },
      schema: [['flowDir', '流向', 0, 1, 0.01], ['stretch', '拉长', 0.5, 6, 0.1],
        ['contrast', '对比', 0, 1, 0.01], ['warp', '扭曲', 0, 1.2, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T09', name: '雾状流体', nameEn: 'Doppler Mist', group: '幻彩', star: true,
      desc: '★★ 多普勒的形状来源：大块雾团 + 柔和边界 + 多尺度噪声 + 不规则流向（由 seed 随机）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.55,
        mistLarge: 0.75, mistSmall: 0.35, softness: 0.50, contrast: 0.65, roughnessStrength: 0.35 },
      schema: [['mistLarge', '大雾团', 0, 1, 0.01], ['mistSmall', '小雾团', 0, 1, 0.01],
        ['softness', '边缘柔化', 0, 1, 0.01], ['warp', '扭曲', 0, 1.2, 0.01], ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T10', name: '彩色云纹', nameEn: 'Iridescent Cloud', group: '幻彩',
      desc: '比 T09 更明显的云状彩纹：彩虹云 / 油膜 / 幻彩钢',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.6,
        cloudScale: 2.0, colorSpread: 0.75, softness: 0.45, contrast: 0.65 },
      schema: [['cloudScale', '云尺度', 0.5, 6, 0.05], ['colorSpread', '色彩跨度', 0, 1, 0.01],
        ['softness', '边缘柔化', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T11', name: '蚀刻纹', nameEn: 'Etched', group: '工业',
      desc: '激光/化学蚀刻、微刻线：主要走 normal + roughness + height',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.1,
        lineDensity: 60, lineWidth: 0.06, depth: 0.65, roughnessStrength: 0.75 },
      schema: [['lineDensity', '刻线密度', 10, 200, 1], ['lineWidth', '线宽', 0.01, 0.3, 0.005],
        ['depth', '深度', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T12', name: '碎片纹', nameEn: 'Shard', group: '工业',
      desc: '随机块状区域：淬火残色 / 特殊钢 / Case Hardened 风格 / 矿石感',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.3,
        shardScale: 5, shardContrast: 0.78, plateThickness: 0.25, roughnessStrength: 0.6 },
      schema: [['shardScale', '碎块密度', 1, 20, 0.5], ['shardContrast', '碎块对比', 0, 1, 0.01],
        ['plateThickness', '块面厚度', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height'], procedural: true,
    },
    {
      id: 'T13', name: '渐变之色', nameEn: 'Fade', group: '幻彩',
      desc: '★ 2026-10-11 新增：沿刀身的平滑多段色相渐变 + 缎面拉丝底（CS:GO 渐变之色语言）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.5,
        density: 6, direction: 0, contrast: 0.7, roughnessStrength: 0.45 },
      schema: [['density', '色带段数', 1, 20, 1], ['warp', '边界扰动', 0, 1, 0.01],
        ['direction', '渐变轴向', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T14', name: '深红之网', nameEn: 'Crimson Web', group: '幻彩',
      desc: '★ 2026-10-11 新增：不规则蛛网（Voronoi 双阈值），深底亮丝，配深红/暗金色板最出效果',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.35,
        gridScale: 9, grooveWidth: 0.09, contrast: 0.8, roughnessStrength: 0.55 },
      schema: [['gridScale', '网眼密度', 3, 24, 0.5], ['grooveWidth', '丝线粗细', 0.02, 0.3, 0.005],
        ['warp', '不规则度', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T15', name: '多普勒', nameEn: 'Doppler', group: '幻彩',
      desc: '★ 2026-10-11 新增：双八度域扭曲的流动色块（多普勒 / 液态大理石），冷色域过渡最自然',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.75,
        cellScale: 3.0, softness: 0.42, contrast: 0.75, roughnessStrength: 0.35 },
      schema: [['cellScale', '色块尺度', 0.8, 8, 0.05], ['softness', '过渡柔化', 0.05, 0.95, 0.01],
        ['warp', '域扭曲', 0, 1.5, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T16', name: '渐变大理石', nameEn: 'Marble Fade', group: '幻彩',
      desc: '★ 2026-10-11 新增：湍流扰动的石脉 + 低频分区，色板沿刀身扫过（渐变大理石语言）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.7,
        cellScale: 3.6, veinWidth: 0.07, contrast: 0.78, roughnessStrength: 0.4 },
      schema: [['cellScale', '石脉尺度', 1, 9, 0.05], ['veinWidth', '脉络宽度', 0.02, 0.3, 0.005],
        ['warp', '湍流强度', 0, 1.5, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T17', name: '淬火斑驳', nameEn: 'Case Hardened', group: '幻彩',
      desc: '★ 2026-10-11 v3 新增：双频噪声大斑 + 亮边，斑块内部带细粒（表面淬火 / 残色钢）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.45,
        cellScale: 3.2, contrast: 0.8, roughnessStrength: 0.55 },
      schema: [['cellScale', '斑块尺度', 0.8, 8, 0.05], ['warp', '斑块破碎', 0, 1.2, 0.01],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T18', name: '星尘', nameEn: 'Stardust', group: '特殊',
      desc: '★ 2026-10-11 v3 新增：网格星点 + 银河带（星空黑 / 陨铁点缀）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.3,
        gridScale: 12, contrast: 0.85, roughnessStrength: 0.4 },
      schema: [['gridScale', '星点密度', 4, 30, 0.5], ['contrast', '星点亮度', 0, 1, 0.01],
        ['warp', '银河扰动', 0, 1.2, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T19', name: '霜花', nameEn: 'Frost', group: '自然',
      desc: '★ 2026-10-11 v3 新增：交叉正弦晶格生成的枝状冰晶（寒锋 / 低温钢）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.4,
        cellScale: 3.4, contrast: 0.75, roughnessStrength: 0.45 },
      schema: [['cellScale', '晶格密度', 1.5, 9, 0.05], ['warp', '晶枝扰动', 0, 1.2, 0.01],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T20', name: '鳞纹', nameEn: 'Dragon Scale', group: '自然',
      desc: '★ 2026-10-11 v3 新增：错位砖格 + 圆域生成叠瓦鳞片与亮边（龙鳞 / 重甲感）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.35,
        gridScale: 11, contrast: 0.78, roughnessStrength: 0.5 },
      schema: [['gridScale', '鳞片密度', 4, 26, 0.5], ['warp', '鳞片错落', 0, 1.2, 0.01],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T21', name: '电路', nameEn: 'Circuit', group: '工业',
      desc: '★ 2026-10-11 v3 新增：每格随机轴向的直角走线 + 节点（科技 / 极简工业）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.1,
        gridScale: 9, grooveWidth: 0.09, contrast: 0.7, roughnessStrength: 0.55 },
      schema: [['gridScale', '网格密度', 3, 22, 0.5], ['grooveWidth', '线宽', 0.02, 0.3, 0.005],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T22', name: '云锦层叠', nameEn: 'Layered Swirl', group: '锻造',
      desc: '★ 2026-10-11 v3 新增：各向异性层噪声生成正弦层带 + 亮线（层锻 / 云锦）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.6,
        cellScale: 2.6, contrast: 0.72, roughnessStrength: 0.5 },
      schema: [['cellScale', '层带尺度', 1, 8, 0.05], ['warp', '层带扭曲', 0, 1.5, 0.01],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T23', name: '极光带', nameEn: 'Aurora Ribbons', group: '特殊',
      desc: '★ 2026-10-11 v3 新增：双噪声扰动的竖直光带（极光 / 幻彩流动）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.7,
        cellScale: 2.4, softness: 0.45, contrast: 0.76, roughnessStrength: 0.38 },
      schema: [['cellScale', '光带尺度', 0.8, 7, 0.05], ['softness', '边界柔化', 0.05, 0.95, 0.01],
        ['warp', '扰动强度', 0, 1.5, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
    {
      id: 'T24', name: '陨铁纹', nameEn: 'Widmanstatten', group: '特殊',
      desc: '★ 2026-10-11 v3 新增：三族交叉长条晶体（魏氏组织 / 陨铁切片）',
      defaults: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, warp: 0.25,
        cellScale: 2.2, veinWidth: 0.08, contrast: 0.82, roughnessStrength: 0.5 },
      schema: [['cellScale', '晶体尺度', 1, 8, 0.05], ['veinWidth', '晶体宽度', 0.02, 0.3, 0.005],
        ['contrast', '对比', 0, 1, 0.01]],
      channels: ['pattern', 'roughness', 'height', 'mask'], procedural: true,
    },
  ];

  /** 纹理全局默认（文档 §6 的随机化参数，所有纹理共有） */
  const TEXTURE_COMMON = Object.freeze({
    seed: 381729,
    scale: 1.0,
    rotation: 0,
    offset: { x: 0, y: 0 },
    warpStrength: 0.4,
    contrast: 0.5,
    strength: 1.0,
  });

  // ⚠ 先建 LIST，再由 LIST 建索引：get() 必须返回**同一个对象**，
  //   否则 list().indexOf(get(id)) 会落空（曾导致 uTexId=0 → 纹理全走 T01）
  const LIST = TEXTURES.map((t) => Object.freeze({ ...t, defaults: Object.freeze({ ...t.defaults }) }));
  const INDEX = new Map(LIST.map((t) => [t.id, t]));

  K3D.textures12 = {
    TEXTURES: LIST,
    TEXTURE_COMMON,
    ASSET_SLOTS,
    ASSET_BASE,
    /** 该纹理的本地资源目录（可替换 WebP 放这里；不存在则纯程序化） */
    assetDir: (id) => ASSET_BASE + id + '/',
    list: () => LIST.slice(),
    get(id) { return INDEX.get(id) || LIST[0]; },
    /** 1-based 序号（shader 里用 int 分支识别纹理） */
    indexOf(id) { return LIST.findIndex((t) => t.id === id) + 1; },
    byGroup: (g) => LIST.filter((t) => t.group === g),
  };

export const textures12 = __reg.proxy.textures12;
