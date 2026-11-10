/**
 * 固定程序族 · 统一工艺配方（纯数据，无 THREE / DOM 依赖）
 *
 * 背景（docs/RENDER_REARCHITECTURE_S1_S9.md §4）：
 *   旧实现把 12 种工艺写成 `k3dApplyFinish` 里的 12 路 if/else，再靠**按卡特化**把
 *   分支裁到 1 路 —— 于是"换一张 S5 卡"就是"换一份 GLSL 源码"，首次使用要重新链接
 *   （实测 S5 新增 link 3.8s/次）。这是本工程最大的可交互长帧来源。
 *
 *   这里把 12 种工艺**收敛成一组固定算子**（抛光/压暗/染色/色带走位/薄膜/视角光泽），
 *   每种工艺只是这组算子的不同权重组合 —— 源码不再随卡变化，运行时只刷 uniform。
 *   12 行参数表就是"统一视觉配方"，可单独测试、可逐卡替换，不需要改 GLSL。
 *
 * 参数槽（对应 shader 里的 uV2FinA..D）：
 *   A = (polish 抛光量, roughMul 粗糙度乘子, roughAdd 粗糙度加量, darken 压暗)
 *   B = (tintAmt 染色量, coverBias 纹理门控, filmAmt 薄膜量, filmThickness 膜厚)
 *   C = (fresnelPow 视角指数, fresnelAdd 视角加光, hueShift 色相偏移, specLift 高光提亮)
 *   D = (axialMix 色带来源:0=纹样 1=沿刀轴, rampBias 相位, rampAmt 色带强度, coat 清漆)
 *
 * ⚠ 这里不追求逐像素复制旧 F 分支（那是被判定要退役的"按卡裁剪"路径），
 *   但**必须保住每张卡的身份**：色相 / 明暗档位 / 覆盖范围都来自卡自己的参数，
 *   阶段继承（S1 底色、S3 纹理、S6 回火、S7 刃线）不在这里改动。
 */

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** 表面淬火（F06）的四段色域：留底钢 / 深蓝 / 金 / 紫。非连续彩虹。 */
export const CASE_HARDENED_PALETTE = ['#0f1f38', '#1c4fb8', '#b8862a', '#5a2f8c'];
/** 回火（F07）色带：黄 → 紫 → 蓝。 */
export const TEMPER_PALETTE = ['#f2d66b', '#c47a2a', '#6a3f9e', '#2f5fc4'];
/** 渐变之色（F10 + gradient）：紫 → 品红 → 朱 → 金。旧实现的 7 档锚点收敛成 4 档。 */
export const FADE_PALETTE = ['#391d73', '#a51c80', '#e55618', '#f2c935'];
/**
 * 多普勒（F10 无 gradient）专用四段色：**深蓝 → violet → 品红 → 青**。
 *
 * 为什么不复用 FADE_PALETTE：那一套整体偏暖（品红→朱→金），
 * 方案 §7 点名「S5_20 蓝紫流界必须实际呈现蓝紫」—— 实测用暖色板居中取色会落成
 * 品红/朱红，卡名与画面继续打架。多普勒这一支本来语义就是"视角相关的冷色流动"，
 * 所以给它一套独立的冷色锚点；渐变卡（S5_21 一类）继续用 FADE_PALETTE。
 */
export const DOPPLER_PALETTE = ['#1b2a6b', '#4a2f9e', '#8b3fc0', '#2fa6c8'];

/**
 * 工艺 → 固定算子权重。
 * @param {number} finId  1..12
 * @param {object} fp     卡写入的工艺参数（amount / darkness / gradient / coat / hueShift …）
 * @param {object} ctx    { dopplerStrength, iridescence, wear }
 * @returns {{a:number[],b:number[],c:number[],d:number[],tint:string|null,palette:string[]|null,coating:boolean}}
 */
