/**
 * 数据配置层 · 平衡常数（★ 全游戏规则的唯一数值真源）
 *
 * ── 为什么集中在这里 ──
 * V1 的数值散落在 core/risk.js、core/appraise.js、core/arena.js、core/minigame.js
 * 四个文件里，且互相矛盾：
 *   · risk.js 的断裂率是「2.5% + 超出 20 点 ×0.35%，clamp 到 35%」；
 *   · appraise.js 的评分是「六维均值 + 特性数 ×4」，标尺 0–180；
 *   · 而主设定 V2.1 §9.3 / §13 要求「锚点插值，最高档 60%」
 *     与「六维均值 × 特性倍率，目标接近 999，不设上限」。
 * 两套规则并存会让"卡面显示的概率"与"实际判定"不一致，也会让评分永远到不了
 * 文档定义的稀有度区间。因此本文件把 V2.1 的每一条数值**只写一遍**，
 * core 层全部转调这里，任何地方再自己写一份公式都属违规。
 *
 * ── 引用规则 ──
 *   core/*  只读本文件的常量与纯函数；
 *   ui/*    只读本文件做展示；
 *   改数值只改这里，改完跑 `node tools/verify.mjs` 看分布是否仍落在目标区间。
 */

/* ══════════════════════════════════════════════════════════════════
   一、六维属性（V2.1 §12）
   ══════════════════════════════════════════════════════════════════ */

export const STAT_KEYS = Object.freeze([
  'strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit',
]);

export const STAT_META = Object.freeze({
  strength: { name: '强度', en: 'Strength', desc: '结构承载与力量表现' },
  toughness: { name: '韧性', en: 'Toughness', desc: '稳定、抗破坏与容错' },
  sharpness: { name: '锋利', en: 'Sharpness', desc: '刃口与切削性能' },
  craft: { name: '工艺', en: 'Craft', desc: '加工完成度与精度' },
  design: { name: '设计', en: 'Design', desc: '造型、结构和审美表现' },
  spirit: { name: '灵性', en: 'Spirit', desc: '独特性、特殊表达与工艺潜力' },
});

/** 单维软上限：防止单一维度无限堆叠（V2.1 §30 平衡原则 1） */
export const STAT_SOFT_CAP = 300;

/** 赛事 V3：独立标尺，不重算鉴定、锻造或历史成刀。150 之后软饱和。 */
export const ARENA_V3 = Object.freeze({
  version: 'arena-3', seconds: 45, choices: [0, 15, 30],
  refillDelay: .15, maxAlive: 6, minAlive: 3, repeatCooldown: .16, repeatTravel: .12,
  secondaryScore: .35, secondaryLimit: 3,
  schoolTargets: [1800, 3800, 7500, 15000, 28000],
  nationalTargets: [15000, 20000, 26000, 33000, 42000],
  apexTargets: [35000, 40000, 48000],
});
export const ARENA_STAT_CEILING = 210;
export function arenaStat(value) {
  const v = Math.max(0, Math.min(STAT_SOFT_CAP, Number(value) || 0));
  return v <= 150 ? v : 150 + 60 * (1 - Math.exp(-(v - 150) / 60));
}
export function arenaGrowth(value, anchors) {
  const v = Math.max(0, Number(value) || 0);
  for (let i = 1; i < anchors.length; i++) {
    if (v <= anchors[i][0]) {
      const [x, y] = anchors[i - 1], [nx, ny] = anchors[i];
      return y + (ny - y) * (v - x) / (nx - x);
    }
  }
  return anchors.at(-1)[1];
}
export const ARENA_POWER = Object.freeze({
  soft: [[0,.12],[30,.48],[60,1.035],[100,1.8],[150,2.7],[210,3.2]],
  hard: [[0,.025],[30,.15],[60,.5],[100,1.2],[150,3.4],[210,4.4]],
  wear: [[0,7],[30,5.8],[60,4.3],[100,2.35],[150,1.05],[210,.8]],
});
export const ARENA_MATERIALS = Object.freeze({
  foam: { name:'塑料泡棉', short:'泡棉', points:50, hard:0, armor:0, health:1, damage:.01, life:3.6, angle:Math.PI*.77, color:'#83c9aa' },
  rope: { name:'编织绳束', short:'绳束', points:70, hard:0, armor:0, health:1.3, damage:.02, life:4, angle:0, color:'#e7b65e' },
  wood: { name:'纹理木桩', short:'木桩', points:160, hard:.45, armor:.45, health:2.65, damage:.30, life:5.5, angle:Math.PI*.47, color:'#b88455' },
  plastic: { name:'工程塑料板', short:'塑板', points:220, hard:.6, armor:.6, health:3.4, damage:.38, life:6, angle:0, color:'#dbe5e9' },
  ice: { name:'透明冰块', short:'冰块', points:250, hard:.62, armor:.62, health:3.2, damage:.26, life:6, angle:Math.PI*.25, color:'#8fd8e8' },
  metal: { name:'金属块', short:'金属块', points:460, hard:1, armor:1, health:6.4, damage:.72, life:8, angle:0, color:'#b7c4cc', solid:true },
});

