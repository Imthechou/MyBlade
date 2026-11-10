/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/knifeTypes.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 12 种刀型基础定义（modelId 对应 manifest / regions.js / .glb） */
  const BASE_TYPES = [
    { id: 'balisong', name: '蝴蝶刀', modelId: 'knife_balisong', desc: '双柄旋转，灵巧', statBias: { design: +2, craft: +1 } },
    { id: 'bayonet',  name: '刺刀',   modelId: 'knife_bayonet',  desc: '直刺型，结构强', statBias: { strength: +2, toughness: +2 } },
    { id: 'folding',  name: '折叠刀', modelId: 'knife_folding',  desc: '便携多段，工艺高', statBias: { craft: +3, design: +1 } },
    { id: 'gladius',  name: '罗马短剑',modelId: 'knife_gladius', desc: '紧凑宽刃，刺击', statBias: { strength: +3, sharpness: +2 } },
    { id: 'karambit', name: '爪子刀', modelId: 'knife_karambit', desc: '弧刃内钩，近身', statBias: { sharpness: +3, spirit: +1 } },
    { id: 'kris',     name: '马来剑', modelId: 'knife_kris',     desc: '波浪刃，灵性高', statBias: { spirit: +3, design: +2 } },
    { id: 'machete',  name: '砍刀',   modelId: 'knife_machete',  desc: '宽刃劈砍，输出强', statBias: { strength: +3, sharpness: +2 } },
    { id: 'saber',    name: '弯刀',   modelId: 'knife_saber',    desc: '弧刃切割，流畅', statBias: { sharpness: +3, design: +1 } },
    { id: 'skull',    name: '骷髅匕首',modelId: 'knife_skull',   desc: '战术造型，设计强', statBias: { design: +3, craft: +2 } },
    { id: 'straight', name: '直刀',   modelId: 'knife_straight', desc: '通用直刃，均衡', statBias: { strength: +2, toughness: +2 } },
    { id: 'survival', name: '生存刀', modelId: 'knife_survival', desc: '多功能，韧性高', statBias: { toughness: +3, craft: +1 } },
    { id: 'tangdao',  name: '唐刀',   modelId: 'knife_tangdao',  desc: '修长直刃，气韵', statBias: { design: +2, spirit: +1 } },
  ];

  /**
   * ═══ 刀名命名（2026-10-06，用户拍板）═══
   * 刀名 = 两字皮肤前缀 + 刀型名。前缀从 材质24 / 缎纹12 / 淬火(工艺)12 三层取，
   * **稀有度决定取字优先级**（名字随成长「升层」，低档重外观、高档重材料）：
   *   common / fine      缎纹 → 工艺 → 材质   （如 拉丝直刀 / 镜抛唐刀）
   *   rare / epic        工艺 → 缎纹 → 材质   （如 淬火弯刀 / 回彩砍刀）
   *   legend / mythic    材质 → 工艺 → 缎纹   （如 紫晶唐刀 / 赤焰弯刀）
   * 某层无字样（缎纹 T01 素面）就落到下一层；三层全空 → 纯刀型名。
   * 老档（无 bladeName 字段）由显示层回落 modelNameOf（刀型名），不显示错名。
   */
  const TEXTURE_PREFIX = {
    T01: '',      // 素面：无字样，落下一层
    T02: '拉丝', T03: '锻打', T04: '大马', T05: '水波', T06: '石纹',
    T07: '几何', T08: '火焰', T09: '雾流', T10: '云纹', T11: '蚀刻', T12: '碎片',
  };
  const FINISH_PREFIX = {
    F01: '精抛', F02: '镜抛', F03: '拉丝', F04: '发黑', F05: '蓝化', F06: '淬火',
    F07: '回彩', F08: '阳极', F09: '镀层', F10: '油膜', F11: '磨砂', F12: '流光',
  };
  const MATERIAL_PREFIX = {
    M01: '银灰', M02: '高碳', M03: '冷白', M04: '铬镜', M05: '枪灰', M06: '黑曜',
    M07: '烟墨', M08: '锻黑', M09: '冰蓝', M10: '深海', M11: '极光', M12: '紫晶',
    M13: '赤焰', M14: '黄金', M15: '蓝晶', M16: '紫辉', M17: '翡翠', M18: '琥珀',
    M19: '珠光', M20: '水银', M21: '墨液', M22: '星黑', M23: '蚀紫', M24: '虹银',
  };
  const NAME_PRIORITY = {
    common: ['texture', 'finish', 'material'],
    fine:   ['texture', 'finish', 'material'],
    rare:   ['finish', 'texture', 'material'],
    epic:   ['finish', 'texture', 'material'],
    legend: ['material', 'finish', 'texture'],
    mythic: ['material', 'finish', 'texture'],
  };

  /** modelId（knife_*）→ 刀型中文名（旧档回落用，也是 bladeNameOf 的底座） */
  function modelNameOf(modelId) {
    const t = BASE_TYPES.find((x) => x.modelId === modelId);
    return t ? t.name : String(modelId || '');
  }

  /**
   * 生成刀名（纯函数）。
   * @param {object} r { rarity, skinState: {materialId, textureId, finishId}, knifeType(modelId) }
   * @returns {string}  两字前缀 + 刀型名（如「淬火弯刀」；全空时纯刀型名）
   */
  function bladeNameOf(r) {
    const type = modelNameOf(r && r.knifeType);
    if (!type) return '';
    const s = (r && r.skinState) || {};
    const order = NAME_PRIORITY[r && r.rarity] || NAME_PRIORITY.common;
    for (const layer of order) {
      let p = '';
      if (layer === 'texture') p = TEXTURE_PREFIX[s.textureId] || '';
      else if (layer === 'finish') p = FINISH_PREFIX[s.finishId] || '';
      else p = MATERIAL_PREFIX[s.materialId] || '';
      if (p) return p + type;
    }
    return type;
  }

  K3D.knifeTypes = {
    BASE_TYPES,
    TEXTURE_PREFIX, FINISH_PREFIX, MATERIAL_PREFIX, NAME_PRIORITY,
    modelNameOf, bladeNameOf,
    typeOf: (typeId) => BASE_TYPES.find((t) => t.id === typeId) || BASE_TYPES[0],
  };

export const knifeTypes = __reg.proxy.knifeTypes;
