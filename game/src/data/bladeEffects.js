/**
 * 数据配置层 · 成刀 → 测试的适配内容（rework T01 / T02）
 *
 * 这里回答两个问题，且只在这里回答：
 *   ① 刀型在各项测试里有什么样的**能力画像**（不是所有差异都变成同一个倍率）；
 *   ② 特性/Combo 的职责是什么 —— 哪些只是**永久六维/收藏**，哪些真的有**赛事效果**。
 *
 * ⚠ 分层原则（T02.4）：
 *   `statDelta` 在特性授予时**已经写进永久六维**（core/traits.grant → attributes.apply）。
 *   所以本文件的 `testMods` **只允许表达赛场行为**，不得再写六维增量，
 *   否则参赛适配会把同一份收益叠加第二次。
 *   这里用 `NO_TEST_EFFECT` 显式标注「纯属性/收藏职责」，而不是留空让读者猜。
 *
 * 版本：ADAPTER_VERSION 与 EFFECT_VERSION 分开，因为它们的变化理由不同 ——
 *   刀型画像调整不应让历史评分失效，反之亦然。
 */

/** 成刀 → 测试能力适配层的规则版本（T01） */
export const ADAPTER_VERSION = 'adapter-1';

/** 效果结算表版本（T02）；历史成刀按各自记录的版本展示，不后台重算 */
export const EFFECT_VERSION = 'effect-1';

/**
 * 「这条特性在赛场没有任何独立效果」—— 显式职责声明，不是缺省值。
 * 这类特性（多为 LEGACY 条件树产物）的职责已经通过永久六维兑现。
 */
export const NO_TEST_EFFECT = Object.freeze({ scope: 'permanent-stats-only' });

/**
 * 刀型能力画像（T01.4）。
 *
 * 每项是**该项测试的适配系数**，围绕 1.0 上下浮动（0.88–1.12）。
 * 语义按刀的真实形状给，不是「统一攻击半径」：
 *   cutting    —— 刃长/曲率/刃口连续性：越适合连续切断越高
 *   precision  —— 操控与刚性/对称性：短刃、折叠结构、均衡重心更高
 *   strength   —— 厚度/脊线/根部截面：厚脊、宽刃、直刺型更高
 *   durability —— 结构冗余/柄芯/抗疲劳：生存型、全龙骨更高
 *   extreme    —— 承受超负荷后的余量：厚实且韧性好的更高
 *
 * ⚠ 可调初版。改动后需重跑 docs/rework/2026-10-24 的 A02/A09 交叉优势样本。
 */
export const KNIFE_PROFILES = Object.freeze({
  balisong: { label: '灵巧操控',  cutting: 0.96, precision: 1.10, strength: 0.90, durability: 0.92, extreme: 0.93 },
  bayonet:  { label: '直刺结构',  cutting: 1.02, precision: 0.95, strength: 1.10, durability: 1.02, extreme: 1.02 },
  folding:  { label: '精密便携',  cutting: 0.94, precision: 1.12, strength: 0.88, durability: 0.92, extreme: 0.92 },
  gladius:  { label: '宽刃刺击',  cutting: 1.08, precision: 0.96, strength: 1.10, durability: 1.00, extreme: 0.98 },
  karambit: { label: '弧刃内钩',  cutting: 1.12, precision: 0.98, strength: 0.92, durability: 0.93, extreme: 0.95 },
  kris:     { label: '波刃灵性',  cutting: 1.00, precision: 1.06, strength: 0.95, durability: 0.96, extreme: 1.00 },
  machete:  { label: '宽刃劈砍',  cutting: 1.12, precision: 0.90, strength: 1.05, durability: 0.98, extreme: 0.96 },
  saber:    { label: '弧刃切割',  cutting: 1.10, precision: 1.00, strength: 0.94, durability: 0.96, extreme: 0.97 },
  skull:    { label: '战术造型',  cutting: 0.98, precision: 1.08, strength: 1.00, durability: 0.97, extreme: 0.99 },
  straight: { label: '通用均衡',  cutting: 1.00, precision: 0.99, strength: 1.06, durability: 1.04, extreme: 1.00 },
  survival: { label: '结构冗余',  cutting: 1.00, precision: 0.97, strength: 1.04, durability: 1.12, extreme: 1.06 },
  tangdao:  { label: '修长气道',  cutting: 1.04, precision: 1.06, strength: 0.97, durability: 0.98, extreme: 1.02 },
});

