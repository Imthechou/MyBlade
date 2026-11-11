/**
 * 数据配置层 · 图鉴统一目录（rework T12）
 *
 * ★ 要修什么（审计问题 12 的图鉴部分）：
 *   改造前 `codexTotal()` 是 `CARDS + COMBOS + KNIFE_TYPES + BRANCHES×GRADIENTS + 60`
 *   —— 最后那个 **写死的 60** 不对应任何真实内容集合。
 *   同时 `material` / `finish` / `arena` 三个目录**从来没有写入过**，
 *   于是完成度分母包含玩家永远开不满的项目，进度条注定走不到 100%。
 *
 * ★ 本文件是图鉴**唯一**的内容与分母真源：
 *   每个分类声明自己的条目列表、总数与「未发现时给什么线索」。
 *   UI 只读这里，不自己拼第二套清单。
 *
 * ⚠ 断裂记录（fracture）是**事件型**分类，没有固定分母：
 *   它记录「玩家真实断过的刀」，因此 total 为 null，不参与完成度百分比。
 */

import { CARDS } from './cards.js';
import { COMBOS } from './combos.js';
import { KNIFE_TYPES } from './knifeTypes.js';
import { TAGS } from './tags.js';
import { BASE_TAG_TRAITS, SPECIAL_TAG_TRAITS, HAMMER_TIER_TRAITS, setLegacyTraits, legacyTraits } from './traits.js';
import { traitsV11 } from './legacy/traitsV11.js';
import { BRANCHES, GRADIENTS } from './arena/branches.js';
import { LEGACY_MODE } from '../platform/env.js';
import { FITS, LOOKS, ORE_MATERIALS, SIGNATURES } from '../v19/forge.js';
import { GRADIENTS as V19_GRADIENTS, SCHOOLS } from '../v19/tournament.js';
import { materials } from './legacy/materials.js';
import { knifeTypes } from './legacy/knifeTypes.js';

/** 确保 LEGACY 特性已注册（图鉴是纯展示层，不能依赖 run 先跑过） */
let legacyReady = false;
function ensureLegacy() {
  if (legacyReady || legacyTraits().length) { legacyReady = true; return; }
  setLegacyTraits((traitsV11.TRAITS || []).map((t) => ({
    id: t.id, kind: 'LEGACY', name: t.name,
    desc: t.trigger || '', statDelta: { ...(t.statDelta || {}) },
    tier: t.tier || 'normal', scoreMult: 1, rarityFloor: null,
  })));
  legacyReady = true;
}

/** 纹理中文名（来自 legacy/knifeTypes 的前缀表 = 真实名字） */
const TEXTURE_NAME = knifeTypes.TEXTURE_PREFIX || {};
const FINISH_NAME = knifeTypes.FINISH_PREFIX || {};

const lookGroups = { metal: '钢材', pattern: '纹理', film: '表面膜', fx: '常驻特效' };
const newLooks = slot => Object.entries(LOOKS[slot]).filter(([key, name]) => key !== 'raw' && name).map(([key, name]) => ({
  id: 'v19:' + slot + ':' + key, name, group: lookGroups[slot], hint: '将此' + lookGroups[slot] + '保留至鉴定',
}));

/**
 * 分类定义。
 * `items()` 返回 `[{id, name, desc, hint, group}]`；
 * `total` 为 null 表示事件型分类（无固定分母）。
 */
const LEGACY_CATALOG = [
  {
    id: 'knife',
    name: '刀型',
    desc: '十二款真实刀模',
    items: () => KNIFE_TYPES.map((k) => ({
      id: k.id, name: k.name, desc: k.desc || '', group: null,
      hint: '未锻造过的刀型',
    })),
  },
  {
    id: 'material',
    name: '材料',
    desc: '可用于锻造的原料',
    items: () => (materials.MATERIALS || []).map((m) => ({
      id: m.id, name: m.name, desc: m.note || '', group: m.rarity || null,
      hint: `稀有度 ${m.rarity || '未知'} 的原料`,
    })),
  },
  {
    id: 'texture',
    name: '纹理',
    desc: '锻造形成的纹样',
    items: () => Object.entries(TEXTURE_NAME)
      .filter(([, name]) => !!name)
      .map(([id, name]) => ({
        id, name, desc: '', group: null,
        hint: '尚未形成的锻纹',
      })),
  },
  {
    id: 'finish',
    name: '工艺',
    desc: '刀身表面工艺',
    items: () => Object.entries(FINISH_NAME)
      .filter(([, name]) => !!name)
      .map(([id, name]) => ({
        id, name, desc: '', group: null,
        hint: '尚未使用的表面工艺',
      })),
  },
  {
    id: 'card',
    name: '工艺卡',
    desc: '九阶段的决策卡',
    items: () => CARDS.map((c) => ({
      id: c.id, name: c.name, desc: c.copy || '', group: c.stage || null,
      hint: `${c.stage || '未知阶段'} 的候选卡`,
    })),
  },
  {
    id: 'tag',
    name: '工艺标签',
    desc: '基础、特殊与风味标签',
    items: () => TAGS.map((t) => ({
      id: t.id, name: t.name, desc: t.desc || '', group: null,
      hint: '尚未积累的工艺倾向',
    })),
  },
  {
    id: 'trait',
    name: '特性',
    desc: '基础成长、特殊、锻打与卡池特性',
    items: () => {
      ensureLegacy();
      const out = [];
      for (const t of Object.values(BASE_TAG_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: '基础标签' });
      for (const t of Object.values(SPECIAL_TAG_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: '特殊标签' });
      for (const t of Object.values(HAMMER_TIER_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: 'S4 锻打' });
      for (const t of legacyTraits()) out.push({ id: t.id, name: t.name, desc: t.desc, group: '卡池特性' });
      return out.map((t) => ({ ...t, hint: `${t.group || '未知来源'}中的一条特性` }));
    },
  },
  {
    id: 'combo',
    name: '隐藏组合',
    desc: '条件隐藏 Combo',
    items: () => COMBOS.map((c) => ({
      id: c.id, name: c.name, desc: c.conditions || '', group: c.rarity || null,
      /** 未发现时只给线索，不泄露配方（T12 验收要求） */
      hint: c.hint || '尚未发现触发条件',
    })),
  },
  {
    id: 'arena',
    name: '赛事',
    desc: '六流派 × 五档',
    items: () => BRANCHES.flatMap((b) => GRADIENTS.map((g) => ({
      id: `${b.id}:${g.id}`, name: `${b.name} · ${g.name}`,
      desc: b.desc || '', group: b.name,
      hint: '尚未通关的对阵',
    }))),
  },
  {
    id: 'fracture',
    name: '断刀记录',
    desc: '真实断过的刀（事件型，无固定分母）',
    /** 事件型：没有固定集合，total = null，不参与完成度 */
    items: () => [],
    eventOnly: true,
  },
];