/**
 * ══════════════════════════════════════════════════════════════════
 * 成刀六维 → 测试能力曲线（rework T01，规则版本 cap-1）
 * ══════════════════════════════════════════════════════════════════
 *
 * 【要修什么】改造前 `core/cutParams.js` 与 `core/arenaChallenge.js` 把输入六维
 * 一律 `clamp(0,100)`。而锻造可以产出远高于 100 的永久六维（实测成刀常见
 * 124/256/129/233/113/48 —— 五项越界）。于是「工艺进步」只提高鉴定分，
 * 不再改善任何试刀能力，六维量纲断裂（审计问题 1）。
 *
 * 【为什么不用线性或硬截断】
 *   · 硬截断：>100 的部分彻底无效，正是缺陷本身；
 *   · 纯线性：256 点属性 = 2.56 倍能力，靶具与对手全部失去难度，数值爆炸；
 *   · 所以用**在 KNEE 处连续、一阶连续、有渐近上限**的饱和曲线：
 *        v ≤ KNEE        →  v                 （保留 0–100 的原有手感，靶具无需重标）
 *        v > KNEE        →  KNEE + SPAN·(1 − e^(−(v−KNEE)/TAU))
 *
 * 【实测取值】（KNEE=100 / SPAN=60 / TAU=90）：
 *   v=100 → 100.0   v=124 → 115.9   v=233 → 145.1   v=256 → 149.4   v=300 → 153.5
 *   → 100 与 256 相差 49.4 点能力（约 +49%），差异明确且可解释；
 *   → 渐近上限 KNEE+SPAN = 160，配合 STAT_SOFT_CAP=300 的永久上限，
 *     保证再堆属性也不会无限碾压。
 *   曲线在 v=100 处 C¹ 连续（导数两侧都为 1），不存在「跨过 100 突然变强/变弱」的拐点。
 *
 * ⚠ 这是**可调初版**：改 TAU/SPAN 后必须复核 TEST_REF 与 ARENA_TARGET_SCALE，
 *   并重跑 docs/rework/2026-10-24/BALANCE_REPORT 的属性标尺样本。
 */
export const STAT_CURVE = Object.freeze({ KNEE: 100, SPAN: 60, TAU: 90 });

/**
 * 永久六维 → 测试能力值（0 … KNEE+SPAN）。
 * 唯一实现；cutParams / arenaChallenge / 赛事适配层都必须转调本函数，
 * 任何地方再写一份 clamp(0,100) 都属违规。
 */
export function applyStatCurve(value) {
  const v = Math.max(0, Math.min(STAT_SOFT_CAP, Number(value) || 0));
  const { KNEE, SPAN, TAU } = STAT_CURVE;
  if (v <= KNEE) return v;
  return KNEE + SPAN * (1 - Math.exp(-(v - KNEE) / TAU));
}

/** 曲线饱和上限（等于 KNEE+SPAN），供靶具重标与展示用 */
export const STAT_CURVE_CEILING = STAT_CURVE.KNEE + STAT_CURVE.SPAN;

/* ── 正式赛事测试项目（rework T06/T08） ────────────────────────
 * 五种性能测试；每场正式赛取其中 2–3 项，不同流派用不同组合。
 * `stats` 是该项的主判定六维；`profile` 是刀型在该项的适配键。
 */
export const TEST_PROJECTS = Object.freeze({
  cutting:   { id: 'cutting',   name: '切割',   en: 'Cutting',   stats: ['sharpness', 'strength', 'craft'], profile: 'cutting' },
  precision: { id: 'precision', name: '精度',   en: 'Precision', stats: ['craft', 'design'],             profile: 'precision' },
  strength:  { id: 'strength',  name: '强度',   en: 'Strength',  stats: ['strength', 'toughness'],        profile: 'strength' },
  durability:{ id: 'durability',name: '耐久',   en: 'Durability',stats: ['toughness', 'craft'],           profile: 'durability' },
  extreme:   { id: 'extreme',   name: '极限',   en: 'Extreme',   stats: ['strength', 'toughness', 'design'], profile: 'extreme' },
});

