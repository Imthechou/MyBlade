/**
 * 应用层 · 游戏会话编排
 *
 * ★ 这里是"流程"的唯一持有者：UI 不再各自调用 core，而是调用 Game 的方法，
 *   Game 负责 ① 调 core ② 发 bus 事件 ③ 驱动渲染门面 ④ 落存档。
 *
 * 分层的意义：UI 页想改版不用碰规则；规则想改不用碰 DOM；
 * 渲染想换引擎（Cocos/小游戏）只需替换 src/render/index.js。
 */

import * as Core from '../core/index.js';
import { bus, EVENTS, audio, haptics } from '../platform/index.js';
import { getStage } from '../render/index.js';
import { candidateWarmNeedsVisualRestore } from '../render/gpuPreparation.js';
import { KNIFE_BY_ID, resolveModelId } from '../data/knifeTypes.js';

function immutableTeamView(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) immutableTeamView(child);
  return value;
}

function teamViewSnapshot(value) {
  return immutableTeamView(JSON.parse(JSON.stringify(value)));
}

function immutableNationalRunView(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) immutableNationalRunView(child);
  return value;
}

function nationalRunSnapshot(value) {
  return immutableNationalRunView(JSON.parse(JSON.stringify(value)));
}

class Session {
  constructor() {
    this.run = null;
    this.record = null;
    this.match = null;
    this.teamMatch = null; // 独立可选 team3，不改变单刀 this.match
    this.nationalRun = null; // 独立 provisional 全国赛会话，不改变单刀 this.match
    this.preview = null;      // 预览中的卡（未提交）
    this._candidatePrewarmPromise = null;
    this._candidatePrewarmKey = null;
    this._candidatePrewarmDoneKey = null;
    this._enterReadyPromise = null;
    this.mode = 'normal';
  }

  /* ── 锻造 ─────────────────────────────────────────── */

  startForge({ mode = 'normal', seed = null, daily = null } = {}) {
    const save = Core.progress.get();
    this.mode = mode;
    this.record = null;
    this.preview = null;
    this._visualSeq = (this._visualSeq || 0) + 1;
    this._candidatePrewarmPromise = null;
    this._candidatePrewarmKey = null;
    this._candidatePrewarmDoneKey = null;
    this._enterReadyPromise = null;
    this.run = Core.forge.createRun({
      seed: seed != null ? seed : (mode === 'daily' ? Core.daily.seedOfDay() : null),
      mode,
      cr: save.cr,
      daily,
      /* ★ rework T10.4：把存档里的内容解锁接进候选抽取。
         改造前 `game.startForge` **从不**传 `unlockedCardIds`，
         于是成就/图鉴发的 `card:` 解锁永远不影响候选——解锁形同虚设。
         `rollCandidates` 已改为「只提升已解锁卡的权重、绝不缩减卡池」，
         所以旧档的 218 张内容不会被拿走（详见 core/cards.js 注释）。 */
      unlockedCardIds: Array.isArray(save.unlockedCardIds) ? save.unlockedCardIds : null,
      workshopSnapshot: Core.arenaV41Growth.workshopSnapshot(save),
      specialistSnapshot: Core.arenaV41Specialties.specialtySnapshot(save,save.forgeBonus?.equippedId),
    });
    /* ★ rework T11：开锻前装备的有限加成绑定到本局。
       只做两件事：① 把选择的加成快照到 run.bonus（不写永久属性）；
       ② 立回锁定标志 —— 真正锁定发生在 S1 首次确认卡时（见 confirmCard）。
       未解锁 / 预留项一律降为 null，不会误消耗。 */
    const equipped = save.forgeBonus?.equippedId || null;
    const check = equipped ? Core.forgeBonuses.equipBonus(save, equipped) : { ok: true, bonusId: null };
    this.run.bonus = Core.forgeBonuses.makeRunBonus(check.bonusId || null);
    // 首页的 ghost 刀用了独立配方；不要让 show() 把它套到第一阶段原料上。
    // 第一阶段初始态保留 GLB 原始金属材质，用户点卡后再预览配方。
    const stage = getStage();
    if (stage) {
      stage.deferSkin = false;
      stage._skinState = null;
      stage._handle = null;
      stage.applyGlow(null);
    }
    bus.emit(EVENTS.RUN_START, { seed: this.run.seed, mode });
    audio.play('select');
    this.syncStage();
    // Candidates are fixed by createRun(). Start loading their models and
    // shader variants during the route transition, before the first card tap.
    this.prewarmCandidates();
    return this.run;
  }

  /**
   * Canonical visual recipe for run state, temporary card overlays, stored knives,
   * prewarm, and the standalone card-image tool. Pure data, no renderer mutation.
   * Unselected layers retain neutral fallback values but stay disabled in skin flags.
   */
  resolveVisualState(source, overrides = {}, { modelId = null, viewPreset = 'forge' } = {}) {
    if (!source) return null;
    const ov = overrides || {};
    if (source.stageIndex === 1 && modelId === 'molten_sphere_small') viewPreset = 'melt';
    const skin = Core.recipe.deriveSkinState(source, ov);
    const handle = Core.recipe.deriveHandleMask(source, ov);
    const form = (skin.visualStages || []).find((v) => v.index === 3);
    return { ov, skin, handle, modelId, viewPreset, glowCardId: form?.cardId || null };
  }

  /** Convert a card to its entire override (S5/S6 ID and per-stage fingerprint included). */
  cardVisualOverlay(card) {
    if (!card) return {};
    return {
      ...(card.visual?.write || {}),
      ...(card.stage === 'S6' ? { temperCardId: card.id } : {}),
      ...(card.stage === 'S5' ? { finishCardId: card.id } : {}),
      visualStages: [Core.recipe.visualCardOf(card)].filter(Boolean),
    };
  }

  resolveVisual(card = null, { preview = !!card } = {}) {
    if (!this.run) return null;
    const ov = this.cardVisualOverlay(card);
    return this.resolveVisualState(this.run, ov, {
      modelId: this.modelIdForStage(ov.knifeType || null, { preview }),
      viewPreset: this.viewPresetForStage({ preview }),
    });
  }

  previewVisual(card) { return this.resolveVisual(card, { preview: true }); }

  /**
   * 补一次透射族预热（M15–M18 晶体）。
   *
   * 只在「当前阶段的候选池里真的有透射材质」时才动手 —— 不做无条件预热，
   * 否则大部分局（S1 三张候选都没有晶体）会白付一次 ~2s 的 GPU 编译。
   * 幂等：同一批候选只判一次；渲染层自己也有 cached 早退。
   *
   * ⚠ 为什么是"补"而不是"抢先"：候选预热（prewarmSkins）本身就会为晶体候选
   *   编出透射变体，这里只兜模型未就绪 / 指纹早退 / 重绘这些落空情形。
   */
  _warmTransmissionOnce() {
    const stage = getStage();
    const run = this.run;
    if (!stage || typeof stage.warmTransmissionFamily !== 'function'
      || typeof stage.transmissionReachable !== 'function') return null;
    if (!run || run.phase !== Core.forge.PHASE.SELECT || !Array.isArray(run.candidates)) return null;
    const key = `${run.stageId}:${run.candidates.map((c) => c.id).join(',')}`;
    if (this._transPoolKey === key) return null;
    this._transPoolKey = key;
    const cards = run.candidates.slice();
    const owner = run;
    /* 延到下一个宏任务：transmissionReachable 要为每个候选跑一次 compose，
       不能把这段 CPU 压在当前帧（调用点可能在预热收尾、也可能在渲染路径旁）。 */
    setTimeout(() => {
      if (this.run !== owner || !stage.viewer) return;
      const skins = cards
        .map((c) => { const v = this.previewVisual(c); return v && v.skin; })
        .filter(Boolean);
      if (!skins.length || !stage.transmissionReachable(skins)) return;
      stage.warmTransmissionFamily();
    }, 0);
    return null;
  }

  /** 预览（纯计算，不写 run） */
  previewCard(card) {
    const unchanged = !!card && this.preview?.id === card.id;
    this.preview = card;
    const startedAt = performance.now();
    const programsBefore = getStage()?.viewer?.renderer?.info?.programs?.length || 0;
    const p = Core.cards.previewPick(this.run, card);
    bus.emit(EVENTS.CARD_PREVIEW, { card, preview: p });
    if (unchanged) return p;
    // 预览视觉：走 overrides 旁路，不碰 pendingSkin
    if (card && p) {
      const v = this.previewVisual(card);
      if (v) this.applyResolvedVisual(v, { preview: true, startedAt, cardId: card.id, programsBefore });
    } else {
      this.syncStage(); // null candidate must also restore baseline, not leave a stale preview
    }
    return p;
  }

