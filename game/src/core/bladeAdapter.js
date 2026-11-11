/**
 * 核心层 · 成刀 → 测试能力适配（rework T01）
 *
 * ★ 唯一职责：把一把 **BladeRecord** 翻译成「各项测试的能力值」。
 *   quick / single / national / team 所有入口都必须经过这里，
 *   不允许任何入口再自己 `clamp(stats, 0, 100)` 或自拼一套参数。
 *
 * ★ 三层必须分清（T01.1）：
 *   ① 原始永久六维（record.stats）—— 存档真源，永不被本文件修改；
 *   ② 局内能力（capabilities）—— 由 ① 经 balance.applyStatCurve 得到，0…160；
 *   ③ 局内 modifiers（testMods）—— 刀型画像 + 特性赛事效果 + 局内 buff，
 *      只影响本次测试的适配系数，不写回 ①。
 *   永久损耗 / 锻造 Risk / 局内临时损伤同样各自独立，不在这三层里混。
 *
 * ★ 为什么要它：改造前 `arenaSlice.bladeView()` 只留 id/name/score/stats，
 *   刀型、特性和材质全部丢失，于是「不同刀打同一场赛」退化成同一把刀。
 *   本文件把 bladeId / knifeTypeId / traits / combos / 版本号一并带出，
 *   且只读原始记录、不把渲染对象或 UI 状态塞进 core。
 */

import {
  STAT_KEYS, TEST_PROJECTS, applyStatCurve, ARENA_TARGET_SCALE,
} from '../data/balance.js';
import {
  KNIFE_PROFILES, KNIFE_PROFILE_FALLBACK, TRAIT_TEST_MODS, LEGACY_TEST_MODS,
  NO_TEST_EFFECT, ADAPTER_VERSION, EFFECT_VERSION, TEST_MOD_CLAMP,
} from '../data/bladeEffects.js';
import { TAG_TIERS } from '../data/balance.js';
import { getTrait } from '../data/traits.js';
import { isBaseTag, tagName } from '../data/tags.js';
import { KNIFE_BY_ID } from '../data/knifeTypes.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (v) => Math.round(v * 1000) / 1000;

/** 刀型画像（未知刀型 → 中性画像，不随机生成能力） */
export function knifeProfile(knifeTypeId) {
  const t = KNIFE_BY_ID[knifeTypeId];
  const key = t ? knifeTypeId : null;
  const p = (key && KNIFE_PROFILES[key]) || null;
  return {
    knifeTypeId: key,
    knifeTypeName: t ? t.name : null,
    label: p ? p.label : KNIFE_PROFILE_FALLBACK.label,
    known: !!p,
    mods: { ...(p || KNIFE_PROFILE_FALLBACK) },
  };
}

/**
 * 特性 → 赛事效果的解析（T02.1）。
 *
 * 规则：
 *   · 基础标签**按标签最高档结算一次**（同标签的 2/4/6 层特性不各自再叠）；
 *     未达 2 层（只有倾向）不给赛场效果。
 *   · 特殊标签 / S4 锻打特性按**特性 id**查表；锻打表按 `HT_<tag>` 前缀归一，
 *     因为档位收益已由六维与评分兑现，赛场行为不随档位再线性放大。
 *   · 隐藏 Combo 走 `combo` 汇总键，每条一份。
 *   · LEGACY 只在 LEGACY_TEST_MODS 里显式声明过才有赛场效果，其余记 NO_TEST_EFFECT。
 *
 * 同一 effectId 在同项计算只结算一次，结果去重后返回。
 */