/**
 * 测试分标准化参考值：一项测试的「能力均值」达到 TEST_REF 即视为 100 分基准。
 * 104 = 100（KNEE）与额外饱和余量的中点附近，取整后让「全 100 刀」约得 96 分、
 * 「全 256 刀」约得 100 分上限附近溢出到 100 以外的部分由 TEST_SCORE_SPAN 承接。
 * ⚠ 可调初版，见 BALANCE_REPORT。
 */
export const TEST_REF = Object.freeze({ cutting: 100, precision: 100, strength: 100, durability: 100, extreme: 100 });

/** 测试分曲线：能力比值 → 0–100 分的软上限（ratio 1 → 100，ratio 1.5 → ~115） */
export const TEST_SCORE = Object.freeze({ KNEE_RATIO: 1, SPAN: 24, TAU: 0.55 });

/** 能力比值 → 测试分（0–100 软上限之外允许少量溢出，便于区分顶级刀） */
export function testScoreOfRatio(ratio) {
  const r = Math.max(0, Number(ratio) || 0);
  const { KNEE_RATIO, SPAN, TAU } = TEST_SCORE;
  if (r <= KNEE_RATIO) return r * 100;
  return 100 + SPAN * (1 - Math.exp(-(r - KNEE_RATIO) / TAU));
}

/**
 * 赛事合成权重（rework T06.4）：**默认等权**，由赛事定义的 weights 覆盖。
 * ⚠ 明确不是旧的 70/10/20 或 70:30 —— 那些是旧桥接口径，见 DECISIONS.md。
 */
export const TEST_WEIGHTS_DEFAULT = Object.freeze({ equal: true });

/**
 * 旧引擎的赛事目标分缩放：属性曲线抬高了刀的能力，靶具/幽灵分需要同向微调，
 * 避免「全 100 刀」因为曲线而变得比以前更难。1.0 = 不重标（曲线在 100 处不变）。
 */
export const ARENA_TARGET_SCALE = 1.0;

/**
 * ★ 卡池六维标定系数。
 *
 * 【为什么要它】决策卡 V1.1 的 218 张卡是按「早期六维均值 ≈45」的旧标尺写的
 * （实测：单卡六维和中位 30，9 阶段累计 ≈270，均值 ≈45）。
 * 而 V2.1 §13.4 的稀有度区间（120/250/450/700）只有在这个量级上才有意义 ——
 * 不换算的话，极优秀的成刀也只能到 ~200 分，传说/神话档永远不可达。
 *
 * 【它是什么】在 data/cards.js 归一化卡表时统一乘上，把卡池抬到 V2.1 的量级。
 *
 * 【3.0 怎么定下来的】用 tools/verify.mjs 实测（每档 300–800 局）：
 *   · 2.0 时：稳健流 p50 ≈155、专精流 p50 ≈205、最优 ≈570 —— 神话档(700+)不可达；
 *   · 3.0 时：稳健流 p50 ≈230（稀有）、专精流 p50 ≈310（史诗）、
 *     最优 ≈640–850（传说/神话），999 仍需要「6 层标签 + 高特殊倍率 +
 *     高锻打档 + 高峰值风险」同时成立的极端协同才摸得到 —— 正是文档要的形态。
 *
 * ⚠ 这是**标定系数**不是玩法规则：改卡表数值时同步复核本值，
 *   并以 `node tools/verify.mjs` 的分布报告为准。
 */
export const CARD_STAT_SCALE = 3.0;

/**
 * 对手预算表是在「卡池 2.0 倍」的旧标尺上标定的（实测 tier4 预算 720 → 六维均值 ≈120，
 * 正好对上 2.0 倍时玩家的 114–144）。改 CARD_STAT_SCALE 后必须同比例缩放对手，
 * 否则玩家会恒定碾压（或反过来被碾压），赛事退化。
 */
export const LEGACY_OPPONENT_SCALE = 2.0;
export const OPPONENT_STAT_SCALE = CARD_STAT_SCALE / LEGACY_OPPONENT_SCALE;

/* ══════════════════════════════════════════════════════════════════
   二、Risk 风险与断裂（V2.1 §9）
   ══════════════════════════════════════════════════════════════════ */

export const RISK_MAX = 100;