  /**
   * 后台预热本阶段候选卡的着色器 program（见 docs/卡顿归因与优化方案.md §四 · 方案 A）。
   *
   * 病象：玩家第一次点候选卡，画面要等 2.8–9.1 s 才有反应 —— 归因是
   * **该配方的 program 第一次用到时才新建+链接**（实测 3807 ms），而不是模型加载。
   * 候选卡渲染出来之后、玩家还在看图的时候先把 program 链接好，点下去就是热命中。
   *
   * 有并行编译扩展时后台准备；无扩展时在准备边界执行同步链接，不降低材质质量。
   * 准备失败会返回原因，玩法仍保留可用的渲染降级路径。
   * 重复调用是廉价的（门面有指纹早退 + 预热池）。
   */
  prewarmCandidates() {
    if (!this.run || !Array.isArray(this.run.candidates) || !this.run.candidates.length) return null;
    if (this.run.phase !== Core.forge.PHASE.SELECT) return null;
    const candidateKey = `${this.run.stageId}:${this.run.rerollCountByStage[this.run.stageId] || 0}:${this.run.candidates.map((card) => card.id).join(',')}`;
    if (this._candidatePrewarmKey === candidateKey && this._candidatePrewarmPromise) {
      return this._enterReadyPromise || this._candidatePrewarmPromise;
    }
    if (this._candidatePrewarmDoneKey === candidateKey) {
      /* 这一批已经预热过（重复进同一阶段 / 重绘）：候选预热不再跑，
         但透射族可能还没热（上一批可能在模型就绪前就结束了）。
         补一次 —— 已覆盖时是 program 缓存命中，近零成本。 */
      this._warmTransmissionOnce();
      return null;
    }
    const stage = getStage();
    const originalRun = this.run;
    const isCurrent = () => this.run === originalRun
      && this._candidatePrewarmKey === candidateKey
      && originalRun.phase === Core.forge.PHASE.SELECT
      && `${originalRun.stageId}:${originalRun.rerollCountByStage[originalRun.stageId] || 0}:${originalRun.candidates.map((card) => card.id).join(',')}` === candidateKey;
    // 即使当前模型正在异步编译也立即排入候选卡预热。
    // prewarmSkins 内部会等待 viewer._compilePromise 后再编译隐藏材质副本，
    // 这样玩家看卡片时就开始预热，不会等到点卡后才开始冷编译。
    if (!stage || typeof stage.prewarmSkins !== 'function') return null;
    const groups = new Map();
    for (const card of this.run.candidates) {
      const v = this.previewVisual(card);
      if (!v) continue;
      const modelId = this.modelIdForStage(v.ov.knifeType || null, { preview: true });
      if (!modelId) continue;
      if (!groups.has(modelId)) groups.set(modelId, { skins: [], handles: [] });
      groups.get(modelId).skins.push(v.skin);
      groups.get(modelId).handles.push(v.handle);
    }
    if (!groups.size) return null;
    // S4 cards may each use a different knife. Load every candidate GLB in
    // parallel first so tapping a later card never waits for model parsing.
    const entries = [...groups];
    const prepStartedAt = (globalThis.performance || Date).now();
    const prepStageId = this.run.stageId;
    const prepCards = this.run.candidates.map(card => card.id);
    /* ★ 2026-10-21：入场放行信号。
       首页「开始锻刀」要 `await prewarmCandidates()` 才 router.go('forge')，
       以前等的是**整批**（含晶体卡的两支透射程序，实测 2.33s）。
       现在第一段（不透明程序）编完就 resolve，玩家立刻进页面；
       透射那一段在后台继续，闸门仍然等整批（不会两个 compileAsync 并发）。 */
    let releaseEnter = null;
    let enterReleased = false;
    const enterReady = new Promise((resolve) => { releaseEnter = resolve; });
    const noteEnterReady = (info) => {
      if (enterReleased) return;
      enterReleased = true;
      releaseEnter({ ok: true, ...(info || {}) });
    };
    const work = Promise.all(entries.map(async ([modelId]) => {
      if (!stage.engine || typeof stage.engine.warmup !== 'function') return true;
      // Silent prefetch: no persistent 'loading model' UI after GPU warmup.
      try { return !!(await stage.engine.warmup(modelId)); } catch (_) { return false; }
    })).then(async (loaded) => {
      if (!isCurrent()) return { ok: false, reason: 'obsolete' };
      // Upload all newly parsed candidate GLB textures before players can
      // first see their S4 knives; compileAsync alone doesn't do texture I/O.
      const uploads = stage.initLoadedTextures?.();
      if (uploads && !uploads.ok) console.warn('[forge] candidate GPU texture preparation incomplete', uploads);
      // One batched compile per model; no delayed 2.6s cold queue.
      // All candidates use the same recipe resolver as the visible preview.
      let success = true;
      let attempted = 0;
      const results = [];
      for (let i = 0; i < entries.length; i++) {
        if (!loaded[i]) { success = false; continue; }
        const [modelId, group] = entries[i];
        attempted++;
        if (!isCurrent()) return { ok: false, reason: 'obsolete' };
        const result = await stage.prewarmSkins(group.skins, {
          modelId, handles: group.handles, isCurrent, onFirstPhase: noteEnterReady,
        });
        results.push({ modelId, ...result });
        if (!result?.ok) success = false;
      }
      const report = { ok: success && attempted > 0, stageId: prepStageId,
        ms: Math.round((globalThis.performance || Date).now() - prepStartedAt),
        candidates: prepCards.length, cards: prepCards, results };
      const samples = globalThis.__FORGE_PREWARM_TIMINGS ||= [];
      samples.push(report);
      if (samples.length > 64) samples.shift();
      /* 透射族（M15–M18 晶体）：候选预热只覆盖"本批真的建成副本"的情况。
         模型还没就绪 / 指纹早退 / 重绘都会让它落空，这里补一次。
         预热已覆盖时这是 program 缓存命中（个位数毫秒），不会重复付编译成本。 */
      this._warmTransmissionOnce();
      /* 兜底：某种情况下第一段回调没触发（早退 / 无几何），这里放行，
         否则首页按钮会一直停在"正在准备工艺…"。 */
      noteEnterReady({ phase: 'fallback' });
      return report;
    });
    this._candidatePrewarmKey = candidateKey;
    this._candidatePrewarmPromise = work;
    this._enterReadyPromise = enterReady;
    work.then((result) => {
      if (this._candidatePrewarmPromise === work && result && result.ok) {
        this._candidatePrewarmDoneKey = candidateKey;
      }
    }).catch(() => {});
    work.finally(() => {
      if (this._candidatePrewarmPromise !== work) return;
      this._candidatePrewarmPromise = null;
      this._enterReadyPromise = null;
      if (!this.run) return;
      // Candidate warming only adds invisible meshes. If the same selection
      // set is still active, every visible state change was already applied by
      // previewCard/syncStage; replaying it here dirties material generations
      // and can trigger another full compile on slow WebGL implementations.
      if (!candidateWarmNeedsVisualRestore(isCurrent)) return;
      // 编译期间玩家仍可换卡、确认或推进阶段；结束后只渲染当下那份状态。
      if (this.preview) {
        const visual = this.previewVisual(this.preview);
        if (visual) this.applyResolvedVisual(visual, { preview: true });
      } else this.syncStage();
    }).catch(() => {});
    /* 调用方等的是"可以进页面了"（第一段编完），不是整批。 */
    return enterReady;
  }

  clearPreview() {
    this.preview = null;
    this.syncStage();
  }

  confirmCard(card) {
    if (!this.run || !card) return null;
    const before = this.run.stageId;
    const res = Core.forge.confirmCard(this.run, card);
    if (!res.ok) return res;
    /* ★ rework T11：S1 首次确认卡后锁定加成一—本局不能再换。 */
    if (before === 'S1') Core.forgeBonuses.lockBonus(this.run);
    this.preview = null;
    audio.play('confirm');
    haptics.feedback('confirm');
    bus.emit(EVENTS.CARD_CONFIRMED, { card, stageId: before, riskCheck: res.riskCheck });
    if (res.riskCheck) {
      bus.emit(EVENTS.RISK_CHECKED, res.riskCheck);
      audio.play(res.riskCheck.fractured ? 'fracture' : 'riskSafe');
    }
    if (res.fractured) {
      bus.emit(EVENTS.FRACTURE, this.run.fractureInfo);
      haptics.feedback('fracture');
    }
    this.syncStage();
    this.prewarmCandidates();
    return res;
  }