export function finishOperators(finId, fp = {}, ctx = {}) {
  /* ★ 2026-10-20（S5 逐卡差异）：`amount` 缺省不等于"没选工艺"。
     实测 S5_21（神淬虹纹，F10 + gradient=0.92）与 S5_14（液氮断彩，F10 + marble）
     的卡数据**都没写 amount**，于是这里早退成中性 → 这两张卡的工艺层整体消失。
     旧实现的 F10 分支只用 strength/gradient/marble，从不读 amount。
     现在的判据：finishId > 1（或显式 amount > 0）= 玩家选过工艺 → 给一个基准量。 */
  const chosen = (Number(ctx.finishId) || 1) > 1 || (fp.amount != null && Number(fp.amount) > 0);
  /* ★ 2026-10-22（S5 淬火差异化）：基准量 0.55 → 0.70。
     实测 25 张淬火卡在物体掩膜内差 39–59/255，但其中很大一部分来自"色相"而不是
     "工艺幅度"；把基准抬起来后，抛光/压暗/染色/色带这四项算子的**逐卡差距**同步放大，
     同一色系的两张卡（例如都偏蓝的）也能靠明暗与覆盖分开。 */
  const amount = chosen ? clamp01(fp.amount != null && Number(fp.amount) > 0 ? fp.amount : 0.70) : 0;
  const darkness = clamp01(fp.darkness);
  const gradient = clamp01(fp.gradient);
  const coat = clamp01(fp.coat);
  const hueShift = Number(fp.hueShift) || 0;
  const iridescence = clamp01(fp.iridescence);
  const temperature = clamp01(fp.temperature);
  const strength = clamp01(ctx.dopplerStrength != null ? ctx.dopplerStrength : 1);
  const wear = clamp01(ctx.wear);
  const id = Math.round(Number(finId) || 1);

  /* 默认 = 中性（不抛光、不压暗、不染色、无薄膜）—— 未选 S5 时必须逐像素中性。 */
  const out = {
    a: [0, 1, 0, 0], b: [0, 0, 0, 0], c: [1.6, 0, 0, 0], d: [0, 0, 0, 0],
    /* 色带来源：0 无 / 1 多普勒液态场 / 2 表面淬火斑块 / 3 沿刀轴渐变 */
    mode: 0,
    /* 色带的空间覆盖率（方案 §7「起点 10–25%、局部上限 40%」）。
       1.0 = 旧口径（整刀 wash，实测覆盖 ≈90%）；色带类工艺按 §7 收窄。 */
    cover: 1.0,
    tint: null, palette: null, coating: false,
    /* ★★ 玩家到底选过 S5 没有 —— **单一真源**。
       下游（S5 稀有效果库）必须以此为前提，否则会出现
       「刚进新阶段、还没选卡，刀身就被自动上了个效果」。 */
    chosen,
  };
  if (!chosen) return out;

  switch (id) {
    case 1: // F01 精抛光：只提镜面度，不改色相
      out.a = [amount, 0.32, 0, 0];
      out.c = [1.5, 0, 0, 0.55];
      out.d = [0, 0, 0, 0.30];
      break;
    case 2: // F02 镜面抛光
      out.a = [amount, 0.10, 0.035, 0];
      out.c = [1.5, 0, 0, 1.0];
      out.d = [0, 0, 0, 0.55];
      break;
    case 3: // F03 拉丝：方向性微粗糙（由纹理 roughDelta 承担方向）
      out.a = [amount * 0.9, 1.0, 0.10, 0];
      out.b = [0, 0.85, 0, 0];
      break;
    case 4: // F04 发黑氧化（可选紫调染色）
      out.a = [amount, 1.0, 0.28 * darkness, 0.82 * darkness];
      if (gradient > 0.002) {
        /* 旧实现把染色权重顶到 ~0.86（tintAmt*1.55*K3D_FIN_COLOR）：
           这里保持同档，否则深色底材上"紫色"读不出来（S5_22 玄蚀紫界）。 */
        out.b = [Math.min(1, gradient * 1.35), 0.35, 0, 0];
        out.tint = fp.tintHex || '#7a3fbf';
      }
      out.c = [1.8, 0, 0, 0];
      break;
    case 5: // F05 蓝化：沿花纹铺蓝灰氧化层
      out.a = [amount * 0.85, 1.0, 0.16, 0];
      out.b = [0.55 * amount, 0.75, 0, 0];
      out.tint = fp.tintHex || '#3d5f8c';
      break;
    case 6: // F06 表面淬火：斑块色域（palette 由 binder 覆盖成四段钢/蓝/金/紫）
      out.a = [amount * 0.55, 1.0, 0.12, 0];
      out.b = [0.12, 0.95, 0, 0];
      out.d = [0.25, 0.06, 0.55 + 0.35 * amount, 0];
      out.mode = 2;
      out.palette = CASE_HARDENED_PALETTE;
      out.coating = true;
      /* 表面淬火是"斑块"语义，覆盖率给上限 40%（方案 §7 局部强调上限） */
      out.cover = 0.40;
      break;
    case 7: // F07 回火彩：黄 → 紫 → 蓝
      out.a = [amount * 0.35, 1.0, 0, 0];
      out.d = [0.35, temperature * 0.55 + gradient * 0.2, 0.42 + 0.30 * amount, 0];
      out.mode = 3;
      out.palette = TEMPER_PALETTE;
      /* 回火带：卡的原始语义就是「窄色带，沿边缘而非全刀铺开」（S5_05/11 的
         targetDescription）—— 覆盖率与 F10 同档，实测 ≤40%。 */
      out.cover = 0.24;
      break;
    case 8: // F08 阳极氧化：色相偏移 + 视角薄膜
      out.a = [amount, 0.78, 0, 0];
      out.b = [0.42 * amount, 0.70, 0.22 + 0.40 * iridescence, 0.45 + 0.25 * iridescence];
      out.c = [1.6, 0.02, hueShift + 0.05, 0];
      out.tint = fp.tintHex || null;
      out.coating = true;
      break;
    case 9: // F09 PVD 镀层：薄层色偏 + 更光洁
      out.a = [amount, 0.55, 0, 0];
      out.b = [0.35 * amount, 0.55, 0.10 * coat, 0.35];
      out.c = [1.7, 0, 0, 0.25];
      out.d = [0, 0, 0, 0.65 * clamp01(coat || 0.5)];
      out.tint = fp.tintHex || null;
      out.coating = true;
      break;
    case 10: { // F10 彩色油膜 / 多普勒 / 渐变
      const preserve = Math.min(0.65, Math.max(0.25, Number(fp.preserveRatio) || 0.45));
      /* ★ 2026-10-21：渐变（fade）不吃 dopplerStrength。
         旧实现的 Fade 分支只读 `fade = f0.z`（=gradient），与材质的多普勒强度无关；
         这里若乘上 strength，M01 这类 doppler.strength=0 的底材会把整条渐变乘没
         （实测四底材矩阵里 M01 渲染成纯银白）。
       * ★ 2026-10-21（第二轮）：**多普勒分支原来也吃同一个门控，同样会被乘没**。
         实测 S5_20「蓝紫流界」（F10 + override `iridescence: 0.88`，没有 gradient）
         在 M01 素钢上：strength=0 → ramp=0 → `uV2FinD.z=0` → 整个色带块被跳过，
         刀身只剩 rank 色相的 11% 加色 → 渲成**黄绿**（方案 §7 点名的问题）。
         现在：驱动量取 `max(dopplerStrength, iridescence)` 再抬一个 0.45 的下限，
         让"这张卡自己的油膜强度"决定色彩，而不是被底材一刀切成 0。 */
      const irid = clamp01(Number(fp.iridescence) || 0);
      const drive = Math.max(strength, irid);
      const ramp = gradient > 0.002 ? 0.92 : (0.45 + 0.55 * drive) * (1 - preserve) * 1.6;
      /* 多普勒分支的色带**中心**取卡的 paletteShift（没有就 0.5 居中）——
         S5_20 是 0.33（紫/品红段），S5_21 是 0.66（品红/朱段）。
         这个值在 shader 里当绝对位置用（mode 1），渐变分支仍当偏置用（mode 3）。 */
      const palShift = fp.paletteShift > 0 ? clamp01(Number(fp.paletteShift)) : 0.5;
      /* ★ 2026-10-23（F10 对齐 v1.0）：legacy 的 F10 有一条
           `rough = mix( rough, rough * 0.72, mask * strength )` —— 油膜区更光洁。
         而 v2 这里给的是 roughMul = 0.85，光洁度只有 legacy 的一半多，
         高光因此更散更亮：实测 S5 的两张 F10 卡（S5_20 蓝紫流界 / S5_21 神淬虹纹）
         比 legacy 亮 14~16/255。对齐到 0.72。 */
      out.a = [amount * 0.8, 0.72, 0, 0];
      out.b = [0, 0.55, 0.16 + 0.24 * amount, 0.5];
      out.c = [Math.max(0.6, Number(fp.fresnelPower) || 2.2), 0.05 + 0.10 * amount, Number(fp.colorPhase) || 0, 0];
      out.d = [gradient > 0.002 ? 1.0 : 0.0, gradient > 0.002 ? hueShift * 0.3 : palShift, clamp01(ramp * 1.15), 0];
      out.mode = gradient > 0.002 ? 3 : 1;
      /* 两种模式各用自己的一套四段色：渐变用暖色锚点，多普勒用冷色锚点。
         以前多普勒分支不带 palette，只能吃材质派生的 uDopPal*（M01 是红棕），
         与「蓝紫流界」的卡面语义完全不符。 */
      out.palette = gradient > 0.002 ? FADE_PALETTE : DOPPLER_PALETTE;
      /* 方案 §7：颜色覆盖起点 10–25%、局部上限 40%。
         标称 0.24 → 实测（Δ>12 口径）32–39%，落在上限内且留下余量；
         覆盖率与标称值不是 1:1（掩码有 ±0.12 羽化），实测曲线见
         docs/render-v2-2026-10-20/probe-s5-coverage-sweep.json。 */
      out.cover = 0.24;
      break;
    }
    case 11: // F11 喷砂磨砂
      /* ★ 2026-10-23（对齐 v1.0 / legacy）：legacy 的 F11 是
           rough = mix( rough, clamp( rough + 0.55, 0, 1 ), amount )
           color *= (1 - 0.05*amount)   // 轻微压暗
           color = mix( color, color * vec3(0.84,0.92,1.06), coat )   // coat → 冷调
         而 v2 只写了 roughAdd = 0.22，磨砂"不够磨"，高光偏亮 ——
         实测 S5 里三张 F11 卡（S5_02/08/12）比 legacy 亮 15~27/255，
         正是 S5 卡间差被压的主因。这里把 roughAdd 对齐到 0.55，并补回那 5% 压暗。 */
      out.a = [amount, 1.0, 0.55, 0.05];
      out.b = [0, 0.5, 0, 0];
      out.tint = fp.tintHex || null;
      break;
    case 12: // F12 动态边缘光（视角光泽）
      out.a = [amount * 0.4, 1.0, 0, 0];
      out.c = [1.35, 0.35 * amount, 0, 0];
      out.b = [0, 0.5, 0.12 * amount, 0.5];
      out.tint = fp.tintHex || null;
      break;
    default:
      break;
  }

  /* ★ 2026-10-23：试过按 finishId 补 darken（F11 +0.15 / F10 +0.11 / F07 −0.09 / F06 −0.07），
     实测卡间中位只从 22.31 动到 22.47 —— **无效**。原因：darken 在 shader 里是
     `col *= 1 − A.w·cover·0.82`，而 cover 由 B.y(coverBias) 把 smoothstep 压下去，
     这几类工艺的 cover 本来就小，darken 被门控掉了。已回退，不留死参数。
     S5 与 legacy 的差距（22.5 vs 32.6）要真正收口，得逐条把 legacy 的 12 路分支搬成算子，
     不是调一个系数能解决的（见 RESULT §3.32）。 */

  /* 磨损会让"改颜色"的层整体退让（与旧实现 K3D_FIN_COLOR 折扣同口径，
     但这里按磨损量连续衰减，避免高磨损卡被工艺色盖住）。 */
  const keep = 1 - wear * 0.55;
  out.b[0] *= keep;
  out.d[2] *= keep;
  return out;
}