/** 风险状态分档（V2.1 §9.1） */
export const RISK_BANDS = Object.freeze([
  { max: 19, id: 'steady', name: '平稳', tone: 'safe', desc: '容错较高' },
  { max: 39, id: 'controlled', name: '受控', tone: 'safe', desc: '正常加工区，仍需关注后续选择' },
  { max: 59, id: 'unstable', name: '不稳', tone: 'warn', desc: '需要考虑控险与收益取舍' },
  { max: 79, id: 'critical', name: '临界', tone: 'warn', desc: '高收益机会与断裂压力都明显提高' },
  { max: 94, id: 'danger', name: '危险', tone: 'risk', desc: '每次继续冒险都必须有明确理由' },
  { max: 100, id: 'brink', name: '崩溃边缘', tone: 'risk', desc: '最高风险区，仍可操作，但必须承担实际后果' },
]);

/**
 * ★★ 单次断裂概率锚点（V2.1 §9.3）★★
 * 「概率不在每个 Risk 档位突然跳变，而是按锚点线性插值」
 * 「Risk 达到 95 后，概率固定为 60%，直到 Risk 100」
 *
 * 锚点之间线性插值；≥95 恒为 60%。
 * ⚠ 卡面预览、风险条、正式判定必须共用 breakChance()，不允许各写一份。
 */
export const BREAK_ANCHORS = Object.freeze([
  { risk: 12, p: 0 },
  { risk: 24, p: 0.02 },
  { risk: 36, p: 0.05 },
  { risk: 48, p: 0.10 },
  { risk: 60, p: 0.18 },
  { risk: 72, p: 0.30 },
  { risk: 84, p: 0.45 },
  { risk: 100, p: 0.60 },
]);

/* ══════════════════════════════════════════════════════════════════
   三、S4 自由锻打（V2.1 §10）
   ══════════════════════════════════════════════════════════════════ */

/**
 * 每锤 Risk 增量（V2.1 §10.3）。
 * 表中为 [本局已尝试锤数上限, 该档增量]；第 13 锤起恒为 +8，Risk 最高 100。
 */
export const HAMMER_RISK_STEPS = Object.freeze([
  { upTo: 3, delta: 0 },
  { upTo: 6, delta: 1 },
  { upTo: 10, delta: 2 },
  { upTo: 11, delta: 4 },
  { upTo: 12, delta: 6 },
  { upTo: 13, delta: 8 },
  { upTo: 14, delta: 10 },
  { upTo: 15, delta: 12 },
  { upTo: 16, delta: 14 },
  { upTo: 17, delta: 16 },
  { upTo: Infinity, delta: 18 },
]);

/** 第 n 锤（1-based）的 Risk 增量 */
export function hammerRiskDelta(hammerCount) {
  for (const s of HAMMER_RISK_STEPS) if (hammerCount <= s.upTo) return s.delta;
  return HAMMER_RISK_STEPS[HAMMER_RISK_STEPS.length - 1].delta;
}

/**
 * 锤击成果：前期收益明确、后期递减（V2.1 §10.4「不设锤数上限，收益递减」）。
 * 第 n 锤的成果 = BASE × DECAY^(n-1)，下限 FLOOR。
 *
 * 累计：1→10, 2→19.2, 3→28.9, 5→45.6, 7→59.7, 8→65.9, 12→86.2, 17→94.8，之后每锤 +2.5。
 */
export const HAMMER_PROGRESS = Object.freeze({ BASE: 1, DECAY: 1, FLOOR: 1 });

/**
 * 累计成果 → 强化档位（V2.1 §8.4「强化等级由累计有效锤击成果决定」）。
 *
 * ★★ rework T04.2：门槛重标 ★★
 * 改造前门槛 18/46/82/126，对应 2/6/13/30 锤 —— 第 4 档需要 30 锤，
 * 而 S4 在第 18 锤就把 Risk 顶到 100（单次断裂 60%），实测存活率约
 * **0.00000836%（约 1197 万次一次）**，属于事实上不可达的死档。
 *
 * 同时改造前「成果」只累计到档位，第 3–5 锤（或任何未跨档的锤）
 * **只加 Risk 不留下任何有效收益**，中间锤变成纯亏损（审计问题 8）。
 *
 * 现在：
 *   · 门槛 12/30/54/82 → 需要 2/4/7/12 锤；
 *   · 第 12 锤时 Risk=54（单次断裂约 25.8%），从 Risk=0 入场的纯 S4 存活率约 21.6%；
 *   · **逐锤成果**（HAMMER_GAIN_SCALE）另行即时入账，中间锤也有有限收益 ——
 *     档位只负责「身份 / 强化层次 / 评分倍率」，不再独占全部收益。
 *
 * ⚠ 可调初版，实测分布见 docs/rework/2026-10-24/BALANCE_REPORT.md。
 */