const shared = id => LEGACY_CATALOG.find(category => category.id === id);
const V19_CATALOG = [
  shared('knife'),
  { id: 'material', name: '矿石', desc: '选料台的十二种矿石',
    items: () => ORE_MATERIALS.map(ore => ({
      id: 'v19:' + ore.id, name: ore.name, hint: '以此矿石完成一炉',
    })) },
  { id: 'texture', name: '纹理', desc: '锻打形成的刀身纹样', items: () => newLooks('pattern') },
  { id: 'finish', name: '工艺', desc: '钢材、表面膜与常驻特效',
    items: () => ['metal', 'film', 'fx'].flatMap(newLooks) },
  { id: 'fitting', name: '装配', desc: '六款刀柄配件',
    items: () => FITS.map(({ id, name, parts, role }) => ({
      id, name, desc: parts, group: role, hint: '使用此刀柄完成鉴定',
    })) },
  { id: 'combo', name: '隐藏组合', desc: '拥有对靶专长的签名刀皮',
    items: () => SIGNATURES.map(({ name, desc }) => ({
      id: name, name, desc, hint: '将相合的纹理与表面膜或特效保留至鉴定',
    })) },
  { id: 'arena', name: '赛事', desc: '六流派 × 五阶',
    items: () => Object.entries(SCHOOLS).flatMap(([id, school]) => V19_GRADIENTS.map((name, grade) => ({
      id: id + ':' + grade, name: school.name + ' · ' + name, desc: school.focus,
      group: school.name, hint: '通关对应流派阶位',
    }))) },
  shared('fracture'),
];

export const CODEX_CATALOG = Object.freeze(LEGACY_MODE ? LEGACY_CATALOG : V19_CATALOG);

export const CATALOG_BY_ID = Object.freeze(
  Object.fromEntries(CODEX_CATALOG.map((c) => [c.id, c])),
);

/** 某个分类的完整条目（惰性计算并缓存） */
const cache = new Map();
export function itemsOf(categoryId) {
  const def = CATALOG_BY_ID[categoryId];
  if (!def) return [];
  if (!cache.has(categoryId)) cache.set(categoryId, def.items());
  return cache.get(categoryId);
}

/** 某个分类的固定分母（事件型返回 null） */
export function totalOf(categoryId) {
  if (CATALOG_BY_ID[categoryId]?.eventOnly) return null;
  return itemsOf(categoryId).length;
}

/** 参与完成度计算的分类（排除事件型） */
export const COUNTED_CATEGORIES = Object.freeze(
  CODEX_CATALOG.filter((c) => !c.eventOnly).map((c) => c.id),
);

/** 图鉴总分母：由**真实内容集合**推导，不再是写死的 +60 */
export function catalogTotal() {
  return COUNTED_CATEGORIES.reduce((sum, id) => sum + (totalOf(id) || 0), 0);
}

/** 某分类已发现数量 */
export function foundCount(codexState, categoryId) {
  const bucket = codexState?.[categoryId] || {};
  if (CATALOG_BY_ID[categoryId]?.eventOnly) return Object.keys(bucket).length;
  return itemsOf(categoryId).filter(item => Boolean(bucket[item.id])).length;
}

/**
 * 完整进度视图（UI 直接渲染）。
 * @param {object} codexState 存档里的 `codex`
 */
export function codexProgressView(codexState = {}) {
  let found = 0;
  let total = 0;
  const groups = CODEX_CATALOG.map((def) => {
    const items = itemsOf(def.id);
    const bucket = codexState?.[def.id] || {};
    const foundItems = items.filter((it) => !!bucket[it.id]);
    const eventOnly = !!def.eventOnly;
    const groupTotal = eventOnly ? null : items.length;
    if (!eventOnly) { found += foundItems.length; total += items.length; }
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      eventOnly,
      total: groupTotal,
      found: eventOnly ? Object.keys(bucket).length : foundItems.length,
      /** 未发现条目带 hint，已发现带真实 desc */
      entries: items.map((it) => {
        const hit = !!bucket[it.id];
        return {
          id: it.id,
          name: hit ? it.name : null,
          group: it.group || null,
          desc: hit ? (it.desc || '') : null,
          hint: it.hint || '未发现',
          found: hit,
        };
      }),
    };
  });
  return {
    found,
    total,
    percent: total > 0 ? Math.min(100, Math.round((found / total) * 100)) : 0,
    groups,
  };
}

export default CODEX_CATALOG;