/** 供诊断/验收直接检查算子表的纯函数视图 */
export function finishOperatorTable() {
  const rows = [];
  for (let id = 1; id <= 12; id++) {
    const op = finishOperators(id, { amount: 0.7, darkness: 0.5, gradient: 0.95, coat: 0.5, hueShift: 0.2, iridescence: 0.6, temperature: 0.4 }, { dopplerStrength: 0.8, wear: 0, finishId: id });
    rows.push({ finId: id, a: op.a.map((v) => +v.toFixed(3)), b: op.b.map((v) => +v.toFixed(3)), c: op.c.map((v) => +v.toFixed(3)), d: op.d.map((v) => +v.toFixed(3)), tint: op.tint, palette: !!op.palette });
  }
  return rows;
}

export default { finishOperators, finishOperatorTable, CASE_HARDENED_PALETTE, TEMPER_PALETTE, FADE_PALETTE };

/* ════════════════════════════════════════════════════════════════
 * S5 稀有+ 效果库（CSGO 级）—— 纯数据，零 GLSL 改动
 *
 * 为什么要做成数据表：v2 的色带系统已经把「模式(1 流动 / 2 斑块 / 3 沿轴) +
 * 4 锚点调色板 + 覆盖率 + 色带权重 + 薄膜 + 菲涅尔 + 粗糙度」全部做成了 uniform。
 * 于是"一种工艺"就等于**一组参数**，不需要新写 GLSL 分支 ——
 * 这正是"加效果但不加加载时间"的唯一通路（program 数、编译配置数都不变）。
 *
 * 每张效果 = {
 *   mode     1 流动 / 2 斑块 / 3 沿轴渐变
 *   palette  [4] 四段锚点（沿色带 0→1 取色）
 *   cover    覆盖率 0..1（色带落在哪一段刀面）
 *   ramp     色带权重（0..1，越大越"实"）
 *   gloss    粗糙度乘子（越小越镜面）
 *   film     薄膜量 / filmThick 膜厚
 *   fresPow  菲涅尔指数 / fresAdd 边缘加光
 *   jitter   每局摆动（色带相位、覆盖率），让"同一张卡每局小有差异"
 *   rare     低概率模板（例如表面淬火的"蓝宝石"），chance 概率、整套换色
 * }
 * ════════════════════════════════════════════════════════════════ */
