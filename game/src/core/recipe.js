/**
 * 核心玩法层 · 视觉配方推导
 *
 * 职责：RunState → **纯数据**的 BladeSkinState。
 * 它不 import 任何渲染代码 —— 分层规则要求 core 不依赖 render。
 * 渲染门面（src/render/index.js）负责把这份数据合成 uniform 并画出来。
 *
 * 槽位归属沿用已验证的十阶段映射（禁止跨阶段抢占）：
 *   S1 原料 → materialId       S2 熔炼 → variants.texture
 *   S3 锻打 → textureId        S4 定型 → knifeType / fixedTexture
 *   S5 淬火 → finishId         S6 回火 → variants.temper（叠加层）
 *   S7 开刃 → variants.edge（叠加层，小游戏只改 grind 子键）
 *   S8 装配 → handle           S9 调校 → wear
 *   S10 鉴定 → 只读
 */

import { CARD_BY_ID, stageRankOf } from '../data/cards.js';
import { handlePaletteOf } from '../data/handlePalette.js';

/**
 * 默认皮肤（阶段未选到时用它，保证舞台永远能画出一把刀）。
 * 这三个 id 来自已验证的材质/纹理/工艺表，改动需同步确认表内存在。
 *
 * ★ 2026-10-16（用户：「端内…S2 我看还有纹理」）
 *   `textureId` 由 **T04（粗锤痕）改为 T01（素面锻）**。
 *   原因：默认纹理从 S1 就开始生效 —— 玩家还没走到 S3「锻打」、还没选任何纹理卡，
 *   矿石 / 熔球 / 刀胚表面上就已经带着一层锻打纹（T 层 + S3 图像层同时按 T04 出图）。
 *   语义上"未选纹理 = 素面"才对：纹理是 **S3 决策卡** 的效果，玩家选了才出现。
 *   这也让端内与出图工具的基准一致（`tools/shoot-card-effects.mjs` 按原项目
 *   `docs/卡片效果预览/说明.md` 的口径用的就是 T01）。
 *   S3 及之后的每张纹理卡都自带 `textureId` 写入，所以它们**完全不受影响**。
 *   ⚠ 首页幽灵刀 / 藏刀阁展台走的是显式配方（M03/T04/F10），同样不受影响。
 */
export const DEFAULT_SKIN = Object.freeze({
  materialId: 'M01',
  textureId: 'T01',
  finishId: 'F01', // neutral fallback: no S5 processing means no iridescent oil film
  /* ★ 2026-10-16（用户：「没选就没有」）：`wear` 由 0.12 改为 **0**。
     磨损是 **S9 调校卡** 的产物；玩家没选过就不该带着磨损上场
     （与出图工具的基准 wear 0 对齐）。 */
  wear: 0,
});

/** 深拷贝一层（value 都是标量） */
function cloneVariants(v) {
  const out = {};
  for (const k of Object.keys(v || {})) {
    if (v[k] && typeof v[k] === 'object') out[k] = { ...v[k] };
  }
  return out;
}

/** S3 锻打纹理参数是否存在；S2 melt 是独立的材质/热泽层，不提前开启纹理。
 *  见 deriveSkinState 里 textureChosen 的长注释。 */
function texParamsOf(p, overrides) {
  const pick = (src) => (src && src.variants) || {};
  const a = pick(p);
  const b = (overrides && overrides.variants) || (overrides && overrides.variantParams) || {};
  for (const bag of [a, b]) {
    for (const key of ['texture']) {
      const v = bag[key];
      if (v && typeof v === 'object' && Object.keys(v).length) return true;
    }
  }
  return false;
}