/** 未知/缺失刀型的降级画像（T01 验收：不能因未知内容崩溃或获得随机能力） */
export const KNIFE_PROFILE_FALLBACK = Object.freeze({
  label: '未记录刀型', cutting: 1, precision: 1, strength: 1, durability: 1, extreme: 1,
});

/**
 * 特性 → 赛事行为（T02.1 的「比赛效果」列）。
 *
 * 键可以是**特性 id**（ST_void / HT_stable_2 …），也可以是**基础标签 id**
 * （precision / layer …）—— 后者按「该标签已达最高档」整体生效，
 * 避免 2/4/6 层三条特性各自再叠一层同类赛场效果（否则就是重复结算）。
 *
 * testMods 的数字是该项目的**适配乘数增量**，最终 project 系数 = 1 + Σ(增量)。
 */
export const TRAIT_TEST_MODS = Object.freeze({
  /* ── 基础标签（按标签最高档生效一次） ─────────────────── */
  precision: { precision: 0.07, cutting: 0.02, note: '精度专长：窄目标与稳定操作更占优' },
  stable:    { durability: 0.06, strength: 0.03, note: '稳态专长：持续承载与结构测试更占优' },
  flow:      { precision: 0.03, extreme: 0.03, note: '流动专长：连贯动作与余量管理更占优' },
  layer:     { strength: 0.07, durability: 0.02, note: '层叠专长：抗冲击与承载更占优' },
  edge:      { cutting: 0.07, note: '刃线专长：连续切断效率更占优' },
  heat:      { strength: 0.05, extreme: 0.04, note: '热相专长：高温组织下的承载与超载更占优' },
  cold:      { durability: 0.04, cutting: 0.03, note: '冷相专长：抗损伤与刃口保持更占优' },
  oxide:     { precision: 0.04, extreme: 0.02, note: '氧化专长：表面可控性与稳定性更占优' },

  /* ── 特殊标签特性 ─────────────────────────────────────── */
  ST_signature: { cutting: 0.02, precision: 0.02, strength: 0.02, durability: 0.02, extreme: 0.02,
    note: '签名工艺：各项测试都能小幅稳定发挥（优势平均，不制造偏科）' },
  ST_void:      { durability: 0.04, extreme: 0.02, note: '暗域：低反射表面，长时间负荷下更稳定' },
  ST_spectral:  { precision: 0.04, note: '偏相：异常相变让精细操作更容易复现' },
  ST_resonance: { cutting: 0.02, strength: 0.02, note: '共鸣：放大既有倾向，主项小幅加成' },
  ST_mirror:    { precision: 0.03, durability: 0.02, note: '镜面：极致抛光降低摩擦与局部应力' },

  /* ── S4 锻打特性（按基础标签，档位由六维/评分兑现） ───── */
  HT_precision: { precision: 0.03, note: '致密锻打：组织致密，精细项目更稳' },
  HT_stable:    { durability: 0.04, note: '稳固锻打：应力消除，持续测试更稳' },
  HT_flow:      { precision: 0.02, extreme: 0.02, note: '流锻：锻纹流动，动作连贯性更好' },
  HT_layer:     { strength: 0.04, note: '叠锻：层积强化，承载项目更稳' },
  HT_edge:      { cutting: 0.04, note: '锐锻：刃口强化，连续切断更稳' },
  HT_heat:      { strength: 0.03, extreme: 0.02, note: '热锻：热相组织，超载余量更足' },
  HT_cold:      { durability: 0.03, note: '冷锻：低温相区，抗损伤更好' },
  HT_oxide:     { precision: 0.02, extreme: 0.02, note: '彩锻：发色层稳定' },
  HT_mixed:     { cutting: 0.02, precision: 0.02, strength: 0.02, durability: 0.02, extreme: 0.02,
    note: '综合锻打：多路线并进，各项小幅加成' },

  /* ── 隐藏 Combo：给「有效得分」，不是只加六维 ─────────── */
  combo: { cutting: 0.02, precision: 0.02, strength: 0.02, durability: 0.02, extreme: 0.02,
    note: '隐藏组合：多面协同，各项测试小幅加成' },
});