export const S5_EFFECTS = {
  /* Original PBR recipes: each family owns a spatial mask, not just a palette.
     The numeric look is consumed by the SINGLE fixed-program S5 shader. */
  marbleFade: {
    name: '渐变大理石', look: 4, mode: 3,
    palette: ['#b7142b','#e94737','#e9b53e','#1742b5'],
    cover: 0.88, ramp: 0.91, gloss: 0.37, film: 0.025, filmThick: 0.40,
    fresPow: 1.85, fresAdd: 0.08, jitter:{phase:0.06,cover:0.02},
    rare:{chance:0.07,note:'冰火纹',palette:['#bd152a','#ed4042','#354ec8','#102b88'],cover:0.92,ramp:0.95},
  },
  gemDoppler: {
    name: '宝石多普勒', look: 5, mode: 1,
    palette:['#071f56','#123b9a','#1d69e2','#87b9ff'],
    cover:0.92,ramp:0.94,gloss:0.25,film:0.025,filmThick:0.40,
    fresPow:1.80,fresAdd:0.08,jitter:{phase:0.04,cover:0.01},
    rare:{chance:0,note:'宝石',palette:['#071f56','#123b9a','#1d69e2','#87b9ff'],cover:0.94,ramp:0.95},
  },
  /* ── 三张对标 CSGO 的经典牌 ───────────────────────────── */
  /* ★★ 2026-10-24（修「配色偏艳」的真正根因）
   *
   *   病象：S5 各卡渲出来像彩漆、看不出金属层次；部分卡颜色与卡名相反。
   *   实测取证：11 套效果的 `cover` 全部为 **0.56–1.00**，而本文件
   *   自己的规范（方案 §7）写的是「颜色覆盖起点 10–25%、局部上限 40%」。
   *   也就是说色带实际上是在**整刀通铺**，再乘 ramp≈0.86–1.0 的权重，
   *   最终把底材亮暗与 S3 纹路完全盖住 —— 这正是"偏艳"。
   *
   *   修法：把 cover 全部收回到 0.30–0.42（上限内），ramp 控制在 0.62–0.78，
   *   并降低薄膜量（film 会把色散叠在已经很浓的色层上）。
   *   身份不丢：色相、明暗档、斑块尺度、稀有模板都照旧，只是不再满铺。
   */
  doppler: {
    name: '多普勒', look: 1,
    mode: 1, palette: ['#1b2a6b', '#4a2f9e', '#8b3fc0', '#2fa6c8'],
    cover: 0.38, ramp: 0.70, gloss: 0.72, film: 0.08, filmThick: 0.55,
    fresPow: 2.20, fresAdd: 0.16, jitter: { phase: 0.10, cover: 0.06 },
    rare: { chance: 0.10, note: '蓝宝石多普勒', palette: ['#0d1b4a', '#123a8c', '#1f6fd0', '#8fd4ff'], cover: 0.44, ramp: 0.76 },
  },
  caseHardened: {
    name: '表面淬火', look: 2,
    mode: 2, palette: ['#6f7a86', '#2f6fb5', '#c8a049', '#7a3f8c'],
    cover: 0.40, ramp: 0.72, gloss: 0.86, film: 0.05, filmThick: 0.40,
    fresPow: 2.60, fresAdd: 0.10, jitter: { phase: 0.16, cover: 0.10 },
    /* 全蓝模板：概率压得很低 —— "有几率搞出纯蓝"是这张卡的核心乐趣 */
    rare: { chance: 0.07, note: '全蓝淬火', palette: ['#123a7a', '#1f6fd0', '#39a6f0', '#0f2f5f'], cover: 0.46, ramp: 0.78 },
  },
  fade: {
    name: '渐变之色', look: 3,
    mode: 3, palette: ['#391d73', '#a51c80', '#e55618', '#f2c935'],
    /* mode 3 是沿轴渐变，本来就该较通铺 —— 但 1.0 等于把整刀染满，
       降到 0.58 后仍能读出一条完整色环，同时保住打磨质感。 */
    cover: 0.58, ramp: 0.74, gloss: 0.60, film: 0.05, filmThick: 0.45,
    fresPow: 2.00, fresAdd: 0.14, jitter: { phase: 0.08, cover: 0.03 },
    rare: { chance: 0.08, note: '全金渐变', palette: ['#7a4a10', '#c08a22', '#e8b83c', '#fdf0b0'], cover: 0.62, ramp: 0.78 },
  },

  /* 渐变之色的**冷热版**：卡名"冷热虹界"要的是冷端到热端的过渡，
     所以与 fade 同构（mode 3 沿轴 / 满覆盖 / 高权重），只把四段锚点换成 冷蓝→青→朱→金。 */
  fadeColdHot: {
    /* 2026-10-23 用户口径更新：「我要完全 csgo 渐变之色的效果」——
       一度改成 CSGO Fade 的紫→金锚点，但用户随后要求"做成原材质本身的渐变"，
       所以现在 fromBase=true：调色板由刀身基色现场派生（见 baseGradientPalette），
       下面这行 palette 只在 fromBase 不可用时兜底。 */
    name: '冷热虹界',
    /* 四段锚点调深、中段加饱和：之前尾段 #f7d043 太浅，整条读成"紫→白"，
       看不出紫→品红→朱→金。 */
    look: 3, mode: 3, fromBase: true, fullWeight: true,   /* 2026-10-23 用户口径：用**材质本身**做渐变，不用外来色 */
    palette: ['#3a1470', '#8f1a6e', '#c9391a', '#e8a41c'],
    cover: 0.60, ramp: 0.74, gloss: 0.58, film: 0.05, filmThick: 0.45,
    fresPow: 1.90, fresAdd: 0.10, jitter: { phase: 0.05, cover: 0.0 },
    rare: { chance: 0.08, note: '全紫渐变', palette: ['#2a1060', '#5a1f9c', '#8b3fc8', '#c8a0f0'], cover: 0.64, ramp: 0.78 },
  },

  /* ── 以下 6 套为自设计，同质量档 ────────────────────────── */
  auroraRibbon: {
    name: '极光带',
    mode: 2,   /* 2026-10-23 用户口径：S5_14/15 要随机不规则块，不要固定带 */ palette: ['#123f4a', '#20b6a0', '#6a4fd0', '#e0619b'],
    cover: 0.40, ramp: 0.70, gloss: 0.70, film: 0.10, filmThick: 0.62,
    fresPow: 1.90, fresAdd: 0.20, jitter: { phase: 0.12, cover: 0.05 },
    rare: { chance: 0.09, note: '极夜极光', palette: ['#071a24', '#0f6b62', '#2fd0b8', '#a8f0e0'], cover: 0.44, ramp: 0.74 },
  },
  iceFracture: {
    name: '冰裂水晶',
    mode: 1, palette: ['#7f96a8', '#bcd8e8', '#e8f6ff', '#3a6b8c'],
    cover: 0.36, ramp: 0.66, gloss: 0.55, film: 0.16, filmThick: 0.72,
    fresPow: 1.70, fresAdd: 0.26, jitter: { phase: 0.14, cover: 0.07 },
    rare: { chance: 0.08, note: '深冰裂', palette: ['#1a3a52', '#3f7ea8', '#9fd8f0', '#f0fbff'], cover: 0.42, ramp: 0.72 },
  },
  midnightEmber: {
    name: '午夜余烬',
    mode: 2,   /* 2026-10-23：S5_21 也要随机块 */ palette: ['#141026', '#3a1f52', '#b8491a', '#f0b24a'],
    cover: 0.34, ramp: 0.64, gloss: 0.66, film: 0.09, filmThick: 0.48,
    fresPow: 2.40, fresAdd: 0.12, jitter: { phase: 0.18, cover: 0.06 },
    rare: { chance: 0.06, note: '熔心', palette: ['#2a0f0a', '#7a2a10', '#e05a18', '#ffd98a'], cover: 0.40, ramp: 0.70 },
  },
  jadeRipple: {
    name: '翡翠水波',
    mode: 2, palette: ['#0f3a2a', '#1e7a4f', '#59c48a', '#d8e8a0'],
    cover: 0.38, ramp: 0.68, gloss: 0.60, film: 0.08, filmThick: 0.52,
    fresPow: 2.10, fresAdd: 0.15, jitter: { phase: 0.13, cover: 0.08 },
    rare: { chance: 0.07, note: '帝王绿', palette: ['#0a2e1c', '#127a44', '#2fbf78', '#c8f0b0'], cover: 0.44, ramp: 0.74 },
  },
  rustPatina: {
    name: '赤铜锈色',
    mode: 2, palette: ['#5a2f18', '#8a4a20', '#3f7a6a', '#c8a066'],
    cover: 0.36, ramp: 0.66, gloss: 0.92, film: 0.05, filmThick: 0.35,
    fresPow: 2.80, fresAdd: 0.08, jitter: { phase: 0.15, cover: 0.09 },
    rare: { chance: 0.07, note: '古铜镜面', palette: ['#3a1f10', '#8f5a26', '#d8a24a', '#f5e0b0'], cover: 0.42, ramp: 0.72 },
  },
  obsidianPrism: {
    name: '黑曜棱镜',
    mode: 1, palette: ['#12141a', '#2a2f3a', '#5b4a86', '#a8b8c8'],
    cover: 0.32, ramp: 0.62, gloss: 0.48, film: 0.18, filmThick: 0.78,
    fresPow: 1.60, fresAdd: 0.30, jitter: { phase: 0.12, cover: 0.05 },
    rare: { chance: 0.06, note: '紫曜', palette: ['#0a0a12', '#2a1a4a', '#7a4ad0', '#d8ccf0'], cover: 0.38, ramp: 0.68 },
  },
  abyssTide: {
    name: '深渊潮汐',
    mode: 2, palette: ['#08202e', '#0e4f6b', '#1f9fa8', '#a8e8e0'],
    cover: 0.38, ramp: 0.68, gloss: 0.58, film: 0.12, filmThick: 0.66,
    fresPow: 1.85, fresAdd: 0.22, jitter: { phase: 0.14, cover: 0.07 },
    rare: { chance: 0.08, note: '深海之心', palette: ['#04141c', '#0a3a52', '#127fb0', '#8fe0f0'], cover: 0.44, ramp: 0.74 },
  },
};