export const HAMMER_TIERS = Object.freeze([
  { id: 0, name: '未锻打', need: 0 },
  { id: 1, name: '初步致密', need: 22 },
  { id: 2, name: '纤维延展', need: 44 },
  { id: 3, name: '晶粒细化', need: 76 },
  { id: 4, name: '极限锻合', need: 110 },
]);

/**
 * 逐锤成果的六维转化系数（rework T04.2）。
 * 每锤的「有限有效成果」= progressGain × HAMMER_GAIN_SCALE 点，
 * 按该阶段主导标签的方向向量分配（T04.3：九个方向不得共用同一个向量）。
 * 12 锤累计约 47 点，与旧第 4 档总增量（46 点）同量级，不虚增加强。
 */
export const HAMMER_GAIN_SCALE = 1;

/**
 * 各强化档的评分倍率与**额外**六维奖励。
 *
 * ★ rework T04.2 / §8.4：statDelta 改为 **{}**。
 * 六维现在由**逐锤成果**（HAMMER_GAIN_SCALE）即时写入，档位倍率只参与评分。
 * 若档位再给一份 statDelta，就叫「同一效果计算两次」（§8.4 / 审计问题 7 的同类问题）。
 * 档位仍然决定：评分倍率、锻打特性的身份与稀有度底线。
 */
export const HAMMER_TIER_REWARD = Object.freeze({
  0: { scoreMult: 1.00, statDelta: {} },
  1: { scoreMult: 1.05, statDelta: {} },
  2: { scoreMult: 1.12, statDelta: {} },
  3: { scoreMult: 1.20, statDelta: {} },
  4: { scoreMult: 1.30, statDelta: {} },
});

/* ══════════════════════════════════════════════════════════════════
   四、S7 刃线模拟（V2.1 §11）
   ══════════════════════════════════════════════════════════════════ */

/**
 * V2.1 §11：结果「有限影响开刃质量及最终六维，不直接决定成刀评分或稀有度」。
 * → 只给锋利加成（受 SHARP_CAP 约束），不进评分倍率。
 */
export const EDGE_TIERS = Object.freeze([
  { id: 'miss', name: 'MISS', min: 0.00, sharp: 0, craft: -2 },
  { id: 'good', name: 'GOOD', min: 0.35, sharp: 58, craft: 0 },
  { id: 'great', name: 'GREAT', min: 0.62, sharp: 92, craft: 0 },
  { id: 'perfect', name: 'PERFECT', min: 0.85, sharp: 128, craft: 0 },
]);
export const EDGE_SHARP_CAP = 136;
export const CONTOUR_SAMPLES = 48;
export const CONTOUR_ATTEMPT_MULTIPLIERS = Object.freeze([1.12, 1.06, 1]);
/** 贴合度计算：平均偏差 → 分数（偏差 0 → 1，偏差 ≥TOLERANCE → 0） */
export const EDGE_TOLERANCE = 0.35;
export const EDGE_SAMPLES = 24;

/*
 * ── rework T05：S7 真实描线评价的额外参──
 *
 * EDGE_COVERAGE_MIN：完成度低于这个值时不可能是 GOOD 以上。
 *   改造前没有任何覆盖率概念 —— UI 预填 0.5 的整条轨迹就能提交，
 *   于是「不操作」也能拿到 GOOD（实测 497/1000）。现在覆盖不足直接落 MISS。
 *
 * EDGE_STABILITY_TOLERANCE：相邻采样二阶差分超出基准多少就算“手抖”。
 *   值越小越严格；0.075 实测可区分「稳定描线」与「完整但抖动」。
 */
export const EDGE_COVERAGE_MIN = 0.55;
export const EDGE_STABILITY_TOLERANCE = 0.075;

/* ══════════════════════════════════════════════════════════════════
   五、工艺标签 → 特性（V2.1 §8.1 / §13.1）
   ══════════════════════════════════════════════════════════════════ */

/**
 * 标签成长档位与评分倍率（V2.1 §8.1 表 + §13.1）。
 * 「每种基础标签只取本局最终达到的最高档位，不把 2/4/6 层奖励重复相乘」
 */
