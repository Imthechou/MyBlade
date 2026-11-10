/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/materials.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 25 张原料卡；materialId 覆盖 M01–M24，神话模板复用 M22 并按种子强化属性。 */
  const MATERIALS = [
    // ── 普通（8 张）：基础钢铁系 ──
    { id: 'MAT01', name: '生铁',     rarity: 'common', materialId: 'M08', statBias: { toughness: +13, craft: +4 }, riskDelta: 0, trait: 'TR108', note: '粗朴含杂，韧性尚可' },
    { id: 'MAT02', name: '碳钢',     rarity: 'common', materialId: 'M01', statBias: { strength: +9, toughness: +7 }, riskDelta: 0, note: '最稳的入门钢' },
    { id: 'MAT03', name: '低碳钢',   rarity: 'common', materialId: 'M03', statBias: { toughness: +11, sharpness: +3 }, riskDelta: 0, trait: 'TR101', note: '韧而不锐' },
    { id: 'MAT04', name: '工具钢',   rarity: 'common', materialId: 'M02', statBias: { strength: +9, craft: +7 }, riskDelta: 0, note: '均衡实用' },
    { id: 'MAT05', name: '锰钢',     rarity: 'common', materialId: 'M05', statBias: { strength: +11, toughness: +4 }, riskDelta: 0, trait: 'TR107', note: '强而韧' },
    { id: 'MAT06', name: '弹簧钢',   rarity: 'common', materialId: 'M07', statBias: { toughness: +13, design: +3 }, riskDelta: 0, trait: 'TR103', note: '带弹性的韧性' },
    { id: 'MAT07', name: '铸铁',     rarity: 'common', materialId: 'M06', statBias: { strength: +7, toughness: +9 }, riskDelta: 0, trait: 'TR114', note: '硬而脆' },
    // ★ 2026-10-03 修 D9：MAT08 原来也写 M07（与 MAT06 视觉重复），被 S1 卡池排除
    //   → 结果 25 条原料只产出 23 个唯一材质，**M04「铬镜钢」全局无人引用**，
    //   连带 CB02「大马士革秘密」的 requires.materialId 含 M04 → 结构性不可达。
    //   现把 MAT08 接到 M04（铬镜钢：metalness 1.0 / roughness 0.30，镜面感强，
    //   与 S5「镜面冷光」工艺天然搭配），既补上 M04 又不浪费这张卡。
    { id: 'MAT08', name: '铬镜钢',   rarity: 'common', materialId: 'M04', statBias: { toughness: +11, craft: +4 }, riskDelta: 0, trait: 'TR120', note: '温润易锻' },

    // ── 精良（6 张）：彩色金属系 ──
    // ★ 2026-10-04 文案优化：原 5 张全叫「钛合金」，玩家只能靠 note 的四个字分辨。
    //   现按 skin/materials.js 的正式材质名（M09 冰蓝钛 / M10 深海钛 / M11 极光钛 /
    //   M12 紫晶钛 / M13 赤焰钛）各自命名，**卡名与图鉴材质名对齐**。
    { id: 'MAT09', name: '冷锻钛',   rarity: 'fine',   materialId: 'M09', statBias: { strength: +19, craft: +15, design: +7 }, riskDelta: 0.04, trait: 'TR104', note: '轻而冷' },
    { id: 'MAT10', name: '深海钛',   rarity: 'fine',   materialId: 'M10', statBias: { toughness: +19, craft: +12 }, riskDelta: 0.035, trait: 'TR108', note: '深海沉稳' },
    { id: 'MAT11', name: '紫晶钛',   rarity: 'fine',   materialId: 'M12', statBias: { spirit: +15, design: +12 }, riskDelta: 0.03, trait: 'TR102', note: '紫晶灵动' },
    { id: 'MAT12', name: '赤焰钛',   rarity: 'fine',   materialId: 'M13', statBias: { strength: +15, sharpness: +15 }, riskDelta: 0.033, trait: 'TR102', note: '赤焰锋锐' },
    { id: 'MAT13', name: '黄金合金', rarity: 'fine',   materialId: 'M14', statBias: { design: +19, spirit: +12 }, riskDelta: 0.035, trait: 'TR117', note: '贵重华丽' },
    { id: 'MAT14', name: '极光钛',   rarity: 'fine',   materialId: 'M11', statBias: { craft: +15, design: +12, spirit: +7 }, riskDelta: 0.038, trait: 'TR104', note: '极光清冽' },

    // ── 稀有（4 张）：宝石珠光系 ──
    { id: 'MAT15', name: '蓝晶石',   rarity: 'rare',   materialId: 'M15', statBias: { craft: +36, spirit: +30 }, riskDelta: 0.04, trait: 'TR118', note: '清澈冷光' },
    { id: 'MAT16', name: '紫晶石',   rarity: 'rare',   materialId: 'M16', statBias: { spirit: +45, design: +30 }, riskDelta: 0.07, trait: 'TR118', note: '神秘幻彩' },
    { id: 'MAT17', name: '翡翠玉',   rarity: 'rare',   materialId: 'M17', statBias: { toughness: +36, spirit: +30 }, riskDelta: 0.04, trait: 'TR125', note: '温润如玉' },
    { id: 'MAT18', name: '琥珀金',   rarity: 'rare',   materialId: 'M18', statBias: { strength: +30, spirit: +36 }, riskDelta: 0.04, trait: 'TR110', note: '古老暖意' },

    // ── 史诗（3 张）：珠光液态系 ──
    { id: 'MAT19', name: '铂珍珠光', rarity: 'epic',   materialId: 'M19', statBias: { design: +86, craft: +72 }, riskDelta: 0.1, trait: 'TR118', note: '珠光流转' },
    { id: 'MAT20', name: '液态银',   rarity: 'epic',   materialId: 'M20', statBias: { sharpness: +86, craft: +58 }, riskDelta: 0.07, trait: 'TR120', note: '流光溢彩' },
    { id: 'MAT21', name: '液态黑',   rarity: 'epic',   materialId: 'M21', statBias: { spirit: +100, toughness: +58 }, riskDelta: 0.1, trait: 'TR116', note: '深渊镜面' },

    // ── 传说（3 张）：特殊视觉系 ──
    // ★ 2026-10-04 文案优化：去掉间隔号「·」，与全库命名风格统一。
    { id: 'MAT22', name: '星陨铁',   rarity: 'legend', materialId: 'M22', statBias: { spirit: +125, strength: +56 }, riskDelta: 0.1, trait: 'TR305', note: '天外之物，星尘微光' },
    { id: 'MAT23', name: '月蚀晶',   rarity: 'legend', materialId: 'M23', statBias: { spirit: +125, craft: +71 }, riskDelta: 0.11, trait: 'TR302', note: '月蚀之夜凝固' },
    { id: 'MAT24', name: '极光银',   rarity: 'legend', materialId: 'M24', statBias: { spirit: +112, design: +85 }, riskDelta: 0.12, trait: 'TR304', note: '极光入钢' },

    // ── 神话（1 张）：模板 + 掷骰 ──
    // ★ 2026-10-04 文案优化：「无名·神铁」→「天降陨铁」。
    //   原名的问题：9 张神话卡里 7 张以「无名」开头，而这词在说"我不知道我是什么"——
    //   神话卡该给的是"很强且不可控"。现全库神话卡统一句式「神X天Y」。
    // ★ 2026-10-07：materialId 由复用的 'M22' 改为专属 'M25'。
    //   原写法让「天降陨铁」与「星陨铁」拿到完全相同的材质与指纹色（ΔE = 0.00，
    //   tools/probe_de.js 在 S1 抓到的唯一 FAIL）。神话卡必须有自己可辨的视觉指纹。
    { id: 'MAT25', name: '天降陨铁', rarity: 'mythic', materialId: 'M25', statBias: { spirit: +127, strength: +64, craft: +64 }, riskDelta: 0.13, trait: 'TR303',
      template: true, note: '天降神铁，属性随本局种子掷骰变化' },
  ];

  /** 稀有度权重（阶段 1 抽卡用；与 10×24 全卡的稀有度分布近似一致） */
  const RARITY_WEIGHT = {
    common: 40, fine: 24, rare: 15, epic: 10, legend: 7, mythic: 4,
  };

  K3D.materials = {
    MATERIALS,
    RARITY_WEIGHT,
    byRarity: (r) => MATERIALS.filter((m) => m.rarity === r),
    byGroup: () => MATERIALS,
    get: (id) => MATERIALS.find((m) => m.id === id) || MATERIALS[0],
    /** 按稀有度权重抽一张原料（需传入确定性 RNG） */
    roll(rand, onlyRarities = null) {
      const pool = onlyRarities
        ? MATERIALS.filter((m) => onlyRarities.includes(m.rarity))
        : MATERIALS;
      // 加权抽
      let total = 0;
      for (const m of pool) total += RARITY_WEIGHT[m.rarity] || 1;
      let r = rand() * total;
      for (const m of pool) {
        r -= RARITY_WEIGHT[m.rarity] || 1;
        if (r < 0) return m;
      }
      return pool[pool.length - 1];
    },
  };

export const materials = __reg.proxy.materials;