/**
 * 定向覆盖：某些卡的效果由**美术口径**定，不走哈希。
 * 判据只用"逐卡静态签名"（finishId / amount / hueShift …），所以同卡永远命中同一条。
 * `冷热虹界`（finishId 8 / amount 0.85 / hueShift 0.85）在 S5 里是唯一组合，
 * 实测其余 fin=8 的卡 amount 都是 0.7~0.8，不会误伤。
 */
/* Fixed visual identity: the S5 card decides its family, while run seed
   only shifts the pattern and, for the gem card, the jewel subtype. */
/* Every one of the 25 S5 cards has exactly ONE meaningful family.
   13 named families, each assigned to one or two cards, never a hashed
   lottery. Gameplay/card IDs and numerical balance remain unchanged. */
export const S5_CARD_FAMILY = Object.freeze({
  S5_25:'steelMirror', S5_09:'steelMirror',
  S5_01:'coolQuench', S5_02:'coolQuench',
  S5_03:'matteSteel', S5_08:'matteSteel',
  S5_04:'forgeFlow', S5_12:'forgeFlow',
  S5_05:'saltBath', S5_11:'saltBath',
  S5_06:'blackOxide', S5_17:'blackOxide',
  S5_07:'silkTint', S5_13:'silkTint',
  S5_10:'gunMetal',
  S5_16:'caseHardened', S5_18:'caseHardened',
  S5_19:'fade', S5_23:'fadeColdHot',
  S5_14:'marbleFade', S5_15:'marbleFade',
  S5_20:'doppler', S5_22:'doppler',
  S5_21:'gemDoppler', S5_24:'gemDoppler',
});
/* The two Fade cards use different palettes but share one forge family;
   same for the case-hardened and gemstone variants. */
/* Card-level visual signatures. Family decides the main metallurgical finish;
   this art-direction map provides DIFFERENT spatial response within a family.
   x: stable card index; y: subtle effect strength; z: physical motif frequency;
   w: motif direction (radians). Never changes gameplay/card probability.
   Quality is selected-stage rarity, never the global maximum rarity.
   These 25 signatures share ONE fixed GLSL program, not 25 shader variants. */
export const S5_CARD_ART = Object.freeze({
  S5_01: {name:'冷蓝幕层',      type:'cold-veil',          strength:0.36, freq:4.2, angle:0.18},
  S5_02: {name:'急冷锁锋',      type:'quenched-edge',      strength:0.62, freq:3.1, angle:0.0},
  S5_03: {name:'冷灰哑面',      type:'satin-flats',        strength:0.52, freq:3.0, angle:0.0},
  S5_04: {name:'斜向冷纹',      type:'diagonal-grain',     strength:0.65, freq:16.0,angle:0.55},
  S5_05: {name:'盐浴定色',      type:'salt-oxide',         strength:0.36, freq:5.5, angle:0.0},
  S5_06: {name:'暗灰吸光',      type:'charcoal-absorb',    strength:0.72, freq:4.0, angle:0.0},
  S5_07: {name:'渐染色层',      type:'light-oxide-film',   strength:0.48, freq:3.2, angle:0.13},
  S5_08: {name:'细砂压光',      type:'bead-blasted',       strength:0.70, freq:34.0,angle:0.0},
  S5_09: {name:'真空净镜',      type:'vacuum-mirror',      strength:0.72, freq:2.0, angle:0.0},
  S5_10: {name:'氮化枪灰',      type:'nitrided-gunmetal',  strength:0.62, freq:5.0, angle:0.0},
  S5_11: {name:'窄温控窗',      type:'heat-window',        strength:0.64, freq:5.0, angle:0.0},
  S5_12: {name:'深硬暗纹',      type:'deep-etched-grain',  strength:0.75, freq:13.0,angle:0.28},
  S5_13: {name:'转角虹膜',      type:'bevel-iridescence',  strength:0.62, freq:3.5, angle:0.0},
  S5_14: {name:'液氮断彩',      type:'fractured-marble',   strength:0.72, freq:3.9, angle:0.24},
  S5_15: {name:'阳极纹彩',      type:'anodized-strata',    strength:0.62, freq:8.0, angle:0.74},
  S5_16: {name:'赤金临界',      type:'gold-case-islands',  strength:0.68, freq:3.3, angle:0.0},
  S5_17: {name:'磷化暗甲',      type:'phosphate-armor',       strength:0.73, freq:9.0, angle:0.38},
  S5_18: {name:'横贯热带',      type:'blue-case-ribbon',   strength:0.67, freq:3.4, angle:0.0},
  S5_19: {name:'幻彩氧层',      type:'axial-fade',         strength:0.58, freq:2.1, angle:0.0},
  S5_20: {name:'蓝紫流界',      type:'doppler-ribbons',    strength:0.75, freq:3.3, angle:0.0},
  S5_21: {name:'神淬虹纹',      type:'gem-depth',          strength:0.65, freq:3.0, angle:0.0},
  S5_22: {name:'玄蚀紫界',      type:'amethyst-boundary',  strength:0.80, freq:4.0, angle:0.0},
  S5_23: {name:'冷热虹界',      type:'substrate-fade',     strength:0.60, freq:2.0, angle:0.0},
  S5_24: {name:'冷蓝天幕',      type:'sapphire-bands',     strength:0.70, freq:5.0, angle:0.0},
  S5_25: {name:'静镜留底',      type:'raw-steel-polish',   strength:0.25, freq:1.5, angle:0.0},
});
export function s5CardArt(cardId, chosen, tier=0) {
  if (!chosen) return [0,0,0,0];
  const c = S5_CARD_ART[String(cardId || '')];
  if (!c) return [0,0,0,0];
  const id = Number(String(cardId).slice(3));
  const quality = Math.min(1, Math.max(0, Number(tier) / 5));
  // More rare = clearer microstructure and uniform polish, not increased emission.
  return [id, +(c.strength*(0.76+0.24*quality)).toFixed(5), c.freq, c.angle];
}