export function resolveTraitEffects(record) {
  const applied = [];
  const seen = new Set();
  const mods = emptyProjectMods();
  const responsibilities = [];

  const add = (effectId, table, source, detail) => {
    if (!table || seen.has(`${effectId}|${source}`)) return;
    seen.add(`${effectId}|${source}`);
    for (const [project, delta] of Object.entries(table)) {
      if (project === 'note') continue;
      if (!TEST_PROJECTS[project]) continue;
      mods[project] += num(delta);
    }
    applied.push({ effectId, source, note: table.note || '', detail: detail || null });
  };

  /* ── ① 基础标签：按标签最高档结算一次 ── */
  const tagTiers = Array.isArray(record.tagTiers) ? record.tagTiers
    : (Array.isArray(record.tags) ? [] : []);
  const tagCounts = record.tags && typeof record.tags === 'object' ? record.tags : {};
  const qualifiedTags = new Map();
  for (const t of tagTiers) {
    if (!t || !t.tagId) continue;
    qualifiedTags.set(t.tagId, t.effectiveLayers ?? t.layers ?? 0);
  }
  // 旧刀可能只有 tags 计数、没有 tagTiers：从层数确定性推断，不重掷
  if (!qualifiedTags.size) {
    for (const [tagId, layers] of Object.entries(tagCounts)) {
      if (isBaseTag(tagId)) qualifiedTags.set(tagId, Math.min(6, num(layers)));
    }
  }
  for (const [tagId, layers] of qualifiedTags) {
    const tier = TAG_TIERS.slice().reverse().find((x) => layers >= x.layers) || null;
    if (!tier || !tier.grantsTrait) {
      responsibilities.push({ kind: 'base-tag', id: tagId, layers, duty: NO_TEST_EFFECT.scope,
        note: `${tagName(tagId)} 仅 ${layers} 层（工艺倾向），无赛场独立效果` });
      continue;
    }
    const table = TRAIT_TEST_MODS[tagId];
    if (table) {
      add(tagId, table, 'baseTag', { tagId, layers, tierName: tier.name });
    }
    responsibilities.push({ kind: 'base-tag', id: tagId, layers, tierName: tier.name,
      duty: table ? 'arena-effect' : NO_TEST_EFFECT.scope, note: table ? table.note : '' });
  }

  /* ── ② 特殊标签 / S4 锻打 / ③ Combo / ④ LEGACY ── */
  for (const id of (record.traits || [])) {
    const def = getTrait(id);
    if (!def) {
      responsibilities.push({ kind: 'unknown-trait', id, duty: 'ignored',
        note: '未知特性：按降级处理，不授予随机能力' });
      continue;
    }
    if (def.kind === 'BASE_TAG') continue;   // 已在 ① 结算

    if (def.kind === 'SPECIAL_TAG') {
      add(id, TRAIT_TEST_MODS[id], 'specialTag');
      responsibilities.push({ kind: 'special-tag', id, duty: TRAIT_TEST_MODS[id] ? 'arena-effect' : NO_TEST_EFFECT.scope,
        note: (TRAIT_TEST_MODS[id] || {}).note || '' });
      continue;
    }
    if (def.kind === 'HAMMER') {
      // 档位收益（六维 + 评分倍率）已兑现，这里只给与标签同向的赛场行为
      const key = `HT_${def.tagId}`;
      add(key, TRAIT_TEST_MODS[key], 'hammer');
      responsibilities.push({ kind: 'hammer', id, duty: TRAIT_TEST_MODS[key] ? 'arena-effect' : NO_TEST_EFFECT.scope,
        note: (TRAIT_TEST_MODS[key] || {}).note || '' });
      continue;
    }
    // LEGACY
    const legacy = LEGACY_TEST_MODS[id];
    if (legacy) add(id, legacy, 'legacy');
    responsibilities.push({ kind: 'legacy', id, duty: legacy ? 'arena-effect' : NO_TEST_EFFECT.scope,
      note: legacy ? legacy.note : '只兑现永久六维与视觉，不进赛场判定' });
  }

  const comboList = Array.isArray(record.combos) ? record.combos : [];
  for (const cid of comboList) {
    add(`combo:${cid}`, TRAIT_TEST_MODS.combo, 'combo', { comboId: cid });
    responsibilities.push({ kind: 'combo', id: cid, duty: 'arena-effect', note: TRAIT_TEST_MODS.combo.note });
  }

  // 生效表摘要（UI/鉴定解释读取，与判定同源）
  const effectSummary = Object.entries(mods)
    .filter(([, v]) => Math.abs(v) > 1e-9)
    .map(([project, delta]) => ({ project, name: TEST_PROJECTS[project].name, delta: round3(delta) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { applied, mods, responsibilities, effectSummary, version: EFFECT_VERSION };
}

function emptyProjectMods() {
  const out = {};
  for (const id of Object.keys(TEST_PROJECTS)) out[id] = 0;
  return out;
}

/**
 * 主适配入口。
 *
 * @param {object} blade BladeRecord（或含同等字段的只读视图）
 * @returns {object} 只读能力视图
 */
export function adaptBlade(blade) {
  const source = blade && typeof blade === 'object' ? blade : {};
  const rawStats = {};
  for (const k of STAT_KEYS) rawStats[k] = Math.max(0, num(source.stats?.[k]));

  /** ② 局内能力：永久六维经饱和曲线，0…STAT_CURVE_CEILING */
  const capability = {};
  for (const k of STAT_KEYS) capability[k] = round3(applyStatCurve(rawStats[k]));

  const profile = knifeProfile(source.knifeTypeId || source.knifeType || null);
  const effects = resolveTraitEffects(source);

  /** ③ 局内 modifiers：刀型画像 × 特性赛场效果 */
  const modifiers = {};
  const projectFactor = {};
  for (const id of Object.keys(TEST_PROJECTS)) {
    const knifeMod = num(profile.mods[id]) || 1;
    const traitMod = 1 + effects.mods[id];
    const raw = knifeMod * traitMod;
    projectFactor[id] = {
      knife: round3(knifeMod),
      trait: round3(traitMod),
      raw: round3(raw),
      value: round3(Math.max(TEST_MOD_CLAMP.min, Math.min(TEST_MOD_CLAMP.max, raw))),
    };
    modifiers[id] = projectFactor[id].value;
  }

  return {
    version: ADAPTER_VERSION,
    effectVersion: effects.version,
    /* ── 身份（稳定、可追踪） ── */
    bladeId: typeof source.id === 'string' ? source.id : null,
    bladeName: source.bladeName || source.name || null,
    knifeTypeId: profile.knifeTypeId,
    knifeTypeName: profile.knifeTypeName,
    knifeProfileLabel: profile.label,
    knifeProfileKnown: profile.known,
    rarity: source.rarity || null,
    rarityName: source.rarityName || null,
    score: num(source.score),
    fractured: source.fractured === true,
    canEnterArena: source.canEnterArena !== false && source.fractured !== true,
    /* ── 三层拆分（禁止 UI 自己再算一遍） ── */
    permanentStats: { ...rawStats },
    capabilities: capability,
    projectFactor,
    /** 给旧引擎（cutParams/arenaChallenge）用的扁平参数输入 */
    capabilitiesForLegacy: { ...capability },
    /** 外观配方：仅供展示读取，不参与判定 */
    appearance: snapshotAppearance(source),
    /* ── 效果明细（鉴定解释、赛报依据） ── */
    responsibilities: effects.responsibilities,
    effectSummary: effects.effectSummary,
    appliedEffects: effects.applied,
    /* ── 版本 ── */
    targetScale: ARENA_TARGET_SCALE,
  };
}

function snapshotAppearance(source) {
  return {
    knifeType: source.knifeType ?? null,
    visualRecipe: Array.isArray(source.visualRecipe) ? source.visualRecipe.map((r) => ({ ...r })) : [],
    pendingSkin: source.pendingSkin && typeof source.pendingSkin === 'object'
      ? JSON.parse(JSON.stringify(source.pendingSkin)) : null,
    handlePalette: source.handlePalette ?? null,
  };
}

/**
 * 旧引擎桥：把适配后的能力 + 局内 buff 折成 cutParams 需要的 stats 形状。
 * ⚠ 只用于「已经过曲线的能力值」，绝不接受裸永久六维。
 */
export function legacyStatsOf(view) {
  return { ...(view?.capabilities || {}) };
}

/** 某项测试的能力均值（0…160 量级），供测试分标准化使用 */
export function projectCapabilityMean(view, projectId) {
  const def = TEST_PROJECTS[projectId];
  const caps = view?.capabilities || {};
  if (!def) return 0;
  let sum = 0;
  for (const k of def.stats) sum += num(caps[k]);
  return sum / Math.max(1, def.stats.length);
}

export default {
  adaptBlade, knifeProfile, resolveTraitEffects,
  legacyStatsOf, projectCapabilityMean,
};
