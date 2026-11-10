/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/arenaMilestones.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const MILESTONES = [
    { id: 'MS1', wins: 3, name: '初登榜单', desc: '在赛事里拿到第一份战绩', trophy: '首胜铭牌', reward: { traits: ['TR401'] } },
    { id: 'MS2', wins: 8, name: '定级出线', desc: '稳定打上正赛序列', trophy: '定级徽章', reward: { traits: ['TR402'] } },
    { id: 'MS3', wins: 15, name: '巡回常客', desc: '巡回赛名单里开始有你', trophy: '巡回勋章', reward: { traits: ['TR403'] } },
    { id: 'MS4', wins: 25, name: '决赛常客', desc: '进决赛圈不再是新闻', trophy: '决赛奖章', reward: { traits: ['TR404'] } },
    { id: 'MS5', wins: 40, name: '冠军候选', desc: '赛前预测里出现了你的名字', trophy: '候选金徽', reward: { traits: ['TR405'] } },
    { id: 'MS6', wins: 60, name: '名宿席位', desc: '后来的人开始研究你的刀谱', trophy: '名宿奖杯', reward: { traits: ['TR406'] } },
  ];

  /**
   * 每场胜利的信用点基数（按赛事 tier + 难度档），再乘流派 rewardMult。
   * ⚠ 世界冠军杯是**每局**结算的（三局），所以单局基数必须低于全国大赛，
   *   否则一届三局能拿 ~135 CR（旧值 45×3），一天刷两届就把经济撑爆。
   *   现在 30×3 ≈ 90（上限）/ 一局都没赢约 22 —— 仍是三层里最高的，但不失控。
   * ★ P3：style 数组随 5 档梯度（学徒/能手/专家/大师/传奇）扩到 5 值，
   *   避免 crBaseOf 把 tier 3/4 静默钳到 tier 2。
   */
  const CR_BY_KIND = {
    style: [12, 16, 22, 28, 34],   // 流派赛：学徒 / 能手 / 专家 / 大师 / 传奇
    national: 26,
    world: 30,
  };

  /** 败北也有保底（不是白跑一趟），但只有胜者的 ~1/4 */
  const CR_LOSS_RATIO = 0.25;

  K3D.arenaMilestones = {
    MILESTONES, CR_BY_KIND, CR_LOSS_RATIO,
    /** 下一个还没达成的里程碑 */
    nextOf(totalWins) {
      return MILESTONES.find((m) => totalWins < m.wins) || null;
    },
    /** 累计胜场从 a → b 之间跨过的里程碑（通常一次只跨一个） */
    crossed(a, b) {
      return MILESTONES.filter((m) => a < m.wins && b >= m.wins);
    },
    allTraitIds() {
      const out = [];
      for (const m of MILESTONES) for (const t of (m.reward.traits || [])) out.push(t);
      return out;
    },
  };

export const arenaMilestones = __reg.proxy.arenaMilestones;
