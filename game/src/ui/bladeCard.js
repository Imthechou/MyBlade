/**
 * 表现层 · 共用收藏卡（rework T13）
 *
 * ★ 要修什么（审计问题 13）：
 *   改造前每处各画一套卡片：工坊藏刀阁是小缩略图 + 数值列表，
 *   鉴定页是另一套 h1/chip 排版，赛报又各写一份。
 *   同一把刀在三处呈现不同的身份信息，玩家无法形成“这就是我的作品”的记忆。
 *
 * ★ 本文件的职责（T13.1）：**唯一**的成刀展示数据来源。
 *   `bladeCardModel()` 把 BladeRecord 归一成展示模型；
 *   `bladeCard()` 渲染竖版卡片；`bladeCardDetail()` 渲染卡背详情。
 *   鉴定、藏刀阁、派刀、赛后都调这里，不各自拼一遍。
 *
 * ★ 卡面以**刀具本身**为主视觉（T13.2）：竖向居中、留白、名称/稀有度/评分/少量核心特性。
 *   完整六维、工艺路径与规则放卡背/详情，不塞在正面。
 *
 * 纯展示：不判定玩法，不重算评分或倍率。
 */

import { el } from './dom.js';
import { rarityBadge, statRail } from './components.js';
import { STAT_KEYS, STAT_META } from '../data/balance.js';
import { KNIFE_BY_ID, KNIFE_BY_MODEL } from '../data/knifeTypes.js';
import { getTrait } from '../data/traits.js';
import { COMBOS } from '../data/combos.js';
import { resultView as edgeResultView } from '../core/edge.js';
import { tagName } from '../data/tags.js';
import { signaturePerk, STAT_CAP } from '../v19/forge.js';

/**
 * 把记录里的 `knifeType` 归一成**真实模型 id**。
 *
 * ★ 为什么需要它：BladeRecord 有两个不同的刀型字段 ——
 *   `knifeTypeId`（刀型 id，如 `folding`）与 `knifeType`（模型 id，如 `knife_folding`）。
 *   旧存档、手改存档或外部导入可能把刀型 id 写进 `knifeType`，
 *   而渲染层只认模型 id，于是控制台报 `[render] 未找到刀型：folding`，卡面主视觉空白。
 *
 * 这里是**确定性修正**，不猜测：能当模型 id 就用；否则回落到该刀型自己的 modelId；
 * 都拿不到则返回 null，由调用方走降级展示。
 */
function resolveModelId(source, knifeTypeDef) {
  const raw = source?.knifeType;
  if (typeof raw === 'string' && KNIFE_BY_MODEL[raw]) return raw;
  if (typeof raw === 'string' && KNIFE_BY_ID[raw]) return KNIFE_BY_ID[raw].modelId;
  return knifeTypeDef?.modelId || null;
}

const STAT_LABELS = [
  ['strength', '力'], ['toughness', '韧'], ['sharpness', '锋'],
  ['craft', '艺'], ['design', '形'], ['spirit', '灵'],
];