  reroll() {
    if (!this.run) return null;
    /* ★ rework T11：「备料余裕」在本局内的**真实消费点**。
       它提供一次免费重抽（不消耗 CR），用完即失效。
       注意：免掉的是 CR 支付，不绕过 rerollCountByStage 的阶梯计数，
       因此不会因为一次免费重抽而让后续价格变化。 */
    const freeReroll = this._canUseFreeReroll();
    // 赛事可能已增加主档 CR；旧 run 只提供刷新次数，不能反写余额。
    const draft = { ...this.run, cr: Core.progress.get().cr, freeRerollOverride: !!freeReroll,
      rerollCountByStage: { ...this.run.rerollCountByStage },
      specialist: this.run.specialist ? JSON.parse(JSON.stringify(this.run.specialist)) : null };
    const r = Core.cards.reroll(draft);
    if (!r.ok) return r;
    let paid;
    if (freeReroll) {
      /* 免费路径：直接采用草稿结果，不扣 CR。 */
      const use = Core.forgeBonuses.use(this.run);
      paid = { ok: true, cr: draft.cr, bonus: use };
      if (use.ok) bus.emit(EVENTS.UNLOCKED, { kind: 'bonus-used', receipt: use.receipt });
    } else {
      paid = Core.progress.spendForgeReroll(r.cost);
      if (!paid.ok) return paid;
    }
    Object.assign(this.run, { cr: paid.cr, rerollCountByStage: draft.rerollCountByStage,
      rerollTotal: draft.rerollTotal, paidRerollsUsed: draft.paidRerollsUsed, candidates: draft.candidates,
      specialist: draft.specialist });
    bus.emit(EVENTS.CR_CHANGED, { cr: paid.cr });
    this.preview = null; // the previous candidate is no longer in this pool
    this.syncStage();
    audio.play('reroll');
    bus.emit(EVENTS.REROLL, { ...r, free: !!freeReroll, receipt: paid.bonus?.receipt || null });
    this.prewarmCandidates();
    return { ...r, free: !!freeReroll, receipt: paid.bonus?.receipt || null };
  }

  /** 本局是否还有可用的「免费重抽」加成机会 */
  _canUseFreeReroll() {
    if (!this.run?.bonus) return false;
    if (!Core.forgeBonuses.canUse(this.run)) return false;
    const eff = Core.forgeBonuses.effectOf(
      { id: this.run.bonus.bonusId }, this.run);
    return Number(eff?.freeReroll) > 0;
  }

  /** 当前加成快照（锻造页展示装备态与生效回执） */
  bonusView() {
    return Core.forgeBonuses.snapshot(this.run);
  }

  hammerStrike() {
    if (!this.run) return null;
    const r = Core.forge.hammerStrike(this.run);
    /* ★ rework T14：S4 触感要能区分「成功落锤 / 升档 / 危险 / 断裂」。
       改造前无论升档还是临界，都只给同一声 hammer ——
       玩家无法从反馈判断刚才那一锤是“普通一下”还是“升了一个档”。
       优先级：断裂 > 升档 > 危险 > 落锤，一锤只出一类反馈，不叠响。 */
    const s = r.strike || {};
    const danger = Number(s.breakChance) >= 0.30;   // 与 Risk 60 锚点同量级
    if (!r.fractured) {
      if (s.tierUp) { audio.play('hammerTier'); haptics.feedback('trait'); }
      else if (danger) { audio.play('hammerRisk'); haptics.feedback('hammer'); }
      else { audio.play('hammer'); haptics.feedback('hammer'); }
    } else {
      audio.play('hammer'); haptics.feedback('hammer');
    }
    bus.emit(EVENTS.HAMMER, r.strike);
    if (r.fractured) {
      audio.play('fracture');
      haptics.feedback('fracture');
      bus.emit(EVENTS.FRACTURE, this.run.fractureInfo);
    }
    this.syncStage();
    return r;
  }

  endHammer() {
    if (!this.run) return null;
    const r = Core.forge.endHammer(this.run);
    audio.play('select');
    bus.emit(EVENTS.HAMMER_END, r.hammer);
    this.syncStage();
    this.prewarmCandidates();
    return r;
  }

  /**
   * S7 刃线提交。
   * ★ rework T05：新增 opts.skipped（主动跳过 → MISS）；
   *   path 是真实采样数组（[{index,value}]），未绘制区段不参与评分。
   */
  submitEdge(path, opts = {}) {
    if (!this.run) return null;
    const r = Core.forge.submitEdge(this.run, path || null, opts);
    bus.emit(EVENTS.EDGE_DONE, r.edge);
    audio.play(r.edge?.sharp > 0 ? 'select' : 'tap');
    this.syncStage();
    this.prewarmCandidates();
    return r;
  }

  /** S10 鉴定 */
  appraise() {
    if (!this.run) return null;
    const rec = Core.appraise.appraise(this.run);
    if (this.mode === 'daily') rec.dayKey = Core.daily.dayKey();
    this.record = rec;
    bus.emit(EVENTS.APPRAISED, rec);
    audio.play(rec.fractured ? 'lose' : 'reveal');
    return rec;
  }

  /** 把本局结果归档（鉴定后调用） */
  archive() {
    if (!this.record) return null;
    const r = Core.progress.archive(this.record, { mode: this.mode });
    if (r?.ok === false) return r;
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    return r;
  }

  /* ── 快赛原子结算：仅当前页原 run 对象重试，不提供刷新恢复 ── */
  settleQuickChallenge(run) {
    // run 由战报页持有；不写 this.run（锻造局），失败也不重开/清空传入局。
    const result = Core.progress.settleQuickChallenge(run);
    if (result.ok && result.code === 'OK') {
      bus.emit(EVENTS.CR_CHANGED, { cr: result.cr });
    }
    return result;
  }

  /* ── 赛事 ─────────────────────────────────────────── */

  /**
   * 开始一场比赛（V2.1 §16 / §20）。
   * @param {object} o
   *   bladeId   藏刀阁里的成刀 id
   *   tier      'school' | 'national' | 'apex'
   *   styleId   流派赛分支（school 用；national/apex 用作对手风格倾向）
   *   gradient  流派赛梯度 0–4
   *   theme     GLOBAL APEX 主题（V2.1 §20.3 主题事件）
   *   seed
   */
  startMatch({ bladeId, tier, styleId, gradient, seed, theme }) {
    const blade = Core.progress.bladeById(bladeId);
    if (!blade) return { ok: false, reason: '找不到这把刀' };
    const m = Core.arena.createMatch({ blade, tier, styleId, gradient, seed, theme });
    if (!m.ok) return m;
    this.match = m.match;
    bus.emit(EVENTS.MATCH_START, { tier: m.match.tier, bladeId });
    return m;
  }

  choose(choiceId) {
    if (!this.match) return null;
    const r = Core.arena.choose(this.match, choiceId);
    audio.play('select');
    return r;
  }

  submitFieldTest(timing) {
    if (!this.match) return null;
    const r = Core.arena.submitFieldTest(this.match, timing);
    audio.play(r.result && r.result.tier === 'perfect' ? 'win' : 'tap');
    return r;
  }

  skipFieldTest() {
    if (!this.match) return null;
    return Core.arena.skipFieldTest(this.match);
  }

  /* ── 可选 team3：独立会话，不赋值 this.match，绝不走 finishMatch ── */

  /** 成功返回 {ok,team}；失败 {ok:false,code,reason}；全部写操作先落档。 */
  startTeamMatch(options) {
    const result = Core.progress.startTeamMatch(options);
    if (result.ok) {
      this.teamMatch = result.team;
      bus.emit('arena:team-start', { team: this.teamMatch });
    }
    return result;
  }

  /** 刷新后显式调用；返回 {ok:true,team:null|TeamState}，不会自动派刀或重开。 */
  resumeTeamMatch() {
    this.teamMatch = Core.progress.activeTeamMatch();
    return { ok: true, team: this.teamMatch };
  }

  /** Read-only detached view for the team picker and per-round dispatch UI. */
  teamMatchView() {
    const team = Core.progress.activeTeamMatch()
      || (this.teamMatch?.status === 'settled' ? this.teamMatch : null);
    if (!team) return teamViewSnapshot({ team: null, status: 'none', roster: [], usedBladeIds: [],
      currentRound: null, activeRound: null, result: null, settlement: null });

    const liveBlades = new Map(Core.progress.collection().map(blade => [blade.id, blade]));
    const fracturedIds = new Set(Core.progress.fracturedList().map(blade => blade.id));
    const canDispatchRound = team.status === 'ready' && !team.activeMatch
      && team.rounds.length < team.policy.roundCount;
    const roster = team.roster.map(blade => {
      const live = liveBlades.get(blade.id);
      const used = team.usedBladeIds.includes(blade.id);
      let reason = null;
      let reasonText = null;
      if (team.status === 'complete' || team.status === 'settled' || team.result) {
        reason = 'TEAM_COMPLETE'; reasonText = '团队赛已结束';
      } else if (team.activeMatch) {
        reason = 'ROUND_ACTIVE'; reasonText = '当前轮尚未结束';
      } else if (!canDispatchRound) {
        reason = 'TEAM_NOT_READY'; reasonText = '当前不能派刀';
      } else if (used) {
        reason = 'BLADE_ALREADY_USED'; reasonText = '本场已出战';
      } else if (!live || live.fractured || live.canEnterArena === false) {
        reason = fracturedIds.has(blade.id) ? 'BLADE_ALREADY_FRACTURED' : 'INELIGIBLE_BLADE';
        reasonText = fracturedIds.has(blade.id) ? '已收入断刀册' : '已失去参赛资格';
      }
      return { id: blade.id, name: blade.bladeName || blade.id, blade, used,
        canDispatch: reason === null, reason, reasonText };
    });
    const activeRound = team.activeMatch ? {
      index: team.rounds.length + 1,
      bladeId: team.activeMatch.blade?.id || null,
      done: !!team.activeMatch.done,
      result: team.activeMatch.result || null,
    } : null;
    return teamViewSnapshot({ team, status: team.status, roster, usedBladeIds: team.usedBladeIds,
      currentRound: team.status === 'complete' || team.status === 'settled'
        ? team.policy.roundCount : team.rounds.length + 1,
      activeRound, result: team.result, settlement: team.settlement });
  }

