/**
 * 数据配置层 · 每日挑战修饰器（V2.1 §24）
 *
 * 「挑战条件不要求唯一正确配方，而是鼓励探索不同解决方式。」
 * 每天用固定 Seed 生成挑战：同一天所有玩家面对**相同**的初始条件，
 * 但可以自由选择锻造路线。
 *
 * ⚠ 边界（V2.1 §24）：挑战成品**不进入普通藏刀阁**、**不具备普通赛事参赛资格**，
 *   也不改变普通成刀的永久数值。这条由 core/daily.js 强制执行，不靠 UI 自律。
 */

export const MODIFIERS = Object.freeze([
  { id: 'none', name: '无修饰', desc: '标准锻造条件，纯粹比拼构筑', apply: {} },
  { id: 'high_risk', name: '高压炉温', desc: '所有卡的风险增量提高，控险更重要', apply: { riskScale: 1.5 } },
  { id: 'low_risk', name: '稳定气流', desc: '所有卡的风险增量降低，可以走得更激进', apply: { riskScale: 0.6 } },
  { id: 'precision_focus', name: '精度至上', desc: '工艺与设计类收益提高', apply: { statBoost: { craft: 1.3, design: 1.3 } } },
  { id: 'power_focus', name: '力量至上', desc: '强度与锋利类收益提高', apply: { statBoost: { strength: 1.3, sharpness: 1.3 } } },
  { id: 'spirit_focus', name: '灵性之夜', desc: '灵性类收益提高', apply: { statBoost: { spirit: 1.5 } } },
  { id: 'one_reroll', name: '一次机会', desc: '本局最多只能重铸一次', apply: { maxReroll: 1 } },
  { id: 'no_reroll', name: '无从选择', desc: '本局不能重铸', apply: { maxReroll: 0 } },
  { id: 'fragile', name: '脆弱钢坯', desc: '断裂概率整体提高', apply: { breakScale: 1.25 } },
]);

export const MODIFIER_BY_ID = Object.freeze(Object.fromEntries(MODIFIERS.map((m) => [m.id, m])));
export const getModifier = (id) => MODIFIER_BY_ID[id] || MODIFIERS[0];

export default MODIFIERS;
