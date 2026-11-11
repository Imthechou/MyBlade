/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/handleMaterials.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /**
   * 24 种刀柄材质（与 S8 装配阶段的 24 张卡一一对应）。
   * 字段：
   *   id / name / cardId / group
   *   tintHex        基调色（#rrggbb）
   *   desat          去饱和 0–1（1 = 完全转灰）
   *   metalness      金属度 0–1
   *   roughness      粗糙度 0–1
   *   gain           亮度 0.2–1.6
   *   reflection     反射 0–2
   *   patternKind    程序化外观 kind（= PATTERN_KINDS 下标，供 bladeMask shader 用）
   */
  const HANDLE_MATERIALS = [
    // ── S8_01~S8_04 普通档：朴素、低饱和、不抢戏 ─────────────────────
    { id: 'h_warm_wood',    cardId: 'S8_01', name: '温木柄',   group: '木质',
      surfaceNote: '胡桃木顺纹、琥珀色火焰纹与细木导管，保留自然哑光。', tintHex: '#87562f', desat: 0.04, metalness: 0.02,  roughness: 0.64, gain: 1.08, reflection: 0.98, patternKind: 0 },
    { id: 'h_grip_leather', cardId: 'S8_02', name: '握皮纹',   group: '皮胶',
      surfaceNote: '深鞍革粒面，细密毛孔与柔软压纹，边缘略带油蜡光。', tintHex: '#57352b', desat: 0.12, metalness: 0.00,  roughness: 0.78, gain: 1.06, reflection: 0.92, patternKind: 1 },
    { id: 'h_antisilp',     cardId: 'S8_03', name: '止滑胶',   group: '皮胶',
      surfaceNote: '石墨黑止滑橡胶，双向交叉防滑筋与微砂颗粒。', tintHex: '#252a31', desat: 0.06, metalness: 0.00,  roughness: 0.84, gain: 1.00, reflection: 0.82, patternKind: 2 },
    { id: 'h_lightweight',  cardId: 'S8_04', name: '轻量化',   group: '复合',
      surfaceNote: '冷灰轻量聚合物，纵向减重槽与分段结构线。', tintHex: '#434b56', desat: 0.05, metalness: 0.12, roughness: 0.54, gain: 1.04, reflection: 1.00, patternKind: 3 },
    // ── S8_05~S8_10 精良档：材质身份明确 ────────────────────────────
    { id: 'h_bamboo',       cardId: 'S8_05', name: '竹节柄',   group: '木质',
      surfaceNote: '蜂蜜金竹材，长纤维与几道自然竹节暗环。', tintHex: '#c5a45b', desat: 0.06, metalness: 0.00,  roughness: 0.50, gain: 1.04, reflection: 1.08, patternKind: 4 },
    { id: 'h_tactical_g10', cardId: 'S8_06', name: '战术柄',   group: '复合',
      surfaceNote: '军绿 G10 层压玻纤，平行色层和细密交织切面。', tintHex: '#43513a', desat: 0.08, metalness: 0.18, roughness: 0.52, gain: 1.06, reflection: 1.00, patternKind: 5 },
    { id: 'h_brushed',      cardId: 'S8_07', name: '拉丝柄',   group: '金属',
      surfaceNote: '冷银钛合金，细长拉丝高光和低幅纵向纹理。', tintHex: '#b9c4d0', desat: 0.00, metalness: 0.88, roughness: 0.28, gain: 1.08, reflection: 1.24, patternKind: 6 },
    { id: 'h_machined',     cardId: 'S8_08', name: '机加柄',   group: '金属',
      surfaceNote: '精密机加工钢，微细同心车纹与均匀金属颗粒。', tintHex: '#8491a2', desat: 0.00, metalness: 0.92, roughness: 0.35, gain: 1.06, reflection: 1.18, patternKind: 7 },
    { id: 'h_carbon_weave', cardId: 'S8_09', name: '碳纤柄',   group: '复合',
      surfaceNote: '黑蓝 2×2 碳纤维编织，交错纤维边缘带细亮线。', tintHex: '#293649', desat: 0.00, metalness: 0.40, roughness: 0.32, gain: 1.10, reflection: 1.12, patternKind: 8 },
    { id: 'h_white_ceramic',cardId: 'S8_10', name: '白瓷柄',   group: '陶瓷',
      surfaceNote: '暖白釉瓷，克制的冰裂开片和干净的镜面高光。', tintHex: '#d8cfbd', desat: 0.00, metalness: 0.02,  roughness: 0.24, gain: 1.08, reflection: 1.08, patternKind: 9 },
    // ── S8_11~S8_16 稀有档：出现石/玉/模块/镜面 ──────────────────────
    { id: 'h_cloud_stone',  cardId: 'S8_11', name: '云脉石柄', group: '石玉',
      surfaceNote: '灰白云脉石，宽缓云雾层和深灰自然矿线。', tintHex: '#abb7c7', desat: 0.02, metalness: 0.02,  roughness: 0.38, gain: 1.05, reflection: 1.02, patternKind: 10 },
    { id: 'h_aged_wood',    cardId: 'S8_12', name: '旧木柄',   group: '木质',
      surfaceNote: '烟熏老木，深浅木纹、细裂丝与使用磨蚀。', tintHex: '#52351f', desat: 0.16, metalness: 0.00,  roughness: 0.70, gain: 0.95, reflection: 0.92, patternKind: 11 },
    { id: 'h_wrap_leather', cardId: 'S8_13', name: '缠光皮柄', group: '皮胶',
      surfaceNote: '焦糖棕缠皮，斜向搭接、压线缝边和柔韧粒面。', tintHex: '#8b542f', desat: 0.04, metalness: 0.08, roughness: 0.43, gain: 1.10, reflection: 1.08, patternKind: 12 },
    { id: 'h_mist_jade',    cardId: 'S8_14', name: '雾透玉柄', group: '石玉',
      surfaceNote: '青白雾玉，软雾底色、内部丝絮与冷润玉光。', tintHex: '#76d9c3', desat: 0.02, metalness: 0.02,  roughness: 0.20, gain: 1.10, reflection: 1.20, patternKind: 13 },
    { id: 'h_modular_olive',cardId: 'S8_15', name: '模块军绿', group: '复合',
      surfaceNote: '模块化军绿复合柄，分段护片、暗接缝和精密螺点。', tintHex: '#46573a', desat: 0.08, metalness: 0.14, roughness: 0.52, gain: 1.02, reflection: 0.96, patternKind: 14 },
    { id: 'h_mirror_steel', cardId: 'S8_16', name: '冷镜钢柄', group: '金属',
      surfaceNote: '冰蓝镜钢，近镜面反射和发丝级车削细线。', tintHex: '#d9e6f4', desat: 0.00, metalness: 0.96, roughness: 0.12, gain: 1.12, reflection: 1.40, patternKind: 15 },
    // ── S8_17~S8_20 史诗档：编织/玉芯/镜瓷/幻彩 ─────────────────────
    { id: 'h_deep_carbon',  cardId: 'S8_17', name: '深织亮碳', group: '复合',
      surfaceNote: '深海蓝亮碳，密集斜纹和清晰的纤维走向。', tintHex: '#273650', desat: 0.00, metalness: 0.58, roughness: 0.19, gain: 1.14, reflection: 1.30, patternKind: 16 },
    { id: 'h_jade_core',    cardId: 'S8_18', name: '断光玉芯', group: '石玉',
      surfaceNote: '深青玉芯，断裂冰脉、亮色芯线与不规则玉云。', tintHex: '#368f86', desat: 0.02, metalness: 0.04, roughness: 0.19, gain: 1.12, reflection: 1.24, patternKind: 17 },
    { id: 'h_mirror_ceramic', cardId: 'S8_19', name: '白昼镜瓷', group: '陶瓷',
      surfaceNote: '珍珠白镜瓷，细开片和柔和暖冷双色珠光。', tintHex: '#f8f5ed', desat: 0.00, metalness: 0.04, roughness: 0.12, gain: 1.10, reflection: 1.35, patternKind: 18 },
    { id: 'h_polar_irid',   cardId: 'S8_20', name: '偏振幻彩', group: '异材',
      surfaceNote: '蓝紫至玫瑰青的偏振虹彩膜，带细拉丝反光。', tintHex: '#b7c9eb', desat: 0.00, metalness: 0.74, roughness: 0.18, gain: 1.10, reflection: 1.35, patternKind: 19 },
    // ── S8_21~S8_24 传说/神话档：允许明显彩度与自发光感 ──────────────
    { id: 'h_spirit_jade',  cardId: 'S8_21', name: '共鸣神玉', group: '石玉',
      surfaceNote: '浓翡翠共鸣玉，亮绿色玉脉和内芯聚光。', tintHex: '#28d6a2', desat: 0.00, metalness: 0.04, roughness: 0.14, gain: 1.12, reflection: 1.30, patternKind: 20 },
    { id: 'h_star_iron',    cardId: 'S8_22', name: '星屑玄铁', group: '金属',
      surfaceNote: '陨铁深灰，锻打微坑和稀疏冷金星屑。', tintHex: '#545159', desat: 0.02, metalness: 0.52, roughness: 0.42, gain: 1.06, reflection: 1.08, patternKind: 21 },
    { id: 'h_star_glaze',   cardId: 'S8_23', name: '冷星釉瓷', group: '陶瓷',
      surfaceNote: '午夜蓝星釉，深蓝镜釉底和克制的冷白星点。', tintHex: '#2d4b73', desat: 0.03, metalness: 0.08, roughness: 0.21, gain: 1.10, reflection: 1.10, patternKind: 22 },
    { id: 'h_sky_shell',    cardId: 'S8_24', name: '天工构壳', group: '异材',
      surfaceNote: '珍珠母贝构壳，六边分片、虹彩边缘和精密嵌线。', tintHex: '#c7d7ee', desat: 0.02, metalness: 0.48, roughness: 0.19, gain: 1.12, reflection: 1.30, patternKind: 23 },
  ];

  /** 旧 12 种通用 id 的兼容映射（老数据/存档里可能还写着这些 id） */
  const LEGACY_ALIAS = {
    polymer: 'h_lightweight', wood: 'h_warm_wood', leather: 'h_grip_leather',
    rubber: 'h_antisilp', bamboo: 'h_bamboo', g10: 'h_tactical_g10',
    brushed: 'h_brushed', machined: 'h_machined', carbon: 'h_carbon_weave',
    ceramic: 'h_white_ceramic', marble: 'h_cloud_stone', jade: 'h_mist_jade',
  };

  /** 默认刀柄（装配阶段未选时兜底） */
  const HANDLE_DEFAULT = {
    metalId: 'h_lightweight',
    gain: 1.04, desat: 0.05, metalness: 0.12, roughness: 0.54, reflection: 1.0, tintHex: '#434b56',
  };

  /**
   * 程序化外观 kind 的枚举（顺序即 shader 里的分支号，**不可随意调整**）。
   * 与 js/skin/shader/handleLook.js 的 k3dHandleLook() 分支一一对应，顺序 = S8_01 ~ S8_24。
   */
  const PATTERN_KINDS = [
    'warmWood',      // 0  暖木纹：定向木纹 + 年轮 + 木孔
    'gripLeather',   // 1  皮革粒面：细胞状粒面 + 中频起伏
    'antiSlip',      // 2  止滑胶：细颗粒 + 斜向止滑棱
    'lightWeight',   // 3  轻量化：细磨砂 + 稀疏减重槽
    'bambooNode',    // 4  竹节：竖纤维 + 竹节横隔
    'tacticalG10',   // 5  G10 层压：多层平行色带 + 交错层线
    'brushedSteel',  // 6  拉丝：各向异性长丝
    'machinedSteel', // 7  机加：同心车削纹 + 细颗粒
    'carbonWeave',   // 8  碳纤维：2x2 斜纹编织
    'whiteCeramic',  // 9  白瓷：釉面 + 细开片
    'cloudStone',    // 10 云脉石：域扭曲脉络 + 云雾
    'agedWood',      // 11 旧木：深木纹 + 裂纹 + 暗斑
    'wrapLeather',   // 12 缠光皮：斜向缠绕带 + 光泽粒面
    'mistJade',      // 13 雾透玉：柔和云雾 + 内部透光
    'modularOlive',  // 14 模块：面板分块缝 + 哑光
    'mirrorSteel',   // 15 冷镜钢：近镜面 + 极细机加纹
    'deepCarbon',    // 16 深织亮碳：密织斜纹 + 强高光
    'jadeCore',      // 17 断光玉芯：玉云 + 断光裂纹
    'mirrorCeramic', // 18 白昼镜瓷：亮釉 + 镜面 + 微弱开片
    'polarIrid',     // 19 偏振幻彩：虹彩条纹（色相随位置变化）
    'spiritJade',    // 20 共鸣神玉：玉云 + 发光脉络
    'starIron',      // 21 星屑玄铁：暗铁 + 星屑亮点
    'starGlaze',     // 22 冷星釉瓷：暗釉 + 星点 + 冷色光泽
    'skyShell',      // 23 天工构壳：分块甲壳板 + 虹彩边缘
  ];

  const resolve = (id) => {
    const key = LEGACY_ALIAS[id] || id;
    return HANDLE_MATERIALS.find((m) => m.id === key) || null;
  };

  K3D.handleMaterials = {
    HANDLE_MATERIALS,
    HANDLE_DEFAULT,
    PATTERN_KINDS,
    LEGACY_ALIAS,
    get: (id) => resolve(id),
    /** 按 S8 卡 id 取材质（卡名 -> 材质） */
    byCard: (cardId) => HANDLE_MATERIALS.find((m) => m.cardId === cardId) || null,
    list: () => HANDLE_MATERIALS.slice(),
    byGroup: (g) => HANDLE_MATERIALS.filter((m) => m.group === g),
    groups: () => [...new Set(HANDLE_MATERIALS.map((m) => m.group))],
    /** 取某刀柄的 bladeMask 参数包（供 main.js applyBladeMask 用） */
    maskOf: (id) => {
      const m = resolve(id) || resolve(HANDLE_DEFAULT.metalId);
      return {
        gain: m.gain,
        tint: m.tintHex,
        desat: m.desat,
        metalness: m.metalness,
        roughness: m.roughness,
        reflection: m.reflection,
        // 程序化外观 kind 下发到 bladeMask shader（k3dHandleLook 的分支号，0~23）
        patternKind: m.patternKind,
        wear: 0,
      };
    },
  };

export const handleMaterials = __reg.proxy.handleMaterials;