  dispatchTeamBlade(bladeId) {
    if (!this.teamMatch) return { ok: false, code: 'TEAM_NOT_FOUND', reason: '请先开始或恢复团队赛' };
    const result = Core.progress.dispatchTeamBlade(this.teamMatch.id, bladeId);
    if (result.ok) {
      this.teamMatch = result.team;
      bus.emit('arena:team-round-start', { teamId: this.teamMatch.id, match: result.match });
    }
    return result;
  }

  /**
   * 高阶正式测试桥：updateTeamRound(m => Suite.createSuite(m)) 等。
   * 进行中的 Challenge / Performance 必须在回调内保存在 m.teamOperation 并按动作落档；
   * 返回的快照只供绘制，不要缓存其对象身份（每次事务会换引用）。
   */
  updateTeamRound(mutator) {
    if (!this.teamMatch) return { ok: false, code: 'TEAM_NOT_FOUND', reason: '请先开始或恢复团队赛' };
    const result = Core.progress.updateTeamRound(this.teamMatch.id, mutator);
    if (result.ok) this.teamMatch = result.team;
    return result;
  }

  teamChoose(choiceId) {
    return this.updateTeamRound(match => Core.arena.choose(match, choiceId));
  }

  teamSubmitFieldTest(timing) {
    return this.updateTeamRound(match => Core.arena.submitFieldTest(match, timing));
  }

  teamSubmitFieldTestChallenge(performance) {
    return this.updateTeamRound(match => Core.arena.submitFieldTestChallenge(match, performance));
  }

  teamSkipFieldTest(performance = null) {
    return this.updateTeamRound(match => Core.arena.skipFieldTest(match, performance));
  }

  /** 只记轮次/迁移当前断刀，0 CR；不会自动开始下一轮。 */
  finishTeamRound() {
    if (!this.teamMatch) return { ok: false, code: 'TEAM_NOT_FOUND', reason: '请先开始或恢复团队赛' };
    const result = Core.progress.completeTeamRound(this.teamMatch.id);
    if (result.ok) {
      this.teamMatch = result.team;
      bus.emit('arena:team-round-end', { teamId: this.teamMatch.id, round: result.round, result: result.result });
    }
    return result;
  }

  /** 仅限已在其他流程断裂的阵容刀，玩家确认缺席后本轮计负、0 CR。 */
  teamForfeitUnavailableBlade(bladeId) {
    if (!this.teamMatch) return { ok: false, code: 'TEAM_NOT_FOUND', reason: '请先开始或恢复团队赛' };
    const result = Core.progress.forfeitUnavailableTeamBlade(this.teamMatch.id, bladeId);
    if (result.ok) {
      this.teamMatch = result.team;
      bus.emit('arena:team-round-end', { teamId: this.teamMatch.id, round: result.round, result: result.result });
    }
    return result;
  }

  /** 整场唯一奖励入口；重复回调返回 duplicate:true，不重放成功音效/奖励事件。 */
  finishTeamMatch(teamId = this.teamMatch?.id) {
    if (!teamId) return { ok: false, code: 'TEAM_NOT_FOUND', reason: '请先开始或恢复团队赛' };
    const result = Core.progress.settleTeamMatch(teamId);
    if (result.ok) {
      this.teamMatch = result.team;
      if (!result.reward.duplicate) {
        audio.play(result.result.win ? 'win' : 'lose');
        bus.emit('arena:team-end', result);
        bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
      }
    }
    return result;
  }

  /* ── provisional 全国赛连赛：独立会话，不赋值 this.match ── */

  startNationalRun(options) {
    const result = Core.progress.startNationalRun(options);
    if (result.ok) {
      this.nationalRun = result.run;
      if (!result.duplicate) bus.emit('arena:national-start', { run: this.nationalRun });
    }
    return result;
  }

  /** 刷新后显式恢复；传 id 时读取历史中的指定全国赛，否则恢复当前 active。 */
  resumeNationalRun(runId = null) {
    const run = runId == null
      ? Core.progress.activeNationalRun()
      : Core.progress.nationalRunById(runId);
    this.nationalRun = run;
    return { ok: true, run };
  }

  /** Detached, recursively frozen current-session snapshot; null when not resumed. */
  nationalRunView() {
    const run = this.nationalRun
      ? (Core.progress.nationalRunById(this.nationalRun.id) || this.nationalRun)
      : Core.progress.activeNationalRun();
    return run ? nationalRunSnapshot(run) : null;
  }

  beginNationalRound(expectedRoundIndex) {
    if (!this.nationalRun) return { ok: false, code: 'NATIONAL_RUN_NOT_FOUND', reason: '请先开始或恢复全国赛' };
    if (expectedRoundIndex === undefined) {
      return { ok: false, code: 'NATIONAL_ROUND_INDEX_REQUIRED', reason: '必须指定期望的轮次索引' };
    }
    const result = Core.progress.beginNationalRound(this.nationalRun.id, expectedRoundIndex);
    if (result.ok) {
      this.nationalRun = result.run;
      if (!result.duplicate) {
        bus.emit('arena:national-round-start', { runId: this.nationalRun.id, match: result.match });
      }
    }
    return result;
  }

  /** 四参核心同形桥；旧 (matchId, mutator[, options]) 调用仍兼容。 */
  updateNationalRound(runIdOrMatchId, matchIdOrMutator, mutatorOrOptions, options = {}) {
    if (!this.nationalRun) return { ok: false, code: 'NATIONAL_RUN_NOT_FOUND', reason: '请先开始或恢复全国赛' };
    const legacy = arguments.length <= 2 || typeof matchIdOrMutator === 'function';
    const runId = legacy ? this.nationalRun.id : runIdOrMatchId;
    const matchId = legacy ? runIdOrMatchId : matchIdOrMutator;
    const mutator = legacy ? matchIdOrMutator : mutatorOrOptions;
    const checkpointOptions = legacy ? (mutatorOrOptions ?? {}) : options;
    if (runId !== this.nationalRun.id) return { ok: false, code: 'NATIONAL_RUN_NOT_FOUND', reason: '当前全国赛身份已变化，请恢复最新全国赛' };
    if (matchId == null) return { ok: false, code: 'NATIONAL_MATCH_ID_REQUIRED', reason: '必须指定当前比赛 id' };
    if (typeof mutator !== 'function') return { ok: false, code: 'INVALID_MUTATOR', reason: '比赛更新操作无效' };
    if (!checkpointOptions || typeof checkpointOptions !== 'object' || Array.isArray(checkpointOptions)) return { ok: false, code: 'INVALID_OPERATION', reason: '比赛更新选项无效' };
    const result = Core.progress.updateNationalRound(runId, matchId, mutator, checkpointOptions);
    if (result.ok) this.nationalRun = result.run;
    return result;
  }

  /** 只写独立 operation 小槽；不触发赛事/奖励事件。 */
  validateNationalCheckpoint(runId, matchId, checkpoint) {
    return Core.progress.validateNationalCheckpoint(runId, matchId, checkpoint);
  }

  checkpointNationalRound(runId, matchId, checkpoint) {
    return Core.progress.checkpointNationalRound(runId, matchId, checkpoint);
  }

  /** 调用方消费恢复的 result.run，不能用主档查询覆盖它。 */
  restoreNationalRound(runId, matchId) {
    const result = Core.progress.restoreNationalRound(runId, matchId);
    if (result.ok) this.nationalRun = result.run;
    return result;
  }

  flushNationalRound(runId, matchId, options) {
    const result = Core.progress.flushNationalRound(runId, matchId, options);
    if (result.ok) this.nationalRun = result.run;
    return result;
  }

  nationalChoose(matchId, choiceId) {
    return this.updateNationalRound(matchId, match => Core.arena.choose(match, choiceId));
  }

  nationalSubmitFieldTest(matchId, timing) {
    return this.updateNationalRound(matchId, match => Core.arena.submitFieldTest(match, timing));
  }

  nationalSubmitFieldTestChallenge(matchId, performance) {
    return this.updateNationalRound(matchId, match => Core.arena.submitFieldTestChallenge(match, performance));
  }