/* ── 逐卡视觉指纹的「原始材料」 ─────────────────────────────────────────────
 *
 * ★ 2026-10-15：为什么 core 要把这几行单独交出去
 *
 *   原项目每提交一张卡，`js/core/cards.js#applyCardWrite` 都会往 pendingSkin 里补三样东西：
 *     · `visualTier`              = max(旧值, rarityVisuals.level(card.rarity))   0..5
 *     · `cardFingerprints[stage]` = cardVisuals.resolve(card, stage)
 *     · `cardEffects[stage]`      = 上面那个指纹的 shaderParams（4 个数）
 *   它们最终变成两个 uniform：`uVisualTier`（渲进 shader 的 `float tier`）
 *   与 `uCardFx[9]`（每阶段一行，S1..S9）。
 *
 *   这两条通道**不是装饰**，是 S1–S9 每一阶段卡效果的主体：
 *     · `uCardFx[i].y <= 0.001` 时 `k3dApplyStageCardFx()` / `k3dApplyCardRoughness()`
 *       对该阶段**整段跳过** —— 全 0 就等于"所有决策卡都没有 3D 效果"；
 *     · R10（2026-10-13）之后 S5 的中段热带宽度 `spanW`、连续强度 `rr`、
 *       S7 的刃线宽度 `tierW`、以及每阶段末尾那 5 层"稀有度附加维度"
 *       全部读 `tier` —— tier 恒为 0 就等于"高档卡与低档卡长得一样"。
 *
 *   本工程重构时漏掉了这条通路（与 S6 逐卡虹彩配方是同一类"独立数据文件没接上"的事故），
 *   实测 `uVisualTier = 0` 且 `uCardFx` 9 行全 0（tools/probe-card-visual-channels.mjs）。
 *
 *   ⚠ core 不允许 import 渲染层，所以这里**只交材料**（阶段位次 / 卡 id / 稀有度 / 池内 rank），
 *     查 `cardVisuals` / `rarityVisuals` 的活在门面 `src/render/index.js` 里做。
 */
function visualCardEntry(card) {
  if (!card) return null;
  const index = Number(card.stageIndex);
  if (!Number.isInteger(index) || index < 0 || index > 8) return null;
  return { index, cardId: card.id, rarity: card.rarity, rank: stageRankOf(card) || 0 };
}

/** 单张卡 → 视觉指纹条目（选卡预览 / 离线工具用） */
export const visualCardOf = (card) => visualCardEntry(card);

/**
 * 把调用方已经算好的条目规整成同一个形状（外部传入 / 存档复现时的宽容入口）。
 * 只认两种输入：卡数据（→ visualCardEntry），或已经带 index 的条目。
 */
function normalizeVisualEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const index = Number(raw.index);
  if (!Number.isInteger(index) || index < 0 || index > 8) return null;
  return {
    index,
    cardId: raw.cardId || null,
    rarity: raw.rarity || 'common',
    rank: Number(raw.rank) || 0,
  };
}

/**
 * 本局已选卡 → 逐阶段视觉指纹条目（按阶段索引去重，后选者胜）。
 * 真源优先 `visualRecipe`（applyVisual 每次提交都写，含 stage），
 * 旧档 / 外部传入只有 `history` 时退回按卡 id 查表。
 */
function collectVisualStages(run) {
  const byIdx = new Map();
  const add = (cardId) => {
    const e = visualCardEntry(CARD_BY_ID[cardId]);
    if (e) byIdx.set(e.index, e);
  };
  const recipe = run && run.visualRecipe;
  if (Array.isArray(recipe) && recipe.length) {
    for (const r of recipe) if (r && r.cardId) add(r.cardId);
  } else if (run && Array.isArray(run.history)) {
    for (const id of run.history) add(id);
  }
  return [...byIdx.values()].sort((a, b) => a.index - b.index);
}

/**
 * 找出本局 S6（回火）用的那张卡 id。
 *
 * ★ 2026-10-14：为什么 core 要专门吐这个字段
 *   S6 的 24 张卡在卡数据里只写 `variants.temper = { amount, temperature }` ——
 *   它只够决定"强度闸门"和"一档相位"。真正的虹彩外观（色系族 family / 覆盖 cover /
 *   色带 bands / 强度 strength / 漂移 flow）来自 `data/legacy/temperIridescence.js`
 *   的**逐卡配方**。V1 由 `cardPools` 在提交时把配方并进 `variants.temper`，
 *   V2 没有这条通路 → `uTemperIrid.w` 恒为 0 → `k3dApplyTemper()` 首行就 return
 *   → **S6 的 24 张卡在 3D 上完全没有反应**（2026-10-14 探针实测预览 0/3 变化）。
 *
 *   core 不允许 import 渲染层，所以这里只负责回答"是哪张卡"，
 *   配方查表交给门面 `src/render/index.js`。
 *
 * 解析优先级：预览覆盖 → 本局视觉配方账本 → 历史卡 id（旧档/藏刀阁复现兜底）。
 */
