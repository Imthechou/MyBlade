/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/core/conditionEval.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 高风险卡阈值：规范附录 B.1 硬性定义 */
  const HIGH_RISK_THRESHOLD = 8;

  /** 合法视觉槽（规范 §8.2：视觉 preset 必须映射到这些既有槽位） */
  const VALID_SLOTS = ['material', 'melt', 'texture', 'form', 'finish', 'temper', 'edge', 'handle', 'tune', 'wear'];

  /** 六维规范键 */
  const STAT_KEYS = ['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'];

  /** 阶段顺序（S1..S9） */
  const STAGES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'];

  /* ────────────────────────────── 上下文构造 ────────────────────────────── */

  /**
   * 由 RunState 构造求值上下文。
   *
   * ★ 只读**已确认**的选择（run.tagLedger），不读预览态。
   *   规范 §6.2：「标签累计与 Trait/Combo 触发有单一来源，
   *   刷新卡、预览、重复确认不得重复加标签/加属性。」
   *
   * @param {object} run RunState
   * @returns {object} ctx
   */
  function makeContext(run) {
    const ledger = (run && run.tagLedger) || [];
    const picks = [];
    for (const e of ledger) {
      if (!e || !e.cardId) continue;
      const card = K3D.cardsV11 ? K3D.cardsV11.byId(e.cardId) : null;
      const vs = (e.visualSpec || (card && card.visualSpec)) || null;
      picks.push({
        stage: e.stage,
        cardId: e.cardId,
        tags: (e.tags || (card && card.tags) || []).slice(),
        riskDeltaPoints: e.riskDeltaPoints != null ? e.riskDeltaPoints : ((card && card.riskDeltaPoints) || 0),
        assetRef: e.assetRef != null ? e.assetRef : ((card && card.assetRef) || null),
        visualSpec: vs,
        validVisual: !!(vs && vs.recipeKey && Array.isArray(vs.slots)
          && vs.slots.some((s) => VALID_SLOTS.indexOf(s) >= 0)),
      });
    }
    const stats = (run && run.stats) || {};
    const risk = (run && run.risk) || {};
    return {
      picks,
      stats: {
        strength: Number(stats.strength) || 0,
        toughness: Number(stats.toughness) || 0,
        sharpness: Number(stats.sharpness) || 0,
        craft: Number(stats.craft) || 0,
        design: Number(stats.design) || 0,
        spirit: Number(stats.spirit) || 0,
      },
      currentRisk: Number(risk.current) || 0,
      peakRisk: Number(risk.peak) || 0,
      combos: ((run && run.combos) || []).slice(),
      completedStages: ((run && run.completedStages) || []).slice(),
    };
  }

  /* ────────────────────────────── 派生统计（带缓存） ────────────────────────────── */

  function makeStats(ctx) {
    const cache = {};
    const api = {
      /** 标签出现卡次数（每卡每标签最多 1 次） */
      tagCount(tag) {
        const k = 'tc:' + tag;
        if (cache[k] == null) cache[k] = ctx.picks.filter((p) => p.tags.indexOf(tag) >= 0).length;
        return cache[k];
      },
      /** 标签出现的不同阶段数 */
      tagStageCount(tag) {
        const k = 'tsc:' + tag;
        if (cache[k] == null) {
          const set = {};
          for (const p of ctx.picks) if (p.tags.indexOf(tag) >= 0) set[p.stage] = 1;
          cache[k] = Object.keys(set).length;
        }
        return cache[k];
      },
      /** 指定阶段集合中是否有卡带任一标签 */
      stageTagAny(stages, tags) {
        for (const p of ctx.picks) {
          if (stages.indexOf(p.stage) < 0) continue;
          for (const t of tags) if (p.tags.indexOf(t) >= 0) return true;
        }
        return false;
      },
      /** 指定阶段是否选了所列卡 ID 之一 */
      stageCardIdAny(stage, ids) {
        return ctx.picks.some((p) => p.stage === stage && ids.indexOf(p.cardId) >= 0);
      },
      /** 指定阶段的源资产 ID 是否命中列表 */
      stageAssetRefAny(stage, values) {
        return ctx.picks.some((p) => p.stage === stage && p.assetRef != null && values.indexOf(p.assetRef) >= 0);
      },
      /** 高风险卡数量（riskDeltaPoints >= 8） */
      highRiskCardCount() {
        if (cache.hrc == null) cache.hrc = ctx.picks.filter((p) => p.riskDeltaPoints >= HIGH_RISK_THRESHOLD).length;
        return cache.hrc;
      },
      /** 主动止损卡：riskDeltaPoints < 0 或带 repair 标签 */
      isRepairPick(p) {
        return p.riskDeltaPoints < 0 || p.tags.indexOf('repair') >= 0;
      },
      /** 已激活的视觉槽（来自已确认卡的有效 visualSpec） */
      activeSlots() {
        if (cache.slots == null) {
          const set = {};
          for (const p of ctx.picks) {
            if (!p.visualSpec || !Array.isArray(p.visualSpec.slots)) continue;
            for (const s of p.visualSpec.slots) if (VALID_SLOTS.indexOf(s) >= 0) set[s] = 1;
          }
          cache.slots = set;
        }
        return cache.slots;
      },
      /**
       * taggedVisualSlotCountMin 口径（规范附录 B.2）：
       * 只统计「携带指定标签」且「visualSpec.recipeKey 非空且声明至少一个合法槽位」的已选卡；
       * 可选 stages 限定阶段；每张卡最多计 1 次。**只检查数据声明，不检查像素渲染。**
       */
      taggedVisualSlotCount(tags, stages) {
        let n = 0;
        for (const p of ctx.picks) {
          if (stages && stages.length && stages.indexOf(p.stage) < 0) continue;
          if (!p.validVisual) continue;
          if (tags.some((t) => p.tags.indexOf(t) >= 0)) n++;
        }
        return n;
      },
    };
    return api;
  }

  /* ────────────────────────────── 条件求值 ────────────────────────────── */

  /**
   * 求值一个条件树。
   * @param {object} spec  条件节点（triggerSpec / conditionSpec / 其子节点）
   * @param {object} ctx   makeContext 产物
   * @returns {boolean}
   */
  function evaluate(spec, ctx) {
    return evalNode(spec, ctx, makeStats(ctx));
  }

  function evalNode(node, ctx, S) {
    if (node == null) return true;
    if (typeof node === 'boolean') return node;
    if (typeof node !== 'object') return false;

    for (const key of Object.keys(node)) {
      const v = node[key];
      let r;
      switch (key) {
        /* ── 布尔组合 ── */
        case 'all':
          r = (v || []).every((c) => evalNode(c, ctx, S));
          break;
        case 'any':
          r = (v || []).some((c) => evalNode(c, ctx, S));
          break;

        /* ── 标签计数 ── */
        case 'tagCountMin':
          r = Object.keys(v).every((t) => S.tagCount(t) >= v[t]);
          break;
        case 'tagCountMax':
          r = Object.keys(v).every((t) => S.tagCount(t) <= v[t]);
          break;
        case 'tagCountSumMin': {
          const tags = v.tags || [];
          let sum = 0;
          for (const t of tags) sum += S.tagCount(t);
          r = sum >= v.min;
          break;
        }
        case 'tagStageCountMin':
          r = Object.keys(v).every((t) => S.tagStageCount(t) >= v[t]);
          break;

        /* ── 阶段标签 ── */
        case 'stageTagAny':
          r = S.stageTagAny([v.stage], v.tags || []);
          break;
        case 'stageTagAnyIn':
          r = S.stageTagAny(v.stages || [], v.tags || []);
          break;
        case 'stageCardIdAny':
          r = S.stageCardIdAny(v.stage, v.ids || []);
          break;
        case 'stageAssetRefAny':
          r = S.stageAssetRefAny(v.stage, v.values || []);
          break;
        case 'stageCompleted':
          r = ctx.completedStages.indexOf(v) >= 0;
          break;

        /* ── 属性 / 风险 ── */
        case 'statMin':
          r = Object.keys(v).every((k) => (ctx.stats[k] || 0) >= v[k]);
          break;
        case 'riskPeakMin':
          r = ctx.peakRisk >= v;
          break;
        case 'riskCurrentMax':
          r = ctx.currentRisk <= v;
          break;
        case 'peakMinusCurrentMin':
          r = (ctx.peakRisk - ctx.currentRisk) >= v;
          break;
        case 'highRiskCardCountMin':
          r = S.highRiskCardCount() >= v;
          break;

        /* ── 顺序 / 先后关系 ── */
        case 'tagAfterTag':
          r = tagAfterTag(ctx, v.firstTags || [], v.laterTags || []);
          break;
        case 'differentStageTagPair':
          r = differentStageTagPair(ctx, v.leftTags || [], v.rightTags || []);
          break;
        case 'repairAfterHighRisk':
          r = repairAfterHighRisk(ctx, S);
          break;

        /* ── Combo 状态 ── */
        case 'comboActive':
          r = ctx.combos.indexOf(v) >= 0;
          break;
        case 'comboCountMin':
          r = ctx.combos.length >= v;
          break;

        /* ── 视觉槽 ── */
        case 'visualSlotPresentAny': {
          const slots = S.activeSlots();
          const list = Array.isArray(v) ? v : (v.slots || []);
          r = list.some((s) => slots[s]);
          break;
        }
        case 'taggedVisualSlotCountMin':
          r = S.taggedVisualSlotCount(v.tags || [], v.stages) >= v.min;
          break;

        default:
          // 未实现的操作符必须显式失败并留痕，不能静默当作 true
          if (K3D.conditionEval) K3D.conditionEval.unknownOperators[key] = true;
          r = false;
      }
      if (!r) return false;
    }
    return true;
  }

  /* ────────────────────────────── 顺序型条件实现 ────────────────────────────── */

  /** 按阶段顺序排列的选择（stage 索引升序） */
  function orderedPicks(ctx) {
    return ctx.picks.slice().sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
  }

  /**
   * tagAfterTag：至少一张带 firstTags 的卡，在**更晚的阶段**之后跟着一张带 laterTags 的卡。
   * 规范 B.2：「一类标签出现后，后续阶段再出现另一类标签」。
   */
  function tagAfterTag(ctx, firstTags, laterTags) {
    const ps = orderedPicks(ctx);
    for (let i = 0; i < ps.length; i++) {
      if (!firstTags.some((t) => ps[i].tags.indexOf(t) >= 0)) continue;
      for (let j = i + 1; j < ps.length; j++) {
        if (STAGES.indexOf(ps[j].stage) <= STAGES.indexOf(ps[i].stage)) continue;
        if (laterTags.some((t) => ps[j].tags.indexOf(t) >= 0)) return true;
      }
    }
    return false;
  }

  /**
   * differentStageTagPair：至少一处 leftTags 与一处 rightTags 出现在**不同阶段**。
   * 规范 B.2：`mustBeDifferentStages` 为 true 时必须来自不同锻造阶段。
   */
  function differentStageTagPair(ctx, leftTags, rightTags) {
    const left = ctx.picks.filter((p) => leftTags.some((t) => p.tags.indexOf(t) >= 0));
    const right = ctx.picks.filter((p) => rightTags.some((t) => p.tags.indexOf(t) >= 0));
    for (const a of left) for (const b of right) if (a.stage !== b.stage) return true;
    return false;
  }

  /**
   * repairAfterHighRisk：至少一张高风险卡（riskDeltaPoints >= 8）之后，
   * 有更晚阶段的修复/负风险卡。规范 B.2。
   */
  function repairAfterHighRisk(ctx, S) {
    const ps = orderedPicks(ctx);
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].riskDeltaPoints < HIGH_RISK_THRESHOLD) continue;
      for (let j = i + 1; j < ps.length; j++) {
        if (STAGES.indexOf(ps[j].stage) <= STAGES.indexOf(ps[i].stage)) continue;
        if (S.isRepairPick(ps[j])) return true;
      }
    }
    return false;
  }

  /* ────────────────────────────── 导出 ────────────────────────────── */

  K3D.conditionEval = {
    HIGH_RISK_THRESHOLD,
    VALID_SLOTS,
    STAT_KEYS,
    STAGES,
    makeContext,
    evaluate,
    unknownOperators: {},
    /** 调试用：返回条件树里出现的全部操作符 id */
    operatorsIn(spec, acc) {
      acc = acc || {};
      if (!spec || typeof spec !== 'object') return acc;
      for (const k of Object.keys(spec)) {
        if (k === 'all' || k === 'any') { for (const c of (spec[k] || [])) this.operatorsIn(c, acc); continue; }
        acc[k] = (acc[k] || 0) + 1;
      }
      return acc;
    },
  };

export const conditionEval = __reg.proxy.conditionEval;