  nationalSkipFieldTest(matchId, performance = null) {
    return this.updateNationalRound(matchId, match => Core.arena.skipFieldTest(match, performance));
  }

  /** 只结算当前全国赛轮次；核心按旧 matchId 幂等，成功奖励不经过 finishMatch。 */
  finishNationalRound(matchId) {
    if (!this.nationalRun) return { ok: false, code: 'NATIONAL_RUN_NOT_FOUND', reason: '请先开始或恢复全国赛' };
    if (matchId == null) return { ok: false, code: 'NATIONAL_MATCH_ID_REQUIRED', reason: '必须指定当前比赛 id' };
    const result = Core.progress.completeNationalRound(this.nationalRun.id, matchId);
    if (result.ok) {
      this.nationalRun = result.run;
      if (!result.duplicate) {
        bus.emit('arena:national-round-end', {
          runId: this.nationalRun.id, round: result.round, reward: result.reward,
        });
        bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
      }
    }
    return result;
  }

  /** 比赛结束 → 记进度 + 发奖励 */
  finishMatch() {
    if (!this.match || !this.match.result) return null;
    const res = this.match.result;
    const r = Core.progress.recordMatch(this.match.tier, {
      win: res.win,
      styleId: this.match.styleId,
      gradient: this.match.gradient,
      score: this.match.blade.score,
      matchId: this.match.id,
      bladeId: this.match.blade.id,
      matchRecord: {
        seed: this.match.seed, opponent: this.match.opponent, theme: this.match.theme,
        log: this.match.log, fieldTest: this.match.fieldTest, result: res,
      },
    });
    if (r?.error || r?.ok === false) return { ok: false, reason: r.reason || r.error, reward: r };
    audio.play(res.win ? 'win' : 'lose');
    /* ★ 2026-10-23：这里原来只发 MATCH_END，没有发 CR_CHANGED ——
       存档余额已经加上比赛奖励，顶栏却还停在上一次的值，玩家赢了比赛
       看到余额不变（要切页或别处再触发一次 CR_CHANGED 才刷新）。
       组队赛 / 全国赛 / 快赛三个结算入口都发了，只有单刀赛事漏了。 */
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    bus.emit(EVENTS.MATCH_END, { result: res, reward: r });
    return { result: res, reward: r };
  }

  /* ── 单刀赛事：3 局切割（buff 构筑 + 幽灵分）────────── */

  /**
   * 开一场切割赛事。
   * kind: 'single'（1 刀 × 3 局）/ 'team'（3 刀 × 各 1 局）/ 'national'（1 刀 × 5 轮）
   */
  startSliceMatch({ bladeId, bladeIds, kind = 'single', tier, styleId, gradient, theme }) {
    const ids = Array.isArray(bladeIds) ? bladeIds : (bladeId ? [bladeId] : []);
    const blades = ids.map((id) => Core.progress.bladeById(id)).filter(Boolean);
    if (!blades.length) return { ok: false, reason: '找不到这把刀' };
    const m = Core.arenaSlice.createSliceMatch({ blades, kind, tier, styleId, gradient, theme });
    if (!m.ok) return m;
    this.sliceMatch = m.match;
    this.match = null;
    audio.play('confirm');
    bus.emit(EVENTS.MATCH_START, { tier: m.match.tier, bladeId: ids[0], kind });
    return m;
  }

  /* ── 正式赛（多项目）：唯一新入口 ───────────────────
   * ★ rework T06：这条路径用 data/arena/formalTests 的赛事定义 + core/testScoring 分项计分，
   *   每个流派有**不同项目组合**（pressed=强度+耐久、precise=精度+切割 …）。
   *   旧的 arenaSlice（三次切割 + 逐局 buff）保留为“快速挑战/循环赛”备选，
   *   不再充当正式单刀赛的唯一形态。 */
  startFormalMatch({ bladeId, tier = 'school', styleId = null, gradient = 0, seed = null }) {
    const blade = Core.progress.bladeById(bladeId);
    if (!blade) return { ok: false, reason: '找不到这把刀' };
    const r = Core.arenaFormal.createFormalMatch({ blade, tier, styleId, gradient, seed });
    if (!r.ok) return r;
    this.formalMatch = r.match;
    audio.play('confirm');
    bus.emit(EVENTS.MATCH_START, { tier, bladeId, kind: 'formal', styleId });
    return r;
  }

  /** 当前正式赛待完成的测试项（UI 读它选舞台） */
  formalTest() {
    return this.formalMatch ? Core.arenaFormal.currentTest(this.formalMatch) : null;
  }

  /** 当前测试项的确定性题目（靶具序列/路径/负荷档） */
  formalTask() {
    return this.formalMatch ? Core.arenaFormal.testTask(this.formalMatch) : null;
  }

  /** 提交当前测试项的成绩（measure 来自真实操作舞台） */
  submitFormalTest(payload) {
    if (!this.formalMatch) return { ok: false, reason: '当前没有进行中的正式赛' };
    const r = Core.arenaFormal.submitTest(this.formalMatch, payload);
    audio.play(r?.result?.failed ? 'lose' : r?.done ? (this.formalMatch.result?.win ? 'win' : 'lose') : 'tap');
    // 整场收场 → 同一次写盘里落 CR / 履历 / 任务事件
    if (r?.done) this._settleFormalIfDone();
    return r;
  }

  /** 放弃剩余测试项 */
  abandonFormalMatch() {
    if (!this.formalMatch) return { ok: false, reason: '当前没有进行中的正式赛' };
    const r = Core.arenaFormal.abandon(this.formalMatch);
    if (r?.done) this._settleFormalIfDone();
    return r;
  }

  /**
   * 正式赛结算：CR / 履历 / 任务事件一次性写入。
   * ★ 幂等：用 formalSettled 标记 + recordMatch 的 matchId 幂等双保险。
   * ★ 明确：本场不执行永久断刀（FORMAL_RISK_TBD 未定）。
   */
  _settleFormalIfDone() {
    const m = this.formalMatch;
    if (!m || !m.done || m.settled) return null;
    const result = m.result;
    const record = Core.progress.recordMatch(m.tier === 'national' ? 'national' : 'school', {
      win: !!result.win,
      styleId: m.styleId,
      gradient: m.gradient,
      score: result.composite,
      matchId: m.id,
      bladeId: m.blade.id,
      matchRecord: {
        seed: m.seed,
        version: result.version,
        definition: result.definition,
        projectScores: result.projectScores,
        weights: result.weights,
        temporaryDamage: result.temporaryDamage,
        report: result.report,
        result,
      },
    });
    if (record?.error || record?.ok === false) return record;
    m.reward = record?.cr ?? 0;
    m.settled = true;
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    bus.emit(EVENTS.MATCH_END, { result, reward: record });
    return record;
  }

  clearFormalMatch() {
    if (this.formalMatch?.done && !this.formalMatch.settled) {
      return { ok: false, reason: '本场记录尚未保存，请先重试结算' };
    }
    this.formalMatch = null;
  }

  retryFormalSave() { return this._settleFormalIfDone(); }

  /** Restore a committed cup checkpoint without replaying an unsubmitted attempt. */
  resumeCareerV41() {
    if(!this.nationalMatch) {
      const national=Core.progress.activeCareerV41('national');
      if(national) {
        this.nationalMatch=national;
        if(national.done&&!national.settled)this._settleNationalIfDone();
      }
    }
    if(!this.apexMatch) {
      const apex=Core.progress.activeCareerV41('apex');
      if(apex) {
        this.apexMatch=apex;
        // Completed world cups remain claimable and replayable until the player accepts the result.
      }
    }
    return {national:!!this.nationalMatch,apex:!!this.apexMatch};
  }

  /* ── 三刀巅峰赛（T09）──────────────────────────── */

  /**
   * 开三刀赛。
   * ★ 资格在 core 强制校验：必须正好三把不同 ID、可用、未断的刀。
   *   任何单刀旁路都无法绕过 —— 旧 hub 的 apex+single 路由已不再调用这条路径。
   */
  startApexMatch({ bladeIds = [], seed = null } = {}) {
    if(!Core.progress.hasNationalCrownV41())
      return {ok:false,reason:'需先赢得全国大赛冠军才能挑战世界三刀赛'};
    const blades = bladeIds.map((id) => Core.progress.bladeById(id)).filter(Boolean);
    const r = Core.arenaFormal.createApexMatch({ blades, seed });
    if (!r.ok) return r;
    const saved=Core.progress.checkpointCareerV41('apex',r.match);
    if(!saved.ok)return saved;
    this.apexMatch = r.match;
    audio.play('confirm');
    bus.emit(EVENTS.MATCH_START, { tier: 'apex', kind: 'apex', bladeIds });
    return r;
  }