export const S5_VISUAL_FAMILY = Object.freeze(Object.fromEntries(
  Object.entries(S5_CARD_FAMILY).map(([id,family]) =>
    [id, family === 'fadeColdHot' ? 'fade' : family])
));

const GEM_PALETTES = Object.freeze([
  ['#661019','#a61733','#e53753','#ff7a83'], /* Ruby */
  ['#071b50','#123c99','#276be1','#85bbff'], /* Sapphire */
  ['#063e2c','#0b875e','#1fc88c','#a4f6cf'], /* Emerald */
  ['#100e26','#312353','#58418a','#968bbd'], /* Black pearl */
]);
const S5_EFFECT_OVERRIDES = [
  {
    key: 'fadeColdHot',
    match: (sig) => sig.finishId === 8
      && Math.abs(sig.amount - 0.85) < 0.02
      && sig.hueShift > 0.70,
  },
];

/**
 * 斑块尺度（0..1，shader 里 remap 成 0.70~2.60）—— 走 D.x 这个**原本空闲**的槽位。
 * [普通形态, 稀有模板形态]：模板因此不只是换色，斑块的大小/疏密也跟着变。
 * 例：表面淬火普通是大块蓝金斑，稀有模板是全蓝 + 更细更密的斑。
 */
const S5_BLOB_SCALE = {
  doppler: [0.35, 0.58],
  caseHardened: [0.28, 0.64],
  fade: [0.50, 0.50],
  fadeColdHot: [0.50, 0.50],
  auroraRibbon: [0.55, 0.78],
  iceFracture: [0.62, 0.82],
  midnightEmber: [0.48, 0.72],
  jadeRipple: [0.45, 0.76],
  rustPatina: [0.36, 0.66],
  obsidianPrism: [0.52, 0.74],
  abyssTide: [0.50, 0.72],
};

/** 加权槽位表：主打三张各占 2 格，其余各 1 格（共 12 格） */
const S5_EFFECT_SLOTS = [
  'doppler', 'caseHardened', 'fade',
  'auroraRibbon', 'iceFracture', 'midnightEmber',
  'jadeRipple', 'rustPatina', 'obsidianPrism',
  'abyssTide', 'doppler', 'caseHardened',
];

/** 稳定哈希：把若干个 0..1 的数揉成一个 0..1（同输入必同输出，跨进程一致） */
function mix01(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    const n = Math.round((Number(x) || 0) * 100003);
    h ^= n & 0xffffffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 4294967296;
}

/**
 * 给一张 S5 稀有+ 的卡挑一套效果。
 * @param {number} finishId 1..12（决定基础档位取向）
 * @param {number} tier     构筑稀有档 0..5（<2 不接管，保持原工艺）
 * @param {number} shift    卡的 paletteShift（逐卡身份）
 * @param {number[]} seeds  uSeeds 四元（逐局）
 * @returns {{key:string, eff:object, rare:boolean, phase:number, cover:number, seedMix:number}|null}
 */
export function resolveS5Effect(finishId, tier, shift, seeds, extra = {}) {
  /* ★★ 修复（用户报「刚进新阶段、还没选就有个新效果覆盖上」）：
   *
   *   病象：S5 的稀有效果库只看 `tier`（稀有度），**不看玩家是否真选过淬火**。
   *   而 `uCardTier` 在“进入新阶段、还没选卡”时会回落到 `visualTier`
   *   （= 整局构筑的最高稀有档）—— 于是只要在 S1–S4 选过稀有/史诗卡，
   *   之后每个新阶段一进去，刀身就被自动上了一个淬火特效。
   *
   *   证据（纯逻辑复现，未选 S5 即 finishId=1 / amount=0）：
   *     tier=0 → 不介入（正确）
   *     tier=2/3/4 → 介入 auroraRibbon，mode 0→2、palette 0→4、ramp→0.545
   *
   *   修法：必须由调用方显式传 `extra.chosen`（来自 `finishOperators().chosen`，
   *   单一真源），未选则一律不接管。这样“没选就没有”的契约在效果库这一层也成立。 */
  if (extra.chosen !== true) return null;
  if (!(Number(tier) >= 2)) return null;
  const stableCard = String(extra.cardId || '');
  // Non-premium cards are handled by the baseline PBR recipe, never hash-rerolled.
  if (stableCard && !S5_EFFECTS[S5_CARD_FAMILY[stableCard]]) return null;
  const s = Array.isArray(seeds) ? seeds : [0.5, 0.5, 0.5, 0.5];
  /* 逐卡选效果：用**多维逐卡签名**哈希，不能只看 finishId + paletteShift ——
     实测那两维太少（多数卡 paletteShift 为 0、finishId 也只有少数几种），
     14 张稀有+ 卡会全部落进同一个桶（全变"翡翠水波"）。
     现在并入 colorPhase / hueShift（逐卡身份，见 core/recipe.js#applyCardIdentity）
     与 coat，分布才铺得开。同一张卡这几个值恒定 → 仍保证"永远同一种效果"。 */
  /* 加权槽位表：纯哈希在 14 张卡上只铺到 8/9 套，而且**恰好漏掉多普勒/表面淬火**
     这两张主打。改成 12 格槽位表 —— 主占 2 格，其余各 1 格，14 张卡必然覆盖到主打。 */
  const pick = mix01((Number(finishId) || 1) / 12, Number(shift) || 0,
    Number(extra.colorPhase) || 0, Number(extra.hueShift) || 0,
    Number(extra.coat) || 0, Number(extra.amount) || 0.5);
  const sig = {
    finishId: Number(finishId) || 1,
    amount: Number(extra.amount) || 0,
    hueShift: Number(extra.hueShift) || 0,
    colorPhase: Number(extra.colorPhase) || 0,
    coat: Number(extra.coat) || 0,
    shift: Number(shift) || 0,
  };
  const cardId = String(extra.cardId || '');
  const forced = S5_EFFECT_OVERRIDES.find((o) => { try { return o.match(sig); } catch (_) { return false; } });
  const key = S5_CARD_FAMILY[cardId] || (forced
    ? forced.key
    : S5_EFFECT_SLOTS[Math.min(S5_EFFECT_SLOTS.length - 1, Math.floor(pick * S5_EFFECT_SLOTS.length))]);
  const eff = S5_EFFECTS[key];
  const cardPalette = ({
    /* Every related pair shares a physical family, but NOT its visual pattern.
       Anodized banding stays more restrained than liquid-nitrogen marble. */
    S5_15: ['#332e63','#694886','#c578a0','#d6b15a'],
    S5_16: ['#656d75','#2059a9','#e4b146','#a65529'],
    /* Amethyst-black corrosion, not a copy of the vivid blue Doppler card. */
    S5_22: ['#090e1a','#201b35','#483365','#786295'],
    /* Sky sapphire belongs to one cool blue metal family. */
    S5_24: ['#0b2e56','#18498c','#347ac0','#91c8e7'],
  })[cardId] || null;
  const gemVariant = key === 'gemDoppler'
    ? (cardId === 'S5_24' ? 1 /* Blue sky sapphire only */ :
       Math.min(3, Math.floor(mix01(Number(s[1]), Number(s[3]), 0.71) * 4)))
    : -1;
  /* 逐局小差：同一个 key 在同一张卡上，每局相位/覆盖率都会轻微不同 */
  const jPhase = (mix01(s[0], s[1], Number(shift) || 0) - 0.5) * 2 * (eff.jitter?.phase || 0);
  const jCover = 1 + (mix01(s[2], s[3], Number(shift) || 0) - 0.5) * 2 * (eff.jitter?.cover || 0);
  /* 低概率稀有模板（"表面淬火出全蓝"那一类） */
  const r = eff.rare;
  const rareRoll = mix01(s[1], s[3], (Number(finishId) || 1) / 12, 0.71);
  const rare = !!(r && rareRoll < r.chance);
  return {
    key, eff, rare, gemVariant, cardPalette, tier: Math.min(5, Math.max(0, Number(tier) || 0)),
    baseHex: extra.baseHex || null,
    phase: jPhase,
    cover: Math.max(0.08, Math.min(0.95, (rare ? r.cover : eff.cover) * jCover)),
    seedMix: mix01(s[0], s[2], 0.19),
  };
}