function resolveTemperCardId(run, overrides) {
  if (overrides && overrides.temperCardId) return overrides.temperCardId;
  const recipe = run && run.visualRecipe;
  if (Array.isArray(recipe)) {
    const hit = recipe.find((r) => r && r.stage === 'S6');
    if (hit && hit.cardId) return hit.cardId;
  }
  // 兜底：卡 id 自带阶段前缀（S6_xx），封存的 BladeRecord 只留 history 时也能复现
  const hist = run && run.history;
  if (Array.isArray(hist)) {
    const hit = hist.find((id) => typeof id === 'string' && id.startsWith('S6_'));
    if (hit) return hit;
  }
  return null;
}

/**
 * 解析本局的 **S5 淬火卡 id** —— `data/legacy/finishOverrides.js`（逐卡工艺参数覆盖，
 * 如 S5_21 神淬虹纹 → F10 渐变之色、S5_22 玄蚀紫界 → 明显紫调）的查表键。
 *
 * ★ 2026-10-16 修复「S5_21 / S5_22 与卡面承诺不符」
 *   现象：这两张卡的 3D 效果与普通 F 工艺卡一模一样（逐卡 uniform 对比：
 *        `uFinParam0 = [0,0,0,0]`，而原项目是 `[0,0,0.92,0]`）。
 *   根因：原项目由 `data/cardPools.js#buildRuntimeCard` 在装配运行时卡时把
 *        `finishOverrides.forCard(c)` 并进 `write.variants.finish`；本工程重构时
 *        **整张表 import 了却没有任何消费点**（与 S6 虹彩配方、逐卡指纹同一类事故）。
 *   core 不允许 import 渲染层，所以这里只回答"是哪张卡"，查表交给门面。
 *
 * 解析优先级与 temperCardId 完全一致：预览覆盖 → 本局视觉配方账本 → 历史卡 id 兜底。
 */