  /** 派一把刀进入当前轮 */
  apexDispatch(bladeId) {
    if (!this.apexMatch) return { ok: false, reason: '当前没有进行中的巅峰赛' };
    const blades = (this.apexMatch.roster || []).map((r) => Core.progress.bladeById(r.id)).filter(Boolean);
    const before=JSON.parse(JSON.stringify(this.apexMatch));
    const r = Core.arenaFormal.apexDispatch(this.apexMatch, blades, bladeId);
    if(!r.ok)return r;
    const saved=Core.progress.checkpointCareerV41('apex',this.apexMatch);
    if(!saved.ok){this.apexMatch=before;return saved;}
    audio.play('select');return r;
  }

  /** 提交当前轮的测试成绩 */
  apexSubmit(payload) {
    if (!this.apexMatch) return { ok: false, reason: '当前没有进行中的巅峰赛' };
    const before=JSON.parse(JSON.stringify(this.apexMatch));
    const r=Core.arenaFormal.apexSubmit(this.apexMatch,payload);
    if(!r?.ok)return r;
    const saved=Core.progress.checkpointCareerV41('apex',this.apexMatch);
    if(!saved.ok){this.apexMatch=before;return saved;}
    // Do not auto-claim: completed world rounds can be replayed for the best legal score.
    return r;
  }

  _settleApexIfDone() {
    const m = this.apexMatch;
    if (!m || !m.done || m.settled) return null;
    const record = Core.progress.recordMatch('apex', {
      win: !!m.result.win,
      score: m.result.composite,
      matchId: m.id,
      // 三刀赛不属于单把刀，不把荣誉写进某一把刀
      bladeId: null,
      matchRecord: { version: m.result.version, rounds: m.result.roundsDetail, report: m.result.report, result: m.result },
    });
    if (record?.error || record?.ok === false) return record;
    m.reward = record?.cr ?? 0;
    m.settled = true;
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    bus.emit(EVENTS.MATCH_END, { result: m.result, reward: record });
    return record;
  }

  clearApexMatch() {
    if (this.apexMatch?.done && !this.apexMatch.settled) return { ok: false, reason: '本场记录尚未保存，请先重试结算' };
    if(this.apexMatch) {
      const saved=Core.progress.clearCareerV41('apex',this.apexMatch.id);
      if(!saved.ok)return saved;
    }
    this.apexMatch = null;
  }

  retryApexSave() { return this._settleApexIfDone(); }

  /** Optional retake of a recorded world round; seed and roster are immutable. */
  retryApexRound(index) {
    const m=this.apexMatch;
    if(!m)return {ok:false,reason:'尚无世界赛'};
    const before=JSON.parse(JSON.stringify(m));
    const r=Core.arenaFormal.apexRetryRound(m,index);
    if(!r.ok)return r;
    const saved=Core.progress.checkpointCareerV41('apex',m);
    if(!saved.ok){this.apexMatch=before;return saved;}
    return r;
  }
  finishApexCareer() {
    if(!this.apexMatch?.done)return {ok:false,reason:'三轮尚未结束'};
    return this._settleApexIfDone();
  }

  /* ── 全国大赛（rework T09）：五轮多项目，非旧三局切割 ── */

  /**
   * 开一届全囉赛。代表刀创建时锁定，整届不换。
   */
  startNationalMatch({ bladeId, seed = null } = {}) {
    const expert=Object.values(Core.progress.get().arena.school || {})
      .filter(x=>Array.isArray(x?.cleared)&&x.cleared.includes(2)).length;
    if(expert<3)return {ok:false,reason:'全国赛需至少三个流派达到专家'};
    const blade = Core.progress.bladeById(bladeId);
    if (!blade) return { ok: false, reason: '找不到这把刀' };
    const r = Core.arenaFormal.createNationalMatch({ blade, seed });
    if (!r.ok) return r;
    const saved=Core.progress.checkpointCareerV41('national',r.match);
    if(!saved.ok)return saved;
    this.nationalMatch = r.match;
    audio.play('confirm');
    bus.emit(EVENTS.MATCH_START, { tier: 'national', kind: 'national', bladeId });
    return r;
  }

  /** 开始当前轮（创建该轮的多项目测试） */
  nationalStartRound() {
    if (!this.nationalMatch) return { ok: false, reason: '当前没有进行中的全国赛' };
    const blades = Core.progress.collection();
    const before=JSON.parse(JSON.stringify(this.nationalMatch));
    const r=Core.arenaFormal.nationalStartRound(this.nationalMatch,blades);
    if(!r.ok)return r;
    const saved=Core.progress.checkpointCareerV41('national',this.nationalMatch);
    if(!saved.ok){this.nationalMatch=before;return saved;}
    audio.play('select');return r;
  }

  /** 提交当前轮成绩 */
  nationalSubmitRound(payload) {
    if (!this.nationalMatch) return { ok: false, reason: '当前没有进行中的全国赛' };
    const before=JSON.parse(JSON.stringify(this.nationalMatch));
    const r=Core.arenaFormal.nationalSubmit(this.nationalMatch,payload);
    if(!r?.ok)return r;
    const saved=Core.progress.checkpointCareerV41('national',this.nationalMatch);
    if(!saved.ok){this.nationalMatch=before;return saved;}
    if(r.done)this._settleNationalIfDone();
    return r;
  }

  /** 主动退出本届（不伪造成绩） */
  nationalAbandonRound() {
    if (!this.nationalMatch) return { ok: false, reason: '当前没有进行中的全国赛' };
    const before=JSON.parse(JSON.stringify(this.nationalMatch));
    const r=Core.arenaFormal.nationalAbandon(this.nationalMatch);
    if(!r?.ok)return r;
    const saved=Core.progress.checkpointCareerV41('national',this.nationalMatch);
    if(!saved.ok){this.nationalMatch=before;return saved;}
    if(r.done)this._settleNationalIfDone();
    return r;
  }

  /** 当前轮的测试任务（UI 读这个渲染舞台） */
  nationalRoundTask() {
    const round = Core.arenaFormal.nationalCurrentRound(this.nationalMatch);
    if (!round?.roundMatch) return null;
    return Core.arenaFormal.testTask(round.roundMatch);
  }

  /**
   * 全国赛结算：与 recordMatch 的 matchId 幂等一起保证不重发奖励。
   * ★ 普通淘汰不改刀的身份；断刀政策仍为 FORMAL_RISK_TBD。
   */
  _settleNationalIfDone() {
    const m = this.nationalMatch;
    if (!m || !m.done || m.settled) return null;
    const result = m.result;
    const record = Core.progress.recordMatch('national', {
      win: !!result.champion,
      styleId: 'composite',
      gradient: Math.max(0, result.rounds - 1),
      score: result.roundsDetail.reduce((a, r) => a + (r.composite || 0), 0),
      matchId: m.id,
      bladeId: result.bladeId,
      matchRecord: {
        version: result.version,
        national: true,
        champion: !!result.champion,
        reason: result.reason,
        rounds: result.roundsDetail,
        report: result.report,
        result,
      },
    });
    if (record?.error || record?.ok === false) return record;
    m.reward = record?.cr ?? 0;
    m.settled = true;
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    bus.emit(EVENTS.MATCH_END, { result, reward: record });
    return record;
  }

  clearNationalMatch() {
    if (this.nationalMatch?.done && !this.nationalMatch.settled) {
      return { ok: false, reason: '本届记录尚未保存，请先重试结算' };
    }
    if(this.nationalMatch){
      const saved=Core.progress.clearCareerV41('national',this.nationalMatch.id);
      if(!saved.ok)return saved;
    }
    this.nationalMatch = null;
  }

  retryNationalSave() { return this._settleNationalIfDone(); }

  /** 组队赛：派这一局出战的刀 */
  dispatchSliceBlade(bladeId) {
    if (!this.sliceMatch) return { ok: false, reason: '当前没有进行中的比赛' };
    const r = Core.arenaSlice.dispatchBlade(this.sliceMatch, bladeId);
    if (r.ok) audio.play('select');
    return r;
  }

  pickSliceBuff(id) {
    if (!this.sliceMatch) return { ok: false, reason: '当前没有进行中的比赛' };
    const r = Core.arenaSlice.pickBuff(this.sliceMatch, id);
    if (r.ok) audio.play('select');
    return r;
  }

  startSliceRun(opts) {
    if (!this.sliceMatch) return { ok: false, reason: '当前没有进行中的比赛' };
    return Core.arenaSlice.startRun(this.sliceMatch, opts);
  }

  /** 单局结束：记账（整场的 CR / 断刀在 nextSliceRun 真正收场后结算） */
  finishSliceRun(performance) {
    if (!this.sliceMatch) return { ok: false, reason: '当前没有进行中的比赛' };
    const m = this.sliceMatch;
    const r = Core.arenaSlice.finishRun(m, performance);
    // V4.1: local blade failure only affects this round, not the owner's collection.
    this._settleSliceIfDone();
    return r;
  }

