/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/finishes.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
const K3D = __reg.proxy;

  /**
   * 每种工艺：
   *   type      参数型 params / Mask 型 mask / Shader 型 shader
   *   mix       默认混合强度（0~1）
   *   affects   该工艺允许改动的通道（文档 §8"关键效果"）
   *   defaults/schema  可调参数（UI 滑块）
   */
  const FINISHES = [
    {
      id: 'F01', name: '精抛光', nameEn: 'Polished', type: 'params', mix: 1.0,
      desc: '降低 Roughness、增强反射（不改变色相）',
      affects: ['roughness', 'reflection'],
      defaults: { amount: 0.55 }, schema: [['amount', '强度', 0, 1, 0.01]],
    },
    {
      id: 'F02', name: '镜面抛光', nameEn: 'Mirror', type: 'params', mix: 1.0,
      desc: '强镜面反射：roughness 压到很低 + 环境反射拉高',
      affects: ['roughness', 'reflection'],
      defaults: { amount: 0.8 }, schema: [['amount', '强度', 0, 1, 0.01]],
    },
    {
      id: 'F03', name: '拉丝处理', nameEn: 'Satin', type: 'params', mix: 1.0,
      desc: '方向性高光：各向异性沿纹理由拉丝方向决定',
      affects: ['roughness', 'anisotropy'],
      defaults: { amount: 0.6, direction: 0 }, schema: [['amount', '强度', 0, 1, 0.01], ['direction', '方向(°)', 0, 180, 1]],
    },
    {
      id: 'F04', name: '发黑氧化', nameEn: 'Blackened', type: 'params', mix: 1.0,
      desc: '深黑氧化层：压暗底色 + 抬粗糙（"发黑"不等于纯黑）。gradient>0 时按 tintHex 染向指定色相（保明暗结构）',
      affects: ['baseColor', 'roughness'],
      defaults: { amount: 0.5, darkness: 0.55, gradient: 0, tintHex: '#ffffff' },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['darkness', '黑度', 0, 1, 0.01],
        ['gradient', '染色强度', 0, 1, 0.01]],
    },
    {
      id: 'F05', name: '蓝化', nameEn: 'Blued', type: 'mask', mix: 1.0,
      desc: '蓝灰氧化层：沿花纹 Mask 叠蓝灰渐变',
      affects: ['baseColor', 'roughness'],
      defaults: { amount: 0.6, tintHex: '#4a6b96', gradient: 0.35 },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['gradient', '渐变跨度', 0, 1, 0.01]],
    },
    {
      id: 'F06', name: '表面淬火', nameEn: 'Case Hardened', type: 'mask', mix: 1.0,
      desc: '★ 随机斑块（CSGO 表面淬火式）：域扭曲 + Voronoi 斑块 + 低频聚团，色域＝留底钢/深蓝/金/紫；每局 run.seed 不同 → 斑块布局整体重排',
      affects: ['baseColor', 'roughness'],
      defaults: { amount: 0.75, heatSpread: 0.7, phase: 0 },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['heatSpread', '斑块密度', 0, 1, 0.01], ['phase', '相位', 0, 1, 0.01]],
    },
    {
      id: 'F07', name: '回火彩', nameEn: 'Tempered', type: 'mask', mix: 1.0,
      desc: '黄 → 紫 → 蓝 热色变化（回火温度越低越黄）',
      affects: ['baseColor'],
      defaults: { amount: 0.7, temperature: 0.45 },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['temperature', '回火程度', 0, 1, 0.01]],
    },
    {
      id: 'F08', name: '阳极氧化', nameEn: 'Anodized', type: 'mask', mix: 1.0,
      desc: '★ 彩色氧化层：支持彩色 + 虹彩（颜色由材质 + 色相偏移决定）',
      affects: ['baseColor', 'iridescence', 'roughness'],
      defaults: { amount: 0.7, hueShift: 0.0, iridescence: 0.35 },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['hueShift', '色相偏移', -0.5, 0.5, 0.01],
        ['iridescence', '虹彩', 0, 1, 0.01]],
    },
    {
      id: 'F09', name: 'PVD 镀层', nameEn: 'PVD Coat', type: 'mask', mix: 1.0,
      desc: '高级彩色涂层：高光洁度薄层 + 轻微色偏（不盖掉金属反射）',
      affects: ['baseColor', 'clearcoat', 'roughness'],
      defaults: { amount: 0.65, coat: 0.5, tintHex: '#8a93a6' },
      schema: [['amount', '覆盖', 0, 1, 0.01], ['coat', '清漆', 0, 1, 0.01]],
    },
    {
      id: 'F10', name: '彩色油膜', nameEn: 'Oil Slick / Doppler', type: 'shader', mix: 1.0,
      desc: '★★ 多普勒色变：Fresnel 视角相关虹彩（正面与斜看不同），颜色由材质派生 palette 决定。gradient>0 时切换为「渐变之色 Fade」：沿刀身长轴的平滑宽幅渐变（紫→品红→橙→金）',
      affects: ['baseColor', 'iridescence', 'reflection'],
      defaults: { strength: 0.62, preserveRatio: 0.42, fresnelPower: 2.2, fresnelIntensity: 0.45, colorPhase: 0.0, gradient: 0.0 },
      schema: [['strength', '多普勒强度', 0.35, 0.85, 0.01], ['preserveRatio', '原材质保留', 0.25, 0.65, 0.01],
        ['fresnelPower', 'Fresnel 幂', 0.5, 5, 0.1], ['fresnelIntensity', 'Fresnel 强度', 0, 1, 0.01],
        ['colorPhase', '色彩相位', 0, 1, 0.01], ['gradient', 'Fade 渐变', 0, 1, 0.01]],
    },
    {
      id: 'F11', name: '喷砂磨砂', nameEn: 'Bead Blast', type: 'params', mix: 1.0,
      desc: '粗糙度提升，去掉镜面感（哑光）',
      affects: ['roughness', 'reflection'],
      defaults: { amount: 0.6 }, schema: [['amount', '强度', 0, 1, 0.01]],
    },
    {
      id: 'F12', name: '动态边缘光', nameEn: 'Edge Glow', type: 'shader', mix: 1.0,
      desc: '★ Fresnel / 流动高光：只在边缘与高光处出现，不破坏基础材质',
      affects: ['emission', 'fresnel', 'reflection'],
      defaults: { amount: 0.45, fresnelPower: 2.6, flowSpeed: 0.35, tintHex: '#9fd0ff' },
      schema: [['amount', '强度', 0, 1, 0.01], ['fresnelPower', 'Fresnel 幂', 0.5, 6, 0.1],
        ['flowSpeed', '流动速度', 0, 1.5, 0.01]],
    },
  ];

  // 同 textures.js：先 LIST 再索引，保证 get() 与 list() 是同一批对象
  const LIST = FINISHES.map((f) => Object.freeze({ ...f, defaults: Object.freeze({ ...f.defaults }) }));
  const INDEX = new Map(LIST.map((f) => [f.id, f]));

  K3D.finishes12 = {
    FINISHES: LIST,
    list: () => LIST.slice(),
    get(id) { return INDEX.get(id) || LIST[0]; },
    /** 1-based 序号（shader 里用 int 分支识别工艺） */
    indexOf(id) { return LIST.findIndex((f) => f.id === id) + 1; },
    byType: (t) => LIST.filter((f) => f.type === t),
    /** 该工艺的参数默认值（供 UI 滑块初值） */
    defaultsOf: (id) => ({ ...(INDEX.get(id) || LIST[0]).defaults }),
  };

export const finishes12 = __reg.proxy.finishes12;
