/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/arenaEvents.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const STAT_KEYS = K3D.arenaStyles ? K3D.arenaStyles.STAT_KEYS :
    ['strength', 'sharpness', 'toughness', 'craft', 'design', 'spirit'];

  /* ── 事件模板 ─────────────────────────── */

  /** 事件 ID 前缀 + 序号，避免硬编码字符串 */
  let _nextEventId = 1;
  function eid(prefix) { return prefix + String(_nextEventId++).padStart(3, '0'); }

  const EVENTS = [
    // ═══ 普通事件（21 个，~60%）══════════════════════
    { id: eid('E'), name: '捕捉破绽', type: 'normal',
      styleIds: ['edge'],
      choices: [
        { id: 'a', title: '快速切入', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'b', title: '稳住节奏', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'c', title: '强行压制', mainStat: 'strength', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 6, b: 2, c: -3 },
      riskDelta: { a: 0.02, b: -0.01, c: 0.06 },
    },
    { id: eid('E'), name: '锻台失手', type: 'normal',
      choices: [
        { id: 'a', title: '继续打磨', mainStat: 'craft', secondaryStat: 'strength', risk: 'low' },
        { id: 'b', title: '调整角度', mainStat: 'design', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'c', title: '换工具重干', mainStat: 'toughness', secondaryStat: 'craft', risk: 'medium' },
      ],
  momentumDelta: { a: 3, b: 1, c: -2 },
      riskDelta: { a: -0.02, b: 0.01, c: 0.03 },
    },
    { id: eid('E'), name: '突发冷却', type: 'normal',
      styleIds: ['quench'],
      choices: [
        { id: 'a', title: '加速淬火', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
        { id: 'b', title: '自然冷却', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'c', title: '双液处理', mainStat: 'craft', secondaryStat: 'spirit', risk: 'medium' },
      ],
  momentumDelta: { a: 11, b: 1, c: 4 },
      riskDelta: { a: 0.07, b: -0.03, c: 0.02 },
    },
    { id: eid('E'), name: '对手施压', type: 'normal',
      styleIds: ['press', 'overload'],
      choices: [
        { id: 'a', title: '硬抗冲击', mainStat: 'toughness', secondaryStat: 'strength', risk: 'medium' },
        { id: 'b', title: '卸力引导', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '以攻代守', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
      ],
  momentumDelta: { a: 2, b: 4, c: -2 },
      riskDelta: { a: 0.03, b: -0.01, c: 0.08 },
    },
    { id: eid('E'), name: '节奏控制', type: 'normal',
      choices: [
        { id: 'a', title: '加快节奏', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'b', title: '放慢节奏', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'c', title: '变速试探', mainStat: 'design', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: 4, b: 1, c: -1 },
      riskDelta: { a: 0.02, b: -0.02, c: 0.05 },
    },
    { id: eid('E'), name: '应力集中', type: 'normal',
      styleIds: ['precise'],
      choices: [
        { id: 'a', title: '均匀退火', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'b', title: '局部减压', mainStat: 'design', secondaryStat: 'craft', risk: 'medium' },
        { id: 'c', title: '重新校直', mainStat: 'toughness', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: 2, b: 3, c: -5 },
      riskDelta: { a: -0.02, b: 0.01, c: 0.06 },
    },
    { id: eid('E'), name: '刃口崩裂', type: 'normal',
      styleIds: ['edge'],
      choices: [
        { id: 'a', title: '快速回磨', mainStat: 'craft', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'b', title: '降级使用', mainStat: 'toughness', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '重新开刃', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: 3, b: -1, c: 10 },
      riskDelta: { a: 0.02, b: -0.03, c: 0.07 },
    },
    { id: eid('E'), name: '火候偏差', type: 'normal',
      styleIds: ['quench'],
      choices: [
        { id: 'a', title: '补火调整', mainStat: 'spirit', secondaryStat: 'design', risk: 'medium' },
        { id: 'b', title: '接受色差', mainStat: 'design', secondaryStat: 'toughness', risk: 'low' },
        { id: 'c', title: '重烧一次', mainStat: 'strength', secondaryStat: 'craft', risk: 'high' },
      ],
  momentumDelta: { a: 4, b: -2, c: 1 },
      riskDelta: { a: 0.03, b: -0.01, c: 0.05 },
    },
    { id: eid('E'), name: '对手失误', type: 'normal',
      choices: [
        { id: 'a', title: '趁虚而入', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'medium' },
        { id: 'b', title: '稳扎稳打', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'c', title: '试探跟进', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 8, b: 3, c: 9 },
      riskDelta: { a: 0.02, b: -0.01, c: 0.04 },
    },
    { id: eid('E'), name: '材质变异', type: 'normal',
      styleIds: ['composite'],
      choices: [
        { id: 'a', title: '顺势延展', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'b', title: '加固收尾', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'c', title: '冒险折叠', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
      ],
  momentumDelta: { a: 5, b: 2, c: -2 },
      riskDelta: { a: 0.02, b: -0.02, c: 0.06 },
    },
    { id: eid('E'), name: '赛场干扰', type: 'normal',
      choices: [
        { id: 'a', title: '忽略干扰', mainStat: 'toughness', secondaryStat: 'spirit', risk: 'low' },
        { id: 'b', title: '借力打力', mainStat: 'craft', secondaryStat: 'design', risk: 'medium' },
        { id: 'c', title: '主动打断', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
      ],
  momentumDelta: { a: 3, b: 4, c: -5 },
      riskDelta: { a: -0.01, b: 0.01, c: 0.08 },
    },
    { id: eid('E'), name: '时间压力', type: 'normal',
      choices: [
        { id: 'a', title: '加速完成', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
        { id: 'b', title: '保证品质', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '取舍一刀', mainStat: 'spirit', secondaryStat: 'toughness', risk: 'medium' },
      ],
  momentumDelta: { a: -1, b: 5, c: 1 },
      riskDelta: { a: 0.08, b: -0.02, c: 0.03 },
    },
    { id: eid('E'), name: '刀胚裂纹', type: 'normal',
      styleIds: ['press'],
      choices: [
        { id: 'a', title: '深入排查', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'b', title: '轻磨掩饰', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'c', title: '更换刀胚', mainStat: 'strength', secondaryStat: 'craft', risk: 'high' },
      ],
  momentumDelta: { a: 4, b: -1, c: -6 },
      riskDelta: { a: -0.02, b: 0.02, c: 0.05 },
    },
    { id: eid('E'), name: '评委提问', type: 'normal',
      choices: [
        { id: 'a', title: '自信回应', mainStat: 'spirit', secondaryStat: 'design', risk: 'low' },
        { id: 'b', title: '技术解释', mainStat: 'craft', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'c', title: '艺术阐述', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
      ],
  momentumDelta: { a: 3, b: 2, c: 2 },
      riskDelta: { a: -0.01, b: 0.01, c: 0.01 },
    },
    { id: eid('E'), name: '装备故障', type: 'normal',
      choices: [
        { id: 'a', title: '紧急维修', mainStat: 'craft', secondaryStat: 'strength', risk: 'medium' },
        { id: 'b', title: '改用手工', mainStat: 'toughness', secondaryStat: 'design', risk: 'high' },
        { id: 'c', title: '跳过此步', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'low' },
      ],
  momentumDelta: { a: 1, b: -2, c: 4 },
      riskDelta: { a: 0.02, b: 0.06, c: -0.02 },
    },
    { id: eid('E'), name: '临时规则', type: 'normal',
      choices: [
        { id: 'a', title: '遵守新规', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '钻空子', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
        { id: 'c', title: '据理力争', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'medium' },
      ],
  momentumDelta: { a: 2, b: -3, c: 0 },
      riskDelta: { a: -0.01, b: 0.07, c: 0.03 },
    },
    { id: eid('E'), name: '观众反应', type: 'normal',
      choices: [
        { id: 'a', title: '保持专注', mainStat: 'toughness', secondaryStat: 'spirit', risk: 'low' },
        { id: 'b', title: '借势发挥', mainStat: 'sharpness', secondaryStat: 'design', risk: 'medium' },
        { id: 'c', title: '无视声音', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
      ],
  momentumDelta: { a: 2, b: 5, c: 1 },
      riskDelta: { a: -0.01, b: 0.02, c: -0.02 },
    },
    { id: eid('E'), name: '锋刃对撞', type: 'normal',
      styleIds: ['edge'], exclusive: true,   // ★ §8.4 专属事件（约 10%）：只在锋刃赛出现
      choices: [
        { id: 'a', title: '硬碰硬', mainStat: 'strength', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'b', title: '巧劲卸力', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '刃口对刃口', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: 3, b: 4, c: -6 },
      riskDelta: { a: 0.03, b: -0.01, c: 0.09 },
    },
    { id: eid('E'), name: '精密校准', type: 'normal',
      styleIds: ['precise'],
      choices: [
        { id: 'a', title: '反复微调', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'b', title: '一次到位', mainStat: 'design', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'c', title: '靠手感估测', mainStat: 'spirit', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: 3, b: 5, c: -3 },
      riskDelta: { a: -0.01, b: 0.01, c: 0.06 },
    },
    { id: eid('E'), name: '复合挑战', type: 'normal',
      styleIds: ['composite'],
      choices: [
        { id: 'a', title: '均衡应对', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'b', title: '集中一点', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'c', title: '全维冒险', mainStat: 'spirit', secondaryStat: 'toughness', risk: 'high' },
      ],
  momentumDelta: { a: 4, b: 6, c: -1 },
      riskDelta: { a: -0.01, b: 0.02, c: 0.05 },
    },
    { id: eid('E'), name: '过载边缘', type: 'normal',
      styleIds: ['overload'],
      choices: [
        { id: 'a', title: '收手保命', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '再推一点', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'c', title: '超极限', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 1, b: 7, c: -9 },
      riskDelta: { a: -0.02, b: 0.04, c: 0.10 },
    },
    { id: eid('E'), name: '淬火危机', type: 'normal',
      styleIds: ['quench'], exclusive: true,   // ★ 淬彩专属
      choices: [
        { id: 'a', title: '多淬一次', mainStat: 'craft', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'b', title: '改变介质', mainStat: 'design', secondaryStat: 'spirit', risk: 'high' },
        { id: 'c', title: '接受瑕疵', mainStat: 'toughness', secondaryStat: 'design', risk: 'low' },
      ],
  momentumDelta: { a: 2, b: 9, c: -3 },
      riskDelta: { a: 0.02, b: 0.06, c: -0.02 },
    },
    { id: eid('E'), name: '临界过载', type: 'normal',
      styleIds: ['overload'], exclusive: true,  // ★ 过载专属
      choices: [
        { id: 'a', title: '锁死红线', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '越线一瞬', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
        { id: 'c', title: '借势回落', mainStat: 'spirit', secondaryStat: 'design', risk: 'medium' },
      ],
  momentumDelta: { a: 2, b: 13, c: -4 },
      riskDelta: { a: -0.02, b: 0.09, c: 0.02 },
    },

    // ═══ 优势事件（7 个，~20%）═══════════════════════════
    { id: eid('E'), name: '对手破绽', type: 'edge',
      choices: [
        { id: 'a', title: '致命一击', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'medium' },
        { id: 'b', title: '稳拿优势', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'c', title: '扩大战果', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 10, b: 5, c: 18 },
      riskDelta: { a: 0.03, b: -0.01, c: 0.07 },
    },
    { id: eid('E'), name: '完美时机', type: 'edge',
      styleIds: ['edge', 'quench'],
      choices: [
        { id: 'a', title: '顺势而为', mainStat: 'spirit', secondaryStat: 'sharpness', risk: 'low' },
        { id: 'b', title: '锦上添花', mainStat: 'design', secondaryStat: 'craft', risk: 'medium' },
        { id: 'c', title: '不留余地', mainStat: 'strength', secondaryStat: 'toughness', risk: 'high' },
      ],
  momentumDelta: { a: 8, b: 6, c: 17 },
      riskDelta: { a: -0.02, b: 0.01, c: 0.06 },
    },
    { id: eid('E'), name: '临场发挥', type: 'edge',
      choices: [
        { id: 'a', title: '直觉决策', mainStat: 'spirit', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'b', title: '计算执行', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '打破常规', mainStat: 'strength', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: 7, b: 4, c: 14 },
      riskDelta: { a: 0.02, b: -0.02, c: 0.08 },
    },
    { id: eid('E'), name: '评委认可', type: 'edge',
      styleIds: ['quench', 'composite'],
      choices: [
        { id: 'a', title: '保持水准', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '更进一步', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'c', title: '突破框架', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: 5, b: 8, c: 16 },
      riskDelta: { a: -0.01, b: 0.02, c: 0.06 },
    },
    { id: eid('E'), name: '技术碾压', type: 'edge',
      styleIds: ['precise'],
      choices: [
        { id: 'a', title: '精准打击', mainStat: 'craft', secondaryStat: 'sharpness', risk: 'low' },
        { id: 'b', title: '全面压制', mainStat: 'strength', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'c', title: '不留余地', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 8, b: 10, c: 20 },
      riskDelta: { a: -0.01, b: 0.01, c: 0.05 },
    },
    { id: eid('E'), name: '爆发窗口', type: 'edge',
      styleIds: ['overload'],
      choices: [
        { id: 'a', title: '稳健输出', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '全力爆发', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'c', title: '赌上一切', mainStat: 'spirit', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 6, b: 12, c: 22 },
      riskDelta: { a: -0.01, b: 0.03, c: 0.10 },
    },
    { id: eid('E'), name: '完美淬火', type: 'edge',
      styleIds: ['quench'],
      choices: [
        { id: 'a', title: '保持温度', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '提升质感', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'c', title: '超常发挥', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: 5, b: 9, c: 17 },
      riskDelta: { a: -0.02, b: 0.02, c: 0.06 },
    },

    // ═══ 劣势事件（5 个，~12%）═════════════════════════
    { id: eid('E'), name: '刀刃崩口', type: 'disadvantage',
      choices: [
        { id: 'a', title: '紧急回磨', mainStat: 'craft', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'b', title: '改用钝角', mainStat: 'toughness', secondaryStat: 'strength', risk: 'low' },
        { id: 'c', title: '冒险强攻', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: -4, b: -2, c: -10 },
      riskDelta: { a: 0.04, b: -0.01, c: 0.08 },
    },
    { id: eid('E'), name: '对手反击', type: 'disadvantage',
      styleIds: ['edge', 'overload'],
      choices: [
        { id: 'a', title: '硬扛反击', mainStat: 'toughness', secondaryStat: 'strength', risk: 'medium' },
        { id: 'b', title: '战术后撤', mainStat: 'craft', secondaryStat: 'design', risk: 'low' },
        { id: 'c', title: '以伤换伤', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: -5, b: -2, c: -12 },
      riskDelta: { a: 0.05, b: -0.02, c: 0.10 },
    },
    { id: eid('E'), name: '设备故障', type: 'disadvantage',
      choices: [
        { id: 'a', title: '修复设备', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'b', title: '手工替代', mainStat: 'strength', secondaryStat: 'design', risk: 'medium' },
        { id: 'c', title: '继续尝试', mainStat: 'spirit', secondaryStat: 'sharpness', risk: 'high' },
      ],
  momentumDelta: { a: -2, b: -6, c: -8 },
      riskDelta: { a: 0.01, b: 0.04, c: 0.07 },
    },
    { id: eid('E'), name: '裁判误判', type: 'disadvantage',
      choices: [
        { id: 'a', title: '接受判决', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'b', title: '申诉反驳', mainStat: 'design', secondaryStat: 'spirit', risk: 'medium' },
        { id: 'c', title: '无视干扰', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
      ],
  momentumDelta: { a: -3, b: -5, c: -2 },
      riskDelta: { a: 0.02, b: 0.04, c: -0.01 },
    },
    { id: eid('E'), name: '状态低迷', type: 'disadvantage',
      styleIds: ['composite', 'precise'],
      choices: [
        { id: 'a', title: '调整呼吸', mainStat: 'spirit', secondaryStat: 'toughness', risk: 'low' },
        { id: 'b', title: '强行提速', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
        { id: 'c', title: '稳守待机', mainStat: 'craft', secondaryStat: 'design', risk: 'medium' },
      ],
  momentumDelta: { a: -1, b: -8, c: -3 },
      riskDelta: { a: -0.02, b: 0.07, c: 0.01 },
    },

    // ═══ 特殊事件（2 个，~5%，带成本）═════════════════
    { id: eid('E'), name: '极限挑战', type: 'special',
      cost: { cr: 15 },
      choices: [
        { id: 'a', title: '放手一搏', mainStat: 'strength', secondaryStat: 'sharpness', risk: 'high' },
        { id: 'b', title: '保守尝试', mainStat: 'craft', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'c', title: '放弃挑战', mainStat: 'spirit', secondaryStat: 'design', risk: 'low' },
      ],
  momentumDelta: { a: 22, b: 5, c: -5 },
      riskDelta: { a: 0.10, b: 0.03, c: -0.02 },
    },
    { id: eid('E'), name: '豪赌时刻', type: 'special',
      cost: { risk: 0.15 },
      choices: [
        { id: 'a', title: '全押优势', mainStat: 'sharpness', secondaryStat: 'strength', risk: 'high' },
        { id: 'b', title: '分散风险', mainStat: 'design', secondaryStat: 'craft', risk: 'medium' },
        { id: 'c', title: '止损撤退', mainStat: 'toughness', secondaryStat: 'spirit', risk: 'low' },
      ],
  momentumDelta: { a: 18, b: 3, c: -8 },
      riskDelta: { a: 0.08, b: 0.01, c: -0.05 },
    },

    // ═══ 链式事件（3 个，~3%）════════════════════════
    {
      id: eid('E'), name: '连锁反应', type: 'chain',
      chainNext: null,
      choices: [
        { id: 'a', title: '顺势展开', mainStat: 'spirit', secondaryStat: 'sharpness', risk: 'medium' },
        { id: 'b', title: '打断链条', mainStat: 'toughness', secondaryStat: 'craft', risk: 'low' },
        { id: 'c', title: '加重负担', mainStat: 'strength', secondaryStat: 'design', risk: 'high' },
      ],
  momentumDelta: { a: 5, b: -2, c: -7 },
      riskDelta: { a: 0.03, b: -0.02, c: 0.08 },
    },
    {
      id: eid('E'), name: '连锁危机', type: 'chain',
      chainNext: null,
      choices: [
        { id: 'a', title: '逐个击破', mainStat: 'craft', secondaryStat: 'toughness', risk: 'medium' },
        { id: 'b', title: '优先保锋', mainStat: 'sharpness', secondaryStat: 'spirit', risk: 'high' },
        { id: 'c', title: '全面防守', mainStat: 'design', secondaryStat: 'strength', risk: 'low' },
      ],
  momentumDelta: { a: 3, b: 13, c: -4 },
      riskDelta: { a: 0.02, b: 0.06, c: -0.01 },
    },
    {
      id: eid('E'), name: '连锁机遇', type: 'chain',
      chainNext: null,
      choices: [
        { id: 'a', title: '抓住机会', mainStat: 'sharpness', secondaryStat: 'design', risk: 'medium' },
        { id: 'b', title: '稳扎稳打', mainStat: 'craft', secondaryStat: 'toughness', risk: 'low' },
        { id: 'c', title: '扩大战果', mainStat: 'strength', secondaryStat: 'spirit', risk: 'high' },
      ],
  momentumDelta: { a: 7, b: 4, c: 16 },
      riskDelta: { a: 0.02, b: -0.01, c: 0.05 },
    },
  ];

  /* ── 动态生成事件池 ────────────────────────────── */

  /**
   * 根据当前 matchState 生成下一事件候选池（加权）。
   * 权重 = 基础比例 × 流派偏好 × 当前局势偏置 × 事件复杂度调整。
   */
  function getEventPool(matchState, rand) {
    const ms = matchState || {};
    const arenaId = ms.arenaId || 'national';
    const opponent = ms.opponent || {};
    const styleId = opponent.style || 'composite';

    // 基础比例
    const WEIGHTS = { normal: 60, edge: 20, disadvantage: 12, special: 5, chain: 3 };
    // 随梯度提高，特殊/链式比例递增
    const tier = ms.tier != null ? ms.tier : 0;
    const bonusSpecial = tier * 1.5;
    const bonusChain = tier * 1;
    const adjusted = {};
    for (const t of Object.keys(WEIGHTS)) {
      adjusted[t] = t === 'special' ? WEIGHTS[t] + bonusSpecial :
                    t === 'chain' ? WEIGHTS[t] + bonusChain : WEIGHTS[t];
    }
    const total = Object.values(adjusted).reduce((a, b) => a + b, 0);

    // 流派偏好权重
    function styleBonus(ev) {
      if (!ev.styleIds || !ev.styleIds.length) return 1;
      return ev.styleIds.indexOf(styleId) >= 0 ? 1.4 : 1;
    }

    // 局势偏置：落后 → 更易出优势事件；领先 → 更易出劣势/特殊
    const momBias = ms.momentum || 0;
    const momFactor = Math.max(-1, Math.min(1, momBias / 30));
    function momentumBias(type) {
      if (momFactor < -0.3 && (type === 'edge' || type === 'special')) return 1.5;
      if (momFactor > 0.3 && (type === 'disadvantage' || type === 'chain')) return 1.4;
      return 1;
    }

    // 对手状态偏置
    const flags = ms.flags || [];
    function opponentBias(type) {
      if (flags.indexOf('opp_pressing') >= 0 && type === 'disadvantage') return 1.6;
      if (flags.indexOf('opp_vulnerable') >= 0 && type === 'edge') return 1.5;
      return 1;
    }

    // 高风险 → 更可能出特殊事件
    const riskBias = (ms.risk || 0) > 0.6 ? 1.4 : 1;

    /* ── ★ 战术连贯（§8.7 轻量 B 方案）────────────────────────
       连续两次同向主属性选择 → 形成「主动节奏」，下一事件倾向
       偏向该属性相关事件（权重 ×1.3），而非简单 +N。
       读 matchState.lastMainStat + tacticalContinuity 标记。 */
    function continuityBias(ev) {
      if (!ms.tacticalContinuity || !ev.choices) return 1;
      // 若事件主属性与上两次同向 → 略升
      const main = ev.choices[0] && ev.choices[0].mainStat;
      if (main && main === ms.lastMainStat) return 1.3;
      return 1;
    }

    /* ── ★ 主题加权（§8.11 世界巅峰）─────────────────────────
       matchState.themeWeight 由 arena.js 的主题系统注入：
       { type?: multiplier, styleIds?: [...] }
       主题可轻度提升某类事件或流派专属事件。 */
    function themeBias(ev) {
      const tw = ms.themeWeight;
      if (!tw) return 1;
      let m = 1;
      if (tw.eventTypes && tw.eventTypes[ev.type]) m *= tw.eventTypes[ev.type];
      if (tw.styleBoost && ev.styleIds && ev.styleIds.some(function(s){ return tw.styleBoost.indexOf(s) >= 0; })) m *= 1.5;
      return m;
    }

    // 构建加权池（含专属事件过滤）
    const pool = [];
    for (const ev of EVENTS) {
      // ★ §8.4：流派专属事件（exclusive）只在匹配流派出现
      if (ev.exclusive && ev.styleIds && ev.styleIds.indexOf(styleId) < 0) continue;
      let w = (adjusted[ev.type] || 0) / total;
      w *= styleBonus(ev);
      w *= momentumBias(ev.type);
      w *= opponentBias(ev.type);
      if (ev.type === 'special') w *= riskBias;
      w *= continuityBias(ev);
      w *= themeBias(ev);
      // 重复添加到池（权重 = w * 100），供 rand 抽样
      const n = Math.max(1, Math.round(w * 100));
      for (let i = 0; i < n; i++) pool.push(ev);
    }

    // 如果池为空或太小，兜底
    if (pool.length < 5) return EVENTS.slice();
    return pool;
  }

  /**
   * 从池子里抽取下一个事件（确定性 rand）。
   */
  function nextEvent(pool, matchState, rand) {
    // ★ 2026-10-06（§8.15）：兜底改确定性 seed —— 不再 Math.random
    const s = 'nextev#' + (matchState && matchState.opponentId || 'x') + '#' + (matchState && matchState.eventCount || 0);
    rand = rand || mulberry(s);   // ★ 数据层不依赖 K3D.arena（它会反向依赖本文件），统一走本地 mulberry
    if (!pool || !pool.length) return EVENTS[Math.floor(rand() * EVENTS.length)];
    const idx = Math.floor(rand() * pool.length) % pool.length;
    return pool[idx];
  }

  /** 本地确定性随机（mulberry32 + 字符串 hash），不依赖 bladeSkin / K3D.arena */
  function mulberry(seed) {
    let a = 0;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) a = (Math.imul(a, 31) + s.charCodeAt(i)) >>> 0;
    a |= 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── 结算 ──────────────────────────────────── */

  /**
   * 玩家选择某选项后更新 matchState。
   * @returns {{ choiceId, momentumDelta, riskDelta, success: boolean, feedback: string }}
   */
  function resolveChoice(eventTemplate, choiceId, matchState, opts) {
    // ★ 2026-10-06（§8.15）：兜底改确定性 seed（同 nextEvent 的 mulberry）
    const seed = 'res#' + (eventTemplate && eventTemplate.id || '') + '#' + choiceId + '#' + ((matchState && matchState.opponentId) || '');
    const rand = (opts && opts.rand) || mulberry(seed);
    const ev = eventTemplate;
    if (!ev || !ev.choices) return { error: 'event not found' };

    const choice = ev.choices.find((c) => c.id === choiceId);
    if (!choice) return { error: 'choice not found' };

    const momDelta = (ev.momentumDelta && ev.momentumDelta[choiceId]) || 0;
    const riskDelta = (ev.riskDelta && ev.riskDelta[choiceId]) || 0;
    const flags = (ev.flags && ev.flags[choiceId]) || [];

    // 胜率修正：实际选择会受随机性影响（不是 100% 按 delta 结算）
    const baseSuccessRate = 0.5 + Math.max(-0.4, Math.min(0.4, momDelta / 30));
    const success = rand() < baseSuccessRate;

    // 实际 delta 有 ±20% 随机抖动
    const actualMomDelta = Math.round(momDelta * (0.8 + 0.4 * rand()));
    const actualRiskDelta = riskDelta * (0.8 + 0.4 * rand());

    return {
      choiceId,
      eventId: ev.id,
      eventName: ev.name,
      type: ev.type,
      success,
      momentumDelta: actualMomDelta,
      riskDelta: Math.max(0, Math.min(1, (matchState.risk || 0) + actualRiskDelta)),
      flags,
      chainNext: ev.chainNext,
      feedback: success
        ? generateSuccessFeedback(ev, choice, rand)
        : generateFailFeedback(ev, choice, rand),
    };
  }

  /**
   * 对手行动（被动，按当前局势 + 流派倾向决定轻微影响）。
   */
  function applyOpponentAction(matchState, rand) {
    const opp = matchState.opponent || {};
    const styleId = opp.style || 'composite';
    const style = K3D.arenaStyles.byId(styleId);
    const w = style ? style.statWeights : {};
    const dominantStat = STAT_KEYS.reduce((a, k) => (w[k] || 0) > (w[a] || 0) ? k : a, 'strength');

    // 对手偶尔失误（高压下更容易）
    const mistakeProb = 0.05 + (matchState.risk || 0) * 0.1;
    if (rand() < mistakeProb) {
      return { type: 'mistake', stat: dominantStat, momentumDelta: 3 };
    }

    // 对手施压（高风险时更频繁）
    if ((matchState.risk || 0) > 0.5 && rand() < 0.15) {
      return { type: 'pressure', stat: dominantStat, momentumDelta: -2, flags: ['opp_pressing'] };
    }

    return { type: 'none' };
  }

  /* ── 反馈文案生成 ──────────────────────────────── */

  function generateSuccessFeedback(ev, choice, rand) {
    const templates = [
      '✅ ' + ev.name + ' · 你成功利用了这个机会。',
      '✅ 抓住空档 · ' + choice.title + '奏效。',
      '✅ 判断准确 · 你的' + choice.mainStat + '在这一刻展现了价值。',
    ];
    return templates[Math.floor(rand() * templates.length) % templates.length];
  }

  function generateFailFeedback(ev, choice, rand) {
    const templates = [
      '❌ ' + ev.name + ' · 未能抓住这个机会。',
      '❌ 判断失误 · ' + choice.title + '没有达到预期效果。',
      '❌ 时机未到 · 对手的施压让你未能发挥' + choice.mainStat + '。',
    ];
    return templates[Math.floor(rand() * templates.length) % templates.length];
  }

  /* ── 公开接口 ────────────────────────────────── */

  K3D.arenaEvents = {
    EVENTS,
    STAT_KEYS,
    getEventPool,
    nextEvent,
    resolveChoice,
    applyOpponentAction,
    /** 事件总数（仅供守卫断言用） */
    EVENT_COUNT: EVENTS.length,
    /** 按类型统计 */
    typeCounts() {
      const out = { normal: 0, edge: 0, disadvantage: 0, special: 0, chain: 0 };
      for (const e of EVENTS) { if (out[e.type] != null) out[e.type]++; }
      return out;
    },
    /** 检查链式事件是否构成有效链（最多 3 段，无环） */
    validateChains() {
      const byId = {};
      for (const e of EVENTS) byId[e.id] = e;
      const errors = [];
      for (const e of EVENTS) {
        if (!e.chainNext) continue;
        let cur = e.chainNext;
        let depth = 0;
        while (cur && byId[cur] && depth < 5) {
          if (byId[cur].id === e.id) { errors.push('chain cycle: ' + e.id); break; }
          cur = byId[cur].chainNext;
          depth++;
        }
        if (depth >= 5) errors.push('chain too deep: ' + e.id);
      }
      return errors;
    },
  };

export const arenaEvents = __reg.proxy.arenaEvents;
