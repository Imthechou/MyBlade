/**
 * 数据配置层 · 九个工艺阶段 + S10 鉴定（V2.1 §6）
 *
 * 只描述"这一阶段是什么、要不要风险检查、要不要小游戏"，
 * 不含任何流程控制 —— 流程由 core/forge.js 读这张表驱动。
 */

export const STAGES = Object.freeze([
  {
    id: 'S1', index: 0, name: '原料', en: 'Material',
    question: '从候选材料中选择起点',
    duty: '确立基础六维、材料身份、工艺偏好与初始视觉状态',
    riskCheck: false,          // V2.1 §9.2：原料选择不进行风险检查
    minigame: null,
    slot: 'material',
  },
  {
    id: 'S2', index: 1, name: '熔炼', en: 'Smelt',
    question: '如何处理原料',
    duty: '改变纯净度、稳定性与后续工艺倾向',
    riskCheck: true, minigame: null, slot: 'texture',
  },
  {
    id: 'S3', index: 2, name: '锻打', en: 'Forge',
    question: '如何加工材料',
    duty: '积累工艺标签，建立第一层构筑方向',
    riskCheck: true, minigame: null,   // V2.1 附录 A：S3 不再进行点光小游戏
    slot: 'texture',
  },
  {
    id: 'S4', index: 3, name: '定型', en: 'Shape',
    question: '选择刀型与结构方向',
    duty: '确定刀型，随后进入可持续自由点击的额外锻打',
    riskCheck: 'hammer',        // 每锤独立检查；一锤未打则离开时检查一次
    minigame: 'hammer', slot: 'knifeType',
  },
  {
    id: 'S5', index: 4, name: '淬火', en: 'Quench',
    question: '如何固定热处理状态',
    duty: '影响热处理结果、六维与后续特性条件',
    riskCheck: true, minigame: null, slot: 'finish',
  },
  {
    id: 'S6', index: 5, name: '回火', en: 'Temper',
    question: '如何调整热处理留下的状态',
    duty: '调整稳定性、色调与工艺结果',
    riskCheck: true, minigame: null, slot: 'temper',
  },
  {
    id: 'S7', index: 6, name: '开刃', en: 'Edge',
    question: '如何形成刃口',
    duty: '选择开刃工艺并完成刃线模拟',
    riskCheck: true, minigame: 'edge', slot: 'edge',
  },
  {
    id: 'S8', index: 7, name: '装配', en: 'Assemble',
    question: '如何完成握持与结构装配',
    duty: '影响刀柄、护手、尾部相关属性与装配身份',
    riskCheck: true, minigame: null, slot: 'handle',
  },
  {
    id: 'S9', index: 8, name: '调校', en: 'Tune',
    question: '如何完成最后修整',
    duty: '处理最终细节和微调',
    riskCheck: true, minigame: null, slot: 'wear',
  },
  {
    id: 'S10', index: 9, name: '鉴定', en: 'Appraise',
    question: '查看这把刀最终形成了什么',
    duty: '冻结本局结果，结算永久特性、六维、成刀评分、品质与稀有度',
    riskCheck: false, minigame: null, slot: null,
  },
]);

export const STAGE_COUNT = STAGES.length;          // 10
/** 需要玩家做工艺选择的阶段数（S1–S9） */
export const PLAYABLE_STAGES = STAGES.filter((s) => s.index < 9);

export const stageAt = (index) => STAGES[Math.max(0, Math.min(STAGES.length - 1, index | 0))];
export const stageById = (id) => STAGES.find((s) => s.id === id) || null;

export default STAGES;
