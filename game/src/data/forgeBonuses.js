/**
 * 数据配置层 · 有限锻造加成（rework T11）
 *
 * ★ 要修什么（审计问题 11）：改造前 `workshop.js` 只是「已解锁内容 + 旧规则边界说明」，
 *   `game.startForge()` 没有装备项、锁定和生效流程 —— 设定里的单槽加成根本不存在。
 *
 * ★ 边界（§8.4，必须守住）：
 *   · **永久解锁**，限制的是**每局机会**，不是反复付费维持；
 *   · 普通开锻前装一项，**S1 开始后锁定**，不能中途换；
 *   · 只影响「一次风险检查 / 一次候选机会 / 信息 / 组合线索」，
 *     **绝不做永久基础六维加点**，也不是研究树。
 *
 * ★ 本初版只交付两类（设定已明确范围内、可验证的）：
 *   ① candidate —— 一次额外的候选机会（重抽一次，不花 CR）；
 *   ② insight   —— 一次工艺/Combo 信息提示（展示当前可命中的组合线索）。
 *   风险干预类（risk）需要新增的曲线口径尚未定义清楚，按 T11 要求**先不交付**，
 *   留 `RESERVED` 常量声明位置，避免以后被当作“漏实现”。
 */

export const BONUS_SLOTS = 1;

/** 作用时机：'forge-start' 在 S1 前；'in-forge' 在使用时消费 */
export const BONUS_TIMING = Object.freeze({
  beforeStart: 'beforeStart',
  onDemand: 'onDemand',
});

/**
 * bonusId / 解锁条件 / 作用时机 / 单局次数 / 说明。
 * `unlock` 使用与成就奖励相同的 token 语法，由 core/forgeBonuses 判定。
 */
export const FORGE_BONUSES = Object.freeze([
  {
    id: 'extra_reroll',
    name: '备料余裕',
    icon: '↻',
    desc: '开锻前装备：本局可免费重抽候选一次（不消耗 CR）。',
    detail: '每局一次。在任意阶段使用后立即消耗；进入 S1 后无法更换装备。',
    timing: BONUS_TIMING.onDemand,
    usesPerRun: 1,
    unlock: { kind: 'always' },
    unlockText: '默认解锁',
    /** 生效回执文案 —— 玩家必须看得到它真的生效了 */
    receipt: '备料余裕：已免费重抽本阶段候选',
  },
  // V4.1 six specialization slots. Every definition is unlockable by
  // its corresponding school; none lock a forging decision card.
  ...[
    ['press','锻压·稳锤','第十一锤起，进一步减小实际断裂概率'],
    ['edge','锋刃·精研','第二次描线可获得更高锋利收益'],
    ['precise','精密·定向','指定属性与有效阶段，提高匹配卡权重'],
    ['quench','淬彩·调色','S5/S6 指定冷相/热相/氧化倾向'],
    ['composite','复合·共鸣','已成型基础标签的限定次数候选偏好'],
    ['overload','过载·豪赌','高风险检查成功后，强化下一次卡池稀有度'],
  ].map(([id,name,desc])=>({
    id:'specialty_'+id,name,desc,detail:desc,icon:'◇',
    timing:BONUS_TIMING.beforeStart,usesPerRun:1,
    unlock:{kind:'school',branchId:id,gradient:1},unlockText:'对应流派达到能手',
    receipt:name+'：本局已冻结专精快照',
  })),
  {
    id: 'combo_insight',
    name: '匠人直觉',
    icon: '◈',
    desc: '开锻前装备：开锻时可查看一次当前工艺路线接近的隐藏组合线索。',
    detail: '每局一次。只给线索，不直接泄露完整配方；已发现的组合会直接标明。',
    timing: BONUS_TIMING.beforeStart,
    usesPerRun: 1,
    /* ★ rework T11 验收要求「至少两项可实际选择」：
       初版把解锁挂在「已发现 1 条隐藏组合」上，新档两页都是锁 → 实际只有一项能用。
       它只给**线索**（不给完整配方、不动数值），属于设定允许的「信息」类开局能力，
       因此与「备料余裕」并列作为默认可用项。 */
    unlock: { kind: 'never' },
    reserved: true, // V4.1 discovered Combo knowledge is permanently available, no slot cost.
    unlockText: '默认解锁',
    receipt: '匠人直觉：已显示可接近的组合线索',
  },
  {
    id: 'risk_cushion',
    name: '稳手',
    icon: '◇',
    desc: '（预留）开局的一次风险干预。',
    detail: '正式风险干预需要明确的曲线口径，本轮尚未定案，因此不作为可装备项出现。',
    timing: BONUS_TIMING.onDemand,
    usesPerRun: 1,
    unlock: { kind: 'never' },
    unlockText: '尚未开放',
    reserved: true,
    receipt: '',
  },
]);

export const BONUS_BY_ID = Object.freeze(Object.fromEntries(FORGE_BONUSES.map((b) => [b.id, b])));

/** 风险干预类预留声明（T11：不得暗中替换基础 Risk 曲线） */
export const RESERVED = Object.freeze({
  riskIntervention: {
    status: 'not-delivered',
    reason: '风险干预需要先定义与基础 Risk 曲线的关系、上限与次数，本轮不实现，避免暗中改曲线或给无限保命。',
  },
});

export const bonusById = (id) => BONUS_BY_ID[id] || null;

/** 玩家可见的加成列表（排除预留项） */
export const availableBonuses = () => FORGE_BONUSES.filter((b) => !b.reserved);

export default FORGE_BONUSES;