/** 稀有度 → 卡面主题色（与 tokens 的 rarity 命名保持一致） */
const RARITY_TONE = {
  common: 'common', fine: 'fine', rare: 'rare',
  epic: 'epic', legend: 'legend', mythic: 'mythic',
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 把 BladeRecord 归一成**展示模型**（唯一入口）。
 *
 * ★ 只读已成事实的字段；不重算评分、不重算稀有度、不重新适配。
 *   旧刀缺新字段时给明确降级值，不猜测、不伪造。
 *
 * @param {object} blade BladeRecord 或断刀记录
 * @param {object} [opts]
 * @param {string} [opts.kind] 'collection' | 'appraise' | 'dispatch' | 'report'
 * @returns {object} 展示模型
 */
export function bladeCardModel(blade, { kind = 'collection' } = {}) {
  const src = blade && typeof blade === 'object' ? blade : {};
  const knifeType = KNIFE_BY_ID[src.knifeTypeId] || null;
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = num(src.stats?.[k]);

  const traits = Array.isArray(src.traits) ? src.traits : [];
  const combos = Array.isArray(src.combos) ? src.combos : [];
  const perk = src.v19Visual ? signaturePerk(combos[0]) : null;

  /* 核心特性：最多 3 条，优先“有实际赛场职责”的，避免卡面堆满 LEGACY */
  const traitEntries = traits.map((id) => {
    const def = getTrait(id);
    return {
      id,
      name: def?.name || id,
      kind: def?.kind || 'LEGACY',
      /** 该特性是否在赛场有独立效果（bladeAdapter 的同一口径） */
      arena: def?.kind === 'SPECIAL_TAG' || def?.kind === 'HAMMER' || def?.kind === 'BASE_TAG',
    };
  });
  const coreTraits = traitEntries
    .slice()
    .sort((a, b) => Number(b.arena) - Number(a.arena))
    .slice(0, 3);

  /* 赛事经历（T13：荣誉与经历绑定刀 ID） */
  const arenaHistory = Array.isArray(src.arenaHistory) ? src.arenaHistory : [];
  const wins = arenaHistory.filter((m) => m?.win).length;
  const honors = arenaHistory
    .filter((m) => m?.win)
    .map((m) => ({
      id: m.id,
      tier: m.tier,
      styleId: m.styleId || null,
      gradient: Number.isFinite(m.gradient) ? m.gradient : null,
      champion: m?.champion === true || m?.matchRecord?.champion === true || m?.national?.champion === true,
      at: m.recordedAt || null,
    }));

  return {
    id: src.id || null,
    name: src.bladeName || src.name || src.id || '未命名',
    kind,
    fractured: src.fractured === true,
    v19: Boolean(src.v19Visual),
    canEnterArena: src.canEnterArena !== false && src.fractured !== true,

    /* 身份 */
    knifeTypeId: src.knifeTypeId || null,
    knifeTypeName: knifeType?.name || src.knifeTypeId || '未记录刀型',
    modelId: resolveModelId(src, knifeType),

    /* 价值 */
    score: Math.round(num(src.score)),
    rarity: src.rarity || 'common',
    rarityName: src.rarityName || null,
    rarityTone: RARITY_TONE[src.rarity] || 'common',
    qualityName: src.qualityName || null,

    /* 卡面核心信息 */
    coreTraits: perk ? [perk] : coreTraits,
    traitCount: traits.length,
    comboCount: combos.length,

    /* 卡背/详情 */
    stats,
    statMean: num(src.statMean),
    allTraits: traitEntries,
    combos: combos.map((cid) => ({
      id: cid,
      name: COMBOS.find((c) => c.id === cid)?.name || cid,
    })),
    tags: Object.entries(src.tags && typeof src.tags === 'object' ? src.tags : {})
      .sort((a, b) => b[1] - a[1])
      .map(([id, layers]) => ({ id, name: tagName(id), layers })),

    /* 工艺与风险（只读展示） */
    history: Array.isArray(src.history) ? src.history.slice() : [],
    riskPeak: num(src.riskPeak),
    riskCurrent: num(src.riskCurrent),
    hammerCount: num(src.hammerCount),
    hammerTierName: src.hammerTierName || null,
    edge: src.edge ? { ...src.edge } : null,

    /* 赛事经历 */
    arenaMatches: arenaHistory.length,
    arenaWins: wins,
    honors,
    /* ★ rework T12：分项个人纪录（每个测试项目的历史最好成绩）。
       由 progress.recordMatch 写入，只在新成绩更高时覆盖。
       旧刀没有这个字段 → 空数组，不伪造。 */
    projectRecords: Object.values(src.projectRecords || {})
      .filter((p) => p && Number.isFinite(Number(p.score)))
      .map((p) => ({ kind: p.kind, name: p.name || p.kind, score: Number(p.score) }))
      .sort((a, b) => b.score - a.score),

    createdAt: num(src.createdAt) || null,
    /* 断刀 */
    fractureInfo: src.fractureInfo ? { ...src.fractureInfo } : null,
  };
}

/**
 * 卡面副标题：避免与刀名重复。
 * 刀名 = 前缀 + 刀型名（如「淬火弯刀」），所以只有当刀名**不包含**刀型名时
 * 才把刀型单独写出来；品质总是保留。
 */
function sublineOf(model) {
  const parts = [];
  const name = String(model.name || '');
  const typeName = String(model.knifeTypeName || '');
  if (typeName && !name.includes(typeName)) parts.push(typeName);
  if (model.qualityName) parts.push(`品质 ${model.qualityName}`);
  return parts.join(' · ') || (model.fractured ? '已断裂' : '成刀');
}

/**
 * 竖版收藏卡（卡面）。
 *
 * @param {object} model bladeCardModel() 结果
 * @param {object} [opts]
 * @param {HTMLElement} [opts.art] 刀具主视觉容器（由调用方挂载 3D/缩略图）
 * @param {Function} [opts.onOpen] 点击打开详情
 * @param {string} [opts.actionLabel] 右上角动作文案（如“派刀”）
 * @param {Function} [opts.onAction]
 * @param {boolean} [opts.compact] 紧凑模式（列表用）
 */
export function bladeCard(model, {
  art = null, onOpen = null, actionLabel = null, onAction = null, compact = false,
} = {}) {
  const tag = onOpen ? 'button' : 'div';
  const props = {
    class: `blade-card-v2 rarity--${model.rarityTone}` + (compact ? ' is-compact' : '')
      + (model.fractured ? ' is-fractured' : ''),
  };
  if (onOpen) {
    props.type = 'button';
    props.onclick = onOpen;
    props['aria-label'] = `${model.name}，${model.rarityName || model.rarity}，评分 ${model.score}${model.fractured ? '，已断裂' : ''}`;
  }

  const artNode = el('div', { class: 'bcv-art', 'aria-hidden': 'true' });
  if (art) artNode.appendChild(art);

  const honorChip = model.honors.some((h) => h.champion)
    ? el('span', { class: 'bcv-honor', text: '冠军' })
    : model.arenaWins > 0 ? el('span', { class: 'bcv-honor', text: `${model.arenaWins} 胜` }) : null;

  const face = el(tag, onOpen ? {...props, class:'bcv-open'} : props, [
    el('div', { class: 'bcv-top' }, [
      rarityBadge(model.rarity, model.rarityName),
      honorChip,
      actionLabel ? el('span', {
        class: 'bcv-action',
        onclick: (e) => { if (onAction) { e.stopPropagation(); onAction(); } },
        text: actionLabel,
      }) : null,
    ].filter(Boolean)),
    artNode,
    el('div', { class: 'bcv-body' }, [
      el('div', { class: 'bcv-name', text: model.name }),
      /* ★ 修复：刀名默认就是「刀型名」（例如都叫「马来剑」），
         再写一次 `${knifeTypeName} · ${quality}` 就会在卡面重复同名。
         只有刀名里没有刀型词时才补刀型，避免「马来剑 / 马来剑 · B」。 */
      el('div', { class: 'bcv-sub', text: sublineOf(model) }),
      compact || (model.v19 && !model.coreTraits.length) ? null : el('div', { class: 'bcv-traits' }, model.coreTraits.length
        ? model.coreTraits.map((t) => el('span', { class: 'bcv-trait', text: t.name }))
        : [el('span', { class: 'bcv-trait is-empty', text: '无核心特性' })]),
    ]),
    el('div', { class: 'bcv-score' }, [
      el('b', { text: model.fractured ? '断' : String(model.score) }),
      el('small', { text: model.fractured ? '已断裂' : '评分' }),
    ]),
    /* 六维条：卡面只给极简色条，精确值放卡背（T13.2：不把完整六维塞正面） */
    compact ? null : el('div', { class: 'bcv-rail', 'aria-hidden': 'true' },
      STAT_LABELS.map(([key]) => el('i', {
        style: { height: `${Math.max(6, Math.min(100, (model.stats[key] / 300) * 100))}%` },
        title: `${STAT_META[key]?.name || key} ${model.stats[key]}`,
      }))),
  ].filter(Boolean));
  // The comparison control is a sibling of the real open button, never a button nested inside another button.
  return onOpen ? el('article', {class:props.class}, [face]) : face;
}

/**
 * 卡背/详情内容（完整六维、工艺路径、赛事经历、规则说明）。
 * 鉴定页与藏刀阁详情共用，不各写一套。
 */
export function bladeCardDetail(model) {
  const line = (label, value) => el('div', { class: 'report-line', text: `${label}：${value ?? '未记录'}` });
  const edgeView = edgeResultView(model.edge);
  const date = model.createdAt ? new Date(model.createdAt).toLocaleDateString() : '未记录';

  const honorRows = model.honors.length
    ? model.honors.map((h) => el('div', { class: 'report-line' }, [
      el('span', { text: h.champion ? '冠军' : '胜场' }),
      el('span', { class: 'muted tiny', text: `${h.tier || ''}${h.styleId ? ` · ${h.styleId}` : ''}` }),
    ]))
    : [el('div', { class: 'muted tiny', text: '尚无赛事经历。带这把刀去赛事中心，胜场会写进这里。' })];

  return el('div', { class: 'bcv-detail' }, [
    el('div', { class: 'section-title', text: `六维（均值 ${model.statMean || '—'}）` }),
    statRail(model.stats, null, true, model.v19 ? STAT_CAP : undefined),

    ...(model.v19 ? [] : [
      el('div', { class: 'section-title', text: `永久特性 ${model.traitCount}` }),
      model.allTraits.length
        ? model.allTraits.map((t) => el('div', { class: 'report-line' }, [
          el('span', { text: `· ${t.name}` }),
          el('span', { class: 'muted tiny', text: t.arena ? '赛场生效' : '仅六维' }),
        ]))
        : el('div', { class: 'muted tiny', text: '无' }),
      el('div', { class: 'section-title', text: '隐藏连携' }),
      el('div', { class: 'report-line', text: model.combos.length ? model.combos.map((c) => c.name).join('、') : '无' }),
    ]),

    el('div', { class: 'section-title', text: '赛事经历' }),
    ...honorRows,
    line('参赛场次', model.arenaMatches),

    /* ★ rework T12：分项个人纪录 —— “这把刀在某个项目上最好打到多少” */
    el('div', { class: 'section-title', text: '分项个人纪录' }),
    model.projectRecords.length
      ? el('div', { class: 'bcv-records' }, model.projectRecords.map((p) => el('div', { class: 'bcv-record' }, [
        el('span', { text: p.name }),
        el('b', { text: String(p.score) }),
      ])))
      : el('div', { class: 'muted tiny', text: '还没有分项纪录。参加正式赛会按测试项目记录历史最好成绩。' }),

    el('div', { class: 'section-title', text: '工艺与风险' }),
    ...(model.v19 ? [] : [line('工艺路线', model.history.length ? model.history.join(' → ') : '未记录')]),
    line(model.v19 ? '实际最高断率' : 'Risk 峰值 / 收尾', model.v19 ? `${model.riskPeak}%` : `${model.riskPeak} / ${model.riskCurrent}`),
    line('锻打', `${model.hammerCount} 锤${model.hammerTierName ? ` · ${model.hammerTierName}` : ''}`),
    ...(model.v19 ? [] : [line('S7 刃线', edgeView ? `${edgeView.label}（贴合 ${edgeView.fitText} · 锋利 +${edgeView.sharp}）` : '未记录')]),

    el('div', { class: 'section-title', text: '档案' }),
    line('档案编号', model.id),
    line('收藏于', date),
    line('刀型', model.knifeTypeName),
  ]);
}

/**
 * 比较用数据（T13.4：比较突出项目专长与相关特性，不只按总分判优）。
 * @returns {{rows: {label, values: string[], best: number|null}[]}}
 */
export function compareModels(models) {
  const rows = [];
  rows.push({
    label: '评分', values: models.map((m) => String(m.score)),
    best: pickIndex(models, (m) => m.score),
  });
  for (const [key, label] of STAT_LABELS) {
    rows.push({
      label: STAT_META[key]?.name || label,
      values: models.map((m) => String(m.stats[key])),
      best: pickIndex(models, (m) => m.stats[key]),
    });
  }
  rows.push({
    label: '专属特性',
    values: models.map((m) => (m.coreTraits.length ? m.coreTraits.map((t) => t.name).join('、') : '—')),
    best: null,
  });
  rows.push({
    label: '刀型',
    values: models.map((m) => m.knifeTypeName),
    best: null,
  });
  rows.push({
    label: '赛事',
    values: models.map((m) => `${m.arenaMatches} 场 / ${m.arenaWins} 胜`),
    best: pickIndex(models, (m) => m.arenaWins),
  });
  return { rows, labels: models.map((m) => m.name) };
}

function pickIndex(models, valueOf) {
  if (!models.length) return null;
  let best = 0;
  for (let i = 1; i < models.length; i++) {
    if (valueOf(models[i]) > valueOf(models[best])) best = i;
  }
  /* 全部相同时不标“最优”，避免虚假差异 */
  const allSame = models.every((m) => valueOf(m) === valueOf(models[best]));
  return allSame ? null : best;
}

export default { bladeCardModel, bladeCard, bladeCardDetail, compareModels };