  nextSliceRun() {
    if (!this.sliceMatch) return { ok: false, reason: '当前没有进行中的比赛' };
    const r = Core.arenaSlice.nextRun(this.sliceMatch);
    this._settleSliceIfDone();
    return r;
  }

  /** 整场收场后一次性结算：CR、成就、断刀迁移。用 settled 保证只跑一次。 */
  _settleSliceIfDone() {
    const m = this.sliceMatch;
    // Legacy pending battlefield fractures are deliberately not migrated to the collection.
    if (m?.pendingFractures?.length) m.pendingFractures = [];
    if (!m || !m.done || m.settled) return null;
    const result = m.result;
    // 组队赛沿用 Apex 档（120/30），单刀与全国赛按各自层级
    const settleTier = m.kind === 'team' ? 'apex' : m.tier;
    const recount = Core.progress.recordMatch(settleTier, {
      win: !!result.win,
      styleId: m.styleId,
      gradient: m.gradient,
      score: result.score,
      matchId: m.id,
      rewardTarget: m.kind === 'national' ? 70 * (result.wins || 0) + ((result.losses || 0) > 0 ? 20 : 0) : null,
      // 断过的刀已经从藏刀阁移走，传 bladeId 会被判"失去资格"而拿 0 奖励
      bladeId: m.kind === 'team' ? null : m.blade.id,
      matchRecord: { seed: m.seed, opponent: m.opponent, runs: result.runs, buffs: result.buffs, result },
    });
    if (recount?.error || recount?.ok === false) return recount;
    m.reward = recount?.cr ?? 0;
    // 全国赛逐轮奖励已由 recordMatch 与整场履历原子写入。
    m.settled = true;
    audio.play(result.win ? 'win' : 'lose');
    bus.emit(EVENTS.CR_CHANGED, { cr: Core.progress.get().cr });
    bus.emit(EVENTS.MATCH_END, { result, reward: recount });
    return recount;
  }

  clearSliceMatch() {
    if (this.sliceMatch?.pendingFractures?.length || (this.sliceMatch?.done && !this.sliceMatch.settled)) {
      return { ok: false, reason: '本场记录尚未保存，请先重试结算' };
    }
    this.sliceMatch = null;
    this.match = null;
  }

  retrySliceSave() { return this._settleSliceIfDone(); }

  /* ── 渲染同步 ─────────────────────────────────────── */

  /**
   * 当前应该展示的模型 id（过程模型 → 刀型）。
   * @param {string|null} [knifeTypeOverride] 预览时的临时刀型（不写 run）
   */
  modelIdForStage(knifeTypeOverride = null, { preview = false } = {}) {
    const run = this.run;
    if (!run) return null;
    const idx = run.stageIndex;
    // 阶段进入时显示上一步已确认的成果；选卡时才切到本阶段加工后的预览模型。
    if (idx === 0) return 'ore_small';
    if (idx === 1) return 'molten_sphere_small'; // neutral S2 geometry on stage enter
    if (idx === 2) return 'blank_ingot_small'; // neutral S3 geometry on stage enter
    if (idx === 3 && !preview) {
      // Before the S4 decision, show the ingot. Once the knife-form card is
      // confirmed, keep that full knife through the hammer minigame; reverting
      // to the ingot here discarded the just-confirmed model until S5.
      if (run.phase === Core.forge.PHASE.HAMMER && run.knifeTypeId) {
        return knifeModel(run.knifeTypeId) || 'blank_ingot_small';
      }
      return 'blank_ingot_small';
    }
    const typeId = knifeTypeOverride || run.knifeTypeId;
    if (typeId) return knifeModel(typeId);
    return 'blank_ingot_small';
  }

  /**
   * 每个阶段一个独立机位（用户：各阶段的镜头位置也要调整）。
   *
   * 约定：`preview` 时相机先走到「这张卡生效后」的机位（让玩家预览变化），
   * 非 preview 时停在「本阶段已有的样子」。
   *
   * ★ 2026-10-24：以前 S1→S2、S4→S5 等相邻阶段**复用同一预设**，
   *   切换时镜头完全不动；现在每阶段一个机位（见 viewer.VIEW_PRESETS）。
   */
  viewPresetForStage({ preview = !!this.preview } = {}) {
    const idx = this.run ? this.run.stageIndex : 0;
    if (idx >= 9) return 'reveal';          // S10 鉴定
    if (idx === 0) return 'raw';            // S1 原料（预览不换机位，避免块体跳动）
    /* 每阶：[预览时, 平时] */
    const TABLE = [
      ['raw', 'raw'],            // S1
      ['melt', 'melt'],          // S2 neutral molten entry + preview
      ['billet', 'billet'],      // S3 neutral ingot entry + preview
      ['forge', 'billet'],       // S4 定型
      ['edge', 'forge'],         // S5 淬火
      ['temper', 'edge'],        // S6 回火
      ['grind', 'temper'],       // S7 开刃
      ['assemble', 'grind'],     // S8 装配
      ['tune', 'assemble'],      // S9 调校
    ];
    const row = TABLE[Math.min(TABLE.length - 1, Math.max(0, idx))];
    return preview ? row[0] : row[1];
  }

  /**
   * 刀柄遮罩闸门 —— 与**原项目 `js/main.js#handleMaskGate` 同判据**。
   *
   * ★ 2026-10-16 修复（用户：「端内没落实这些效果…s4 也没全刀应用材质，其他阶段也有问题」）
   *
   *   ① 阶段闸：S1–S7 一律不挂（`stageIndex < 7`）。
   *   ② 数据闸：这张卡 / 本局必须**显式**给过柄配方（`handle.metalId`）。
   *
   *   为什么必须有：`deriveHandleMask` 在没选柄时也会回落一个 **fallback polymer**——
   *   那是"下游要一个完整 cfg"，不是玩家选的东西。原项目注释原文：
   *     「compose() intentionally returns a fallback polymer handle even before the
   *       player reaches/chooses S8, which would **prematurely cover it**」
   *   v1.0 重构时漏搬了这道闸门，`applyStageVisual` 每阶段无条件 `applyHandle` →
   *   实测端内 S4–S7 的材质上都挂着 `bladeMask` 钩（S4 预览 K02/K17/K09 也有），
   *   刀柄被 polymer 盖住，而不是"整刀刀身材质"。
   *   对照：原项目 `js/main.js` 里 `hGate` 为假时走的是 **clearBladeMask** 分支。
   */
  handleMaskGate(handle) {
    const idx = this.run ? (Number(this.run.stageIndex) || 0) : 0;
    if (idx < 7) return false;                       // ① 阶段闸：S8 之前一律不挂
    return !!(handle && handle.explicit);            // ② 数据闸：真的选过柄才挂
  }

