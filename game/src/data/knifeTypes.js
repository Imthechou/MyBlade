/**
 * 数据配置层 · 刀型
 *
 * 12 款刀模沿用已验证的模型资产（assets/models/*.glb），
 * 定义来自已交付的刀型表（data/legacy/knifeTypes.js）。
 * 本文件只暴露 V2 需要的只读视图，不复制第二份刀型数据。
 */

import { knifeTypes } from './legacy/knifeTypes.js';

export const KNIFE_TYPES = Object.freeze(
  (knifeTypes.BASE_TYPES || []).map((t) => Object.freeze({
    id: t.id,
    name: t.name,
    modelId: t.modelId,
    desc: t.desc || '',
    statBias: Object.freeze({ ...(t.statBias || {}) }),
  }))
);

export const KNIFE_BY_ID = Object.freeze(Object.fromEntries(KNIFE_TYPES.map((t) => [t.id, t])));
export const KNIFE_BY_MODEL = Object.freeze(Object.fromEntries(KNIFE_TYPES.map((t) => [t.modelId, t])));

export const typeOf = (id) => KNIFE_BY_ID[id] || null;
export const modelOf = (id) => (KNIFE_BY_ID[id] ? KNIFE_BY_ID[id].modelId : null);
export const nameOfModel = (modelId) => (KNIFE_BY_MODEL[modelId] ? KNIFE_BY_MODEL[modelId].name : modelId);

/**
 * 把记录里的任意“刀型字段”归一成**真实模型 id**（唯一真源）。
 *
 * ★ 为什么需要它：存档里有两个不同的刀型字段 ——
 *   `knifeTypeId`（刀型 id，如 `folding`）与 `knifeType`（模型 id，如 `knife_folding`）。
 *   旧存档 / 手改存档 / 外部导入可能把刀型 id 写进 `knifeType`，
 *   而渲染层只认模型 id，于是控制台报 `[render] 未找到刀型：folding`，卡面主视觉空白。
 *
 * 这是**确定性修正**，不猜测：能当模型 id 就用；否则回落到该刀型自己的 modelId；
 * 都拿不到则返回 null，由调用方走降级展示。
 *
 * @param {object} source BladeRecord / 记录片段（读 `knifeType`）
 * @param {string} [knifeTypeIdHint] 已知刀型 id（不会覆盖合法模型 id）
 * @returns {string|null}
 */
export function resolveModelId(source, knifeTypeIdHint = null) {
  const raw = source && source.knifeType;
  if (typeof raw === 'string' && KNIFE_BY_MODEL[raw]) return raw;
  if (typeof raw === 'string' && KNIFE_BY_ID[raw]) return KNIFE_BY_ID[raw].modelId;
  const byHint = knifeTypeIdHint ? KNIFE_BY_ID[knifeTypeIdHint] : null;
  return byHint ? byHint.modelId : null;
}

/** 刀名生成沿用已交付实现（含稀有度前缀分层） */
export function bladeNameOf(record) {
  if (knifeTypes.bladeNameOf) {
    try { return knifeTypes.bladeNameOf(record); } catch (_) { /* 回落下方 */ }
  }
  const t = KNIFE_BY_MODEL[record.knifeType];
  return (t ? t.name : '未知刀型') + '·' + String(record.seed % 1000).padStart(3, '0');
}

export default KNIFE_TYPES;