function resolveFinishCardId(run, overrides) {
  if (overrides && overrides.finishCardId) return overrides.finishCardId;
  const recipe = run && run.visualRecipe;
  if (Array.isArray(recipe)) {
    const hit = recipe.find((r) => r && r.stage === 'S5');
    if (hit && hit.cardId) return hit.cardId;
  }
  const hist = run && run.history;
  if (Array.isArray(hist)) {
    const hit = hist.find((id) => typeof id === 'string' && id.startsWith('S5_'));
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {object} run RunState
 * @param {object} [overrides] 预览时的临时覆盖（不写 run）
 */
export function deriveSkinState(run, overrides = {}) {
  const p = (run && run.pendingSkin) || {};
  const state = {
    materialId: p.materialId || DEFAULT_SKIN.materialId,
    textureId: p.textureId || DEFAULT_SKIN.textureId,
    finishId: p.finishId || DEFAULT_SKIN.finishId,
    wear: p.wear != null ? Number(p.wear) : DEFAULT_SKIN.wear,
    seed: (run && run.seed != null) ? (run.seed >>> 0) : 0,
    patternSeed: p.grainSeed != null ? (p.grainSeed >>> 0) : null,
    cardFingerprints: { ...(p.cardFingerprints || {}) },
    cardEffects: { ...(p.cardEffects || {}) },
    variantParams: cloneVariants(p.variants),
    visualBonus: { ...(p.visualBonus || {}) },
    /** 刀型不在 skin state 里，单独给渲染层切换模型用 */
    knifeType: p.knifeType || (run && run.knifeTypeId) || null,
    /** S6 逐卡虹彩配方的查表键（渲染层据此补 variants.temper，见上方注释） */
    temperCardId: resolveTemperCardId(run, overrides),
    /** S5 逐卡工艺参数覆盖的查表键（渲染层据此补 variants.finish，见 resolveFinishCardId） */
    finishCardId: resolveFinishCardId(run, overrides),
    /** 已获得过的最高稀有视觉档（0..5）；渲染层还会把 visualStages 里的稀有度取 max 并回来 */
    visualTier: Math.max(0, Math.min(5, Number(p.visualTier) || 0)),
    /** 逐卡视觉指纹的原始材料 —— 渲染门面据此算 uVisualTier / uCardFx（见上方长注释） */
    visualStages: collectVisualStages(run),
    /* ★★ 2026-10-16（用户：「默认纹理那层 S2 没选不应该是没有吗？按这个**没选就没有**的
       逻辑…各个层级的效果应用不要遗漏也不要额外应用」）

       每个"决策层"都要能回答"玩家到底选过没有" —— 只有选过才允许它在画面上生效。
       真源只有两个：本局累计写入（`run.pendingSkin`）与本次预览覆盖（`overrides`）。
       缺省值（DEFAULT_SKIN / fallback）**不算选过**，这正是之前 S2 带纹理、
       S4–S7 带 polymer 刀柄的同一类病根。

       S2「熔炼」写入 variants.melt，独立改变材质纯度、反射和热泽；
       这些参数继续继承，但不能因此开启尚未选择的 S3 锻打纹理。
       纹理层的判据是「选了纹理 ID 或 texture 参数」；
       S3 选卡后才打开图像层，后续工艺保留这份已确认的纹理。 */
    finishChosen: !!(p.finishId || overrides.finishId || resolveFinishCardId(run, overrides)),
    textureChosen: !!(
      p.textureId || overrides.textureId || overrides.fixedTexture
      || texParamsOf(p, overrides)
    ),
    wearChosen: !!(p.wear != null || overrides.wear != null),
  };

  // S4 only defines the silhouette: an already selected S3 texture owns its
  // pattern AND all relief/roughness parameters, regardless of knife shape.
  const fixedTexture = overrides.fixedTexture || p.fixedTexture;
  if (fixedTexture && !p.textureId && !overrides.textureId) {
    state.textureId = fixedTexture; // legacy save fallback, not a replacement
  }

  // 预览覆盖（不写 run）
  if (overrides && typeof overrides === 'object') {
    if (overrides.materialId) state.materialId = overrides.materialId;
    if (overrides.textureId) state.textureId = overrides.textureId;
    if (overrides.finishId) state.finishId = overrides.finishId;
    if (overrides.wear != null) state.wear = Number(overrides.wear);
    if (overrides.seed != null) state.seed = overrides.seed >>> 0;
    if (overrides.knifeType) state.knifeType = overrides.knifeType;
    if (overrides.visualTier != null) {
      state.visualTier = Math.max(0, Math.min(5, Number(overrides.visualTier) || 0));
    }
    if (overrides.visualBonus) state.visualBonus = { ...state.visualBonus, ...overrides.visualBonus };
    /* 选卡预览：把**这一张候选卡**的指纹条目叠进去（同阶段索引覆盖，后写者胜）。
       否则预览画面只会带上"已经确定的那几张卡"的指纹，唯独看不到正在比较的这张
       —— 玩家在 S5/S7 三张候选之间来回点时，画面纹样与色相完全不动。 */
    if (Array.isArray(overrides.visualStages) && overrides.visualStages.length) {
      const byIdx = new Map(state.visualStages.map((e) => [e.index, e]));
      for (const raw of overrides.visualStages) {
        const e = visualCardEntry(raw) || normalizeVisualEntry(raw);
        if (e) byIdx.set(e.index, e);
      }
      state.visualStages = [...byIdx.values()].sort((a, b) => a.index - b.index);
    }
    const overlay = Object.assign({}, overrides.variants || {}, overrides.variantParams || {});
    for (const k of Object.keys(overlay)) {
      state.variantParams[k] = { ...(state.variantParams[k] || {}), ...(overlay[k] || {}) };
    }
  }
  applyCardIdentity(state, run);
  return state;
}

/* ────────────────────────────────────────────────────────────────
 * 逐卡视觉身份（S2–S8「零加载成本差异化」）
 *
 * 实测背景（tools/probe-card-matrix.mjs，全配对矩阵）：
 *   S3 有 34 对卡彼此 mean|ΔRGB| < 6/255 且 ΔHue < 8°（等于撞成同一张），
 *   S2 21 对、S6 14 对；而 S2–S8 的 218 张卡在 `variantParams` 里
 *   **`tintHex` / `hueShift` / `colorPhase` 全部为 0** —— 色相通道一张都没用。
 *   所以"加幅度"对卡间差无效（上一轮实测 S3 18.39→18.42），必须给每张卡
 *   一个**互不相邻的色相锚点 + 不同的图案疏密**。
 *
 * 为什么放在这里（recipe 层）而不是 state.js：
 *   `state.js` 不知道自己在哪个阶段、也不知道卡号；而这里两样都有
 *   （`run.stageIndex` + `visualStages` 的 `{index, cardId, rank}`）。
 *   写进去的都是**已有参数键**（finish.hueShift / temper.hueShift /
 *   edge.tintHex / melt.scale / texture.scale|rotation|density），
 *   所以不新增 uniform、不新增 program、加载成本为 0。
 *
 * 分配规则：黄金比 0.6180339887 的等分序列（任意 N 下相邻两张永不相邻，
 * 是"固定 N 最大最小间距"的经典解），只依赖 `rank`，不用手调 218 个值。
 * ──────────────────────────────────────────────────────────────── */
const GOLDEN_FRAC = 0.6180339887498949;

/** rank(1..N) → [0,1) 的黄金序列。rank 0（未知）返回 null，表示"不给身份"。 */
function goldenOf(rank) {
  const r = Number(rank) || 0;
  if (r <= 0) return null;
  const f = (r * GOLDEN_FRAC) % 1;
  return f < 0 ? f + 1 : f;
}

/** hue(0..1) → #rrggbb（边缘色用；中等饱和，避免荧光） */
function hexFromHue(h, sat = 0.55, light = 0.62) {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = light * (1 - sat), q = light * (1 - f * sat), t = light * (1 - (1 - f) * sat);
  const rgb = [[light, t, p], [q, light, p], [p, light, t], [p, q, light], [t, p, light], [light, p, q]][i];
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(rgb[0]) + to(rgb[1]) + to(rgb[2]);
}

/**
 * 把"这张卡的身份"写进已有的卡参数键上。只在**该阶段确实写了对应参数对象**时才动，
 * 绝不凭空造出一层效果（保持"没选就没有"的既有契约）。
 * @param {object} state deriveSkinState 的返回值（就地修改）
 * @param {object} run
 */
export function applyCardIdentity(state, run) {
  if (!state?.variantParams || !run) return state;
  const entries = Array.isArray(state.visualStages) ? state.visualStages : [];
  const byIndex = new Map(entries.map(e => [Number(e.index), e]));
  const rarity = { common:0, fine:1, rare:2, epic:3, legend:4, mythic:5 };
  const forStage = index => {
    const e = byIndex.get(index), g = goldenOf(e?.rank);
    return g == null ? null : { rank:Number(e.rank)||0, g:+g.toFixed(4),
      tier:rarity[String(e.rarity||'')]??0 };
  };
  const current = forStage(Number(run.stageIndex));
  if (current) state.identity = { ...current, tint:Number(run.stageIndex)>=2 };
  // Base tint is owned by S3 and must remain identical in S4–S10.
  const surface = forStage(2);
  if (surface) state.materialIdentity = { ...surface, tint:true };
  const vp=state.variantParams, finish=forStage(4), temper=forStage(5), edge=forStage(6);
  if (vp.finish && finish && vp.finish.hueShift==null)
    vp.finish.hueShift=+((finish.g-0.5)*0.5).toFixed(4);
  if (vp.temper && temper && vp.temper.hueShift==null)
    vp.temper.hueShift=+((temper.g-0.5)*0.7).toFixed(4);
  if (vp.edge && edge && vp.edge.tintHex==null)
    vp.edge.tintHex=hexFromHue(edge.g,0.5,0.66);
  const scaleK=g=>0.72*Math.pow(1.45/0.72,g);
  const nudge=(v,d)=>Math.max(0.05,Math.min(1,(Number(v)||0.45)+d));
  const melt=forStage(1);
  if (vp.melt && melt) {
    const own=Number(vp.melt.scale);
    vp.melt.scale=+((own>0?own:1)*scaleK(melt.g)).toFixed(4);
    vp.melt.roughnessStrength=+nudge(vp.melt.roughnessStrength,(melt.g-0.5)*0.44).toFixed(4);
  }
  if (vp.texture && surface) {
    const own=Number(vp.texture.scale);
    vp.texture.scale=+((own>0?own:1)*scaleK(surface.g)).toFixed(4);
    vp.texture.rotation=+(((Number(vp.texture.rotation)||0)+surface.g*180)%360).toFixed(2);
    const density=Number(vp.texture.density);
    if(density>0) vp.texture.density=Math.round(density*(0.82+0.43*surface.g));
    vp.texture.roughnessStrength=+nudge(vp.texture.roughnessStrength,(surface.g-0.5)*0.44).toFixed(4);
  }
  return state;
}

/** 刀柄参数（走 bladeMask 通道，独立于刀身 skin state） */
export function deriveHandleMask(run, overrides = {}) {
  const p = (run && run.pendingSkin) || {};
  const h = p.handle || {};
  const wear = Math.max(0, Math.min(1, num(overrides.wear, p.wear, DEFAULT_SKIN.wear)));
  const oh = (overrides && overrides.handle) || {};
  const metalId = String(oh.metalId || h.metalId || 'polymer');
  /* ★ 2026-10-15 配色修订（病灶说明见 src/data/handlePalette.js）：
     优先级 = **显式 tint（调试/强行指定）> 第一方配色表 > 传入的卡表值**。

     ⚠ 为什么卡表值排在配色表后面：`Game.previewVisual()` 会把**候选卡的 write**
       （里面含 `handle.tintHex/gain/...`）当作 overrides 传进来 —— 那是"卡的身份"，
       不该压过配色表。否则会变成「预览用旧配色、确认后用新配色」，
       玩家在三张候选之间点来点去看到的和选下去的不一致。
     只有**显式给了 `tint`**（探针要把刀柄染纯红/纯绿做区域视图）才算强行指定。 */
  const forcedTint = oh.tint || null;
  const pal = handlePaletteOf(metalId) || {};
  /* ★ 2026-10-16：`explicit` —— 这张卡 / 本局**真的给过**柄配方吗？
     没给过时下面会回落 `'polymer'`（下游要一个完整 cfg，不能是 undefined），
     但那只是**占位值**，不是玩家的选择。原项目 `js/main.js#handleMaskGate` 的注释
     写得很清楚：「compose() intentionally returns a fallback polymer handle even
     before the player reaches/chooses S8, which would prematurely cover it」——
     所以 S1–S7 一律不许挂这块遮罩。v1.0 重构时把闸门漏了，实测端内 S4–S7
     材质上都挂了 bladeMask → 刀柄被 polymer 盖住，而不是"整刀刀身材质"。
     判据只认 handle.metalId（tint 是调试/配色旁路，不算"选过柄"）。 */
  const explicit = !!(oh.metalId || h.metalId);
  /* ★ 2026-10-16：`bypass` —— 这张卡**直接使用模型自带刀柄**（不挂柄遮罩）。
     只有第一方配色表能声明（见 data/handlePalette.js 的 h_antisilp）；显式 tint
     （探针染色）优先级更高，带 tint 时按调试通路走，忽略 bypass。 */
  if (pal.bypass && !forcedTint) {
    return { metalId, bypass: true, explicit, wear };
  }
  /* 有该材质的条目才用表；但**逐字段**回落 —— 表里通常只写 tint，
     gain/roughness 这些没写的必须回到卡表值，否则会变成 undefined。 */
  const usePal = !forcedTint && !!pal.tint;
  const pickN = (key, dflt) => (usePal && pal[key] != null ? pal[key] : num(oh[key], h[key], dflt));
  return {
    metalId,
    // ★ 见上方 explicit 注释：这是"玩家/卡真的选过柄"的判据，供 handleMaskGate 使用
    explicit,
    tint: forcedTint || (pal.tint || null) || oh.tintHex || h.tintHex || h.tint || '#ffffff',
    gain: pickN('gain', 1),
    desat: pickN('desat', 0),
    metalness: pickN('metalness', 0.35),
    roughness: pickN('roughness', 0.6),
    reflection: pickN('reflection', 1),
    patternKind: num(oh.patternKind, h.patternKind, 0),
    wear,
  };
}

function num(...vals) {
  for (const v of vals) if (v != null && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

export default { deriveSkinState, deriveHandleMask, visualCardOf, DEFAULT_SKIN };