  /** 等目标模型真正挂载后再施加皮肤，避免异步切模时把预览写到旧模型。 */
  applyStageVisual(stage, modelId, skin, handle, viewPreset,
    { preview = false, startedAt = null, cardId = null, programsBefore = 0,
      glowCardId = null } = {}) {
    const rawInitial = this.run && this.run.stageIndex === 0 && !preview;
    // 预览必须立即写入真实模型。候选 program 在隐藏副本里并行预热，
    // viewer 的异步编译闸门负责阻止同步卡顿；不能等整批预热结束才应用，
    // 否则用户点卡后虽然选中态已变，3D 仍停留在旧效果数秒。
    const nextSkin = rawInitial ? null : skin;
    const visualSeq = this._visualSeq = (this._visualSeq || 0) + 1;
    if (stage.viewer) stage.viewer._pendingVisualSample = null;
    /* ★★ 2026-10-17（用户：「为啥出的对比都好像没有刀柄？」）
     *
     *   病灶：`uSkinCoverAll` 在 v1.0 里**一路恒为 1**（applySkin 的默认值），
     *   于是刀身材质把**握柄**也涂了。对"挂遮罩"的 S8 卡看不太出来（遮罩会盖住柄区），
     *   但对 **bypass 卡（S8_03 止滑胶 —— 按用户口径"直接用模型自带刀柄"）**，
     *   没有遮罩去覆盖 → 柄就是刀身材质 → **看上去整把刀没有刀柄**。
     *
     *   原项目口径（js/main.js 两处调用点逐字相同）：
     *       const hGate = ...handleMaskGate(...);
     *       pack.uniforms.uSkinCoverAll = hGate ? 0 : 1;
     *   注释原文：「S8 之前刀柄还没有自己的材质，整把刀都该是刀身材质；
     *             到 S8 挂上 bladeMask 之后，刀身材质继续写刀身 + 护手，
     *             只有握柄交给刀柄材质。**护手不是握柄**；不能因为 S8 选了柄材质
     *             就突然变成默认灰色。」
     *   着色器侧 `k3dSkinW(wB,wG,wH) = wB + wG + (coverAll ? wH : 0)` ——
     *   传 0 时护手(wG)仍被刀身材质覆盖，只放掉握柄(wH) ✓ 与该注释完全一致。 */
    const hGate = this.handleMaskGate(handle);
    const nextHandle = rawInitial ? null : (hGate ? handle : null);
    // show() 会在新 GLB 上异步恢复暂存配方；先写当前阶段的值，避免把旧模型预览
    // （例如首页 ghost 刀）短暂套到新阶段，造成一次不必要的冷 shader 编译。
    stage._skinState = nextSkin;
    stage._handle = nextHandle;
    stage._coverAll = !hGate; // async model restore must use the new region ownership too
    const apply = () => {
      if (visualSeq !== this._visualSeq || stage.modelId !== modelId) return;
      /* coverAll = !hGate：S1–S7 整刀刀身材质；S8 起把握柄放给刀柄材质（护手仍归刀身） */
      if (nextSkin) stage.applySkin(nextSkin, { coverAll: !hGate });
      else stage.clearSkin();
      /* ★ 闸门关时必须**显式清掉**（传 null），不能"什么都不做" ——
         否则从 S8 重铸回 S7、或切到另一把刀时，会留下上一次的柄材质。
         这与原项目 `else if (engine.clearBladeMask) engine.clearBladeMask(modelId)`
         完全同语义（见 core/recipe.js#deriveHandleMask 的 explicit 注释）。 */
      stage.applyHandle(nextHandle, nextSkin);
      stage.applyGlow(glowCardId);
      // Mark completion only after the target model and every visible effect
      // are assigned. The normal animation loop records the first full draw.
      if (cardId && startedAt != null && stage.viewer) {
        stage.viewer._pendingVisualSample = {
          cardId, stageId: this.run?.stageId, modelId, startedAt,
          programsAtStart: programsBefore,
        };
        stage.viewer.needsRender = true;
      }
      stage.setGhost(false);
      if (stage.viewer && stage.viewer.viewPreset !== viewPreset) stage.view(viewPreset, { duration: 420 });
      if (preview && this.run?.stageIndex <= 1) stage.viewer?.inspectTurn?.();
    };
    // A different preview may still be loading while the desired original model
    // is mounted. Ask show() to invalidate that request even on cancellation.
    if (stage.modelId !== modelId
      || (stage._requestedModelId && stage._requestedModelId !== modelId)) {
      const pending = stage.show(modelId, { viewPreset, viewDuration: 420 });
      Promise.resolve(pending).then(apply).catch(() => {});
    } else apply();
  }

  /** Apply exactly the state resolved for this display (no independent recipe paths). */
  applyResolvedVisual(visual, { preview = false, startedAt = null,
    cardId = null, programsBefore = 0 } = {}) {
    if (!visual) return null;
    const stage = getStage();
    if (stage && visual.modelId) {
      this.applyStageVisual(stage, visual.modelId, visual.skin, visual.handle,
        visual.viewPreset, { preview, startedAt, cardId, programsBefore,
          glowCardId: visual.glowCardId });
    }
    return visual.skin;
  }

  syncStage() {
    return this.applyResolvedVisual(this.resolveVisual(null, { preview: false }));
  }

  pushVisual(overrides, { preview = true } = {}) {
    // Backward-compatible route for callers supplying explicit overrides.
    if (!this.run) return null;
    const ov = overrides || {};
    const visual = this.resolveVisualState(this.run, ov, {
      modelId: this.modelIdForStage(ov.knifeType || null, { preview }),
      viewPreset: this.viewPresetForStage({ preview }),
    });
    return this.applyResolvedVisual(visual, { preview });
  }

  /**
   * 首页无代表作时的展台默认展示（让玩家第一眼就看到"这是一把刀"）。
   *
   * v1.5：演示刀用已有高碳钢/细拉丝/精抛光配方恢复金属反射，
   * 不再让高粗糙冷白钢与整刀覆盖把握柄变成发白的金属块。
   * 是否玩家藏刀仍由首页的“待你铸就”标签区分，不修改任何玩家记录。
   */
  showDefault() {
    const stage = getStage();
    const modelId = 'knife_tangdao';
    this._visualSeq = (this._visualSeq || 0) + 1;
    if (stage.modelId !== modelId) stage.show(modelId);
    stage.applyGlow(null);
    /* ★ 2026-10-24（用户：「首页没有刀的时候就幽灵唐刀，通体半透明，随机材质」）
       这里从写死一套（M02 高碳钢 / T02 拉丝 / F01 精抛光）改成**每次会话随机一套**。

       ⚠ 为什么必须缓存、不能每次 render 都随机：
         render() 在首页会被反复调用（进度变化 / CR 变化 / 切页回来），
         如果每次都取新随机值，刀的材质会不停闪变。
         所以只在**本次会话首次**取一次，之后一直复用 ——
         “每次刷新页面换一把”而不是“每次重绘换一把”。 */
    if (!this._ghostSkin) this._ghostSkin = randomGhostSkin();
    stage.applySkin(Core.recipe.deriveSkinState({
      seed: this._ghostSkin.seed,
      pendingSkin: this._ghostSkin.pendingSkin,
    }), { coverAll: false });
    stage.applyHandle(Core.recipe.deriveHandleMask({ pendingSkin: { handle: { metalId: 'polymer' }, wear: 0.02 } }));
    stage.setGhost(true);
    return modelId;
  }

  /** 展示藏刀阁里的一把刀（首页展台 / 检视） */
  showRecord(record) {
    const stage = getStage();
    if (!record) return null;
    /* ★ fix：`record.knifeType` 是**模型 id**，但旧存档/手改存档可能写入刀型 id
       （如 `folding`）—— 直接当模型 id 传给渲染层会报
       `[render] 未找到刀型：folding` 且主视觉空白。统一走 resolveModelId 归一。 */
    const modelId = resolveModelId(record, record.knifeTypeId);
    const seq = this._visualSeq = (this._visualSeq || 0) + 1;
    const shown = modelId ? stage.show(modelId) : Promise.resolve();
    /* ★ 2026-10-15：整份 record 交给 recipe —— 它自带 history / visualRecipe，
       逐卡视觉指纹（uCardFx）才能按"当初选了哪几张卡"复现。
       以前只传 { seed, pendingSkin }，展台上的收藏刀与原项目相比少了这一层。 */
    const visual = this.resolveVisualState(record, {}, { modelId, viewPreset: 'forge' });
    const skin = visual.skin;
    // Stored knives use the same explicit S8 handle gate and S4 glow as gameplay.
    const recHandle = visual.handle;
    const apply = () => {
      if (seq !== this._visualSeq || stage.modelId !== modelId) return;
      stage.applySkin(skin, { coverAll: !recHandle.explicit });
      stage.applyHandle(recHandle.explicit ? recHandle : null, skin);
      stage.applyGlow(visual.glowCardId);
      stage.setGhost(false);
    };
    // Keep the cached recipe ready for show()'s deferred replay, then apply
    // the complete effect on the actual newly loaded model only.
    stage._skinState = skin;
    stage._handle = recHandle.explicit ? recHandle : null;
    Promise.resolve(shown).then(apply).catch(() => {});
    return modelId;
  }
}

/** 刀型 id → 模型 id（data/knifeTypes 是静态数据，无循环依赖） */
function knifeModel(typeId) {
  const t = KNIFE_BY_ID[typeId];
  return t ? t.modelId : null;
}

/**
 * 幽灵刀的随机观感（用户要求：首页没刀时，放一把半透明的随机材质唐刀）。
 *
 * 取值范围是**全部已交付材质 / 纹理 / 工艺**（M01–M25 / T01–T24 / F01–F12），
 * 所以每次刷新看到的那把“待铸之刀”都可能不同 —— 它只是占位演示，
 * 不写入任何存档、不影响任何真实记录。
 *
 * 为什么不包括柄材质：柄（handleMaterials）与刀身是两套体系，
 * 保持 polymer 柄可让差异集中在刀身上，观感不会因为柄也变色而变脏。
 */
function randomGhostSkin() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const ids = (count, prefix) => Array.from(
    { length: count },
    (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`,
  );
  return {
    /* 随机 seed：让纹理细节（锻纹/云纹走向）也跟着变，而不只是换一张贴图 id */
    seed: (Math.random() * 0xffffff) >>> 0,
    pendingSkin: {
      materialId: pick(ids(25, 'M')),
      textureId: pick(ids(24, 'T')),
      finishId: pick(ids(12, 'F')),
      wear: 0.02,
      variants: {},
      handle: { metalId: 'polymer' },
    },
  };
}

export const Game = new Session();
// A restored WebGL context has lost its previously cached programs. Candidate
// fingerprints and completed keys must be invalidated so new visible cards
// cannot be mistaken for still-GPU-prepared variants.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('forge:gpu-restored', () => {
    Game._candidatePrewarmPromise = null;
    Game._candidatePrewarmDoneKey = null;
    Game._candidatePrewarmKey = null;
    Game.prewarmCandidates();
  });
}
export default Game;