/**
 * 特性职责表（T02.4）：显式声明每条 LEGACY 特性是「赛场有独立效果」还是「只兑现永久六维」。
 *
 * 改造前的实际情况：卡池 LEGACY 特性只给六维与视觉，没有赛事效果，
 * 但代码与文案都没有说清这是**职责划分**还是**漏实现**。
 * 这里给出确定答案（可测的分类），并让 UI 能读到同一份说明。
 *
 * LEGACY_TEST_MODS 只列**确有赛场行为**的条目；未列者走 NO_TEST_EFFECT。
 */
export const LEGACY_TEST_MODS = Object.freeze({
  // 例：条件树里明确表达「在硬靶负荷下更稳」的条目。
  // 未列入的具体 id 保持纯六维职责，由 core/effectLedger 统一标注。
});

/** 判定一项测试的适配系数上下限，避免多重叠加把某一项推到失真 */
export const TEST_MOD_CLAMP = Object.freeze({ min: 0.75, max: 1.35 });

/**
 * 刀型刃线形状（rework T05）。
 *
 * ★ 要修什么（审计问题 9）：改造前 S7 的题目是 `edge.baseline(seed)` 生成的
 *   双正弦叠加随机波形 —— 与这把刀的刀型、刃线完全无关。玩家描的是“一道随机曲线”，
 *   不是“这把刀的刃口”。
 *
 * 现在每种刀型有自己的刃线形状家族，seed 只提供轻微的确定性扰动：
 *   curve   —— 整体弯曲量（正 = 上弧，负 = 下弧）
 *   recurve —— 中段内凹（爪子刀 / 马来剑这类 S 形刃）
 *   tip     —— 刀尖处上翘强度
 *   belly   —— 中后段膨肚（砍刀 / 弯刀）
 * 所有值均为「归一化后的相对量」，与渲染模型解耦，不依赖 glb。
 */
export const EDGE_SHAPES = Object.freeze({
  balisong: { label: '短直刃',      curve: 0.06, recurve: 0.10, tip: 0.16, belly: 0.04 },
  bayonet:  { label: '直刺刃',      curve: 0.02, recurve: 0.00, tip: 0.10, belly: 0.02 },
  folding:  { label: '短折刃',      curve: 0.10, recurve: 0.08, tip: 0.14, belly: 0.06 },
  gladius:  { label: '宽直刃',      curve: 0.04, recurve: 0.00, tip: 0.12, belly: 0.14 },
  karambit: { label: '内钩刃',      curve: -0.26, recurve: 0.34, tip: 0.10, belly: 0.08 },
  kris:     { label: '波浪刃',      curve: 0.00, recurve: 0.00, tip: 0.08, belly: 0.06, wave: 0.30 },
  machete:  { label: '宽弧刃',      curve: 0.18, recurve: 0.00, tip: 0.20, belly: 0.22 },
  saber:    { label: '大弧刃',      curve: 0.30, recurve: 0.10, tip: 0.26, belly: 0.18 },
  skull:    { label: '战术直刃',    curve: 0.05, recurve: 0.06, tip: 0.10, belly: 0.05 },
  straight: { label: '通用直刃',    curve: 0.03, recurve: 0.00, tip: 0.10, belly: 0.03 },
  survival: { label: '全龙骨刃',    curve: 0.08, recurve: 0.04, tip: 0.12, belly: 0.10 },
  tangdao:  { label: '修长直刃',    curve: 0.07, recurve: 0.00, tip: 0.18, belly: 0.02 },
});

/** 未知刀型 → 中性直刃（不随机生成形状） */
export const EDGE_SHAPE_FALLBACK = Object.freeze({
  label: '未记录刀型', curve: 0.05, recurve: 0, tip: 0.10, belly: 0.05,
});