export const TAG_TIERS = Object.freeze([
  { layers: 1, id: 'trace', name: '工艺倾向', scoreMult: 1.00, grantsTrait: false },
  { layers: 2, id: 'base', name: '基础特性', scoreMult: 1.10, grantsTrait: true },
  { layers: 4, id: 'enhanced', name: '强化特性', scoreMult: 1.22, grantsTrait: true },
  { layers: 6, id: 'master', name: '高阶特性', scoreMult: 1.40, grantsTrait: true },
]);
/** 超过 6 层不再升级（V2.1 §8.1） */
export const TAG_MAX_EFFECTIVE_LAYERS = 6;

/* ══════════════════════════════════════════════════════════════════
   六、成刀评分与稀有度（V2.1 §13）
   ══════════════════════════════════════════════════════════════════ */

/** 峰值风险倍率（V2.1 §13.2）—— 只有成功完成锻造才计入 */
export const PEAK_RISK_MULT = Object.freeze([
  { max: 19, mult: 1.00 },
  { max: 39, mult: 1.03 },
  { max: 59, mult: 1.07 },
  { max: 79, mult: 1.12 },
  { max: 94, mult: 1.20 },
  { max: 100, mult: 1.30 },
]);

/**
 * 评分 → 基础稀有度（V2.1 §13.4）。
 * 「不设硬性上限」—— 超过 999 照常显示，不截断。
 *
 * ⚠ 2026-10-14：`legend` 的中文名由「传奇」改为「传说」，与卡片轴（`data/cards.RARITY_CN`，
 *   继承 V1.1 卡表）统一。改之前同一个 `legend` 档在两条轴上各有一个中文名，
 *   而两条轴**共用同一枚 `.rarity--legend` 金色徽标** → 决策卡上写「传说」、
 *   藏刀阁 / 首页名牌 / 赛事选刀 / 出炉印章写「传奇」，玩家会当成两档。
 *   ★ 唯一真源规则：`legend` 的中文名在 RARITY_CN / RARITY_THRESHOLDS / resolveRarity
 *     三处**必须一致**，`tools/verify.mjs` 有断言钉住（改一处就会被测出来）。
 *   ⚠ 不要顺手改赛事梯度名（`data/legacy/arenaOpponents.TIERS` 的 学徒/能手/专家/大师/传奇）：
 *     那是**独立的对手强度阶梯**，自带预算曲线，与稀有度零共享代码，
 *     只是恰好用了同一个词，不属于本次统一范围。
 *
 * ⚠ 2026-10-14 第二改（用户：「成刀稀有度也 6 档吧」）：**从 5 档扩到 6 档**，
 *   新增 `fine`「精良」。两轴至此完全对齐（卡片轴本来就是 6 档）。
 *
 *   【为什么门槛落在 120 / 180 而不是随便插】
 *   用 `tools/probe-rarity-lowend.mjs` 实测 2120 局（5 种策略，含 0 锤摆烂），**只统计完成局**：
 *     · 完成局的评分**地板是 99** —— 即使"全选最差卡 + 0 锤"，分数也下不去。
 *       所以「普通」(0–119) 在四种正常策略下**一局都没命中**（实测占比 0.66%），
 *       是个**事实上的死档**；给它再切一刀毫无意义。
 *     · 分数最密的区间是 120–250（约占 72%），次密是 250–450（约 25%）。
 *   所以第 6 档插在**最挤的那一段**：把 120–249 一分为二（120–179 精良 / 180–249 稀有）。
 *   实测改后占比：普通 0.7% · 精良 30.2% · 稀有 36.7% · 史诗 28.8% · 传说 3.4% · 神话 0.08%。
 *
 *   【代价（明确记下来，别当成没发生）】
 *   `rare` 的下界从 120 抬到 180 → **原本算「稀有」的一批刀会降级成「精良」**，
 *   成就「锻出第一把稀有成刀」的达成难度上升。这是"6 档都有量"的必要代价。
 *   三个**高档门槛 250 / 450 / 700 一个没动**，所以史诗以上、收藏手感、
 *   V2.1 §13.4 文档值、以及 mythic 的稀有度全部不变。
 *   ⚠ 探针分布有幸存者偏差（greedy 策略断裂率 88.8%，只有高分局完成）→ 偏乐观，
 *     真实玩家的低分占比会更高，即「普通/精良」的实际占比比上表更好看。
 */
export const RARITY_THRESHOLDS = Object.freeze([
  { min: 700, id: 'mythic', name: '神话' },
  { min: 450, id: 'legend', name: '传说' },
  { min: 250, id: 'epic', name: '史诗' },
  { min: 180, id: 'rare', name: '稀有' },
  { min: 120, id: 'fine', name: '精良' },
  { min: 0, id: 'common', name: '普通' },
]);

