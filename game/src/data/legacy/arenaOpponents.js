/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/arenaOpponents.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 随机对手的名字池（每流派 6 个）。P3 起这是唯一的名字来源。 */
  const NAME_POOL = {
    press: ['老崔', '断刀张', '铁砧', '秦师傅', '老赵', '压锤'],
    edge: ['刃影', '阿七', '削铁', '小满', '飞燕', '快刀李'],
    precise: ['一丝', '游标', '零点', '陈工', '公差控', '沈师傅'],
    quench: ['釉师', '虹砂', '七色', '蓝调', '退火', '老彩'],
    composite: ['通才', '六边形', '全面手', '折中派', '均衡派', '老全'],
    overload: ['红线', '超载', '爆刃', '疯子赵', '老枪', '极限白'],
  };

  /** 随机对手用的刀型池（缺流派适配时兜底：全 12 种） */
  const ALL_KNIVES = [
    ['balisong', '蝴蝶刀'], ['bayonet', '刺刀'], ['folding', '折叠刀'], ['gladius', '罗马短剑'],
    ['karambit', '爪子刀'], ['kris', '马来剑'], ['machete', '砍刀'], ['saber', '弯刀'],
    ['skull', '骷髅匕首'], ['straight', '直刀'], ['survival', '生存刀'], ['tangdao', '唐刀'],
  ];

  const STAT_KEYS = ['strength', 'sharpness', 'toughness', 'craft', 'design', 'spirit'];

  /* ★ P3（2026-10-05）：5 档梯度预算曲线 —— 规格 §8.1 / §8.19。
   * 难度靠「预算渐进 + 事件复杂度 + 对手信息/行为 + 特殊事件」增长，
   * **不靠数值暴涨**（§8.19 明令禁止 50/100/500 纯数值墙）。
   * 预算（六维和）曲线刻意平缓，真正拉开难度的交给 P4 事件复杂度 与 P5 对手临场行为。
   * ★ 2026-10-06 数值重定：六维放大后预算曲线整体 ×~4（旧 74/90/108/128/150 → 180/300/420/560/700），
   *   对标玩家成长曲线（早期六维和 ~294，满成长 ~720）。流派赛逐档晋级，
   *   T0 学徒早期刀稳赢、T4 传奇要满成长才贴线。
   * 档位名：学徒 / 能手 / 专家 / 大师 / 传奇（arenaUI.TIER_CN 同步 5 档）。 */
  const TIERS = [
    { tier: 0, name: '学徒', budget: 180, event: 'low'      },
    { tier: 1, name: '能手', budget: 280, event: 'low-mid'  },
    { tier: 2, name: '专家', budget: 440, event: 'mid'      },
    { tier: 3, name: '大师', budget: 580, event: 'mid-high' },
    { tier: 4, name: '传奇', budget: 720, event: 'high'     },
  ];
  /** 预算 → 5 档（取最高一档满足 budget ≥ 该档起点） */
  function tierForBudget(b) {
    let t = 0;
    for (const x of TIERS) { if (b >= x.budget) t = x.tier; else break; }
    return t;
  }
  /** 档 → 预算（5 档曲线取值） */
  function tierBudget(t) { return (TIERS[t] || TIERS[0]).budget; }

  /** 本地确定性随机（mulberry32 + 字符串 hash），不依赖 bladeSkin 是否已加载 */
  function seededRand(seed) {
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

  /**
   * 生成一名随机对手。
   * 纯函数：同样的 styleId + budget + seed 永远得到同一名对手。
   *
   * @param {string} styleId  流派 id
   * @param {number} budget   六维和预算（74=学徒 ~ 150=传奇，见 TIERS）
   * @param {number|string} seed
   * @param {function} [rand]  确定性随机（缺省按 seed 自建，保证可复现）
   */
  function roll(styleId, budget, seed, rand) {
    const style = K3D.arenaStyles.byId(styleId) || K3D.arenaStyles.STYLES[0];
    const r = rand || seededRand(seed);
    const w = style.statWeights;

    // 80% 流派权重 + 20% 均匀
    const stats = {};
    for (const k of STAT_KEYS) {
      const base = budget * (0.80 * (w[k] || 0) + 0.20 / 6);
      // ±12% 抖动，让每名对手有一点个性
      stats[k] = Math.max(1, Math.round(base * (0.88 + 0.24 * r())));
    }

    // 刀型：优先从流派适配里挑，没有则全池
    const pool = (style.knives && style.knives.length)
      ? style.knives.map((t) => ALL_KNIVES.find((p) => p[0] === t) || [t, t])
      : ALL_KNIVES;
    const pickIdx = Math.floor(r() * pool.length) % pool.length;

    const names = NAME_POOL[styleId] || NAME_POOL.composite;
    const nameIdx = Math.floor(r() * names.length) % names.length;

    return {
      id: 'RX-' + styleId + '-' + budget + '-' + String(seed).replace(/\W+/g, '').slice(0, 8),
      style: styleId,
      tier: tierForBudget(budget),
      name: names[nameIdx],
      knifeType: 'knife_' + pool[pickIdx][0],
      knifeName: pool[pickIdx][1],
      stats,
      traits: [],
      line: '',
      random: true,
    };
  }

  /**
   * ★ P3：按 5 档曲线生成一名流派赛对手。
   * 特性随档继承该流派的刀型魂（arenaStyles.souls）——T0 空手，T1+ 拿魂，
   * 让「越往后越强」不只是预算，也是**特性维度**（§8.19：Build 稍增强）。
   * 同为纯函数：seed 相同 → 六维/刀型/特性全同。
   *
   * @param {string} styleId  流派 id
   * @param {number} tier     0~4（TIERS）
   * @param {string|number} seed
   * @returns {object} 与 roll() 同形态的随机对手（traits 已注入）
   */
  function makeTierOpponent(styleId, tier, seed) {
    const t = Math.max(0, Math.min(4, tier | 0));
    const style = K3D.arenaStyles.byId(styleId) || K3D.arenaStyles.STYLES[0];
    const budget = tierBudget(t);
    const opp = roll(styleId, budget, 'tier#' + styleId + '#' + t + '#' + seed);
    // T0 空手；T1 起继承流派刀型魂（确定性抽，去重）
    const souls = style.souls || [];
    if (t >= 1 && souls.length) {
      const r = seededRand('trait#' + styleId + '#' + t + '#' + seed);
      const n = Math.min(souls.length, t <= 1 ? 1 : 2);
      const picked = [];
      const pool = souls.slice();
      for (let i = 0; i < n && pool.length; i++) {
        const idx = Math.floor(r() * pool.length) % pool.length;
        picked.push(pool.splice(idx, 1)[0]);
      }
      opp.traits = picked;
    }
    return opp;
  }

  K3D.arenaOpponents = {
    NAME_POOL, ALL_KNIVES, STAT_KEYS,
    TIERS, tierForBudget, tierBudget,
    roll, makeTierOpponent,
  };

export const arenaOpponents = __reg.proxy.arenaOpponents;