/* Non-premium S5 cards retain their owned texture/finish IDs, but their
   surfaces now follow a predictable finish family. This never adds emission;
   the same card preserves differences in substrate roughness and base color. */
export function refineS5BaseFinish(out, cardId, tier = 0) {
  const family = S5_CARD_FAMILY[String(cardId || '')];
  if (!out?.chosen || !family || S5_EFFECTS[family]) return out;
  const q = Math.max(0, Math.min(1, (Number(tier) || 0) / 5));
  switch (family) {
    case 'steelMirror': // neutral silver: narrow but softly bounded highlights
      out.a = [0.82 + 0.09 * q, 0.38 - 0.12 * q, 0, 0];
      out.b[0] = 0; out.b[2] = 0; out.d[2] = 0; out.c[1] = 0; break;
    case 'coolQuench': // blue-gray metal, not saturated blue enamel
      out.a = [0.72 + 0.07 * q, 0.72 - 0.13 * q, 0.02, 0.025];
      out.b[0] = 0.16; out.tint = '#8497a8'; out.d[2] = 0; out.b[2] = 0; break;
    case 'matteSteel': // clear contrast to mirror while retaining steel color
      out.a = [0.87, 1.0, 0.39 - 0.08 * q, 0.08];
      out.b[0] = 0; out.b[2] = 0; out.d[2] = 0; break;
    case 'forgeFlow': // roughness follows existing S3 forged grain
      out.a = [0.70, 0.94 - 0.11 * q, 0.15, 0.04];
      out.b[0] = 0.06; out.tint='#9ca4aa'; out.d[2] = 0; break;
    case 'saltBath': // controlled, clean steel; never the unrelated purple F07 ramp
      out.a = [0.73, 0.67 - 0.10 * q, 0.03, 0];
      out.b[0] = 0.10; out.tint='#b8b6ad'; out.b[2] = 0;
      out.d[2] = 0; out.mode = 0; out.palette = null; break;
    case 'blackOxide':
      out.a = [0.72, 1.0, 0.11, 0.37 - 0.06 * q]; out.d[2] = 0; break;
    case 'silkTint':
      out.a = [0.60, 0.85 - 0.12 * q, 0.03, 0]; out.b[0] = Math.min(0.22,out.b[0]);
      out.b[2] = Math.min(0.11,out.b[2]); break;
    case 'gunMetal':
      out.a = [0.74, 0.80 - 0.10 * q, 0.06, 0.23];
      out.b[0] = 0.11; out.tint='#808d99'; out.d[2] = 0; break;
  }
  // Global finish-energy budget: a low rarity card never produces glow to
  // compensate for roughness and texture detail.
  out.c[1] = Math.min(0.08, Math.max(0, Number(out.c[1]) || 0));
  // Any legacy shader specLift on a basic F preset must not add another
  // whole-surface shine on top of previously forged reflection.
  out.c[3] = 0;
  return out;
}

/**
 * 把效果写进算子表（就地改 out）。只用已有槽位：
 * A(polish, roughMul, roughAdd, darken) / B(tint, coverBias, film, filmThick)
 * C(fresPow, fresAdd, hueShift, specLift) / D(mode, rampBias, rampAmt, coat)
 */
