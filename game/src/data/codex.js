/**
 * 数据配置层 · 图鉴分类（V2.1 §23.4）
 *
 * 图鉴记录"玩家发现过什么"，并提供下一步探索目标。
 * 未发现内容显示轮廓/类别/简短线索，**不直接给出完整答案**；
 * 已发现的 Combo 可以查看明确条件，方便玩家尝试复现。
 *
 * 完成度发 CR / 解锁卡池 / 收藏装饰，**不通过完成度直接增加所有刀的基础六维**。
 */

export const CODEX_CATEGORIES = Object.freeze([
  { id: 'material', name: '材料', desc: '原料阶段可选的材料' },
  { id: 'card', name: '工艺卡', desc: '已解锁的工艺决策卡' },
  { id: 'tag', name: '工艺标签', desc: '基础与特殊工艺标签' },
  { id: 'trait', name: '特性', desc: '基础标签特性与特殊特性' },
  { id: 'combo', name: '隐藏组合', desc: '隐藏 Combo 与其条件' },
  { id: 'knife', name: '刀型', desc: '十二款刀模' },
  { id: 'finish', name: '纹理与工艺', desc: '纹理、Finish 与其他工艺内容' },
  { id: 'arena', name: '赛事', desc: '赛事分支、对手与里程碑' },
  { id: 'fracture', name: '断刀记录', desc: '断刀的锻造路径与断裂节点' },
]);

export const CODEX_BY_ID = Object.freeze(Object.fromEntries(CODEX_CATEGORIES.map((c) => [c.id, c])));

/** 图鉴完成度奖励阶梯（发 CR / 解锁，不给六维） */
export const CODEX_REWARDS = Object.freeze([
  { at: 0.10, cr: 40, note: '初识' },
  { at: 0.25, cr: 80, note: '入门' },
  { at: 0.50, cr: 160, note: '熟识' },
  { at: 0.75, cr: 260, note: '精通' },
  { at: 1.00, cr: 400, unlock: 'decor:图鉴全书', note: '全书' },
]);

/** 从未发现的 Combo 暴露的线索强度（V2.1 §23.4） */
export const HINT_LEVELS = Object.freeze({
  locked: { id: 'locked', showName: false, showCategory: true, showHint: false },
  hinted: { id: 'hinted', showName: true, showCategory: true, showHint: true },
  found: { id: 'found', showName: true, showCategory: true, showHint: true, showConditions: true },
});

export default CODEX_CATEGORIES;