/**
 * 隐藏 Combo 的评分倍率（V2.1 §13.1 把「隐藏 Combo 特性」计入特殊特性倍率）。
 * 每条 Combo 只贡献一份，且不因重复发现而叠加（core/combos.js 已去重）。
 */
export const COMBO_SCORE_MULT = 1.08;

/**
 * 品质（与稀有度不同轴：品质看"六维完成度"，稀有度看"评分 + 独特性"）。
 * V2.1 未定义品质字母档，这里沿用可解释的六维均值分档，仅用于展示排序。
 */
export const QUALITY_THRESHOLDS = Object.freeze([
  { min: 200, id: 'S', name: 'S' },
  { min: 160, id: 'A', name: 'A' },
  { min: 120, id: 'B', name: 'B' },
  { min: 70, id: 'C', name: 'C' },
  { min: 0, id: 'D', name: 'D' },
]);

/* ══════════════════════════════════════════════════════════════════
   七、赛事（V2.1 §15–§21）
   ══════════════════════════════════════════════════════════════════ */

/** 三个对抗面（V2.1 §15.1） */
export const FACES = Object.freeze({
  POWER: { id: 'POWER', name: '力量', stats: ['strength', 'sharpness'] },
  CONTROL: { id: 'CONTROL', name: '控制', stats: ['toughness', 'craft'] },
  ART: { id: 'ART', name: '表现', stats: ['design', 'spirit'] },
});

/**
 * ★ 待补齐规则的落地定义（V2.1 §15.2 明确要求「必须在赛事数据规范中统一定义」）：
 *   对抗面标准化 = clamp(0, 100, 该面两维均值 / FACE_REF × 100)
 * 取 FACE_REF = 220：换算后普通局（六维均值 ≈170）落在 ~78 分，
 * 极端局（≈215）落在 ~98 分 —— 与"六维对抗分是 0–100"的文档口径自洽。
 */
export const FACE_REF = 220;

/**
 * 综合分权重（V2.1 §15.2）：六维对抗 70% + 评分对抗 30%。
 * 评分对抗分 = 我方评分 / (我方 + 对手) × 100 —— 天然收敛，不因评分无上限而碾压。
 */
export const MATCH_WEIGHTS = Object.freeze({ face: 0.70, score: 0.30 });

/** Momentum 五档（V2.1 §18） */
export const MOMENTUM = Object.freeze([
  { id: 'ahead_big', value: 2, name: '大幅领先', short: '大幅领先' },
  { id: 'ahead', value: 1, name: '领先', short: '领先' },
  { id: 'even', value: 0, name: '均势', short: '均势' },
  { id: 'behind', value: -1, name: '落后', short: '落后' },
  { id: 'behind_big', value: -2, name: '大幅落后', short: '大幅落后' },
]);

/** 每种赛事的事件数（V2.1 §16） */
export const ARENA_EVENT_COUNT = Object.freeze({ school: 3, national: 3, apex: 4 });

/**
 * 现场小游戏（V2.1 §19）：单场最多 1 次，只修正六维对抗分，不改永久数值。
 * MAX_FACE_INFLUENCE = 0.15，与文档「影响不超过约 15%」一致。
 */
export const FIELD_TESTS = Object.freeze({
  chop: { id: 'chop', name: '劈砍测试', face: 'POWER', stats: ['strength', 'sharpness'] },
  rope: { id: 'rope', name: '断绳测试', face: 'CONTROL', stats: ['craft', 'spirit'] },
  pressure: { id: 'pressure', name: '极限抗压', face: 'ART', stats: ['toughness', 'design'] },
});
export const FIELD_TEST_MAX_INFLUENCE = 0.15;
export const FIELD_TEST_MOMENTUM = Object.freeze({ perfect: 1.25, near: 0.3, fail: -3 });

/**
 * 正式赛事支持基于实际测试结构失效的断刀，普通落败不触发。
 * 这是能力声明，不是独立的断刀判定；快速挑战永远安全。
 * 概率曲线、跨项目受损和收手政策见 arenaChallenge.FORMAL_RISK_TBD。
 */
export const ARENA_CAN_DESTROY_BLADE = true;

/* ══════════════════════════════════════════════════════════════════
   八、经济：CR 与重铸（V2.1 §25）
   ══════════════════════════════════════════════════════════════════ */

export const CR_START = 50;

/**
 * 重铸价格（V2.1 §25.3）：「每个阶段第一次重铸免费；同一阶段之后每次递增，
 * 进入新阶段后按新阶段重新计算该阶段的重铸次数」—— 按**阶段内**次数计价。
 */