export function applyS5Effect(out, picked, fp = {}) {
  if (!picked) return out;
  const { eff, rare, phase, cover } = picked;
  const quality = Math.min(1, Math.max(0, (picked.tier - 1) / 4));
  /* fromBase：调色板由**这把刀的基色**现场派生（根深→本色→尖亮），不引入外来色相。
     稀有模板仍用固定调色板（模板的意义就是"换一套完全不同的"，与自渐变互斥）。 */
  /* fromBase 的效果**连稀有模板也基于基色**（strong 版：跨度更大、冷暖更分明），
     否则模板会换成一整套外来色（实测 23 命中模板后整刀变紫，与"原材质渐变"直接冲突）。 */
  const pal = picked.gemVariant >= 0
    ? GEM_PALETTES[picked.gemVariant]
    : ((eff.fromBase && picked.baseHex)
      ? baseGradientPalette(picked.baseHex, rare)
      : (rare && eff.rare ? eff.rare.palette : eff.palette));
  out.mode = eff.mode;
  out.premiumLook = Number(eff.look) || 0;
  out.palette = adaptS5PaletteToSubstrate(picked.cardPalette || pal, picked.baseHex, quality, eff.fromBase);
  out.cover = Math.min(0.95, cover * (0.96 + 0.04 * quality));
  /* D.x 原本空闲（旧值只是"是否渐变"的标志，shader 里没读），现在用来传**斑块尺度**：
     各效果一套、稀有模板另一套 —— 模板因此有形态差异，不只是换色。 */
  const blobTab = S5_BLOB_SCALE[picked.key] || [0.5, 0.5];
  out.d = [rare ? blobTab[1] : blobTab[0],
    (Number(fp.paletteShift) || 0) + phase,
    /* 2026-10-23 用户口径：「所有卡的透明度都淡一点点，要看得出原版材质的影响」
       —— 色带权重整体 ×0.82，材质本身的金属感/纹理因此能透上来。 */
    eff.ramp * (rare ? 1.0 : 0.95) * (eff.fullWeight ? 1.0 : 0.82) * (0.91 + 0.09 * quality),
    Number(fp.coat) || 0];
  // Rarity improves polish consistency, not albedo / emission / white clipping.
  out.a = [0.72, Math.max(0.18, eff.gloss * (1.04 - 0.11 * quality)), 0, 0];
  /* coverBias 必须给 0：shader 里 `cover = mix(1, smoothstep(...), B.y)` 会先削掉一截，
     再乘 zone(≈0.5) × peak(0.62) —— 四层相乘后色带权重只剩 0.2，看起来"几乎没效果"。
     给 0 后 cover=1，权重由 cover/zone 两处决定（实测明显变实）。 */
  out.b = [0, 0, eff.film, eff.filmThick];
  out.c = [eff.fresPow, eff.fresAdd, Number(fp.colorPhase) || 0, 0];
  out.ramp = eff.ramp;
  /* fromBase 的效果不参与"阶段身份色"着色（否则刃带会被调色板整体染一遍，
     把材质自渐变盖掉） */
  if (eff.fromBase) { out.noStageTint = true; out.fadeMode = true; }
  return out;
}

/* ── 材质自渐变（S5_23 冷热虹界专用）─────────────────────────────
 * 用户口径：「做成原材质本身的渐变，只是幅度大一点」。
 * 设计：不引入外来色相，只在**材质自己的家族内**做三段梯度 ——
 *   ① 刀根：压深 42%、饱和 +18%（像被反复加热的根段）
 *   ② 中段：还原材质本色（视觉锚点）
 *   ③ 刀尖：提亮 22%→52%、饱和缓降（像抛光/淬亮的高光区），并微微偏暖 +10°
 * 这样整把刀"还是这块钢"，但有明显的明暗与冷暖走向，不脏也不假。
 * 全部纯计算，不进 GLSL。 */
/* Same card + different S1 substrate = same recognizable paint family,
   but different depth, warmth and hue/value response. Use the S1 linear
   metal base as influence, not a fresh random palette per card. */
export function adaptS5PaletteToSubstrate(palette, baseHex, quality = 0, fromBase = false) {
  if (fromBase || !baseHex || !/^#[0-9a-f]{6}$/i.test(String(baseHex)))
    return palette.slice();
  const [bh, bs, bl] = hslOfHex(baseHex);
  const substrateDepth = Math.max(0.76, Math.min(1.10, 0.81 + bl * 0.48));
  const materialHueOffset = ((bh + 0.5) % 1 - 0.5) * 0.046;
  return palette.map(hex => {
    const [h, sat, light] = hslOfHex(hex);
    return hexOfHsl(h + materialHueOffset,
      Math.min(1, sat * (0.91 + bs * 0.13)),
      Math.max(0.025, Math.min(0.92, light * substrateDepth * (0.98 + 0.02 * quality))));
  });
}

function hslOfHex(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return [h, s, l];
}
function hexOfHsl(h, s, l) {
  const hh = ((h % 1) + 1) % 1, ss = Math.max(0, Math.min(1, s)), ll = Math.max(0, Math.min(1, l));
  const hue2rgb = (p, q, t) => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r, g, b;
  if (ss <= 0) { r = g = b = ll; } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3); g = hue2rgb(p, q, hh); b = hue2rgb(p, q, hh - 1 / 3);
  }
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
/**
 * 由基色派生四段锚点（根深 → 中段本色 → 尖端亮暖）
 * @param {string} baseHex 刀身基色
 * @param {boolean} strong 稀有模板用：明度跨度更大、冷暖分离更明显（仍不跳出材质家族）
 */
export function baseGradientPalette(baseHex, strong = false) {
  const [h, s, l] = hslOfHex(/^#[0-9a-fA-F]{6}$/.test(String(baseHex)) ? baseHex : '#6f7780');
  /* ★ 2026-10-23（用户第二轮口径）：「渐变的层次和颜色变化都不够，不要拘泥于本色，
     只是本色影响变化的底色」。所以基色只决定**色相基准点与明度区间**，
     四段之间允许 ±58° 的色相走位、饱和度 1.45x→0.75x 的起落 ——
     读起来是"这块钢被烤出了层次"，而不是"一块灰钢明暗变化"。 */
  /* ★ 2026-10-23（用户第三轮口径）：「不要拘泥于本色，只是本色影响变化的底色」。
     做法：基色只决定**起点色相**与明度区间，四段沿一条**大弧**走位：
       0° → +50° → +108° → +169°
     对一块冷灰钢（h≈0.58）就是 钢蓝 → 紫 → 品红 → 橙金，
     即 CSGO Fade 的那种跨度，但起点与整体色调由素材决定 —— 换一种底钢，整条弧跟着平移。 */
  const k = strong ? 1.15 : 1.0;
  const H = (d) => h + d * k;
  const L = (m) => Math.max(0.03, Math.min(0.99, l * m));
  const S = (m, add) => Math.max(0, Math.min(1, s * m + add));
  return [
    /* 末端（高 tAxis 一侧）做成**中性钢色**：这块模型没有 aRegion、position 也只有 ±0.04，
       区域权重不可用，无法按几何切掉刀柄；于是让色带在刀柄所在的 tAxis 段自然回落到本色。 */
    /* ★ 调试渲染实测：**刀柄 = 低 tAxis（ramp 起点）、刀身/刀尖 = 高 tAxis**。
       所以中性钢色必须放在**第 1 段**（刀柄），颜色往刀尖方向铺 ——
       之前把中性放末端，等于"刀身中性、刀柄有色"，正是用户看到的现象。 */
    hexOfHsl(h, s, l),                            // 起点：材质本色（刀柄段）
    hexOfHsl(H(0.150), S(1.25, 0.55), L(0.58)),   // 紫（压深，撑起色阶）
    hexOfHsl(H(0.330), S(1.15, 0.62), L(0.86)),   // 品红
    hexOfHsl(H(0.500), S(1.05, 0.52), L(1.22)),   // 刀尖：暖金、提亮
  ];
}


