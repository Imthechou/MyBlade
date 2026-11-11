/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/arenaStyles.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 六维 key（与 core/attributes.js 一致） */
  const STAT_KEYS = ['strength', 'sharpness', 'toughness', 'craft', 'design', 'spirit'];

  /**
   * 「淬彩」流派的第二条适配轴：刀身工艺（id 取自 skin/finishes.js 已有的 12 种）。
   * 淬彩只有 2 种原生适配刀型，靠工艺轴补足覆盖面 —— 全部复用现有数据，不新增美术资源。
   * F05 蓝化 / F07 回火彩 / F08 阳极氧化 / F10 彩色油膜 / F12 动态边缘光 = 画面上出彩色的五种。
   */
  const IRIDESCENT_FINISHES = ['F05', 'F07', 'F08', 'F10', 'F12'];

  const STYLES = [
    {
      id: 'press',
      name: '锻压',
      tag: '抗造 · 低断裂',
      desc: '重锤反复压实。不看谁最锋利，看谁劈完还完整。',
      /** 六维目标权重（和必须为 1，守卫 check_arena.js 会校验） */
      statWeights: { strength: 0.28, sharpness: 0.12, toughness: 0.28, craft: 0.12, design: 0.10, spirit: 0.10 },
      knives: ['machete', 'tangdao', 'bayonet', 'straight'],
      souls: ['TR207', 'TR205', 'TR204', 'TR203'],
      /** 专属轴：韧性越高越契合 */
      axis: { kind: 'stat', key: 'toughness', at: 34, gain: 0.08 },
      riskMod: -0.10,          // 赛事断裂倾向修正（负 = 更宽松）
      rewardMult: 1.00,
      fractureMult: 0.85,
      hue: 22,                 // UI 强调色色相（暖橙，对应锤击余温）
    },
    {
      id: 'edge',
      name: '锋刃',
      tag: '速度 · 巧劲',
      desc: '把刃口磨到极致。快到对手来不及反应。',
      statWeights: { strength: 0.10, sharpness: 0.28, toughness: 0.10, craft: 0.10, design: 0.28, spirit: 0.14 },
      knives: ['karambit', 'saber', 'balisong'],
      souls: ['TR202', 'TR201', 'TR206'],
      axis: { kind: 'stat', key: 'sharpness', at: 34, gain: 0.08 },
      riskMod: 0.00,
      rewardMult: 1.00,
      fractureMult: 1.00,
      hue: 348,                // 赤
    },
    {
      id: 'precise',
      name: '精密',
      tag: '精细 · 无短板',
      desc: '公差控制在发丝以内。赢在不犯错。',
      statWeights: { strength: 0.10, sharpness: 0.14, toughness: 0.16, craft: 0.28, design: 0.16, spirit: 0.16 },
      knives: ['folding', 'gladius', 'skull'],
      souls: ['TR212', 'TR209', 'TR211'],
      /** 专属轴：风险峰值越低越契合（控制 = 稳） */
      axis: { kind: 'lowRisk', at: 0.30, gain: 0.08 },
      riskMod: -0.05,
      rewardMult: 1.00,
      fractureMult: 0.90,
      hue: 205,                // 钢青
    },
    {
      id: 'quench',
      name: '淬彩',
      tag: '外观 · 幻彩',
      desc: '淬火的一瞬决定颜色。评委先看刀好不好看。',
      statWeights: { strength: 0.08, sharpness: 0.10, toughness: 0.10, craft: 0.14, design: 0.30, spirit: 0.28 },
      knives: ['kris', 'survival'],
      souls: ['TR210', 'TR208'],
      /** 专属轴：刀身工艺属于幻彩类（复用已有 skin/finishes.js 的分类） */
      axis: { kind: 'finishGroup', values: IRIDESCENT_FINISHES, gain: 0.10 },
      riskMod: 0.05,
      rewardMult: 1.10,
      fractureMult: 1.05,
      hue: 282,                // 紫
    },
    {
      id: 'composite',
      name: '复合',
      tag: '无偏科 · 高容错',
      desc: '样样都来一点。没有最强的一击，也没有最弱的一环。',
      statWeights: { strength: 1 / 6, sharpness: 1 / 6, toughness: 1 / 6, craft: 1 / 6, design: 1 / 6, spirit: 1 / 6 },
      knives: [],              // 空 = 全刀型视作「既 bonus 也不罚」，knives 为空时 knifeMult 恒 1.00
      /* ★ 2026-10-08 补：复合/过载此前 `souls: []`，导致这两个流派 T1+ 的对手
         **一条魂也继承不到**（`makeTierOpponent` 只在 `souls.length` 时抽特性），
         而且继承到的特性也**算不出魂加成** —— `affinityOf` 的
         `style.souls.filter(t => owned.indexOf(t) >= 0)` 对空表恒 0。
         两条合起来就是"复合/过载的高档对手只有预算、没有 Build"，
         与 §8.19「Build 稍增强」不符。选魂口径按流派性格：
           · 复合（无偏科·高容错）→ 多元素叠层的纹路魂（蛇鳞/星屑）
           · 过载（高风险·高收益）→ 被推到极限的刃口与热色魂（焰纹/霜刃/流金）
         ⚠ 魂 id 必须是 `traitsTable` 里真实存在的 TR 编号。 */
      souls: ['TR215', 'TR214'],
      /** 专属轴：最短板 / 最长板 ≥ 0.60 才算真的均衡 */
      axis: { kind: 'balance', at: 0.60, gain: 0.10 },
      riskMod: 0.00,
      rewardMult: 1.00,
      fractureMult: 0.95,
      hue: 152,                // 青绿
    },
    {
      id: 'overload',
      name: '过载',
      tag: '高风险 · 高收益',
      desc: '把钢材推到超出手册的极限。赢面大，断得也干脆。',
      statWeights: { strength: 0.26, sharpness: 0.26, toughness: 0.12, craft: 0.10, design: 0.14, spirit: 0.12 },
      knives: [],
      /* ★ 2026-10-08 补：见 `composite` 处的说明 —— 空 souls 会让高档对手
         既抽不到特性、也拿不到魂加成。过载的魂是"把钢材推到超出手册极限"的后果：
         焰纹（热）、霜刃（冷）、流金（熔）—— 三条都是极端处理的痕迹。 */
      souls: ['TR217', 'TR216', 'TR213'],
      axis: { kind: 'stat', key: 'strength', at: 40, gain: 0.08 },
      riskMod: 0.20,
      rewardMult: 1.25,
      fractureMult: 1.45,
      hue: 0,                  // 正红（警告）
    },
  ];

  const byId = (id) => STYLES.find((s) => s.id === id) || null;

  /**
   * 该刀在某流派下的六维「形状匹配度」 0–1。
   * 判据是**占比向量的方向**（cosine），不是绝对值 —— 六维全 120 不会因为"高"而加分。
   *
   * ★★ 2026-10-08 换公式（T10 数值调优第一项）。为什么原来的 L1 版本必须换掉：
   *   旧式 `sim = 1 - dist/2; return 0.55 + 0.45 * sim;` 里的 `/2` 是 L1 距离的**理论下界**，
   *   但那个下界只在"两个顶点"之间取到，而流派的 `statWeights` 全是**单纯形内部点**。
   *   实测（扫 6 种单维堆满 + 均匀 100 共 7 个形状 × 6 个流派）：
   *     · 每个流派的可达区间只有 **0.586 ~ 0.898**（宽度 0.09~0.11）；
   *     · 而**均匀 100 的均衡刀在每个流派下都拿到 0.889~1.000，是所有形状里的最高分**。
   *   即旧公式把"形状匹配"实际算成了"越均衡越好" —— 与本文档顶部的设计目标
   *   「逼玩家为某流派专门锻一把刀」**正好相反**（那条注释写的是"六维全 120 对任何流派都不算契合"）。
   *   ⚠ 顺带纠正 `锻刀大赛V3_体验诊断报告.md:29/142` 的说法：那里写"均衡刀对任何流派都只有 0.55 地板"，
   *     实测**不是** 0.55，而是 ~0.90（0.55 只是 `shapeFit` 在"六维全 0"时的退化返回值）。
   *     报告指出的"评分要均衡、赛事要偏斜，两套机制互相拆台"这个**方向是对的**，只是数字不对。
   *
   * 新式：把六维与权重各自除以自身最大值（**防止某维飙到几万时 a² 溢掉 cos 的方向信息**），
   *   再归一化 L1 长度取点积（= cosine），最后压到 0.20~1.00。
   *   除最大值不改变方向、也不改变"只看形状不看绝对值"这个语义，纯粹是数值稳定。
   *   `share·w = cos`，所以"形状正好等于该流派的权重向量"→ 1.00。
   * 实测新曲线（同一批 7 个形状 × 6 流派，2026-10-08 实测）：
   *   极差（同一形状在 6 流派间的最大-最小）从旧式的 **0.09~0.11** 拉到 **0.31~0.36**；
   *   均匀 100 在 `composite`（复合，权重本来就是均分）下拿到 **1.000**、
   *   而它对**专项流派的最佳形状**不再是通吃：`overload` 的最佳形状是 `全sharpness/全strength`（0.673），
   *   均匀 100 只有 0.942 —— 差距不大，但 `全craft/全spirit` 在同一流派下会掉到 0.38，
   *   所以"为某流派专门锻"终于在数值上被奖励了（旧式里单维堆满只有 0.586~0.667，比均匀还低）。
   * ⚠ 还没做到的：`press` / `edge` 这类**双峰**权重的流派，其最佳形状仍然是"均匀 100"（0.920 / 0.919）。
   *   这是 cosine 的数学性质（双峰权重向量的方向比单维顶点更接近均匀），不要再指望调公式解决；
   *   真要改，得改 `statWeights` 本身（把双峰改成单峰，或加大峰谷比）。**属后续 T10 范围。**
   * @returns {number} 0.20 ~ 1.00
   */
  function shapeFit(stats, style) {
    const w = (style && style.statWeights) || {};
    // 除以各自最大值：只做数值稳定，不改变方向（也就不会改变"只看形状"的语义）
    let sMax = 0, wMax = 0;
    for (const k of STAT_KEYS) {
      sMax = Math.max(sMax, Math.max(0, (stats && stats[k]) || 0));
      wMax = Math.max(wMax, Math.max(0, (w[k]) || 0));
    }
    // 六维全 0：没有形状可言，给一个保守的低分（不是"均衡"）
    if (sMax <= 0) return 0.30;
    if (wMax <= 0) return 0.20;
    let num = 0, s1 = 0, s2 = 0;
    for (const k of STAT_KEYS) {
      const a = Math.max(0, (stats[k] || 0)) / sMax;     // 该刀的形状（已定标）
      const b = Math.max(0, w[k] || 0) / wMax;           // 该流派的目标形状（已定标）
      num += a * b; s1 += a * a; s2 += b * b;
    }
    // 两侧 L1 长度都先归一化到 1 再点积 → 结果天然落在 0–1（不需要再除以理论最大值的 2）
    const la = Math.sqrt(s1) || 1, lb = Math.sqrt(s2) || 1;
    const cos = Math.max(0, Math.min(1, num / (la * lb)));
    return 0.20 + 0.80 * cos;
  }

  /**
   * 流派专属轴的额外契合（每种 ≤ +0.10）。
   * @param {object} record  刀记录
   * @returns {number}
   */
  function axisBonus(record, style) {
    const ax = style.axis;
    if (!ax) return 0;
    if (ax.kind === 'stat') {
      const v = (record.stats && record.stats[ax.key]) || 0;
      return v >= ax.at ? ax.gain : 0;
    }
    if (ax.kind === 'lowRisk') {
      const p = record.riskPeak || 0;
      return p <= ax.at ? ax.gain : 0;
    }
    if (ax.kind === 'finishGroup') {
      const fid = (record.skinState && record.skinState.finishId) || record.quenchMedium || '';
      if (!fid) return 0;
      return ax.values.indexOf(fid) >= 0 ? ax.gain : 0;
    }
    if (ax.kind === 'balance') {
      const vals = STAT_KEYS.map((k) => Math.max(0, (record.stats && record.stats[k]) || 0));
      const mx = Math.max.apply(null, vals);
      const mn = Math.min.apply(null, vals);
      if (mx <= 0) return 0;
      return (mn / mx) >= ax.at ? ax.gain : 0;
    }
    return 0;
  }

  /**
   * 契合度（0 – 1.30）。
   * @param {object} record  刀记录
   * @returns {{affinity:number, knifeFit:number, soulHits:string[], axisGot:number, shape:number}}
   */
  function affinityOf(record, styleId) {
    const style = typeof styleId === 'string' ? byId(styleId) : styleId;
    if (!style) return { affinity: 0, knifeFit: 1, soulHits: [], axisGot: 0, shape: 0 };

    // ① 形状匹配（0.20–1.00，见 shapeFit 的换公式说明）
    const shape = shapeFit(record.stats, style);
    /* ② 刀型契合：适配 ×1.12；knives 为空（复合/过载）或不在列表 → ×1.00（**不惩罚**）。
       ⚠ `record.knifeType` 存的是 **modelId**（'knife_tangdao'，见 cards.js:102 的
       `typeOf(w.knifeType).modelId`），而 STYLES.knives 记的是**裸 id**（'tangdao'）。
       这里统一剥掉 `knife_` 前缀再比对。不剥的话所有适配判定恒 false ——
       典型的「静默失效」：不报错，只是流派加成从来没生效过。 */
    const raw = String(record.knifeType || '');
    const kt = raw.replace(/^knife_/, '');
    const knifeFit = (style.knives.length && style.knives.indexOf(kt) >= 0) ? 1.12 : 1.00;
    // ③ 刀型魂：每条 +0.05，上限 2 条
    const owned = record.traits || [];
    const soulHits = style.souls.filter((t) => owned.indexOf(t) >= 0);
    const soulBonus = Math.min(2, soulHits.length) * 0.05;
    // ④ 专属轴
    const axisGot = axisBonus(record, style);

    const affinity = Math.min(1.30, shape * knifeFit + soulBonus + axisGot);
    return {
      affinity: Math.round(affinity * 1000) / 1000,
      knifeFit, soulHits, axisGot, shape: Math.round(shape * 1000) / 1000,
    };
  }

  /** 该刀最擅长的流派（放在**存在native收益**的四个专项里挑，排除复合/过载这类通用档） */
  function bestStyleOf(record) {
    let best = null, bestV = -1;
    for (const s of STYLES) {
      const a = affinityOf(record, s.id).affinity;
      if (a > bestV) { bestV = a; best = s; }
    }
    return best ? best.id : 'composite';
  }

  /** 编队多样性加成：不同流派数 / 不同刀型数越多，加成越高（最高 +0.32） */
  function teamBonus(records) {
    const n = records.length;
    if (n <= 1) return 1.00;
    const styles = new Set(), types = new Set();
    for (const r of records) {
      styles.add(bestStyleOf(r));
      types.add(r.knifeType);
    }
    return Math.round((1 + 0.10 * (styles.size - 1) + 0.06 * (types.size - 1)) * 1000) / 1000;
  }

  K3D.arenaStyles = {
    STYLES,
    STAT_KEYS,
    IRIDESCENT_FINISHES,
    byId, shapeFit, axisBonus, affinityOf, bestStyleOf, teamBonus,
  };

export const arenaStyles = __reg.proxy.arenaStyles;