export function rerollCost(stageRerollCount) {
  const n = Math.max(0, Number(stageRerollCount) || 0);
  if (n === 0) return 0;
  const table = [0, 10, 30, 60, 110, 180];
  return n < table.length ? table[n] : 180 + (n - table.length + 1) * 80;
}

/** 鉴定与赛事的 CR 奖励（V2.1 §25.1） */
export const CR_REWARD = Object.freeze({
  forgeFinish: (rarity) => ({ common: 20, fine: 27, rare: 35, epic: 60, legend: 100, mythic: 160 }[rarity] ?? 20),
  matchWin: (tier) => [40, 70, 120][tier] ?? 40,
  matchLose: (tier) => [12, 20, 30][tier] ?? 12,
  dailyTask: 40,
  dailyAllBonus: 50,
});

/* ══════════════════════════════════════════════════════════════════
   九、每日任务（V2.1 §22.2）
   ══════════════════════════════════════════════════════════════════ */

export const DAILY_TASKS = Object.freeze([
  { id: 'forge', name: '完成 1 次锻造', reward: 40 },
  { id: 'match', name: '参加 1 场赛事', reward: 40 },
  { id: 'craft', name: '发现一种新工艺或成刀特性', reward: 50 },
]);
/* ★ 2026-10-24：`DAILY_ALL_BONUS`（全勤 50 CR）已删除。
   用户确认「50 CR 全勤奖励也不必要，删了一起」。
   随着首页「今日目标」抽屉一并移除，避免留下永远领不到的死数据。 */

/* ── 通用取值函数（core 层只调这些，不自己写 if 链） ── */

export function bandOfRisk(risk) {
  const v = Math.min(RISK_MAX, Math.max(0, Number(risk) || 0));
  for (const b of RISK_BANDS) if (v <= b.max) return b;
  return RISK_BANDS[RISK_BANDS.length - 1];
}

export function peakRiskMult(peak) {
  const v = Math.min(RISK_MAX, Math.max(0, Number(peak) || 0));
  for (const r of PEAK_RISK_MULT) if (v <= r.max) return r.mult;
  return 1.30;
}

export function rarityOfScore(score) {
  const v = Math.max(0, Number(score) || 0);
  for (const r of RARITY_THRESHOLDS) if (v >= r.min) return r;
  return RARITY_THRESHOLDS[RARITY_THRESHOLDS.length - 1];
}

export function qualityOfMean(mean) {
  const v = Math.max(0, Number(mean) || 0);
  for (const q of QUALITY_THRESHOLDS) if (v >= q.min) return q;
  return QUALITY_THRESHOLDS[QUALITY_THRESHOLDS.length - 1];
}

export function tagTierOf(layers) {
  let hit = null;
  for (const t of TAG_TIERS) if (layers >= t.layers) hit = t;
  return hit;
}

export function hammerTierOf(progress) {
  let hit = HAMMER_TIERS[0];
  for (const t of HAMMER_TIERS) if (progress >= t.need) hit = t;
  return hit;
}

export default {
  STAT_KEYS, STAT_META, STAT_SOFT_CAP, CARD_STAT_SCALE,
  LEGACY_OPPONENT_SCALE, OPPONENT_STAT_SCALE,
  RISK_MAX, RISK_BANDS, BREAK_ANCHORS,
  HAMMER_RISK_STEPS, HAMMER_PROGRESS, HAMMER_TIERS, HAMMER_TIER_REWARD,
  EDGE_TIERS, EDGE_SHARP_CAP, EDGE_TOLERANCE, EDGE_SAMPLES,
  EDGE_COVERAGE_MIN, EDGE_STABILITY_TOLERANCE,
  TAG_TIERS, TAG_MAX_EFFECTIVE_LAYERS,
  PEAK_RISK_MULT, RARITY_THRESHOLDS, QUALITY_THRESHOLDS, COMBO_SCORE_MULT,
  FACES, FACE_REF, MATCH_WEIGHTS, MOMENTUM, ARENA_EVENT_COUNT,
  FIELD_TESTS, FIELD_TEST_MAX_INFLUENCE, FIELD_TEST_MOMENTUM, ARENA_CAN_DESTROY_BLADE,
  CR_START, CR_REWARD, DAILY_TASKS,
  hammerRiskDelta, rerollCost, bandOfRisk, peakRiskMult, rarityOfScore, qualityOfMean,
  tagTierOf, hammerTierOf,
};
